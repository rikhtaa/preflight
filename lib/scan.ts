import { randomBytes } from "node:crypto";
import {
  PROBE_PATHS,
  evaluateProbe,
  evaluateSourceMap,
  findSourceMapUrls,
  type ProbeResponse,
} from "./detectors/exposedFiles";
import { checkHeaders } from "./detectors/headers";
import { scanText } from "./detectors/secrets";
import { mergeFindings } from "./detectors/shared";
import { createBudget, safeFetch, type SafeFetchOptions, type SafeFetchResult } from "./safeFetch";
import type { Finding, ScanCoverage, Severity, Verdict } from "./types";
import { countBySeverity, verdictFor } from "./verdict";

export const MAX_SCRIPT_FILES = 20;
export const MAX_SOURCE_MAPS = 5;
export const SCRIPT_CONCURRENCY = 4;
export const DEFAULT_DEADLINE_MS = 15_000;
const MAX_REQUESTS = 50;
const MAX_EXTRACTED_URLS = 200;

export type ScanErrorCode =
  | "BAD_URL"
  | "BLOCKED_ADDRESS"
  | "UNREACHABLE"
  | "TIMEOUT"
  | "REDIRECT_LIMIT"
  | "HTTP_ERROR"
  | "NOT_A_WEB_PAGE"
  | "INTERNAL";

export interface ScanError {
  code: ScanErrorCode;
  message: string;
}

export interface ScanResult {
  id: string;
  /** The normalized address that was requested. */
  url: string;
  /** Where the request ended up after redirects. */
  finalUrl: string;
  startedAt: string;
  durationMs: number;
  findings: Finding[];
  counts: Record<Severity, number>;
  verdict: Verdict;
  coverage: ScanCoverage;
}

export type ScanOutcome = { ok: true; result: ScanResult } | { ok: false; error: ScanError };

export type Fetcher = (url: string, options?: SafeFetchOptions) => Promise<SafeFetchResult>;

export interface RunScanOptions {
  /** Defaults to safeFetch. Tests pass a fake. */
  fetcher?: Fetcher;
  /** Defaults to env SCAN_DEADLINE_MS, then 15000. */
  deadlineMs?: number;
}

class ScanInputError extends Error {}

export function newScanId(): string {
  return randomBytes(9).toString("base64url");
}

function readDeadlineMs(): number {
  const fromEnv = Number(process.env.SCAN_DEADLINE_MS);
  return Number.isFinite(fromEnv) && fromEnv > 0 ? fromEnv : DEFAULT_DEADLINE_MS;
}

/** Adds https:// when missing, removes the #fragment, and rejects anything but http(s). */
export function normalizeUrl(input: string): string {
  const trimmed = input.trim();
  if (!trimmed || trimmed.length > 2048 || /\s/.test(trimmed)) {
    throw new ScanInputError("Enter a website address, like https://your-site.com.");
  }
  const withScheme = /^[a-z][a-z0-9+.-]*:\/\//i.test(trimmed) ? trimmed : `https://${trimmed}`;
  let url: URL;
  try {
    url = new URL(withScheme);
  } catch {
    throw new ScanInputError("That address does not look right. Try something like https://your-site.com.");
  }
  if (url.protocol !== "http:" && url.protocol !== "https:") {
    throw new ScanInputError("Only http:// and https:// addresses can be checked.");
  }
  url.hash = "";
  return url.href;
}

// ---------------------------------------------------------------------------
// Finding script files in a page
// ---------------------------------------------------------------------------

/** Third-party hosts whose scripts are not the user's code. Matches the host and its subdomains. */
const SKIPPED_HOSTS: readonly string[] = [
  "google-analytics.com",
  "googletagmanager.com",
  "googlesyndication.com",
  "googleadservices.com",
  "doubleclick.net",
  "gstatic.com",
  "googleapis.com",
  "facebook.net",
  "facebook.com",
  "hotjar.com",
  "clarity.ms",
  "segment.com",
  "segment.io",
  "mixpanel.com",
  "posthog.com",
  "plausible.io",
  "fullstory.com",
  "intercom.io",
  "intercomcdn.com",
  "crisp.chat",
  "hubspot.com",
  "hs-scripts.com",
  "hs-analytics.net",
  "hsforms.net",
  "js.stripe.com",
  "paypal.com",
  "paypalobjects.com",
  "sentry-cdn.com",
  "cloudflareinsights.com",
  "challenges.cloudflare.com",
  "recaptcha.net",
  "vercel-scripts.com",
  "licdn.com",
  "ads-twitter.com",
  "tiktok.com",
  "cdn.jsdelivr.net",
  "unpkg.com",
  "cdnjs.cloudflare.com",
  "code.jquery.com",
  "cdn.tailwindcss.com",
];

function hostIsSkipped(hostname: string): boolean {
  return SKIPPED_HOSTS.some((host) => hostname === host || hostname.endsWith(`.${host}`));
}

function attribute(tag: string, name: string): string | null {
  const pattern = new RegExp(`\\s${name}\\s*=\\s*(?:"([^"]*)"|'([^']*)'|([^\\s"'>]+))`, "i");
  const match = pattern.exec(tag);
  return match ? (match[1] ?? match[2] ?? match[3] ?? null) : null;
}

/** Collects script URLs from <script src>, modulepreload links, and Next.js chunk references. */
export function extractScriptUrls(html: string, pageUrl: string): string[] {
  const urls: string[] = [];
  const seen = new Set<string>();

  const add = (reference: string | null | undefined) => {
    if (!reference || urls.length >= MAX_EXTRACTED_URLS) return;
    const cleaned = reference.trim().replace(/&amp;/g, "&");
    if (!cleaned || /^(?:data|javascript|blob):/i.test(cleaned)) return;
    try {
      const resolved = new URL(cleaned, pageUrl);
      if (resolved.protocol !== "http:" && resolved.protocol !== "https:") return;
      resolved.hash = "";
      if (!seen.has(resolved.href)) {
        seen.add(resolved.href);
        urls.push(resolved.href);
      }
    } catch {
      // ignore malformed references
    }
  };

  for (const match of html.matchAll(/<script\b[^>]*>/gi)) add(attribute(match[0], "src"));

  for (const match of html.matchAll(/<link\b[^>]*>/gi)) {
    const rel = (attribute(match[0], "rel") ?? "").toLowerCase();
    const as = (attribute(match[0], "as") ?? "").toLowerCase();
    if (rel.includes("modulepreload") || (rel.includes("preload") && as === "script")) {
      add(attribute(match[0], "href"));
    }
  }

  // Next.js lists its chunks inside inline data; the browser adds the /_next/ prefix itself.
  for (const match of html.matchAll(/\/_next\/static\/[A-Za-z0-9_\-./%]+?\.js/g)) add(match[0]);
  for (const match of html.matchAll(/["'(,\s](static\/chunks\/[A-Za-z0-9_\-./%]+?\.js)/g)) {
    add(`/_next/${match[1]}`);
  }

  return urls;
}

/** Picks up to MAX_SCRIPT_FILES scripts: the site's own first, analytics and library CDNs skipped. */
export function selectScripts(urls: string[], pageUrl: string): { selected: string[]; skipped: number } {
  const pageHost = new URL(pageUrl).hostname.toLowerCase();
  const base = pageHost.replace(/^www\./, "");
  const own: string[] = [];
  const other: string[] = [];
  let skipped = 0;

  for (const href of urls) {
    const host = new URL(href).hostname.toLowerCase();
    if (hostIsSkipped(host)) {
      skipped += 1;
      continue;
    }
    (host === pageHost || host === base || host.endsWith(`.${base}`) ? own : other).push(href);
  }

  const ordered = [...own, ...other];
  return {
    selected: ordered.slice(0, MAX_SCRIPT_FILES),
    skipped: skipped + Math.max(0, ordered.length - MAX_SCRIPT_FILES),
  };
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function toProbe(result: SafeFetchResult): ProbeResponse {
  return { status: result.status ?? 0, body: result.body, contentType: result.headers["content-type"] ?? null };
}

async function mapLimit<T>(
  items: readonly T[],
  limit: number,
  shouldStop: () => boolean,
  worker: (item: T) => Promise<void>,
): Promise<{ notStarted: number }> {
  let next = 0;
  const runners = Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (next < items.length) {
      if (shouldStop()) return;
      const index = next;
      next += 1;
      await worker(items[index]);
    }
  });
  await Promise.all(runners);
  return { notStarted: items.length - next };
}

/** A source map bigger than 2 MB cannot be parsed; judge it from the part we did read. */
function oversizedMapFindings(mapUrl: string, body: string): Finding[] {
  if (!/^\s*\{\s*"version"\s*:\s*3\b/.test(body)) return [];
  const withSources = body.includes('"sourcesContent"');
  const id = withSources ? "source-map-with-sources" : "source-map-no-sources";
  return [
    {
      id,
      ruleId: id,
      title: withSources ? "Source map exposes your original source code" : "Source map is publicly accessible",
      severity: withSources ? "medium" : "low",
      category: "exposed-files",
      confidence: "medium",
      maskedEvidence: "Larger than 2 MB, so we could only inspect the start of it",
      locations: [{ url: mapUrl }],
      description: withSources
        ? "Your source map contains your original, readable code. Turn off production source maps or stop serving them publicly."
        : "Your source map is public. You can usually turn production source maps off.",
    },
  ];
}

function failure(code: ScanErrorCode, message: string): ScanOutcome {
  return { ok: false, error: { code, message } };
}

function mainPageFailure(main: SafeFetchResult): ScanOutcome | null {
  const error = main.error;
  if (error && !(error.code === "TOO_LARGE" && main.body)) {
    switch (error.code) {
      case "BAD_URL":
        return failure("BAD_URL", error.message);
      case "BLOCKED_ADDRESS":
        return failure("BLOCKED_ADDRESS", "We can only scan public websites.");
      case "TIMEOUT":
        return failure("TIMEOUT", "The site took too long to respond. Try again in a moment.");
      case "REDIRECT_LIMIT":
        return failure("REDIRECT_LIMIT", "The site redirected too many times.");
      case "TOO_LARGE":
        return failure("NOT_A_WEB_PAGE", "That page is too large to scan.");
      default:
        return main.status !== null
          ? failure("NOT_A_WEB_PAGE", "That address did not return a web page.")
          : failure("UNREACHABLE", "We could not reach that site. Check the address and try again.");
    }
  }

  if (main.status !== null && main.status >= 400) {
    const reason =
      main.status === 404
        ? "That page was not found (HTTP 404). Check the address."
        : main.status === 401 || main.status === 403
          ? `The site refused our request (HTTP ${main.status}). It may block automated checks or need a login.`
          : main.status === 429
            ? "The site is limiting requests (HTTP 429). Try again later."
            : `The site returned an error (HTTP ${main.status}).`;
    return failure("HTTP_ERROR", reason);
  }
  return null;
}

// ---------------------------------------------------------------------------
// The scan
// ---------------------------------------------------------------------------

/**
 * Runs a full outside-in scan. Never throws: problems come back as { ok: false, error }.
 * Passive only: it requests the same public addresses a browser or search crawler would.
 */
export async function runScan(rawUrl: string, options: RunScanOptions = {}): Promise<ScanOutcome> {
  try {
    return await runScanUnsafe(rawUrl, options);
  } catch {
    return failure("INTERNAL", "Something went wrong while scanning. Please try again.");
  }
}

async function runScanUnsafe(rawUrl: string, options: RunScanOptions): Promise<ScanOutcome> {
  const fetcher: Fetcher = options.fetcher ?? safeFetch;
  const deadlineMs = options.deadlineMs ?? readDeadlineMs();
  const startedAtMs = Date.now();
  const deadlineAt = startedAtMs + deadlineMs;

  let target: string;
  try {
    target = normalizeUrl(rawUrl);
  } catch (error) {
    return failure("BAD_URL", error instanceof Error ? error.message : "That address does not look right.");
  }

  const budget = createBudget({ deadlineMs, maxRequests: MAX_REQUESTS });
  const coverage: ScanCoverage = {
    checksRun: [],
    checksSkipped: [],
    filesFetched: 0,
    filesSkipped: 0,
    deadlineHit: false,
  };
  const collected: Finding[] = [];

  const get = (url: string, extra: Partial<SafeFetchOptions> = {}) =>
    fetcher(url, { method: "GET", budget, ...extra });
  const noteDeadline = (result: SafeFetchResult) => {
    if (result.error?.code === "TIMEOUT" && /scan-wide/i.test(result.error.message)) {
      coverage.deadlineHit = true;
    }
  };
  const outOfTime = () => Date.now() >= deadlineAt;
  const skipCheck = (id: string) => {
    coverage.checksSkipped.push({ id, reason: "This check hit an unexpected error and was skipped." });
  };

  // 1) The main page
  const main = await get(target);
  noteDeadline(main);
  const problem = mainPageFailure(main);
  if (problem) return problem;

  const finalUrl = main.finalUrl;
  const origin = new URL(finalUrl).origin;

  coverage.checksRun.push("security-headers");
  collected.push(...checkHeaders(main.headers, finalUrl));

  coverage.checksRun.push("inline-secrets");
  collected.push(...scanText(main.body, finalUrl));
  if (main.error?.code === "TOO_LARGE") {
    coverage.checksSkipped.push({
      id: "full-page-scan",
      reason: "The page is larger than 2 MB, so only the first part was scanned.",
    });
  }

  const { selected, skipped } = selectScripts(extractScriptUrls(main.body, finalUrl), finalUrl);
  coverage.filesSkipped += skipped;

  const mapUrls: string[] = [];
  const addMapUrl = (url: string) => {
    if (!mapUrls.includes(url) && mapUrls.length < MAX_SOURCE_MAPS) mapUrls.push(url);
  };
  let baseline: ProbeResponse | undefined;
  let oversizedScripts = 0;

  // 2) Exposed files: /.env, /.git/config, /.git/HEAD
  const runProbes = async () => {
    coverage.checksRun.push("exposed-files");
    const baselineResult = await get(new URL(`/tsv-probe-${newScanId()}`, origin).href, {
      allowAnyContentType: true,
    });
    noteDeadline(baselineResult);
    baseline = baselineResult.status === null ? undefined : toProbe(baselineResult);

    await Promise.all(
      PROBE_PATHS.map(async (path) => {
        const url = new URL(path, origin).href;
        const result = await get(url, { allowAnyContentType: true });
        noteDeadline(result);
        if (result.status === null) return;
        collected.push(...evaluateProbe(path, url, toProbe(result), baseline));
      }),
    );
  };

  // 3) Script files: secrets and source map references
  const runScripts = async () => {
    if (selected.length === 0) {
      coverage.checksSkipped.push({ id: "script-secrets", reason: "No script files were found on the page." });
      return;
    }
    coverage.checksRun.push("script-secrets");
    const { notStarted } = await mapLimit(selected, SCRIPT_CONCURRENCY, outOfTime, async (url) => {
      const result = await get(url);
      noteDeadline(result);
      if (result.status !== 200 || !result.body) {
        coverage.filesSkipped += 1;
        return;
      }
      coverage.filesFetched += 1;
      collected.push(...scanText(result.body, result.finalUrl));
      for (const mapUrl of findSourceMapUrls(result.body, result.finalUrl)) addMapUrl(mapUrl);
      if (result.error?.code === "TOO_LARGE") {
        // The reference comment sits at the end of a file, which we did not read. Try the usual name.
        oversizedScripts += 1;
        addMapUrl(`${result.finalUrl}.map`);
      }
    });
    coverage.filesSkipped += notStarted;
    if (notStarted > 0) coverage.deadlineHit = true;
  };

  const attempt = async (id: string, work: () => Promise<void>) => {
    try {
      await work();
    } catch {
      skipCheck(id);
    }
  };

  await Promise.all([attempt("exposed-files", runProbes), attempt("script-secrets", runScripts)]);

  // 4) Source maps found in the scripts
  await attempt("source-maps", async () => {
    if (mapUrls.length === 0) return;
    coverage.checksRun.push("source-maps");
    await mapLimit(mapUrls, 3, outOfTime, async (mapUrl) => {
      const result = await get(mapUrl, { allowAnyContentType: true });
      noteDeadline(result);
      if (result.status !== 200) return;
      if (result.error?.code === "TOO_LARGE") {
        collected.push(...oversizedMapFindings(mapUrl, result.body));
        return;
      }
      if (result.error) return;
      collected.push(...evaluateSourceMap(mapUrl, toProbe(result), baseline));
    });
  });

  if (oversizedScripts > 0) {
    coverage.checksSkipped.push({
      id: "full-file-scan",
      reason: `${oversizedScripts} script file(s) are larger than 2 MB, so only the first part was scanned.`,
    });
  }
  if (outOfTime()) coverage.deadlineHit = true;
  if (coverage.deadlineHit) {
    coverage.checksSkipped.push({
      id: "time-limit",
      reason: "Some checks were cut short by the scan time limit.",
    });
  }

  const findings = mergeFindings(collected);
  return {
    ok: true,
    result: {
      id: newScanId(),
      url: target,
      finalUrl,
      startedAt: new Date(startedAtMs).toISOString(),
      durationMs: Date.now() - startedAtMs,
      findings,
      counts: countBySeverity(findings),
      verdict: verdictFor(findings),
      coverage,
    },
  };
}
