export type Severity = "critical" | "high" | "medium" | "low" | "info";
export type Category = "secrets" | "headers" | "exposed-files";
export type Confidence = "high" | "medium";
export type Verdict = "fix-before-launch" | "fix-soon" | "nice-to-have";

export interface FindingLocation {
  url: string;
  line?: number;
  column?: number;
}

export interface Finding {
  /** Stable id. Findings with the same id are merged into one (more locations). */
  id: string;
  ruleId: string;
  title: string;
  severity: Severity;
  category: Category;
  confidence: Confidence;
  /** Masked or name-only evidence. NEVER a full secret. */
  maskedEvidence?: string;
  locations: FindingLocation[];
  description: string;
}

export interface SkippedCheck {
  id: string;
  reason: string;
}

export interface ScanCoverage {
  checksRun: string[];
  checksSkipped: SkippedCheck[];
  filesFetched: number;
  filesSkipped: number;
  deadlineHit: boolean;
}
