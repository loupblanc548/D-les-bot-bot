import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const { mockLogger } = vi.hoisted(() => ({
  mockLogger: {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
  },
}));

vi.mock("./logger.js", () => ({ default: mockLogger }));

import {
  checkEmail,
  checkPassword,
  formatEmailBreachReport,
  getLatestBreach,
  hasHibpApiKey,
} from "./hibp.js";

function jsonResponse(status: number, body: unknown): Response {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: async () => body,
    text: async () => (typeof body === "string" ? body : JSON.stringify(body)),
  } as Response;
}

describe("hibp", () => {
  const originalKey = process.env.HIBP_API_KEY;

  beforeEach(() => {
    vi.unstubAllGlobals();
    delete process.env.HIBP_API_KEY;
    mockLogger.warn.mockClear();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    if (originalKey === undefined) delete process.env.HIBP_API_KEY;
    else process.env.HIBP_API_KEY = originalKey;
  });

  it("hasHibpApiKey is false without a key", () => {
    expect(hasHibpApiKey()).toBe(false);
  });

  it("checkEmail returns null when HIBP_API_KEY is missing", async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    expect(await checkEmail("user@example.com")).toBeNull();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("checkEmail maps a 200 breach list", async () => {
    process.env.HIBP_API_KEY = "test-hibp-key";
    const fetchMock = vi.fn().mockResolvedValue(
      jsonResponse(200, [
        {
          Name: "Adobe",
          Title: "Adobe",
          Domain: "adobe.com",
          BreachDate: "2013-10-04",
          DataClasses: ["Email addresses", "Passwords"],
          Description: "In October 2013, <em>Adobe</em> leaked.",
        },
      ]),
    );
    vi.stubGlobal("fetch", fetchMock);

    const result = await checkEmail("user@example.com");
    expect(result).toEqual([
      {
        name: "Adobe",
        title: "Adobe",
        domain: "adobe.com",
        breachDate: "2013-10-04",
        pwnCount: undefined,
        compromisedData: ["Email addresses", "Passwords"],
        description: "In October 2013, Adobe leaked.",
      },
    ]);

    const [url, init] = fetchMock.mock.calls[0] as [string, { headers: Record<string, string> }];
    expect(url).toContain("/breachedaccount/user%40example.com");
    expect(init.headers["hibp-api-key"]).toBe("test-hibp-key");
    expect(init.headers["User-Agent"]).toContain("John-Discord-Bot");
  });

  it("checkEmail treats 404 as no breaches", async () => {
    process.env.HIBP_API_KEY = "test-hibp-key";
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(jsonResponse(404, "Not found")));
    expect(await checkEmail("clean@example.com")).toEqual([]);
  });

  it("checkEmail returns null on 429", async () => {
    process.env.HIBP_API_KEY = "test-hibp-key";
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(jsonResponse(429, "rate")));
    expect(await checkEmail("user@example.com")).toBeNull();
    expect(mockLogger.warn).toHaveBeenCalled();
  });

  it("getLatestBreach works without an API key", async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      jsonResponse(200, {
        Name: "Example",
        Title: "Example Inc",
        Domain: "example.com",
        BreachDate: "2026-01-01",
        PwnCount: 42,
        DataClasses: ["Email addresses"],
        Description: "A test breach.",
      }),
    );
    vi.stubGlobal("fetch", fetchMock);
    const latest = await getLatestBreach();
    expect(latest?.name).toBe("Example");
    expect(latest?.pwnCount).toBe(42);
    const [, init] = fetchMock.mock.calls[0] as [string, { headers: Record<string, string> }];
    expect(init.headers["hibp-api-key"]).toBeUndefined();
  });

  it("formatEmailBreachReport summarizes empty and non-empty lists", () => {
    expect(formatEmailBreachReport("a@b.c", [])).toContain("Aucune fuite");
    expect(
      formatEmailBreachReport("a@b.c", [
        {
          name: "Adobe",
          domain: "adobe.com",
          breachDate: "2013-10-04",
          compromisedData: ["Emails"],
          description: "leaked",
        },
      ]),
    ).toContain("Adobe");
  });

  it("checkPassword uses k-anonymity range search", async () => {
    // SHA-1("password") = 5BAA61E4C9B93F3F0682250B6CF8331B7EE68FD8
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      text: async () => "1E4C9B93F3F0682250B6CF8331B7EE68FD8:12345\nAAAA:1\n",
    });
    vi.stubGlobal("fetch", fetchMock);
    expect(await checkPassword("password")).toBe(12345);
    const [url] = fetchMock.mock.calls[0] as [string];
    expect(url).toBe("https://api.pwnedpasswords.com/range/5BAA6");
  });
});
