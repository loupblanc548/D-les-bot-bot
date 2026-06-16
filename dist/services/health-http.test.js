"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const vitest_1 = require("vitest");
const http_1 = __importDefault(require("http"));
// Hoisted mocks
const { mockPrisma, mockLogger } = vitest_1.vi.hoisted(() => ({
    mockPrisma: {
        $queryRaw: vitest_1.vi.fn(),
    },
    mockLogger: {
        info: vitest_1.vi.fn(),
        error: vitest_1.vi.fn(),
        warn: vitest_1.vi.fn(),
    },
}));
vitest_1.vi.mock("../prisma", () => ({ default: mockPrisma }));
vitest_1.vi.mock("../utils/logger", () => ({ default: mockLogger }));
const health_http_1 = require("./health-http");
function httpGet(url) {
    return new Promise((resolve, reject) => {
        http_1.default.get(url, (res) => {
            let data = "";
            res.on("data", (chunk) => (data += chunk));
            res.on("end", () => {
                try {
                    resolve({ status: res.statusCode || 0, body: JSON.parse(data) });
                }
                catch {
                    resolve({ status: res.statusCode || 0, body: data });
                }
            });
        }).on("error", reject);
    });
}
(0, vitest_1.describe)("health-http", () => {
    (0, vitest_1.beforeEach)(() => {
        vitest_1.vi.clearAllMocks();
    });
    (0, vitest_1.afterEach)(() => {
        (0, health_http_1.stopHealthServer)();
    });
    (0, vitest_1.describe)("startHealthServer", () => {
        (0, vitest_1.it)("should start HTTP server and log info", async () => {
            (0, health_http_1.startHealthServer)(3099);
            // Wait briefly for server to start
            await new Promise((r) => setTimeout(r, 50));
            (0, vitest_1.expect)(mockLogger.info).toHaveBeenCalledWith("Health server listening on port 3099");
        });
        (0, vitest_1.it)("should not start a second server if one is already running", () => {
            (0, health_http_1.startHealthServer)(3098);
            const firstCallCount = mockLogger.info.mock.calls.length;
            (0, health_http_1.startHealthServer)(3098);
            (0, vitest_1.expect)(mockLogger.info).toHaveBeenCalledTimes(firstCallCount);
        });
        (0, vitest_1.it)("should return 200 and JSON when DB is healthy", async () => {
            mockPrisma.$queryRaw.mockResolvedValue([{ 1: 1 }]);
            (0, health_http_1.startHealthServer)(3097);
            await new Promise((r) => setTimeout(r, 50));
            const response = await httpGet("http://localhost:3097/");
            const body = response.body;
            (0, vitest_1.expect)(response.status).toBe(200);
            (0, vitest_1.expect)(body.status).toBe("ok");
            (0, vitest_1.expect)(body).toHaveProperty("uptime");
            (0, vitest_1.expect)(body).toHaveProperty("memory");
            (0, vitest_1.expect)(body).toHaveProperty("timestamp");
        });
        (0, vitest_1.it)("should return 503 when DB is unreachable", async () => {
            mockPrisma.$queryRaw.mockRejectedValue(new Error("DB down"));
            (0, health_http_1.startHealthServer)(3096);
            await new Promise((r) => setTimeout(r, 50));
            const response = await httpGet("http://localhost:3096/");
            const body = response.body;
            (0, vitest_1.expect)(response.status).toBe(503);
            (0, vitest_1.expect)(body.status).toBe("degraded");
            (0, vitest_1.expect)(body.error).toBe("database unreachable");
        });
    });
    (0, vitest_1.describe)("stopHealthServer", () => {
        (0, vitest_1.it)("should stop the server", () => {
            (0, health_http_1.startHealthServer)(3095);
            (0, vitest_1.expect)(() => (0, health_http_1.stopHealthServer)()).not.toThrow();
        });
        (0, vitest_1.it)("should be idempotent", () => {
            (0, health_http_1.startHealthServer)(3094);
            (0, health_http_1.stopHealthServer)();
            (0, vitest_1.expect)(() => (0, health_http_1.stopHealthServer)()).not.toThrow();
        });
    });
});
//# sourceMappingURL=health-http.test.js.map