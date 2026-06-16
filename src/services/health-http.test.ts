import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import http from "http";

// Hoisted mocks
const { mockPrisma, mockLogger } = vi.hoisted(() => ({
  mockPrisma: {
    $queryRaw: vi.fn(),
  },
  mockLogger: {
    info: vi.fn(),
    error: vi.fn(),
    warn: vi.fn(),
  },
}));

vi.mock("../prisma", () => ({ default: mockPrisma }));
vi.mock("../utils/logger", () => ({ default: mockLogger }));

import { startHealthServer, stopHealthServer } from "./health-http";

function httpGet(url: string): Promise<{ status: number; body: unknown }> {
  return new Promise((resolve, reject) => {
    http.get(url, (res) => {
      let data = "";
      res.on("data", (chunk) => (data += chunk));
      res.on("end", () => {
        try {
          resolve({ status: res.statusCode || 0, body: JSON.parse(data) });
        } catch {
          resolve({ status: res.statusCode || 0, body: data });
        }
      });
    }).on("error", reject);
  });
}

describe("health-http", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    stopHealthServer();
  });

  describe("startHealthServer", () => {
    it("should start HTTP server and log info", async () => {
      startHealthServer(3099);

      // Wait briefly for server to start
      await new Promise((r) => setTimeout(r, 50));

      expect(mockLogger.info).toHaveBeenCalledWith(
        "Health server listening on port 3099"
      );
    });

    it("should not start a second server if one is already running", () => {
      startHealthServer(3098);
      const firstCallCount = mockLogger.info.mock.calls.length;
      startHealthServer(3098);

      expect(mockLogger.info).toHaveBeenCalledTimes(firstCallCount);
    });

    it("should return 200 and JSON when DB is healthy", async () => {
      mockPrisma.$queryRaw.mockResolvedValue([{ 1: 1 }]);

      startHealthServer(3097);
      await new Promise((r) => setTimeout(r, 50));

      const response = await httpGet("http://localhost:3097/");
      const body = response.body as Record<string, unknown>;

      expect(response.status).toBe(200);
      expect(body.status).toBe("ok");
      expect(body).toHaveProperty("uptime");
      expect(body).toHaveProperty("memory");
      expect(body).toHaveProperty("timestamp");
    });

    it("should return 503 when DB is unreachable", async () => {
      mockPrisma.$queryRaw.mockRejectedValue(new Error("DB down"));

      startHealthServer(3096);
      await new Promise((r) => setTimeout(r, 50));

      const response = await httpGet("http://localhost:3096/");
      const body = response.body as Record<string, unknown>;

      expect(response.status).toBe(503);
      expect(body.status).toBe("degraded");
      expect(body.error).toBe("database unreachable");
    });
  });

  describe("stopHealthServer", () => {
    it("should stop the server", () => {
      startHealthServer(3095);
      expect(() => stopHealthServer()).not.toThrow();
    });

    it("should be idempotent", () => {
      startHealthServer(3094);
      stopHealthServer();
      expect(() => stopHealthServer()).not.toThrow();
    });
  });
});
