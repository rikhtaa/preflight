import type { Finding, Severity, Verdict } from "./types";

export function verdictFor(findings: Array<Pick<Finding, "severity">>): Verdict {
  if (findings.some((f) => f.severity === "critical" || f.severity === "high")) {
    return "fix-before-launch";
  }
  if (findings.some((f) => f.severity === "medium")) return "fix-soon";
  return "nice-to-have";
}

export function countBySeverity(
  findings: Array<Pick<Finding, "severity">>,
): Record<Severity, number> {
  const counts: Record<Severity, number> = { critical: 0, high: 0, medium: 0, low: 0, info: 0 };
  for (const finding of findings) counts[finding.severity] += 1;
  return counts;
}
