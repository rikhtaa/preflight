import type { Confidence, Finding, Severity } from "../types";
import { fingerprint, makeLocator, mask, mergeFindings } from "./shared";

const MAX_MATCHES_PER_RULE = 50;

interface Rule {
  id: string;
  title: string;
  severity: Severity;
  confidence: Confidence;
  /** Must have the global flag. */
  pattern: RegExp;
  description: string;
  /** Which part of the match is the secret. Default: the whole match. */
  extract?: (match: RegExpMatchArray) => string;
  /** Return false to reject a match. */
  accept?: (value: string) => boolean;
  /** Set to false for rules that already validate the value themselves. */
  rejectPlaceholders?: boolean;
  /** How the value is shown. Default: first 4 + "…" + last 2. */
  maskFn?: (value: string) => string;
}

const PLACEHOLDER_WORDS = /(example|your[_-]|placeholder|redacted|changeme|replace[_-]?me|dummy|sample|fake|\*{4,})/i;

/** Removes things like "sk_live_" or "sk-proj-" so we can judge the random part. */
function randomPart(value: string): string {
  return value.replace(/^(?:[A-Za-z]{1,10}[_-]){1,3}/, "");
}

function looksLikePlaceholder(value: string): boolean {
  if (PLACEHOLDER_WORDS.test(value)) return true;
  return new Set(randomPart(value)).size < 6;
}

function hasMixedCase(value: string): boolean {
  return /\d/.test(value) && /[a-z]/.test(value) && /[A-Z]/.test(value);
}

function isServiceRoleJwt(token: string): boolean {
  const parts = token.split(".");
  if (parts.length !== 3) return false;
  try {
    const payload = JSON.parse(Buffer.from(parts[1], "base64url").toString("utf8")) as {
      role?: unknown;
    };
    return payload.role === "service_role";
  } catch {
    return false;
  }
}

const REVOKE_FIRST = "Revoke it first in the provider's dashboard, then replace it with a server-side environment variable.";

const RULES: Rule[] = [
  {
    id: "stripe-live-secret",
    title: "Stripe live secret key exposed",
    severity: "critical",
    confidence: "high",
    pattern: /\b(?:sk|rk)_live_[0-9A-Za-z]{16,}/g,
    description: `A live Stripe secret key appears in a file anyone can download. ${REVOKE_FIRST}`,
  },
  {
    id: "stripe-test-secret",
    title: "Stripe test secret key exposed",
    severity: "low",
    confidence: "high",
    pattern: /\bsk_test_[0-9A-Za-z]{16,}/g,
    description:
      "A Stripe test-mode secret key appears in a public file. It cannot move real money, but it should not be public. Roll it in the Stripe dashboard and keep it server-side.",
  },
  {
    id: "stripe-webhook-secret",
    title: "Stripe webhook signing secret exposed",
    severity: "high",
    confidence: "high",
    pattern: /\bwhsec_[0-9A-Za-z]{16,}/g,
    description: `Anyone with this secret can forge webhook events to your server. ${REVOKE_FIRST}`,
  },
  {
    id: "openai-key",
    title: "OpenAI API key exposed",
    severity: "critical",
    confidence: "high",
    pattern: /\bsk-(?!ant-)(?:proj-|svcacct-|admin-)?[A-Za-z0-9_-]{32,}/g,
    accept: (value) => hasMixedCase(value.slice(3)),
    description: `Anyone can use this key and run up your bill. ${REVOKE_FIRST}`,
  },
  {
    id: "anthropic-key",
    title: "Anthropic API key exposed",
    severity: "critical",
    confidence: "high",
    pattern: /\bsk-ant-[A-Za-z0-9_-]{32,}/g,
    description: `Anyone can use this key and run up your bill. ${REVOKE_FIRST}`,
  },
  {
    id: "aws-access-key-id",
    title: "AWS access key ID exposed",
    severity: "high",
    confidence: "high",
    pattern: /\b(?:AKIA|ASIA)[0-9A-Z]{16}\b/g,
    description: `An AWS access key ID is public. Check whether its secret key is exposed too. ${REVOKE_FIRST}`,
  },
  {
    id: "github-token",
    title: "GitHub token exposed",
    severity: "critical",
    confidence: "high",
    pattern: /\b(?:gh[pousr]_[A-Za-z0-9]{36,}|github_pat_[A-Za-z0-9_]{40,})/g,
    description: `A GitHub token in a public file can give access to your code. ${REVOKE_FIRST}`,
  },
  {
    id: "slack-token",
    title: "Slack token exposed",
    severity: "high",
    confidence: "high",
    pattern: /\bxox[baprs]-[A-Za-z0-9-]{10,}/g,
    description: `A Slack token can read or post in your workspace. ${REVOKE_FIRST}`,
  },
  {
    id: "sendgrid-key",
    title: "SendGrid API key exposed",
    severity: "high",
    confidence: "high",
    pattern: /\bSG\.[A-Za-z0-9_-]{16,}\.[A-Za-z0-9_-]{16,}/g,
    description: `Anyone can send email as you with this key. ${REVOKE_FIRST}`,
  },
  {
    id: "resend-key",
    title: "Resend API key exposed",
    severity: "high",
    confidence: "medium",
    pattern: /\bre_[A-Za-z0-9]{6,}_[A-Za-z0-9]{16,}/g,
    accept: (value) => /\d/.test(value) && /[A-Za-z]/.test(value),
    description: `Anyone can send email as you with this key. ${REVOKE_FIRST}`,
  },
  {
    id: "supabase-secret-key",
    title: "Supabase secret key exposed",
    severity: "critical",
    confidence: "high",
    pattern: /\bsb_secret_[A-Za-z0-9_-]{16,}/g,
    description: `This key bypasses Row Level Security and gives full database access. ${REVOKE_FIRST}`,
  },
  {
    id: "supabase-service-role",
    title: "Supabase service_role key exposed",
    severity: "critical",
    confidence: "high",
    pattern: /\beyJ[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}/g,
    accept: isServiceRoleJwt,
    rejectPlaceholders: false,
    description: `The service_role key bypasses Row Level Security and gives full database access. ${REVOKE_FIRST}`,
  },
  {
    id: "private-key-block",
    title: "Private key exposed",
    severity: "critical",
    confidence: "high",
    pattern:
      /-----BEGIN (?:[A-Z]+ )*PRIVATE KEY-----([A-Za-z0-9+/=\s\\]{80,}?)-----END (?:[A-Z]+ )*PRIVATE KEY-----/g,
    extract: (match) => match[1].replace(/\s|\\r|\\n/g, ""),
    maskFn: (value) => `PRIVATE KEY block (${value.length} characters)`,
    description:
      "A private key is included in a public file. Treat it as stolen: generate a new key pair, replace it everywhere, and remove the old one.",
  },
];

/**
 * Scans one text file (HTML, JavaScript, .env content) for leaked secrets.
 * Returns masked findings only. The full secret is never returned or logged.
 */
export function scanText(text: string, sourceUrl: string): Finding[] {
  if (!text) return [];
  const locate = makeLocator(text);
  const found: Finding[] = [];

  for (const rule of RULES) {
    let accepted = 0;
    for (const match of text.matchAll(rule.pattern)) {
      if (accepted >= MAX_MATCHES_PER_RULE) break;
      const value = rule.extract ? rule.extract(match) : match[0];
      if (!value) continue;
      if (rule.rejectPlaceholders !== false && looksLikePlaceholder(value)) continue;
      if (rule.accept && !rule.accept(value)) continue;

      accepted += 1;
      const { line, column } = locate(match.index ?? 0);
      found.push({
        id: `${rule.id}:${fingerprint(value)}`,
        ruleId: rule.id,
        title: rule.title,
        severity: rule.severity,
        category: "secrets",
        confidence: rule.confidence,
        maskedEvidence: (rule.maskFn ?? mask)(value),
        locations: [{ url: sourceUrl, line, column }],
        description: rule.description,
      });
    }
  }

  return mergeFindings(found);
}

export { mergeFindings } from "./shared";
