import { describe, expect, it } from "vitest";
import { countBySeverity, verdictFor } from "./verdict";

describe("verdictFor", () => {
  it("is fix-before-launch for any critical or high", () => {
    expect(verdictFor([{ severity: "critical" }])).toBe("fix-before-launch");
    expect(verdictFor([{ severity: "low" }, { severity: "high" }])).toBe("fix-before-launch");
  });
  it("is fix-soon for medium", () => {
    expect(verdictFor([{ severity: "medium" }, { severity: "low" }])).toBe("fix-soon");
  });
  it("is nice-to-have otherwise", () => {
    expect(verdictFor([{ severity: "low" }, { severity: "info" }])).toBe("nice-to-have");
    expect(verdictFor([])).toBe("nice-to-have");
  });
});

describe("countBySeverity", () => {
  it("counts every severity", () => {
    const counts = countBySeverity([{ severity: "critical" }, { severity: "low" }, { severity: "low" }]);
    expect(counts).toEqual({ critical: 1, high: 0, medium: 0, low: 2, info: 0 });
  });
});
