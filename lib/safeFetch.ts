import { lookup as dnsLookup } from "node:dns/promises";
import { isIP } from "node:net";
import { Agent, fetch as undiciFetch } from "undici";
import type { Response as UndiciResponse } from "undici";

export const MAX_RESPONSE_BYTES = 2 * 1024 * 1024;
export const REQUEST_TIMEOUT_MS = 8_000;
export const USER_AGENT = "TheSecureVibeScanner/1.0 (+https://thesecurevibe.com/bot)";

export type SafeFetchErrorCode =
  | "BAD_URL"
  | "BLOCKED_ADDRESS"
  | "TIMEOUT"
  | "TOO_LARGE"
  | "REDIRECT_LIMIT"
  | "NETWORK";

export type SafeFetchError = {
  code: SafeFetchErrorCode;
  message: string;
};

export type SafeFetchResult = {
  ok: boolean;
  status: number | null;
  headers: Record<string, string>;
  finalUrl: string;
  body: string;
  truncated: boolean;
  error: SafeFetchError | null;
};

export type SafeFetchOptions = {
  method?: "GET" | "HEAD";
  budget?: FetchBudget;
  signal?: AbortSignal;
};

export type CreateBudgetOptions = {
  deadlineMs: number;
  maxRequests: number;
};

export type FetchBudget = Readonly<CreateBudgetOptions>;

type BudgetState = {
  deadline: number;
  requests: number;
  maxRequests: number;
};

type AddressRecord = {
  address: string;
  family: 4 | 6;
};

const budgetStates = new WeakMap<FetchBudget, BudgetState>();
const maxRedirects = 3;

if (process.env.NODE_ENV === "production" && process.env.ALLOW_PRIVATE_TARGETS !== undefined) {
  throw new Error("ALLOW_PRIVATE_TARGETS must not be set in production.");
}

export function createBudget({ deadlineMs, maxRequests }: CreateBudgetOptions): FetchBudget {
  if (!Number.isFinite(deadlineMs) || deadlineMs <= 0) {
    throw new RangeError("deadlineMs must be a positive finite number.");
  }

  if (!Number.isInteger(maxRequests) || maxRequests < 0) {
    throw new RangeError("maxRequests must be a non-negative integer.");
  }

  const budget = Object.freeze({ deadlineMs, maxRequests });
  budgetStates.set(budget, {
    deadline: Date.now() + deadlineMs,
    requests: 0,
    maxRequests,
  });

  return budget;
}

function parseIPv4(address: string): number[] | null {
  if (isIP(address) !== 4) return null;

  const octets = address.split(".").map(Number);
  return octets.length === 4 ? octets : null;
}

function parseIPv6(address: string): number[] | null {
  if (isIP(address) !== 6) return null;

  let normalized = address.toLowerCase();
  const lastColon = normalized.lastIndexOf(":");

  if (normalized.includes(".")) {
    const ipv4Tail = normalized.slice(lastColon + 1);
    const octets = parseIPv4(ipv4Tail);
    if (!octets) return null;

    const high = ((octets[0] << 8) | octets[1]).toString(16);
    const low = ((octets[2] << 8) | octets[3]).toString(16);
    normalized = `${normalized.slice(0, lastColon)}:${high}:${low}`;
  }

  const halves = normalized.split("::");
  if (halves.length > 2) return null;

  const left = halves[0] ? halves[0].split(":") : [];
  const right = halves.length === 2 && halves[1] ? halves[1].split(":") : [];
  const missingGroups = 8 - left.length - right.length;

  if ((halves.length === 1 && missingGroups !== 0) || (halves.length === 2 && missingGroups < 1)) {
    return null;
  }

  const groups = [...left, ...Array.from({ length: missingGroups }, () => "0"), ...right];
  if (groups.length !== 8 || groups.some((group) => !/^[0-9a-f]{1,4}$/.test(group))) {
    return null;
  }

  const bytes: number[] = [];
  for (const group of groups) {
    const value = Number.parseInt(group, 16);
    bytes.push((value >> 8) & 0xff, value & 0xff);
  }

  return bytes;
}

function isBlockedIPv4(octets: number[]): boolean {
  const [first, second, third] = octets;

  return first === 0
    || first === 10
    || (first === 100 && second >= 64 && second <= 127)
    || first === 127
    || (first === 169 && second === 254)
    || (first === 172 && second >= 16 && second <= 31)
    || (first === 192 && second === 0 && third === 0)
    || (first === 192 && second === 168)
    || (first === 198 && (second === 18 || second === 19))
    || first >= 224;
}

export function isBlockedAddress(address: string): boolean {
  if (isIP(address) === 4) {
    const octets = parseIPv4(address);
    return octets ? isBlockedIPv4(octets) : true;
  }

  const bytes = parseIPv6(address);
  if (!bytes) return true;

  const isUnspecified = bytes.every((byte) => byte === 0);
  const isLoopback = bytes.slice(0, 15).every((byte) => byte === 0) && bytes[15] === 1;
  const isUniqueLocal = (bytes[0] & 0xfe) === 0xfc;
  const isLinkLocal = bytes[0] === 0xfe && (bytes[1] & 0xc0) === 0x80;
  const isMulticast = bytes[0] === 0xff;
  const isIPv4Mapped = bytes.slice(0, 10).every((byte) => byte === 0)
    && bytes[10] === 0xff
    && bytes[11] === 0xff;

  if (isIPv4Mapped) {
    return isBlockedIPv4(bytes.slice(12, 16));
  }

  return isUnspecified || isLoopback || isUniqueLocal || isLinkLocal || isMulticast;
}

function isPrivateTargetAllowed(): boolean {
  return process.env.NODE_ENV === "test"
    || (process.env.NODE_ENV === "development" && process.env.ALLOW_PRIVATE_TARGETS === "1");
}

function normalizeHostname(hostname: string): string {
  return hostname.replace(/^\[|\]$/g, "").replace(/\.$/, "").toLowerCase();
}

function validateUrl(input: string | URL): URL {
  let url: URL;

  try {
    url = input instanceof URL ? new URL(input.href) : new URL(input);
  } catch {
    throw new SafeFetchException("BAD_URL", "The URL is invalid.");
  }

  if (url.protocol !== "http:" && url.protocol !== "https:") {
    throw new SafeFetchException("BAD_URL", "Only HTTP and HTTPS URLs are allowed.");
  }

  if (url.username || url.password) {
    throw new SafeFetchException("BAD_URL", "URLs containing credentials are not allowed.");
  }

  const hostname = normalizeHostname(url.hostname);
  const port = url.port ? Number(url.port) : (url.protocol === "https:" ? 443 : 80);

  if (!hostname || isIP(hostname) !== 0) {
    throw new SafeFetchException("BAD_URL", "IP-literal hosts are not allowed.");
  }

  if (hostname === "localhost" || hostname.endsWith(".local") || hostname.endsWith(".internal") || hostname.endsWith(".localhost")) {
    throw new SafeFetchException("BAD_URL", "Local hostnames are not allowed.");
  }

  if (port !== 80 && port !== 443) {
    throw new SafeFetchException("BAD_URL", "Only ports 80 and 443 are allowed.");
  }

  url.hash = "";
  return url;
}

class SafeFetchException extends Error {
  readonly code: SafeFetchErrorCode;

  constructor(code: SafeFetchErrorCode, message: string) {
    super(message);
    this.name = "SafeFetchException";
    this.code = code;
  }
}

function resultError(
  code: SafeFetchErrorCode,
  message: string,
  finalUrl: string,
  status: number | null = null,
  headers: Record<string, string> = {},
  body = "",
  truncated = false,
): SafeFetchResult {
  return { ok: false, status, headers, finalUrl, body, truncated, error: { code, message } };
}

function getHeaders(response: UndiciResponse): Record<string, string> {
  const headers: Record<string, string> = {};
  response.headers.forEach((value, key) => {
    if (key.toLowerCase() !== "set-cookie") headers[key] = value;
  });
  return headers;
}

function isTextContentType(contentType: string | null): boolean {
  if (!contentType) return false;
  const mediaType = contentType.split(";", 1)[0].trim().toLowerCase();

  return mediaType.startsWith("text/")
    || mediaType === "application/json"
    || mediaType === "application/xml"
    || mediaType === "application/javascript"
    || mediaType === "application/x-javascript"
    || mediaType === "application/xhtml+xml"
    || mediaType.endsWith("+json")
    || mediaType.endsWith("+xml");
}

function redirectLocation(response: UndiciResponse): string | null {
  if (![301, 302, 303, 307, 308].includes(response.status)) return null;
  return response.headers.get("location");
}

export function validateRedirectTarget(currentUrl: URL, location: string): URL {
  try {
    const candidate = new URL(location, currentUrl);
    const validated = validateUrl(candidate);
    if (isHttpsDowngrade(currentUrl, validated)) {
      throw new SafeFetchException("BAD_URL", "HTTPS redirects to HTTP are not allowed.");
    }
    return validated;
  } catch (error) {
    if (error instanceof SafeFetchException) throw error;
    throw new SafeFetchException("BAD_URL", "The redirect URL is invalid or disallowed.");
  }
}

function isHttpsDowngrade(from: URL, to: URL): boolean {
  return from.protocol === "https:" && to.protocol === "http:";
}

async function abortable<T>(promise: Promise<T>, signal: AbortSignal): Promise<T> {
  if (signal.aborted) throw signal.reason ?? new Error("Aborted");

  let onAbort: (() => void) | undefined;
  const aborted = new Promise<never>((_, reject) => {
    onAbort = () => reject(signal.reason ?? new Error("Aborted"));
    signal.addEventListener("abort", onAbort, { once: true });
  });

  try {
    return await Promise.race([promise, aborted]);
  } finally {
    if (onAbort) signal.removeEventListener("abort", onAbort);
  }
}

function claimBudget(budget?: FetchBudget): { state?: BudgetState; error?: SafeFetchError } {
  if (!budget) return {};

  const state = budgetStates.get(budget);
  if (!state) return { error: { code: "NETWORK", message: "The scan request budget is invalid." } };
  if (Date.now() >= state.deadline) {
    return { error: { code: "TIMEOUT", message: "The scan-wide time limit was reached." } };
  }
  if (state.requests >= state.maxRequests) {
    return { error: { code: "NETWORK", message: "The scan request limit was reached." } };
  }

  state.requests += 1;
  return { state };
}

function pinnedLookup(hostname: string, addresses: AddressRecord[], expectedHostname: string) {
  return (
    requestedHostname: string,
    options: { all?: boolean } | number,
    callback: (...args: never[]) => void,
  ) => {
    if (normalizeHostname(requestedHostname) !== expectedHostname) {
      callback(new Error("Unexpected hostname passed to the pinned DNS lookup.") as never);
      return;
    }

    const lookupOptions = typeof options === "number" ? {} : options;
    if (lookupOptions.all) {
      callback(null as never, addresses as never);
      return;
    }

    const firstAddress = addresses[0];
    if (!firstAddress) {
      callback(new Error("No validated DNS address is available.") as never);
      return;
    }

    callback(null as never, firstAddress.address as never, firstAddress.family as never);
  };
}

async function resolveAddresses(hostname: string, signal: AbortSignal): Promise<AddressRecord[]> {
  const records = await abortable(
    dnsLookup(hostname, { all: true, verbatim: true }) as Promise<AddressRecord[]>,
    signal,
  );
  return records.map(({ address, family }) => ({ address, family: family as 4 | 6 }));
}

async function readTextBody(
  response: UndiciResponse,
  controller: AbortController,
): Promise<{ body: string; truncated: boolean }> {
  if (!response.body) return { body: "", truncated: false };

  const reader = response.body.getReader();
  const chunks: Uint8Array[] = [];
  let totalBytes = 0;
  let truncated = false;

  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      const remaining = MAX_RESPONSE_BYTES - totalBytes;
      if (value.byteLength > remaining) {
        if (remaining > 0) {
          chunks.push(value.subarray(0, remaining));
          totalBytes += remaining;
        }
        truncated = true;
        await reader.cancel().catch(() => undefined);
        controller.abort(new Error("Response body size limit exceeded."));
        break;
      }

      chunks.push(value);
      totalBytes += value.byteLength;
    }
  } finally {
    reader.releaseLock();
  }

  const combined = new Uint8Array(totalBytes);
  let offset = 0;
  for (const chunk of chunks) {
    combined.set(chunk, offset);
    offset += chunk.byteLength;
  }

  return { body: new TextDecoder().decode(combined), truncated };
}

export async function safeFetch(input: string | URL, options: SafeFetchOptions = {}): Promise<SafeFetchResult> {
  const method = options.method ?? "GET";
  if (method !== "GET" && method !== "HEAD") {
    return resultError("BAD_URL", "Only GET and HEAD requests are allowed.", "");
  }

  let currentUrl: URL;
  try {
    currentUrl = validateUrl(input);
  } catch (error) {
    if (error instanceof SafeFetchException) return resultError(error.code, error.message, "");
    return resultError("BAD_URL", "The URL is invalid.", "");
  }

  let redirectsFollowed = 0;

  while (true) {
    const budgetClaim = claimBudget(options.budget);
    if (budgetClaim.error) {
      return resultError(budgetClaim.error.code, budgetClaim.error.message, currentUrl.href);
    }

    const budgetRemaining = budgetClaim.state ? budgetClaim.state.deadline - Date.now() : REQUEST_TIMEOUT_MS;
    if (budgetRemaining <= 0) {
      return resultError("TIMEOUT", "The scan-wide time limit was reached.", currentUrl.href);
    }

    const controller = new AbortController();
    let timedOut = false;
    const requestTimeout = Math.min(REQUEST_TIMEOUT_MS, budgetRemaining);
    const timeout = setTimeout(() => {
      timedOut = true;
      controller.abort(new Error("Request timed out."));
    }, requestTimeout);
    const signal = options.signal
      ? AbortSignal.any([controller.signal, options.signal])
      : controller.signal;

    let agent: Agent | undefined;
    let response: UndiciResponse;

    try {
      const hostname = normalizeHostname(currentUrl.hostname);
      const addresses = await resolveAddresses(hostname, signal);

      if (addresses.length === 0 || addresses.some(({ address, family }) => isIP(address) !== family)) {
        return resultError("BLOCKED_ADDRESS", "The hostname did not resolve to valid IP addresses.", currentUrl.href);
      }

      if (!isPrivateTargetAllowed() && addresses.some(({ address }) => isBlockedAddress(address))) {
        return resultError("BLOCKED_ADDRESS", "The hostname resolves to a private or reserved address.", currentUrl.href);
      }

      const lookup = pinnedLookup(hostname, addresses, hostname);
      agent = new Agent({
        connections: 1,
        connect: {
          lookup,
          servername: hostname,
        },
      });

      response = await undiciFetch(currentUrl, {
        method,
        redirect: "manual",
        credentials: "omit",
        headers: {
          "user-agent": USER_AGENT,
          accept: "text/html, text/plain, application/json, application/xml, application/javascript;q=0.9, */*;q=0.1",
        },
        dispatcher: agent,
        signal,
      });

      let nextLocation: string | null;
      try {
        nextLocation = redirectLocation(response);
      } catch (error) {
        await response.body?.cancel().catch(() => undefined);
        if (error instanceof SafeFetchException) {
          return resultError(error.code, error.message, currentUrl.href, response.status, getHeaders(response));
        }
        throw error;
      }

      if (nextLocation) {
        await response.body?.cancel().catch(() => undefined);
        if (redirectsFollowed >= maxRedirects) {
          return resultError("REDIRECT_LIMIT", "The redirect limit was exceeded.", currentUrl.href, response.status, getHeaders(response));
        }

        let validatedNextUrl: URL;
        try {
          validatedNextUrl = validateRedirectTarget(currentUrl, nextLocation);
        } catch (error) {
          if (error instanceof SafeFetchException) {
            return resultError(error.code, error.message, currentUrl.href, response.status, getHeaders(response));
          }
          return resultError("BAD_URL", "The redirect URL is invalid.", currentUrl.href, response.status, getHeaders(response));
        }

        currentUrl = validatedNextUrl;
        redirectsFollowed += 1;
        continue;
      }

      const responseHeaders = getHeaders(response);
      if (!isTextContentType(response.headers.get("content-type"))) {
        await response.body?.cancel().catch(() => undefined);
        return resultError("NETWORK", "The response content type is not textual.", currentUrl.href, response.status, responseHeaders);
      }

      if (method === "HEAD") {
        return {
          ok: response.ok,
          status: response.status,
          headers: responseHeaders,
          finalUrl: currentUrl.href,
          body: "",
          truncated: false,
          error: null,
        };
      }

      const contentLength = Number(response.headers.get("content-length"));
      if (Number.isFinite(contentLength) && contentLength > MAX_RESPONSE_BYTES) {
        await response.body?.cancel().catch(() => undefined);
        controller.abort(new Error("Response body size limit exceeded."));
        return resultError("TOO_LARGE", "The response exceeded the 2 MB body limit.", currentUrl.href, response.status, responseHeaders, "", true);
      }

      const { body, truncated } = await readTextBody(response, controller);
      if (truncated) {
        return resultError("TOO_LARGE", "The response exceeded the 2 MB body limit.", currentUrl.href, response.status, responseHeaders, body, true);
      }

      return {
        ok: response.ok,
        status: response.status,
        headers: responseHeaders,
        finalUrl: currentUrl.href,
        body,
        truncated: false,
        error: null,
      };
    } catch (error) {
      if (timedOut || (error instanceof Error && error.name === "TimeoutError")) {
        const message = requestTimeout < REQUEST_TIMEOUT_MS
          ? "The scan-wide time limit was reached."
          : "The request timed out after 8 seconds.";
        return resultError("TIMEOUT", message, currentUrl.href);
      }

      if (options.signal?.aborted) {
        return resultError("NETWORK", "The request was aborted.", currentUrl.href);
      }

      return resultError("NETWORK", "The remote server could not be reached.", currentUrl.href);
    } finally {
      clearTimeout(timeout);
      if (agent) await agent.destroy().catch(() => undefined);
    }
  }
}