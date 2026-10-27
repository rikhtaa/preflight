import { describe, expect, it } from "vitest";
import { FixedWindowRateLimiter, clientIp } from "./rateLimit";

describe("FixedWindowRateLimiter", () => {
  it("allows the limit, then blocks with a retry time, then resets", () => {
    let now = 1_000_000;
    const limiter = new FixedWindowRateLimiter(5, 3_600_000, () => now);
    for (let i = 0; i < 5; i++) expect(limiter.check("1.2.3.4").allowed).toBe(true);
    const blocked = limiter.check("1.2.3.4");
    expect(blocked.allowed).toBe(false);
    expect(blocked.retryAfterSeconds).toBe(3600);
    now += 1_800_000;
    expect(limiter.check("1.2.3.4").retryAfterSeconds).toBe(1800);
    now += 1_800_001;
    expect(limiter.check("1.2.3.4").allowed).toBe(true);
  });
  it("tracks each visitor separately", () => {
    const limiter = new FixedWindowRateLimiter(1, 1000, () => 0);
    expect(limiter.check("a").allowed).toBe(true);
    expect(limiter.check("b").allowed).toBe(true);
    expect(limiter.check("a").allowed).toBe(false);
  });
});

describe("clientIp", () => {
  it("prefers the host's header, then x-forwarded-for, then x-real-ip", () => {
    expect(clientIp(new Headers({ "x-nf-client-connection-ip": "9.9.9.9", "x-forwarded-for": "1.1.1.1" }))).toBe("9.9.9.9");
    expect(clientIp(new Headers({ "x-forwarded-for": "1.1.1.1, 2.2.2.2" }))).toBe("1.1.1.1");
    expect(clientIp(new Headers({ "x-real-ip": "3.3.3.3" }))).toBe("3.3.3.3");
    expect(clientIp(new Headers())).toBe("unknown");
  });
});
