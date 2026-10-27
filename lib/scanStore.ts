import type { ScanResult } from "./scan";

export interface ScanStore {
  save(result: ScanResult): Promise<void>;
  get(id: string): Promise<ScanResult | null>;
}

const ID_PATTERN = /^[A-Za-z0-9_-]{12}$/;
const DEFAULT_TTL_MS = 24 * 60 * 60 * 1000;
const DEFAULT_MAX_ENTRIES = 500;

/**
 * TEMPORARY in-memory store. It works on your own computer, but serverless hosts
 * (like Netlify) start fresh copies of the app, so results would disappear there.
 * Replace this with a real database before you deploy.
 */
export class MemoryScanStore implements ScanStore {
  private items = new Map<string, { result: ScanResult; expiresAt: number }>();
  private ttlMs: number;
  private maxEntries: number;
  private now: () => number;

  constructor(options: { ttlMs?: number; maxEntries?: number; now?: () => number } = {}) {
    this.ttlMs = options.ttlMs ?? DEFAULT_TTL_MS;
    this.maxEntries = options.maxEntries ?? DEFAULT_MAX_ENTRIES;
    this.now = options.now ?? (() => Date.now());
  }

  async save(result: ScanResult): Promise<void> {
    this.prune();
    this.items.set(result.id, { result, expiresAt: this.now() + this.ttlMs });
    while (this.items.size > this.maxEntries) {
      const oldest = this.items.keys().next().value;
      if (oldest === undefined) break;
      this.items.delete(oldest);
    }
  }

  async get(id: string): Promise<ScanResult | null> {
    if (!ID_PATTERN.test(id)) return null;
    const entry = this.items.get(id);
    if (!entry) return null;
    if (entry.expiresAt <= this.now()) {
      this.items.delete(id);
      return null;
    }
    return entry.result;
  }

  private prune(): void {
    const now = this.now();
    for (const [id, entry] of Array.from(this.items.entries())) {
      if (entry.expiresAt <= now) this.items.delete(id);
    }
  }
}

// Kept on globalThis so the dev server's hot reloads do not wipe it.
const globalForStore = globalThis as unknown as { __tsvScanStore?: ScanStore };
export const scanStore: ScanStore = (globalForStore.__tsvScanStore ??= new MemoryScanStore());
