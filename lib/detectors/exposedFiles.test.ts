import { describe, expect, it } from "vitest";
import {
  evaluateEnvProbe,
  evaluateGitProbe,
  evaluateProbe,
  evaluateSourceMap,
  findSourceMapUrls,
  matchesBaseline,
} from "./exposedFiles";
import { mergeFindings } from "./shared";
import { token } from "./testkit";

const SITE = "https://example.test";
const HTML = "<!doctype html><html><head><title>App</title></head><body><div id=root></div></body></html>";
const NOT_FOUND = { status: 404, body: "Not found" };

describe("evaluateEnvProbe", () => {
  it("flags a readable .env with credential-like names as critical, without revealing values", () => {
    const stripe = `sk_live_${token(24)}`;
    const body = `NODE_ENV=production\nSTRIPE_SECRET_KEY=${stripe}\nDATABASE_URL=postgres://user:pass${token(6)}@db.test/app\n`;
    const findings = evaluateEnvProbe(`${SITE}/.env`, { status: 200, body });
    const env = findings.find((f) => f.id === "exposed-env");
    expect(env?.severity).toBe("critical");
    expect(env?.maskedEvidence).toContain("STRIPE_SECRET_KEY");
    const output = JSON.stringify(findings);
    expect(output).not.toContain(stripe);
    expect(output).not.toContain("postgres://user");
    // the Stripe key inside the file is also reported, masked
    expect(findings.some((f) => f.ruleId === "stripe-live-secret")).toBe(true);
  });

  it("rates a .env with no credential-like names as medium", () => {
    const [finding] = evaluateEnvProbe(`${SITE}/.env`, { status: 200, body: "PORT=3000\nNODE_ENV=production\n" });
    expect(finding.severity).toBe("medium");
  });

  it("does NOT flag a single-page app that returns index.html for /.env", () => {
    expect(evaluateEnvProbe(`${SITE}/.env`, { status: 200, body: HTML, contentType: "text/html" })).toHaveLength(0);
  });

  it("ignores non-200 responses", () => {
    expect(evaluateEnvProbe(`${SITE}/.env`, { status: 403, body: "A=b" })).toHaveLength(0);
    expect(evaluateEnvProbe(`${SITE}/.env`, NOT_FOUND)).toHaveLength(0);
  });

  it("ignores text that is not KEY=value lines", () => {
    expect(evaluateEnvProbe(`${SITE}/.env`, { status: 200, body: "Welcome to the site" })).toHaveLength(0);
  });

  it("ignores a response identical to the soft-404 baseline", () => {
    const body = "FOO=bar\nBAZ=qux";
    expect(evaluateEnvProbe(`${SITE}/.env`, { status: 200, body }, { status: 200, body })).toHaveLength(0);
  });

  it("lists only the first five variable names", () => {
    const body = Array.from({ length: 8 }, (_, i) => `VAR_${i}=x`).join("\n");
    const [finding] = evaluateEnvProbe(`${SITE}/.env`, { status: 200, body });
    expect(finding.maskedEvidence).toContain("+3 more");
  });
});

describe("evaluateGitProbe", () => {
  it("flags /.git/config containing [core] as high", () => {
    const body = "[core]\n\trepositoryformatversion = 0\n[remote \"origin\"]\n\turl = https://github.com/acme/app.git\n";
    const [finding] = evaluateGitProbe("/.git/config", `${SITE}/.git/config`, { status: 200, body });
    expect(finding.id).toBe("exposed-git");
    expect(finding.severity).toBe("high");
  });

  it("flags /.git/HEAD with a ref or a commit hash", () => {
    expect(evaluateGitProbe("/.git/HEAD", `${SITE}/.git/HEAD`, { status: 200, body: "ref: refs/heads/main\n" })).toHaveLength(1);
    expect(evaluateGitProbe("/.git/HEAD", `${SITE}/.git/HEAD`, { status: 200, body: "a".repeat(40) })).toHaveLength(1);
  });

  it("does NOT flag an SPA that returns index.html for git paths", () => {
    expect(evaluateGitProbe("/.git/config", `${SITE}/.git/config`, { status: 200, body: HTML })).toHaveLength(0);
    expect(evaluateGitProbe("/.git/HEAD", `${SITE}/.git/HEAD`, { status: 200, body: HTML })).toHaveLength(0);
  });

  it("does not flag plain text that only looks similar", () => {
    expect(evaluateGitProbe("/.git/HEAD", `${SITE}/.git/HEAD`, { status: 200, body: "hello world" })).toHaveLength(0);
    expect(evaluateGitProbe("/.git/config", `${SITE}/.git/config`, { status: 200, body: "core settings" })).toHaveLength(0);
  });

  it("reports a git exposure found at two paths as ONE finding with two locations", () => {
    const merged = mergeFindings([
      ...evaluateGitProbe("/.git/config", `${SITE}/.git/config`, { status: 200, body: "[core]\n" }),
      ...evaluateGitProbe("/.git/HEAD", `${SITE}/.git/HEAD`, { status: 200, body: "ref: refs/heads/main" }),
    ]);
    expect(merged).toHaveLength(1);
    expect(merged[0].locations).toHaveLength(2);
  });

  it("masks a token that appears inside .git/config", () => {
    const pat = `ghp_${token(40, 6)}`;
    const body = `[core]\n[remote "origin"]\n\turl = https://${pat}@github.com/acme/app.git\n`;
    const findings = evaluateGitProbe("/.git/config", `${SITE}/.git/config`, { status: 200, body });
    expect(findings.some((f) => f.ruleId === "github-token")).toBe(true);
    expect(JSON.stringify(findings)).not.toContain(pat);
  });
});

describe("evaluateProbe", () => {
  it("routes each path to the right evaluator", () => {
    expect(evaluateProbe("/.env", `${SITE}/.env`, { status: 200, body: "PORT=1" })).toHaveLength(1);
    expect(evaluateProbe("/.git/HEAD", `${SITE}/.git/HEAD`, { status: 200, body: "ref: refs/heads/x" })).toHaveLength(1);
  });
});

describe("matchesBaseline", () => {
  it("matches identical and near-identical pages, not different ones", () => {
    const longPage = HTML.replace("<div id=root></div>", `<div id=root></div>${"<p>content</p>".repeat(60)}`);
    const base = { status: 200, body: longPage };
    expect(matchesBaseline(longPage, base)).toBe(true);
    // same page with a small changing token at the end (nonce, timestamp)
    expect(matchesBaseline(`${longPage}<!-- a1b2c3 -->`, base)).toBe(true);
    expect(matchesBaseline("PORT=3000", base)).toBe(false);
    expect(matchesBaseline(longPage, { status: 404, body: longPage })).toBe(false);
    expect(matchesBaseline(longPage, undefined)).toBe(false);
  });
});

describe("findSourceMapUrls", () => {
  const asset = "https://example.test/static/js/app.js";
  it("resolves relative and absolute references", () => {
    expect(findSourceMapUrls("code\n//# sourceMappingURL=app.js.map", asset)).toEqual([
      "https://example.test/static/js/app.js.map",
    ]);
    expect(findSourceMapUrls("//# sourceMappingURL=/maps/app.map", asset)).toEqual(["https://example.test/maps/app.map"]);
    expect(findSourceMapUrls("//# sourceMappingURL=https://cdn.test/a.map", asset)).toEqual(["https://cdn.test/a.map"]);
  });
  it("supports CSS comments and the legacy //@ form", () => {
    expect(findSourceMapUrls("/*# sourceMappingURL=style.css.map */", "https://example.test/s.css")).toEqual([
      "https://example.test/style.css.map",
    ]);
    expect(findSourceMapUrls("//@ sourceMappingURL=old.map", asset)).toEqual(["https://example.test/static/js/old.map"]);
  });
  it("ignores inline data URIs and string constants inside code", () => {
    expect(findSourceMapUrls("//# sourceMappingURL=data:application/json;base64,AAAA", asset)).toEqual([]);
    expect(findSourceMapUrls('const marker = "//# sourceMappingURL=";', asset)).toEqual([]);
  });
  it("de-duplicates and caps the list", () => {
    const text = Array.from({ length: 9 }, (_, i) => `//# sourceMappingURL=m${i}.map`).join("\n");
    expect(findSourceMapUrls(text, asset)).toHaveLength(5);
    expect(findSourceMapUrls("//# sourceMappingURL=a.map\n//# sourceMappingURL=a.map", asset)).toHaveLength(1);
  });
});

describe("evaluateSourceMap", () => {
  const mapUrl = "https://example.test/static/js/app.js.map";

  it("flags a map that includes original sources as medium", () => {
    const body = JSON.stringify({ version: 3, mappings: "AAAA", sources: ["a.ts"], sourcesContent: ["export const a = 1;"] });
    const [finding] = evaluateSourceMap(mapUrl, { status: 200, body });
    expect(finding.id).toBe("source-map-with-sources");
    expect(finding.severity).toBe("medium");
    expect(finding.maskedEvidence).toContain("1 original source files");
  });

  it("flags a map without sources as low", () => {
    const body = JSON.stringify({ version: 3, mappings: "AAAA", sources: ["a.ts"] });
    const [finding] = evaluateSourceMap(mapUrl, { status: 200, body });
    expect(finding.id).toBe("source-map-no-sources");
    expect(finding.severity).toBe("low");
  });

  it("finds a masked secret inside sourcesContent, with only the map URL as location", () => {
    const key = `sk_live_${token(24)}`;
    const body = JSON.stringify({ version: 3, mappings: "AAAA", sourcesContent: [`const key = "${key}";`] });
    const findings = evaluateSourceMap(mapUrl, { status: 200, body });
    const secret = findings.find((f) => f.ruleId === "stripe-live-secret");
    expect(secret).toBeDefined();
    expect(secret?.locations).toEqual([{ url: mapUrl }]);
    expect(JSON.stringify(findings)).not.toContain(key);
  });

  it("does NOT flag HTML, invalid JSON, or JSON that is not a source map", () => {
    expect(evaluateSourceMap(mapUrl, { status: 200, body: HTML })).toHaveLength(0);
    expect(evaluateSourceMap(mapUrl, { status: 200, body: "{not json" })).toHaveLength(0);
    expect(evaluateSourceMap(mapUrl, { status: 200, body: JSON.stringify({ hello: "world" }) })).toHaveLength(0);
    expect(evaluateSourceMap(mapUrl, { status: 404, body: JSON.stringify({ mappings: "AAAA" }) })).toHaveLength(0);
  });

  it("ignores a response that matches the soft-404 baseline", () => {
    const body = JSON.stringify({ mappings: "AAAA" });
    expect(evaluateSourceMap(mapUrl, { status: 200, body }, { status: 200, body })).toHaveLength(0);
  });
});
