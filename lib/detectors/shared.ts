import { createHash } from "node:crypto";
import type { Finding, FindingLocation, Severity } from "../types";

export const MAX_LOCATIONS = 10;

export const SEVERITY_ORDER: Record<Severity, number> = {
  critical: 4,
  high: 3,
  medium: 2,
  low: 1,
  info: 0,
};

/** First 8 hex chars of the SHA-256 of a value. Used only to dedupe, never to reveal. */
export function fingerprint(value: string): string {
  return createHash("sha256").update(value).digest("hex").slice(0, 8);
}

/** First 4 characters + "…" + last 2 characters. */
export function mask(value: string): string {
  if (value.length <= 8) return "…";
  return `${value.slice(0, 4)}…${value.slice(-2)}`;
}

/** Returns a function that converts a string index into a 1-based line and column. */
export function makeLocator(text: string): (index: number) => { line: number; column: number } {
  let breaks: number[] | null = null;
  return (index: number) => {
    if (breaks === null) {
      breaks = [];
      for (let i = text.indexOf("\n"); i !== -1; i = text.indexOf("\n", i + 1)) {
        breaks.push(i);
      }
    }
    let lo = 0;
    let hi = breaks.length;
    while (lo < hi) {
      const mid = (lo + hi) >> 1;
      if (breaks[mid] < index) lo = mid + 1;
      else hi = mid;
    }
    const previousBreak = lo === 0 ? -1 : breaks[lo - 1];
    return { line: lo + 1, column: index - previousBreak };
  };
}

function dedupeLocations(locations: FindingLocation[]): FindingLocation[] {
  const seen = new Set<string>();
  const out: FindingLocation[] = [];
  for (const location of locations) {
    const key = `${location.url}|${location.line ?? ""}|${location.column ?? ""}`;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(location);
    if (out.length >= MAX_LOCATIONS) break;
  }
  return out;
}

export function bySeverityDesc(a: Finding, b: Finding): number {
  return SEVERITY_ORDER[b.severity] - SEVERITY_ORDER[a.severity];
}

/**
 * Merge findings that share an id (for example the same leaked key found in
 * three script files becomes ONE finding with three locations).
 */
export function mergeFindings(findings: Finding[]): Finding[] {
  const byId = new Map<string, Finding>();
  for (const finding of findings) {
    const existing = byId.get(finding.id);
    if (!existing) {
      byId.set(finding.id, { ...finding, locations: dedupeLocations(finding.locations) });
      continue;
    }
    existing.locations = dedupeLocations([...existing.locations, ...finding.locations]);
    if (SEVERITY_ORDER[finding.severity] > SEVERITY_ORDER[existing.severity]) {
      existing.severity = finding.severity;
    }
  }
  return Array.from(byId.values()).sort(bySeverityDesc);
}
