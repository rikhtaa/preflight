import type { Finding } from "../types";
import { mergeFindings } from "./shared";
import { scanText } from "./secrets";

export interface ProbeResponse {
  status: number;
  body: string;
  contentType?: string | null;
}

/** Paths to request on the scanned site (GET only). */
export const PROBE_PATHS = ["/.env", "/.git/config", "/.git/HEAD"] as const;
export type ProbePath = (typeof PROBE_PATHS)[number];

function looksLikeHtml(body: string): boolean {
  return /<\s*(?:!doctype|html|head|body|script|meta)\b/i.test(body.slice(0, 2000));
}

/**
 * Soft-404 guard. Many sites answer every unknown path with 200 and the same page.
 * `baseline` is the response for a random path that cannot exist.
 */
export function matchesBaseline(body: string, baseline?: ProbeResponse): boolean {
  if (!baseline || baseline.status !== 200) return false;
  const a = body.trim();
  const b = baseline.body.trim();
  if (a === b) return true;
  const longer = Math.max(a.length, b.length);
  if (longer === 0) return false;
  const similarLength = Math.abs(a.length - b.length) / longer < 0.05;
  return similarLength && a.slice(0, 100) === b.slice(0, 100);
}

interface EnvVariable {
  name: string;
}

function parseEnv(body: string): EnvVariable[] {
  const variables: EnvVariable[] = [];
  for (const line of body.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const match = /^(?:export\s+)?([A-Za-z_][A-Za-z0-9_]*)\s*=/.exec(trimmed);
    if (match) variables.push({ name: match[1] });
    if (variables.length >= 200) break;
  }
  return variables;
}

const KEY_LIKE_NAME =
  /(SECRET|TOKEN|PASSWORD|PASSWD|PRIVATE|API[_-]?KEY|ACCESS[_-]?KEY|DATABASE_URL|DB_URL|MONGO|REDIS_URL|SERVICE_ROLE|CREDENTIAL|SMTP)/i;

function namesEvidence(names: string[]): string {
  const shown = names.slice(0, 5).join(", ");
  return names.length > 5 ? `Variable names: ${shown} (+${names.length - 5} more)` : `Variable names: ${shown}`;
}

/** Evaluates the response for /.env. Never returns variable values. */
export function evaluateEnvProbe(url: string, response: ProbeResponse, baseline?: ProbeResponse): Finding[] {
  if (response.status !== 200) return [];
  if (looksLikeHtml(response.body)) return [];
  if (matchesBaseline(response.body, baseline)) return [];

  const variables = parseEnv(response.body);
  if (variables.length === 0) return [];

  const secretFindings = scanText(response.body, url);
  const names = variables.map((variable) => variable.name);
  const keyLike = names.some((name) => KEY_LIKE_NAME.test(name)) || secretFindings.length > 0;

  const envFinding: Finding = {
    id: "exposed-env",
    ruleId: "exposed-env",
    title: ".env file is publicly readable",
    severity: keyLike ? "critical" : "medium",
    category: "exposed-files",
    confidence: "high",
    maskedEvidence: namesEvidence(names),
    locations: [{ url }],
    description: keyLike
      ? "Your environment file, which usually holds passwords and API keys, can be downloaded by anyone. Block public access to it, then revoke and replace every key it contains."
      : "Your environment file can be downloaded by anyone. We did not see credential-like names, but block public access to it and review its contents.",
  };

  return mergeFindings([envFinding, ...secretFindings]);
}

function gitFinding(url: string): Finding {
  return {
    id: "exposed-git",
    ruleId: "exposed-git",
    title: "Git repository metadata is publicly accessible",
    severity: "high",
    category: "exposed-files",
    confidence: "high",
    locations: [{ url }],
    description:
      "Your .git folder can be read from the web, which can let someone download your full source code and history. Remove it from the deployed site and rotate any secret that was ever committed.",
  };
}

/** Evaluates the response for /.git/config or /.git/HEAD. */
export function evaluateGitProbe(
  path: "/.git/config" | "/.git/HEAD",
  url: string,
  response: ProbeResponse,
  baseline?: ProbeResponse,
): Finding[] {
  if (response.status !== 200) return [];
  if (looksLikeHtml(response.body)) return [];
  if (matchesBaseline(response.body, baseline)) return [];

  const body = response.body.trim();
  const valid =
    path === "/.git/config"
      ? /^\s*\[core\]/m.test(body)
      : /^ref:\s*refs\/[\w./-]+$/.test(body) || /^[0-9a-f]{40}$/i.test(body);
  if (!valid) return [];

  const secretFindings = path === "/.git/config" ? scanText(response.body, url) : [];
  return mergeFindings([gitFinding(url), ...secretFindings]);
}

/** Single entry point for the three probe paths. */
export function evaluateProbe(
  path: ProbePath,
  url: string,
  response: ProbeResponse,
  baseline?: ProbeResponse,
): Finding[] {
  if (path === "/.env") return evaluateEnvProbe(url, response, baseline);
  return evaluateGitProbe(path, url, response, baseline);
}

/** Finds sourceMappingURL references in JavaScript or CSS and resolves them to absolute URLs. */
export function findSourceMapUrls(text: string, assetUrl: string, limit = 5): string[] {
  const urls: string[] = [];
  const pattern = /(?:\/\/|\/\*)\s*[#@]\s*sourceMappingURL=([^\s*'"]+)/g;
  for (const match of text.matchAll(pattern)) {
    const reference = match[1];
    if (reference.startsWith("data:")) continue;
    try {
      const resolved = new URL(reference, assetUrl).toString();
      if (!urls.includes(resolved)) urls.push(resolved);
    } catch {
      continue;
    }
    if (urls.length >= limit) break;
  }
  return urls;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/** Evaluates the response for a source map URL. */
export function evaluateSourceMap(mapUrl: string, response: ProbeResponse, baseline?: ProbeResponse): Finding[] {
  if (response.status !== 200) return [];
  if (matchesBaseline(response.body, baseline)) return [];

  let parsed: unknown;
  try {
    parsed = JSON.parse(response.body);
  } catch {
    return [];
  }
  if (!isRecord(parsed) || typeof parsed.mappings !== "string") return [];

  const sources = Array.isArray(parsed.sourcesContent)
    ? parsed.sourcesContent.filter((item): item is string => typeof item === "string" && item.length > 0)
    : [];
  const withSources = sources.length > 0;

  const mapFinding: Finding = {
    id: withSources ? "source-map-with-sources" : "source-map-no-sources",
    ruleId: withSources ? "source-map-with-sources" : "source-map-no-sources",
    title: withSources ? "Source map exposes your original source code" : "Source map is publicly accessible",
    severity: withSources ? "medium" : "low",
    category: "exposed-files",
    confidence: "high",
    maskedEvidence: withSources ? `${sources.length} original source files included` : undefined,
    locations: [{ url: mapUrl }],
    description: withSources
      ? "Your source map contains your original, readable code. Anyone can browse it, which makes finding mistakes and secrets easier. Turn off production source maps or stop serving them publicly."
      : "Your source map is public. It does not include your original code, but you can usually turn production source maps off.",
  };

  // Line numbers inside joined sources would be misleading, so keep only the map URL.
  const secretFindings = withSources
    ? scanText(sources.join("\n"), mapUrl).map((finding) => ({
        ...finding,
        locations: [{ url: mapUrl }],
      }))
    : [];

  return mergeFindings([mapFinding, ...secretFindings]);
}
