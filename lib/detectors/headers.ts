import type { Finding, Severity } from "../types";

export type HeaderInput =
  | Headers
  | Record<string, string | string[] | undefined>
  | Array<[string, string]>;

function normalize(input: HeaderInput): Map<string, string> {
  const map = new Map<string, string>();
  const add = (name: string, value: string | string[] | undefined) => {
    if (value === undefined) return;
    map.set(name.toLowerCase(), Array.isArray(value) ? value.join(", ") : value);
  };

  if (typeof Headers !== "undefined" && input instanceof Headers) {
    input.forEach((value, name) => add(name, value));
  } else if (Array.isArray(input)) {
    for (const [name, value] of input) add(name, value);
  } else {
    for (const [name, value] of Object.entries(input)) add(name, value);
  }
  return map;
}

function parseCsp(value: string): Map<string, string[]> {
  const directives = new Map<string, string[]>();
  for (const part of value.split(";")) {
    const tokens = part.trim().split(/\s+/).filter(Boolean);
    if (tokens.length === 0) continue;
    const [name, ...values] = tokens;
    const key = name.toLowerCase();
    if (!directives.has(key)) directives.set(key, values); // first one wins, like browsers
  }
  return directives;
}

function isHttps(url: string): boolean | null {
  try {
    return new URL(url).protocol === "https:";
  } catch {
    return null;
  }
}

/** Checks response headers from the main page. Pure function: no network. */
export function checkHeaders(input: HeaderInput, finalUrl: string): Finding[] {
  const headers = normalize(input);
  const findings: Finding[] = [];

  const add = (
    id: string,
    title: string,
    severity: Severity,
    description: string,
    maskedEvidence?: string,
  ) => {
    findings.push({
      id: `headers:${id}`,
      ruleId: id,
      title,
      severity,
      category: "headers",
      confidence: "high",
      maskedEvidence,
      locations: [{ url: finalUrl }],
      description,
    });
  };

  // Content-Security-Policy
  const cspValue = headers.get("content-security-policy");
  const csp = cspValue ? parseCsp(cspValue) : null;

  if (!csp) {
    const reportOnly = headers.has("content-security-policy-report-only");
    add(
      "csp-missing",
      "Content Security Policy is missing",
      "medium",
      "A Content-Security-Policy header limits which scripts and resources your pages can load, which reduces the damage of cross-site scripting.",
      reportOnly ? "Only a Report-Only policy was found, which does not block anything." : undefined,
    );
  } else {
    const scriptSources = csp.get("script-src") ?? csp.get("default-src") ?? [];
    const lowered = scriptSources.map((source) => source.toLowerCase());
    const hasNonceOrHash = lowered.some(
      (source) => /^'(?:nonce-|sha(?:256|384|512)-)/.test(source) || source === "'strict-dynamic'",
    );
    const problems: string[] = [];
    if (lowered.includes("'unsafe-eval'")) problems.push("'unsafe-eval'");
    if (lowered.includes("'unsafe-inline'") && !hasNonceOrHash) problems.push("'unsafe-inline'");
    if (problems.length > 0) {
      add(
        "csp-unsafe",
        "Content Security Policy allows unsafe scripts",
        "low",
        "Your policy permits inline or eval-based scripts, which weakens its protection against cross-site scripting.",
        `Script policy includes ${problems.join(" and ")}`,
      );
    }
  }

  // HSTS (only meaningful on HTTPS)
  if (isHttps(finalUrl) === true && !headers.has("strict-transport-security")) {
    add(
      "hsts-missing",
      "HTTPS is not enforced with HSTS",
      "medium",
      "A Strict-Transport-Security header tells browsers to always use HTTPS for your site, which blocks downgrade attacks.",
    );
  }

  // MIME sniffing
  if (!(headers.get("x-content-type-options") ?? "").toLowerCase().includes("nosniff")) {
    add(
      "nosniff-missing",
      "MIME sniffing protection is missing",
      "low",
      "Set X-Content-Type-Options: nosniff so browsers do not guess file types.",
    );
  }

  // Referrer-Policy
  if (!headers.has("referrer-policy")) {
    add(
      "referrer-policy-missing",
      "Referrer Policy is missing",
      "low",
      "A Referrer-Policy header limits how much of your page address is shared with other sites.",
    );
  }

  // Clickjacking protection: X-Frame-Options or CSP frame-ancestors
  const hasFrameOptions = headers.has("x-frame-options");
  const hasFrameAncestors = csp?.has("frame-ancestors") ?? false;
  if (!hasFrameOptions && !hasFrameAncestors) {
    add(
      "clickjacking-protection-missing",
      "Clickjacking protection is missing",
      "low",
      "Without X-Frame-Options or a CSP frame-ancestors rule, other sites can embed your pages in a frame.",
    );
  }

  // Permissions-Policy
  if (!headers.has("permissions-policy")) {
    add(
      "permissions-policy-missing",
      "Permissions Policy is missing",
      "info",
      "A Permissions-Policy header lets you turn off browser features (camera, microphone, location) your site does not use.",
    );
  }

  // Version disclosure
  for (const name of ["server", "x-powered-by"] as const) {
    const value = headers.get(name);
    if (value && /\d+(?:\.\d+)+/.test(value)) {
      add(
        `version-disclosure-${name}`,
        "Server software version is visible",
        "info",
        "Showing exact software versions helps attackers pick known exploits. Hide the version if your host allows it.",
        `${name === "server" ? "Server" : "X-Powered-By"}: ${value.slice(0, 80)}`,
      );
    }
  }

  return findings;
}
