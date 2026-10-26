import { describe, expect, it } from "vitest";
import { mask } from "./shared";
import { mergeFindings, scanText } from "./secrets";
import { jwt, token } from "./testkit";

const URL_A = "https://example.test/app.js";

function ruleIds(text: string): string[] {
  return scanText(text, URL_A).map((f) => f.ruleId);
}

describe("scanText: things we flag", () => {
  const cases: Array<[string, string, string, string]> = [
    ["stripe live secret", "stripe-live-secret", `const k = "sk_live_${token(24)}";`, "critical"],
    ["stripe restricted live", "stripe-live-secret", `const k = "rk_live_${token(24, 2)}";`, "critical"],
    ["stripe test secret", "stripe-test-secret", `const k = "sk_test_${token(24)}";`, "low"],
    ["stripe webhook secret", "stripe-webhook-secret", `const k = "whsec_${token(32)}";`, "high"],
    ["openai key", "openai-key", `apiKey: "sk-${token(48)}"`, "critical"],
    ["openai project key", "openai-key", `apiKey: "sk-proj-${token(60, 4)}"`, "critical"],
    ["anthropic key", "anthropic-key", `key = "sk-ant-api03-${token(60, 5)}"`, "critical"],
    ["aws access key id", "aws-access-key-id", `id: "AKIA${"Q7MZ3KX9TRB2WLE5".slice(0, 16)}"`, "high"],
    ["github classic token", "github-token", `t = "ghp_${token(40, 6)}"`, "critical"],
    ["github fine-grained token", "github-token", `t = "github_pat_${token(70, 7)}"`, "critical"],
    ["slack token", "slack-token", `t = "xoxb-${token(12, 8)}-${token(24, 9)}"`, "high"],
    ["sendgrid key", "sendgrid-key", `k = "SG.${token(22, 10)}.${token(43, 11)}"`, "high"],
    ["resend key", "resend-key", `k = "re_${token(8, 12)}_${token(24, 13)}"`, "high"],
    ["supabase secret key", "supabase-secret-key", `k = "sb_secret_${token(30, 14)}"`, "critical"],
    [
      "supabase service_role jwt",
      "supabase-service-role",
      `const key = "${jwt({ role: "service_role", iss: "supabase" })}";`,
      "critical",
    ],
    [
      "private key block",
      "private-key-block",
      `-----BEGIN RSA PRIVATE KEY-----\n${token(64, 15)}\n${token(64, 16)}\n-----END RSA PRIVATE KEY-----`,
      "critical",
    ],
  ];

  for (const [name, ruleId, text, severity] of cases) {
    it(`flags ${name}`, () => {
      const findings = scanText(text, URL_A);
      const hit = findings.find((f) => f.ruleId === ruleId);
      expect(hit).toBeDefined();
      expect(hit?.severity).toBe(severity);
      expect(hit?.category).toBe("secrets");
    });
  }

  it("flags a private key written with escaped newlines inside a JS string", () => {
    const text = `const pem = "-----BEGIN PRIVATE KEY-----\\n${token(64, 20)}\\n${token(64, 21)}\\n-----END PRIVATE KEY-----";`;
    expect(ruleIds(text)).toContain("private-key-block");
  });
});

describe("scanText: things we must NEVER flag", () => {
  const safe: Array<[string, string]> = [
    ["stripe publishable live key", `pk_live_${token(24)}`],
    ["stripe publishable test key", `pk_test_${token(24, 2)}`],
    ["supabase anon jwt", jwt({ role: "anon", iss: "supabase" })],
    ["supabase publishable key", `sb_publishable_${token(30)}`],
    ["firebase web api key", `AIza${token(35)}`],
    ["clerk publishable key", `pk_live_${token(40, 3)}`],
    ["posthog project key", `phc_${token(43, 4)}`],
    ["google maps key", `AIza${token(35, 5)}`],
  ];

  for (const [name, value] of safe) {
    it(`ignores ${name}`, () => {
      expect(scanText(`const config = { key: "${value}" };`, URL_A)).toHaveLength(0);
    });
  }

  
  it("ignores placeholder values", () => {
    const text = [
      'STRIPE_KEY="YOUR_STRIPE_KEY_HERE"',
      'OPENAI_KEY="YOUR_OPENAI_KEY_HERE"',
      'KEY="REPLACE_WITH_STRIPE_SECRET"',
      'KEY="YOUR_AWS_ACCESS_KEY_ID"',
    ].join("\n");
    expect(scanText(text, URL_A)).toHaveLength(0);
  });

  it("does not use a generic entropy rule", () => {
    expect(scanText(`const id = "${token(64, 9)}";`, URL_A)).toHaveLength(0);
  });

  it("does not flag ordinary words that start with sk-", () => {
    expect(scanText('<div class="sk-chase-dot-before sk-circle-fade-wrapper">', URL_A)).toHaveLength(0);
  });

  it("does not flag a PEM header without a real key body", () => {
    expect(scanText('const re = "-----BEGIN RSA PRIVATE KEY-----"; // docs', URL_A)).toHaveLength(0);
  });

  it("returns nothing for empty text", () => {
    expect(scanText("", URL_A)).toHaveLength(0);
  });
});

describe("scanText: masking", () => {
  it("shows only the first 4 and last 2 characters", () => {
    const value = `sk_live_${token(24)}`;
    const [finding] = scanText(`k="${value}"`, URL_A);
    expect(finding.maskedEvidence).toBe(mask(value));
    expect(finding.maskedEvidence).toBe(`${value.slice(0, 4)}…${value.slice(-2)}`);
  });

  it("never lets the full secret (or most of it) appear anywhere in the output", () => {
    const secrets = [
      `sk_live_${token(24)}`,
      `sk-${token(48)}`,
      `ghp_${token(40, 6)}`,
      jwt({ role: "service_role" }),
    ];
    const text = secrets.map((s) => `x="${s}"`).join("\n");
    const output = JSON.stringify(scanText(text, URL_A));
    for (const secret of secrets) {
      expect(output).not.toContain(secret);
      expect(output).not.toContain(secret.slice(4, 24));
    }
  });

  it("describes a private key without revealing any of it", () => {
    const body = token(64, 15);
    const text = `-----BEGIN RSA PRIVATE KEY-----\n${body}\n${token(64, 16)}\n-----END RSA PRIVATE KEY-----`;
    const output = JSON.stringify(scanText(text, URL_A));
    expect(output).not.toContain(body.slice(0, 20));
    expect(output).toContain("PRIVATE KEY block");
  });
});

describe("scanText: dedupe and locations", () => {
  it("turns the same key found three times into ONE finding with three locations", () => {
    const value = `sk_live_${token(24)}`;
    const text = `a="${value}";\nb="${value}";\nc="${value}";`;
    const findings = scanText(text, URL_A);
    expect(findings).toHaveLength(1);
    expect(findings[0].locations).toHaveLength(3);
    expect(findings[0].locations.map((l) => l.line)).toEqual([1, 2, 3]);
  });

  it("reports line and column", () => {
    const value = `sk_live_${token(24)}`;
    const text = `line one\nconst k = "${value}";`;
    const [finding] = scanText(text, URL_A);
    expect(finding.locations[0].line).toBe(2);
    expect(finding.locations[0].column).toBe(12);
  });

  it("merges the same key found in different files into ONE finding", () => {
    const value = `sk_live_${token(24)}`;
    const merged = mergeFindings([
      ...scanText(`k="${value}"`, "https://example.test/a.js"),
      ...scanText(`k="${value}"`, "https://example.test/b.js"),
      ...scanText(`k="${value}"`, "https://example.test/c.js"),
    ]);
    expect(merged).toHaveLength(1);
    expect(merged[0].locations.map((l) => l.url)).toEqual([
      "https://example.test/a.js",
      "https://example.test/b.js",
      "https://example.test/c.js",
    ]);
  });

  it("keeps two different keys as two findings, most severe first", () => {
    const text = `a="sk_test_${token(24)}"; b="sk_live_${token(24, 2)}";`;
    const findings = scanText(text, URL_A);
    expect(findings).toHaveLength(2);
    expect(findings[0].severity).toBe("critical");
  });
});
