import { NextResponse } from "next/server";
import { clientIp, scanRateLimiter } from "../../../lib/rateLimit";
import { runScan, type ScanErrorCode } from "../../../lib/scan";
import { scanStore } from "../../../lib/scanStore";

export const maxDuration = 30;

const MAX_ACTIVE_SCANS = 5;
let activeScans = 0;

const STATUS_FOR_ERROR: Record<ScanErrorCode, number> = {
  BAD_URL: 400,
  BLOCKED_ADDRESS: 400,
  NOT_A_WEB_PAGE: 422,
  UNREACHABLE: 502,
  HTTP_ERROR: 502,
  REDIRECT_LIMIT: 502,
  TIMEOUT: 504,
  INTERNAL: 500,
};

function jsonError(status: number, code: string, message: string, headers: Record<string, string> = {}) {
  return NextResponse.json({ error: { code, message } }, { status, headers: { "Cache-Control": "no-store", ...headers } });
}

function parseBody(value: unknown): { url: string; ownershipConfirmed: boolean } | null {
  if (typeof value !== "object" || value === null) return null;
  const { url, ownershipConfirmed } = value as Record<string, unknown>;
  if (typeof url !== "string" || url.length === 0 || url.length > 2048) return null;
  return { url, ownershipConfirmed: ownershipConfirmed === true };
}

function isSameOrigin(request: Request): boolean {
  const origin = request.headers.get("origin");
  if (!origin) return true; // non-browser callers send no Origin header
  const host = request.headers.get("x-forwarded-host") ?? request.headers.get("host");
  try {
    return host !== null && new URL(origin).host === host;
  } catch {
    return false;
  }
}

export async function POST(request: Request) {
  if (!isSameOrigin(request)) {
    return jsonError(403, "FORBIDDEN", "This request is not allowed.");
  }

  let json: unknown;
  try {
    json = await request.json();
  } catch {
    return jsonError(400, "BAD_REQUEST", "Send a JSON body with a url.");
  }

  const body = parseBody(json);
  if (!body) return jsonError(400, "BAD_REQUEST", "Enter a website address, like https://your-site.com.");
  if (!body.ownershipConfirmed) {
    return jsonError(400, "OWNERSHIP_REQUIRED", "Please confirm that you own this site or have permission to test it.");
  }

  const limit = scanRateLimiter.check(clientIp(request.headers));
  if (!limit.allowed) {
    return jsonError(429, "RATE_LIMITED", "You have reached the hourly scan limit. Please try again later.", {
      "Retry-After": String(limit.retryAfterSeconds),
    });
  }

  if (activeScans >= MAX_ACTIVE_SCANS) {
    return jsonError(503, "BUSY", "We are busy right now. Please try again in a minute.", { "Retry-After": "30" });
  }

  activeScans += 1;
  try {
    const outcome = await runScan(body.url);
    if (!outcome.ok) {
      return jsonError(STATUS_FOR_ERROR[outcome.error.code], outcome.error.code, outcome.error.message);
    }
    await scanStore.save(outcome.result);
    return NextResponse.json({ id: outcome.result.id }, { headers: { "Cache-Control": "no-store" } });
  } finally {
    activeScans -= 1;
  }
}
