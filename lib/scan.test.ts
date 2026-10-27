import { describe, expect, it } from "vitest";
import { extractScriptUrls, normalizeUrl, runScan, selectScripts, type Fetcher, type ScanOutcome, type ScanResult } from "./scan";
import type { SafeFetchResult } from "./safeFetch";
import { token } from "./detectors/testkit";

const SITE = "https://shop.example.test/";

function response(url: string, body: string, extra: Partial<SafeFetchResult> = {}): SafeFetchResult {
  return {
    ok: true,
    status: 200,
    headers: { "content-type": "text/html; charset=utf-8" },
    finalUrl: url,
    body,
    truncated: false,
    error: null,
    ...extra,
  };
}

function notFound(url: string): SafeFetchResult {
  return response(url, "Not found", { ok: false, status: 404 });
}

/** A fake website: exact URL -> response. Anything else is a 404. Records every request. */
function fakeSite(routes: Record<string, SafeFetchResult | string>, fallback?: (url: string) => SafeFetchResult) {
  const calls: string[] = [];
  const fetcher: Fetcher = async (url) => {
    calls.push(url);
    const route = routes[url];
    if (route === undefined) return fallback ? fallback(url) : notFound(url);
    return typeof route === "string" ? response(url, route) : route;
  };
  return { fetcher, calls };
}

function success(outcome: ScanOutcome): ScanResult {
  if (!outcome.ok) throw new Error(`expected a successful scan, got ${outcome.error.code}`);
  return outcome.result;
}

const STRIPE_KEY = `sk_live_${token(24)}`;
const ENV_KEY = `sk_live_${token(24, 2)}`;

function vulnerableSite() {
  const html = `<!doctype html><html><head>
    <script src="/static/app.js"></script>
    <script src="https://www.google-analytics.com/analytics.js"></script>
    <link rel="modulepreload" href="/assets/chunk.js">
  </head><body><script>window.cfg = { key: "${STRIPE_KEY}" };</script></body></html>`;
  const map = JSON.stringify({ version: 3, mappings: "AAAA", sources: ["app.ts"], sourcesContent: ["export const x = 1;"] });
  return fakeSite({
    [SITE]: html,
    "https://shop.example.test/static/app.js": response(
      "https://shop.example.test/static/app.js",
      `const stripe = "${STRIPE_KEY}";\n//# sourceMappingURL=app.js.map`,
      { headers: { "content-type": "application/javascript" } },
    ),
    "https://shop.example.test/assets/chunk.js": response("https://shop.example.test/assets/chunk.js", "console.log(1)", {
      headers: { "content-type": "application/javascript" },
    }),
    "https://shop.example.test/static/app.js.map": response("https://shop.example.test/static/app.js.map", map, {
      headers: { "content-type": "application/json" },
    }),
    "https://shop.example.test/.env": response(
      "https://shop.example.test/.env",
      `NODE_ENV=production\nSTRIPE_SECRET_KEY=${ENV_KEY}\n`,
      { headers: { "content-type": "application/octet-stream" } },
    ),
  });
}

describe("runScan on a vulnerable site", () => {
  it("finds the leaked key, the .env file, the source map and the missing headers", async () => {
    const { fetcher } = vulnerableSite();
    const result = success(await runScan("shop.example.test", { fetcher, deadlineMs: 5000 }));

    expect(result.url).toBe(SITE);
    expect(result.verdict).toBe("fix-before-launch");
    expect(result.id).toMatch(/^[A-Za-z0-9_-]{12}$/);

    const ids = result.findings.map((f) => f.id);
    expect(ids).toContain("exposed-env");
    expect(ids).toContain("source-map-with-sources");
    expect(ids).toContain("headers:csp-missing");

    const stripe = result.findings.filter((f) => f.ruleId === "stripe-live-secret");
    expect(stripe).toHaveLength(2); // the page/app.js key and the .env key
    const sharedKey = stripe.find((f) => f.locations.length >= 2);
    expect(sharedKey).toBeDefined(); // same key in the HTML and in app.js = ONE finding, two locations

    expect(result.counts.critical).toBeGreaterThan(0);
    expect(result.findings[0].severity).toBe("critical"); // most severe first
  });

  it("never lets a full secret appear in the result", async () => {
    const { fetcher } = vulnerableSite();
    const result = success(await runScan(SITE, { fetcher }));
    const output = JSON.stringify(result);
    expect(output).not.toContain(STRIPE_KEY);
    expect(output).not.toContain(ENV_KEY);
    expect(output).not.toContain(STRIPE_KEY.slice(4, 20));
  });

  it("requests the right files and skips analytics", async () => {
    const { fetcher, calls } = vulnerableSite();
    const result = success(await runScan(SITE, { fetcher }));
    expect(calls.some((c) => c.includes("google-analytics.com"))).toBe(false);
    expect(calls).toContain("https://shop.example.test/static/app.js");
    expect(calls).toContain("https://shop.example.test/assets/chunk.js");
    expect(calls).toContain("https://shop.example.test/static/app.js.map");
    expect(calls).toContain("https://shop.example.test/.env");
    expect(calls).toContain("https://shop.example.test/.git/config");
    expect(calls).toContain("https://shop.example.test/.git/HEAD");
    expect(result.coverage.filesFetched).toBe(2);
    expect(result.coverage.filesSkipped).toBe(1);
    expect(result.coverage.deadlineHit).toBe(false);
    expect(result.coverage.checksRun).toContain("exposed-files");
    expect(result.coverage.checksRun).toContain("source-maps");
  });

  it("finds a .env served as application/octet-stream (needs allowAnyContentType)", async () => {
    const seen: Array<{ url: string; allowAny: boolean | undefined }> = [];
    const inner = vulnerableSite().fetcher;
    const fetcher: Fetcher = async (url, options) => {
      seen.push({ url, allowAny: options?.allowAnyContentType });
      return inner(url, options);
    };
    await runScan(SITE, { fetcher });
    expect(seen.find((s) => s.url.endsWith("/.env"))?.allowAny).toBe(true);
    expect(seen.find((s) => s.url.endsWith("/static/app.js"))?.allowAny).toBeFalsy();
  });
});

describe("runScan on a clean or tricky site", () => {
  it("does not report .env or .git for a single-page app that serves index.html for every path", async () => {
    const index = `<!doctype html><html><head><script type="module" src="/assets/index.js"></script></head><body><div id="root"></div>${"<!-- pad -->".repeat(30)}</body></html>`;
    const { fetcher } = fakeSite(
      { [SITE]: index, "https://shop.example.test/assets/index.js": response("https://shop.example.test/assets/index.js", "console.log('ok')", { headers: { "content-type": "text/javascript" } }) },
      (url) => response(url, index),
    );
    const result = success(await runScan(SITE, { fetcher }));
    const ids = result.findings.map((f) => f.id);
    expect(ids).not.toContain("exposed-env");
    expect(ids).not.toContain("exposed-git");
  });

  it("returns a nice-to-have verdict when only minor header issues exist", async () => {
    const headers = {
      "content-type": "text/html",
      "content-security-policy": "default-src 'self'; frame-ancestors 'none'",
      "strict-transport-security": "max-age=63072000",
      "x-content-type-options": "nosniff",
      "referrer-policy": "no-referrer",
      "x-frame-options": "DENY",
    };
    const { fetcher } = fakeSite({ [SITE]: response(SITE, "<html><body>hi</body></html>", { headers }) });
    const result = success(await runScan(SITE, { fetcher }));
    expect(result.verdict).toBe("nice-to-have");
    expect(result.coverage.checksSkipped.map((c) => c.id)).toContain("script-secrets");
  });

  it("caps script files at 20 and reports the rest as skipped", async () => {
    const scripts = Array.from({ length: 30 }, (_, i) => `<script src="/s${i}.js"></script>`).join("");
    const routes: Record<string, SafeFetchResult | string> = { [SITE]: `<html><head>${scripts}</head></html>` };
    for (let i = 0; i < 30; i++) {
      const url = `https://shop.example.test/s${i}.js`;
      routes[url] = response(url, `var a${i}=1;`, { headers: { "content-type": "text/javascript" } });
    }
    const { fetcher, calls } = fakeSite(routes);
    const result = success(await runScan(SITE, { fetcher }));
    expect(calls.filter((c) => /\/s\d+\.js$/.test(c))).toHaveLength(20);
    expect(result.coverage.filesFetched).toBe(20);
    expect(result.coverage.filesSkipped).toBe(10);
  });

  it("scans the start of an oversized script and tries its .map file", async () => {
    const big = "https://shop.example.test/big.js";
    const map = "https://shop.example.test/big.js.map";
    const { fetcher, calls } = fakeSite({
      [SITE]: `<html><head><script src="/big.js"></script></head></html>`,
      [big]: response(big, `var k="${STRIPE_KEY}";`, {
        ok: false,
        headers: { "content-type": "text/javascript" },
        truncated: true,
        error: { code: "TOO_LARGE", message: "The response exceeded the 2 MB body limit." },
      }),
      [map]: response(map, `{"version":3,"mappings":"AAAA","sourcesContent":["x"`, {
        headers: { "content-type": "application/json" },
        truncated: true,
        error: { code: "TOO_LARGE", message: "The response exceeded the 2 MB body limit." },
      }),
    });
    const result = success(await runScan(SITE, { fetcher }));
    expect(calls).toContain(map);
    expect(result.findings.some((f) => f.ruleId === "stripe-live-secret")).toBe(true);
    expect(result.findings.some((f) => f.id === "source-map-with-sources")).toBe(true);
    expect(result.coverage.checksSkipped.map((c) => c.id)).toContain("full-file-scan");
  });

  it("returns partial results and flags the time limit when scripts run out of time", async () => {
    const scanWide = { code: "TIMEOUT" as const, message: "The scan-wide time limit was reached." };
    const { fetcher } = fakeSite(
      { [SITE]: `<html><head><script src="/a.js"></script><script src="/b.js"></script></head></html>` },
      (url) =>
        url.endsWith(".js")
          ? { ok: false, status: null, headers: {}, finalUrl: url, body: "", truncated: false, error: scanWide }
          : notFound(url),
    );
    const result = success(await runScan(SITE, { fetcher }));
    expect(result.coverage.deadlineHit).toBe(true);
    expect(result.coverage.checksSkipped.map((c) => c.id)).toContain("time-limit");
    expect(result.coverage.filesSkipped).toBe(2);
  });
});

describe("runScan failures never throw", () => {
  const failing = (partial: Partial<SafeFetchResult>): Fetcher => async (url) => ({
    ok: false, status: null, headers: {}, finalUrl: url, body: "", truncated: false, error: null, ...partial,
  });

  it("rejects bad addresses before any request", async () => {
    const { fetcher, calls } = fakeSite({});
    for (const input of ["", "   ", "ftp://example.test", "javascript:alert(1)", "not a url"]) {
      const outcome = await runScan(input, { fetcher });
      expect(outcome.ok).toBe(false);
      if (!outcome.ok) expect(outcome.error.code).toBe("BAD_URL");
    }
    expect(calls).toHaveLength(0);
  });

  it("maps an unreachable host", async () => {
    const outcome = await runScan(SITE, { fetcher: failing({ error: { code: "NETWORK", message: "x" } }) });
    expect(outcome.ok).toBe(false);
    if (!outcome.ok) expect(outcome.error.code).toBe("UNREACHABLE");
  });

  it("maps a blocked address without leaking details", async () => {
    const outcome = await runScan(SITE, { fetcher: failing({ error: { code: "BLOCKED_ADDRESS", message: "resolves to 10.0.0.5" } }) });
    expect(outcome.ok).toBe(false);
    if (!outcome.ok) {
      expect(outcome.error.code).toBe("BLOCKED_ADDRESS");
      expect(outcome.error.message).not.toContain("10.0.0.5");
    }
  });

  it("maps timeouts and redirect loops", async () => {
    const t = await runScan(SITE, { fetcher: failing({ error: { code: "TIMEOUT", message: "x" } }) });
    const r = await runScan(SITE, { fetcher: failing({ error: { code: "REDIRECT_LIMIT", message: "x" } }) });
    expect(t.ok === false && t.error.code).toBe("TIMEOUT");
    expect(r.ok === false && r.error.code).toBe("REDIRECT_LIMIT");
  });

  it("maps HTTP errors, including a site that blocks bots", async () => {
    const forbidden = await runScan(SITE, { fetcher: failing({ status: 403, body: "denied" }) });
    expect(forbidden.ok).toBe(false);
    if (!forbidden.ok) {
      expect(forbidden.error.code).toBe("HTTP_ERROR");
      expect(forbidden.error.message).toContain("403");
    }
    const missing = await runScan(SITE, { fetcher: failing({ status: 404 }) });
    expect(missing.ok === false && missing.error.message).toContain("404");
  });

  it("maps a non-text response to NOT_A_WEB_PAGE", async () => {
    const outcome = await runScan(SITE, { fetcher: failing({ status: 200, error: { code: "NETWORK", message: "not textual" } }) });
    expect(outcome.ok === false && outcome.error.code).toBe("NOT_A_WEB_PAGE");
  });

  it("turns an unexpected exception into INTERNAL instead of throwing", async () => {
    const boom: Fetcher = async () => {
      throw new Error("kaboom: secret internals");
    };
    const outcome = await runScan(SITE, { fetcher: boom });
    expect(outcome.ok).toBe(false);
    if (!outcome.ok) {
      expect(outcome.error.code).toBe("INTERNAL");
      expect(outcome.error.message).not.toContain("kaboom");
    }
  });

  it("still returns results when one check throws", async () => {
    let calls = 0;
    const flaky: Fetcher = async (url) => {
      calls += 1;
      if (url.endsWith("/.env")) throw new Error("boom");
      return url === SITE ? response(SITE, "<html></html>") : notFound(url);
    };
    const outcome = await runScan(SITE, { fetcher: flaky });
    expect(outcome.ok).toBe(true);
    if (outcome.ok) expect(outcome.result.coverage.checksSkipped.map((c) => c.id)).toContain("exposed-files");
    expect(calls).toBeGreaterThan(1);
  });
});

describe("normalizeUrl", () => {
  it("adds https, lowercases the host, and drops the fragment", () => {
    expect(normalizeUrl("example.com")).toBe("https://example.com/");
    expect(normalizeUrl("  HTTP://Example.COM/a?b=1#frag ")).toBe("http://example.com/a?b=1");
  });
  it("rejects empty, spaced, and non-http inputs", () => {
    for (const bad of ["", "a b", "ftp://x.test", "file:///etc/passwd", "javascript:alert(1)"]) {
      let threw = false;
      try {
        normalizeUrl(bad);
      } catch {
        threw = true;
      }
      expect(threw).toBe(true);
    }
  });
});

describe("extractScriptUrls", () => {
  const page = "https://app.example.test/dashboard/";
  it("reads script src, modulepreload and preload-as-script", () => {
    const html = `
      <script src="/a.js"></script>
      <script type="module" src='https://cdn.example.test/b.js'></script>
      <script src=c.js></script>
      <link rel="modulepreload" href="/d.js">
      <link rel="preload" as="script" href="/e.js">
      <link rel="preload" as="style" href="/f.css">
      <script data-src="/not-this.js"></script>
      <script src="data:text/javascript,alert(1)"></script>
      <script>inline()</script>`;
    expect(extractScriptUrls(html, page)).toEqual([
      "https://app.example.test/a.js",
      "https://cdn.example.test/b.js",
      "https://app.example.test/dashboard/c.js",
      "https://app.example.test/d.js",
      "https://app.example.test/e.js",
    ]);
  });
  it("finds Next.js chunks mentioned in inline data and de-duplicates", () => {
    const html = `<script src="/_next/static/chunks/main-abc.js"></script>
      <script>self.__next_f.push([1,"[\\"static/chunks/app/page-123.js\\",\\"static/chunks/main-abc.js\\"]"])</script>`;
    const urls = extractScriptUrls(html, "https://app.example.test/");
    expect(urls).toContain("https://app.example.test/_next/static/chunks/main-abc.js");
    expect(urls).toContain("https://app.example.test/_next/static/chunks/app/page-123.js");
    expect(urls.filter((u) => u.endsWith("main-abc.js"))).toHaveLength(1);
  });
});

describe("selectScripts", () => {
  it("puts the site's own scripts first and drops analytics and library CDNs", () => {
    const { selected, skipped } = selectScripts(
      [
        "https://www.googletagmanager.com/gtm.js",
        "https://cdn.other.test/lib.js",
        "https://www.shop.example.test/a.js",
        "https://static.shop.example.test/b.js",
        "https://unpkg.com/react.js",
      ],
      "https://www.shop.example.test/",
    );
    expect(selected).toEqual([
      "https://www.shop.example.test/a.js",
      "https://static.shop.example.test/b.js",
      "https://cdn.other.test/lib.js",
    ]);
    expect(skipped).toBe(2);
  });
});
