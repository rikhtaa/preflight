export interface RateLimitResult {
  allowed: boolean;
  retryAfterSeconds: number;
}

export interface RateLimiter {
  check(key: string): RateLimitResult;
}

/** Simple fixed-window limiter kept in memory. Fine for one server; use a shared store when you scale. */
export class FixedWindowRateLimiter implements RateLimiter {
  private hits = new Map<string, { count: number; resetAt: number }>();
  private limit: number;
  private windowMs: number;
  private now: () => number;

  constructor(limit: number, windowMs: number, now: () => number = () => Date.now()) {
    this.limit = limit;
    this.windowMs = windowMs;
    this.now = now;
  }

  check(key: string): RateLimitResult {
    const now = this.now();
    if (this.hits.size > 5000) this.prune(now);

    const entry = this.hits.get(key);
    if (!entry || entry.resetAt <= now) {
      this.hits.set(key, { count: 1, resetAt: now + this.windowMs });
      return { allowed: true, retryAfterSeconds: 0 };
    }
    if (entry.count >= this.limit) {
      return { allowed: false, retryAfterSeconds: Math.max(1, Math.ceil((entry.resetAt - now) / 1000)) };
    }
    entry.count += 1;
    return { allowed: true, retryAfterSeconds: 0 };
  }

  private prune(now: number): void {
    for (const [key, entry] of Array.from(this.hits.entries())) {
      if (entry.resetAt <= now) this.hits.delete(key);
    }
  }
}

function configuredLimit(): number {
  const fromEnv = Number(process.env.SCAN_RATE_LIMIT_PER_HOUR);
  if (Number.isFinite(fromEnv) && fromEnv > 0) return fromEnv;
  return process.env.NODE_ENV === "development" ? 100 : 5;
}

const globalForLimiter = globalThis as unknown as { __tsvScanLimiter?: RateLimiter };
export const scanRateLimiter: RateLimiter = (globalForLimiter.__tsvScanLimiter ??=
  new FixedWindowRateLimiter(configuredLimit(), 60 * 60 * 1000));

/** Best-effort visitor address. These headers can be faked, so this only slows down casual abuse. */
export function clientIp(headers: Headers): string {
  const netlify = headers.get("x-nf-client-connection-ip");
  if (netlify) return netlify.trim();
  const forwarded = headers.get("x-forwarded-for");
  if (forwarded) return forwarded.split(",")[0].trim() || "unknown";
  return headers.get("x-real-ip")?.trim() || "unknown";
}
