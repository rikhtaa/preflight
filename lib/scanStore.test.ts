import { describe, expect, it } from "vitest";
import type { ScanResult } from "./scan";
import { MemoryScanStore } from "./scanStore";

function fake(id: string): ScanResult {
  return {
    id, url: "https://x.test/", finalUrl: "https://x.test/", startedAt: "2026-01-01T00:00:00.000Z", durationMs: 1,
    findings: [], counts: { critical: 0, high: 0, medium: 0, low: 0, info: 0 }, verdict: "nice-to-have",
    coverage: { checksRun: [], checksSkipped: [], filesFetched: 0, filesSkipped: 0, deadlineHit: false },
  };
}

describe("MemoryScanStore", () => {
  it("saves and loads a result", async () => {
    const store = new MemoryScanStore();
    await store.save(fake("abcdefghijkl"));
    expect((await store.get("abcdefghijkl"))?.id).toBe("abcdefghijkl");
  });
  it("returns null for unknown or malformed ids", async () => {
    const store = new MemoryScanStore();
    expect(await store.get("abcdefghijkl")).toBe(null);
    expect(await store.get("../../etc/passwd")).toBe(null);
    expect(await store.get("")).toBe(null);
  });
  it("expires old results", async () => {
    let now = 0;
    const store = new MemoryScanStore({ ttlMs: 1000, now: () => now });
    await store.save(fake("abcdefghijkl"));
    now = 999;
    expect((await store.get("abcdefghijkl"))?.id).toBe("abcdefghijkl");
    now = 1000;
    expect(await store.get("abcdefghijkl")).toBe(null);
  });
  it("evicts the oldest entries beyond the maximum", async () => {
    const store = new MemoryScanStore({ maxEntries: 2 });
    await store.save(fake("aaaaaaaaaaaa"));
    await store.save(fake("bbbbbbbbbbbb"));
    await store.save(fake("cccccccccccc"));
    expect(await store.get("aaaaaaaaaaaa")).toBe(null);
    expect((await store.get("cccccccccccc"))?.id).toBe("cccccccccccc");
  });
});
