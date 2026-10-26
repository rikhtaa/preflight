import { createServer, type IncomingMessage, type ServerResponse } from "node:http";
import { lookup } from "node:dns/promises";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { createBudget, isBlockedAddress, safeFetch, validateRedirectTarget } from "./safeFetch";

vi.mock("node:dns/promises", () => ({ lookup: vi.fn() }));

const dnsAnswers = new Map<string, Array<{ address: string; family: 4 | 6 }>>();
const dnsLookup = vi.mocked(lookup);
let server: ReturnType<typeof createServer>;
let requestHandler: (request: IncomingMessage, response: ServerResponse) => void;
let requestCount = 0;

function setDns(hostname: string, addresses: Array<{ address: string; family: 4 | 6 }>) {
  dnsAnswers.set(hostname, addresses);
}

function setProductionMode() {
  vi.stubEnv("NODE_ENV", "production");
  delete process.env.ALLOW_PRIVATE_TARGETS;
}

beforeAll(async () => {
  server = createServer((request, response) => {
    requestCount += 1;
    requestHandler(request, response);
  });

  await new Promise<void>((resolve, reject) => {
    server.once("error", reject);
    server.listen(80, "127.0.0.1", resolve);
  });
});

afterAll(async () => {
  await new Promise<void>((resolve, reject) => {
    server.close((error) => error ? reject(error) : resolve());
  });
});

beforeEach(() => {
  vi.stubEnv("NODE_ENV", "test");
  delete process.env.ALLOW_PRIVATE_TARGETS;
  dnsAnswers.clear();
  requestCount = 0;
  requestHandler = (_request, response) => {
    response.writeHead(200, { "content-type": "text/plain; charset=utf-8" });
    response.end("ok");
  };
  dnsLookup.mockReset();
  dnsLookup.mockImplementation(((hostname: string) => {
    return Promise.resolve(dnsAnswers.get(hostname) ?? [{ address: "127.0.0.1", family: 4 }]) as never;
  }) as unknown as typeof lookup);
});

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllEnvs();
});

describe("isBlockedAddress", () => {
  it.each([
    "0.0.0.0",
    "0.255.255.255",
    "10.0.0.1",
    "100.64.0.1",
    "100.127.255.254",
    "127.0.0.1",
    "169.254.1.1",
    "172.16.0.1",
    "172.31.255.254",
    "192.0.0.1",
    "192.0.0.255",
    "192.168.1.1",
    "198.18.0.1",
    "198.19.255.254",
    "224.0.0.1",
    "239.255.255.254",
    "240.0.0.1",
    "255.255.255.255",
    "::",
    "::1",
    "fc00::1",
    "fdff:ffff:ffff:ffff:ffff:ffff:ffff:ffff",
    "fe80::1",
    "febf:ffff:ffff:ffff:ffff:ffff:ffff:ffff",
    "ff00::1",
    "::ffff:0.1.2.3",
    "::ffff:10.0.0.1",
    "::ffff:100.64.0.1",
    "::ffff:127.0.0.1",
    "::ffff:169.254.1.1",
    "::ffff:172.16.0.1",
    "::ffff:192.0.0.1",
    "::ffff:192.168.1.1",
    "::ffff:198.18.0.1",
    "::ffff:224.0.0.1",
    "::ffff:240.0.0.1",
  ])("blocks reserved address %s", (address) => {
    expect(isBlockedAddress(address)).toBe(true);
  });

  it.each([
    "8.8.8.8",
    "100.63.255.255",
    "100.128.0.1",
    "172.15.255.255",
    "172.32.0.1",
    "192.0.1.1",
    "192.168.0.0".replace("192.168", "192.169"),
    "198.17.255.255",
    "198.20.0.1",
    "223.255.255.255",
    "2001:4860:4860::8888",
    "::ffff:8.8.8.8",
  ])("allows public address %s", (address) => {
    expect(isBlockedAddress(address)).toBe(false);
  });
});

describe("safeFetch URL validation", () => {
  it.each([
    "http://2130706433/",
    "http://0x7f000001/",
    "http://0177.0.0.1/",
    "http://[::1]/",
    "http://[::ffff:7f00:1]/",
  ])("rejects IP literal form %s", async (url) => {
    const result = await safeFetch(url);
    expect(result.error?.code).toBe("BAD_URL");
    expect(dnsLookup).not.toHaveBeenCalled();
  });

  it.each([
    "http://user:pass@site.test/",
    "file:///etc/passwd",
    "ftp://site.test/file",
    "http://site.test:22/",
    "http://localhost/",
    "http://admin.local/",
    "http://server.internal/",
    "http://box.localhost/",
  ])("rejects unsafe URL %s", async (url) => {
    const result = await safeFetch(url);
    expect(result.error?.code).toBe("BAD_URL");
    expect(dnsLookup).not.toHaveBeenCalled();
  });

  it("allows only HTTP(S) URLs with ports 80 or 443", async () => {
    expect((await safeFetch("http://site.test:80/")).error).toBeNull();
    const httpsResult = await safeFetch("https://site.test:443/");
    expect(httpsResult.error?.code).toBe("NETWORK");
  });

  it("blocks a hostname when any A/AAAA result is private", async () => {
    setDns("mixed.test", [
      { address: "93.184.216.34", family: 4 },
      { address: "fc00::7", family: 6 },
    ]);

    setProductionMode();
    const result = await safeFetch("http://mixed.test/");

    expect(result.error?.code).toBe("BLOCKED_ADDRESS");
    expect(requestCount).toBe(0);
  });

  it("allows private test targets in development only with the explicit escape hatch", async () => {
    setDns("dev-target.test", [{ address: "127.0.0.1", family: 4 }]);
    vi.stubEnv("NODE_ENV", "development");

    const blocked = await safeFetch("http://dev-target.test/");
    expect(blocked.error?.code).toBe("BLOCKED_ADDRESS");
    expect(requestCount).toBe(0);

    vi.stubEnv("ALLOW_PRIVATE_TARGETS", "1");
    const allowed = await safeFetch("http://dev-target.test/");
    expect(allowed.ok).toBe(true);
    expect(allowed.body).toBe("ok");
    expect(requestCount).toBe(1);
  });

  it("throws during startup if the private target escape hatch is set in production", async () => {
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("ALLOW_PRIVATE_TARGETS", "1");
    vi.resetModules();

    await expect(import("./safeFetch")).rejects.toThrow(/must not be set in production/i);
  });
});

describe("safeFetch local HTTP behavior", () => {
  it("pins DNS to the validated address, preserves Host, and sends no cookies", async () => {
    let requestHost = "";
    let cookieHeader: string | undefined;
    let userAgent = "";
    requestHandler = (request, response) => {
      requestHost = String(request.headers.host);
      cookieHeader = request.headers.cookie;
      userAgent = String(request.headers["user-agent"]);
      response.writeHead(200, {
        "content-type": "text/plain; charset=utf-8",
        "set-cookie": "session=never-store",
      });
      response.end("local response");
    };

    const result = await safeFetch("http://site.test/");

    expect(result.ok).toBe(true);
    expect(result.body).toBe("local response");
    expect(result.finalUrl).toBe("http://site.test/");
    expect(requestHost).toBe("site.test");
    expect(cookieHeader).toBeUndefined();
    expect(userAgent).toBe("TheSecureVibeScanner/1.0 (+https://thesecurevibe.com/bot)");
    expect(result.headers["set-cookie"]).toBeUndefined();
    expect(dnsLookup).toHaveBeenCalledWith("site.test", { all: true, verbatim: true });
  });

  it("follows a loopback redirect only in the test environment and counts each hop", async () => {
    requestHandler = (_request, response) => {
      response.writeHead(302, { location: "/loop" });
      response.end();
    };

    const result = await safeFetch("http://site.test/loop");

    expect(result.error?.code).toBe("REDIRECT_LIMIT");
    expect(requestCount).toBe(4);
  });

  it("blocks a redirect to a private IP before making a second request", async () => {
    requestHandler = (_request, response) => {
      response.writeHead(302, { location: "http://10.0.0.7/private" });
      response.end();
    };

    const result = await safeFetch("http://site.test/start");

    expect(result.error?.code).toBe("BAD_URL");
    expect(requestCount).toBe(1);
  });

  it("blocks HTTPS-to-HTTP redirects", async () => {
    expect(() => validateRedirectTarget(new URL("https://secure.test/start"), "http://secure.test/plain"))
      .toThrow(/HTTPS redirects to HTTP/i);
  });

  it("aborts when the response body exceeds 2 MB", async () => {
    requestHandler = (_request, response) => {
      response.writeHead(200, { "content-type": "text/plain" });
      response.end(Buffer.alloc(MAX_TEST_BODY_SIZE, 0x61));
    };

    const result = await safeFetch("http://site.test/large");

    expect(result.error?.code).toBe("TOO_LARGE");
    expect(result.truncated).toBe(true);
    expect(Buffer.byteLength(result.body)).toBeLessThanOrEqual(2 * 1024 * 1024);
  });

  it("times out slow responses after 8 seconds", async () => {
    requestHandler = (_request, response) => {
      setTimeout(() => {
        if (!response.destroyed) {
          response.writeHead(200, { "content-type": "text/plain" });
          response.end("late response");
        }
      }, 8_500);
    };

    const result = await safeFetch("http://site.test/slow");

    expect(result.error?.code).toBe("TIMEOUT");
  }, 11_000);

  it("rejects non-text content types", async () => {
    requestHandler = (_request, response) => {
      response.writeHead(200, { "content-type": "application/octet-stream" });
      response.end(Buffer.from([0, 1, 2]));
    };

    const result = await safeFetch("http://site.test/binary");

    expect(result.error?.code).toBe("NETWORK");
    expect(result.status).toBe(200);
  });

  it("supports HEAD without reading a response body", async () => {
    let method = "";
    requestHandler = (request, response) => {
      method = request.method ?? "";
      response.writeHead(200, { "content-type": "text/plain", "content-length": "12" });
      response.end();
    };

    const result = await safeFetch("http://site.test/head", { method: "HEAD" });

    expect(method).toBe("HEAD");
    expect(result.ok).toBe(true);
    expect(result.body).toBe("");
  });

  it("rejects methods other than GET and HEAD without making a request", async () => {
    const result = await safeFetch("http://site.test/", { method: "POST" as "GET" });

    expect(result.error?.code).toBe("BAD_URL");
    expect(requestCount).toBe(0);
  });
});

describe("createBudget", () => {
  it("rejects when the scan request count is exhausted", async () => {
    requestHandler = (_request, response) => {
      response.writeHead(302, { location: "/again" });
      response.end();
    };

    const result = await safeFetch("http://site.test/", {
      budget: createBudget({ deadlineMs: 5_000, maxRequests: 1 }),
    });

    expect(result.error?.code).toBe("NETWORK");
    expect(requestCount).toBe(1);
  });

  it("rejects invalid limits", () => {
    expect(() => createBudget({ deadlineMs: 0, maxRequests: 1 })).toThrow(RangeError);
    expect(() => createBudget({ deadlineMs: 100, maxRequests: -1 })).toThrow(RangeError);
  });

  it("enforces the deadline before making a request", async () => {
    const budget = createBudget({ deadlineMs: 1, maxRequests: 2 });
    await new Promise((resolve) => setTimeout(resolve, 5));

    const result = await safeFetch("http://site.test/", { budget });

    expect(result.error?.code).toBe("TIMEOUT");
    expect(requestCount).toBe(0);
  });
});

const MAX_TEST_BODY_SIZE = 2 * 1024 * 1024 + 1;