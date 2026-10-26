import { describe, expect, it } from "vitest";
import { checkHeaders } from "./headers";

const URL_HTTPS = "https://example.test/";

const SECURE: Record<string, string> = {
  "content-security-policy": "default-src 'self'; script-src 'self'; frame-ancestors 'none'",
  "strict-transport-security": "max-age=63072000; includeSubDomains",
  "x-content-type-options": "nosniff",
  "referrer-policy": "strict-origin-when-cross-origin",
  "x-frame-options": "DENY",
  "permissions-policy": "camera=(), microphone=()",
};

function without(...names: string[]): Record<string, string> {
  const copy = { ...SECURE };
  for (const name of names) delete copy[name];
  return copy;
}

function ids(headers: Record<string, string>, url = URL_HTTPS): string[] {
  return checkHeaders(headers, url).map((f) => f.ruleId);
}

describe("checkHeaders", () => {
  it("returns nothing for a well-configured site", () => {
    expect(checkHeaders(SECURE, URL_HTTPS)).toHaveLength(0);
  });

  it("flags a missing CSP as medium", () => {
    const [finding] = checkHeaders(without("content-security-policy", "x-frame-options"), URL_HTTPS).filter(
      (f) => f.ruleId === "csp-missing",
    );
    expect(finding.severity).toBe("medium");
    expect(finding.category).toBe("headers");
  });

  it("notes when only a Report-Only policy exists", () => {
    const headers = { ...without("content-security-policy"), "content-security-policy-report-only": "default-src 'self'" };
    const finding = checkHeaders(headers, URL_HTTPS).find((f) => f.ruleId === "csp-missing");
    expect(finding?.maskedEvidence).toContain("Report-Only");
  });

  it("flags missing HSTS on https as medium, but not on http", () => {
    const finding = checkHeaders(without("strict-transport-security"), URL_HTTPS).find((f) => f.ruleId === "hsts-missing");
    expect(finding?.severity).toBe("medium");
    expect(ids(without("strict-transport-security"), "http://example.test/")).not.toContain("hsts-missing");
  });

  it("flags missing nosniff, referrer policy and permissions policy", () => {
    const result = ids(without("x-content-type-options", "referrer-policy", "permissions-policy"));
    expect(result).toContain("nosniff-missing");
    expect(result).toContain("referrer-policy-missing");
    expect(result).toContain("permissions-policy-missing");
    const severities = checkHeaders(without("permissions-policy"), URL_HTTPS).map((f) => f.severity);
    expect(severities).toEqual(["info"]);
  });

  it("accepts CSP frame-ancestors instead of X-Frame-Options", () => {
    expect(ids(without("x-frame-options"))).not.toContain("clickjacking-protection-missing");
  });

  it("flags missing clickjacking protection when neither exists", () => {
    const headers = { ...without("x-frame-options"), "content-security-policy": "default-src 'self'" };
    expect(ids(headers)).toContain("clickjacking-protection-missing");
  });

  it("flags unsafe-eval and unsafe-inline in script-src as low", () => {
    const headers = { ...SECURE, "content-security-policy": "script-src 'self' 'unsafe-inline' 'unsafe-eval'; frame-ancestors 'none'" };
    const finding = checkHeaders(headers, URL_HTTPS).find((f) => f.ruleId === "csp-unsafe");
    expect(finding?.severity).toBe("low");
    expect(finding?.maskedEvidence).toContain("'unsafe-eval'");
    expect(finding?.maskedEvidence).toContain("'unsafe-inline'");
  });

  it("falls back to default-src when script-src is absent", () => {
    const headers = { ...SECURE, "content-security-policy": "default-src 'self' 'unsafe-inline'; frame-ancestors 'none'" };
    expect(ids(headers)).toContain("csp-unsafe");
  });

  it("does not flag unsafe-inline when a nonce is present", () => {
    const headers = { ...SECURE, "content-security-policy": "script-src 'nonce-abc123' 'unsafe-inline'; frame-ancestors 'none'" };
    expect(ids(headers)).not.toContain("csp-unsafe");
  });

  it("flags server version disclosure as info, but not a bare product name", () => {
    expect(checkHeaders({ ...SECURE, server: "nginx/1.18.0" }, URL_HTTPS).map((f) => f.ruleId)).toContain("version-disclosure-server");
    expect(ids({ ...SECURE, "x-powered-by": "Express" })).not.toContain("version-disclosure-x-powered-by");
    expect(ids({ ...SECURE, "x-powered-by": "PHP/8.1.2" })).toContain("version-disclosure-x-powered-by");
  });

  it("accepts a Headers object and ignores header name case", () => {
    const headers = new Headers();
    for (const [name, value] of Object.entries(SECURE)) headers.set(name.toUpperCase(), value);
    expect(checkHeaders(headers, URL_HTTPS)).toHaveLength(0);
  });

  it("points every finding at the final URL", () => {
    for (const finding of checkHeaders({}, URL_HTTPS)) {
      expect(finding.locations[0].url).toBe(URL_HTTPS);
    }
  });
});
