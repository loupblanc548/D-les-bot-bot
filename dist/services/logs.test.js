"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const vitest_1 = require("vitest");
const { mockPrisma } = vitest_1.vi.hoisted(() => {
    return {
        mockPrisma: {
            log: {
                create: vitest_1.vi.fn(),
                findMany: vitest_1.vi.fn(),
                deleteMany: vitest_1.vi.fn(),
            },
        },
    };
});
vitest_1.vi.mock("../prisma", () => ({
    default: mockPrisma,
}));
vitest_1.vi.mock("../utils/logger", () => ({
    default: {
        info: vitest_1.vi.fn(),
        warn: vitest_1.vi.fn(),
        error: vitest_1.vi.fn(),
    },
}));
vitest_1.vi.mock("../config", () => ({
    config: {
        logChannel: null,
    },
}));
const logs_1 = require("./logs");
const logger_1 = __importDefault(require("../utils/logger"));
(0, vitest_1.describe)("createLog", () => {
    (0, vitest_1.beforeEach)(() => {
        vitest_1.vi.clearAllMocks();
    });
    (0, vitest_1.it)("should create a log with all fields populated", async () => {
        const entry = {
            type: "MODERATION",
            action: "BAN",
            userId: "user-1",
            targetId: "target-1",
            details: "Banned for spam",
            moderator: "mod-1",
        };
        const expected = { id: "log-1", ...entry, createdAt: new Date() };
        mockPrisma.log.create.mockResolvedValue(expected);
        const result = await (0, logs_1.createLog)(entry);
        (0, vitest_1.expect)(mockPrisma.log.create).toHaveBeenCalledWith({
            data: {
                type: "MODERATION",
                action: "BAN",
                userId: "user-1",
                targetId: "target-1",
                details: "Banned for spam",
                moderator: "mod-1",
            },
        });
        (0, vitest_1.expect)(result).toEqual(expected);
    });
    (0, vitest_1.it)("should convert undefined optional fields to null", async () => {
        const entry = {
            type: "SYSTEM",
            action: "STARTUP",
        };
        mockPrisma.log.create.mockResolvedValue({ id: "log-2" });
        await (0, logs_1.createLog)(entry);
        (0, vitest_1.expect)(mockPrisma.log.create).toHaveBeenCalledWith({
            data: {
                type: "SYSTEM",
                action: "STARTUP",
                userId: null,
                targetId: null,
                details: null,
                moderator: null,
            },
        });
    });
    (0, vitest_1.it)("should handle empty string optional fields as null", async () => {
        const entry = {
            type: "TEST",
            action: "DEBUG",
            userId: "",
            targetId: "",
            details: "",
            moderator: "",
        };
        mockPrisma.log.create.mockResolvedValue({ id: "log-3" });
        await (0, logs_1.createLog)(entry);
        (0, vitest_1.expect)(mockPrisma.log.create).toHaveBeenCalledWith({
            data: {
                type: "TEST",
                action: "DEBUG",
                userId: null,
                targetId: null,
                details: null,
                moderator: null,
            },
        });
    });
    (0, vitest_1.it)("should propagate prisma errors", async () => {
        mockPrisma.log.create.mockRejectedValue(new Error("DB error"));
        const entry = { type: "X", action: "Y" };
        await (0, vitest_1.expect)((0, logs_1.createLog)(entry)).rejects.toThrow("DB error");
    });
});
(0, vitest_1.describe)("getLogs", () => {
    (0, vitest_1.beforeEach)(() => {
        vitest_1.vi.clearAllMocks();
    });
    (0, vitest_1.it)("should fetch logs with default limit of 50", async () => {
        const mockLogs = [{ id: "1", type: "A", action: "B" }];
        mockPrisma.log.findMany.mockResolvedValue(mockLogs);
        const result = await (0, logs_1.getLogs)();
        (0, vitest_1.expect)(mockPrisma.log.findMany).toHaveBeenCalledWith({
            orderBy: { createdAt: "desc" },
            take: 50,
        });
        (0, vitest_1.expect)(result).toEqual(mockLogs);
    });
    (0, vitest_1.it)("should fetch logs with custom limit", async () => {
        mockPrisma.log.findMany.mockResolvedValue([]);
        await (0, logs_1.getLogs)(10);
        (0, vitest_1.expect)(mockPrisma.log.findMany).toHaveBeenCalledWith({
            orderBy: { createdAt: "desc" },
            take: 10,
        });
    });
});
(0, vitest_1.describe)("getLogsByType", () => {
    (0, vitest_1.beforeEach)(() => {
        vitest_1.vi.clearAllMocks();
    });
    (0, vitest_1.it)("should fetch logs filtered by type with default limit", async () => {
        mockPrisma.log.findMany.mockResolvedValue([]);
        await (0, logs_1.getLogsByType)("MODERATION");
        (0, vitest_1.expect)(mockPrisma.log.findMany).toHaveBeenCalledWith({
            where: { type: "MODERATION" },
            orderBy: { createdAt: "desc" },
            take: 50,
        });
    });
    (0, vitest_1.it)("should fetch logs filtered by type with custom limit", async () => {
        mockPrisma.log.findMany.mockResolvedValue([]);
        await (0, logs_1.getLogsByType)("ERROR", 5);
        (0, vitest_1.expect)(mockPrisma.log.findMany).toHaveBeenCalledWith({
            where: { type: "ERROR" },
            orderBy: { createdAt: "desc" },
            take: 5,
        });
    });
});
(0, vitest_1.describe)("getLogsByUser", () => {
    (0, vitest_1.beforeEach)(() => {
        vitest_1.vi.clearAllMocks();
    });
    (0, vitest_1.it)("should fetch logs filtered by userId with custom limit", async () => {
        const mockLogs = [{ id: "1", userId: "user-1", type: "X", action: "Y" }];
        mockPrisma.log.findMany.mockResolvedValue(mockLogs);
        const result = await (0, logs_1.getLogsByUser)("user-1", 20);
        (0, vitest_1.expect)(mockPrisma.log.findMany).toHaveBeenCalledWith({
            where: { userId: "user-1" },
            orderBy: { createdAt: "desc" },
            take: 20,
        });
        (0, vitest_1.expect)(result).toEqual(mockLogs);
    });
    (0, vitest_1.it)("should use default limit of 50", async () => {
        mockPrisma.log.findMany.mockResolvedValue([]);
        await (0, logs_1.getLogsByUser)("user-2");
        (0, vitest_1.expect)(mockPrisma.log.findMany).toHaveBeenCalledWith({
            where: { userId: "user-2" },
            orderBy: { createdAt: "desc" },
            take: 50,
        });
    });
});
(0, vitest_1.describe)("deleteOldLogs", () => {
    (0, vitest_1.beforeEach)(() => {
        vitest_1.vi.clearAllMocks();
    });
    (0, vitest_1.it)("should delete logs older than specified days", async () => {
        mockPrisma.log.deleteMany.mockResolvedValue({ count: 42 });
        const result = await (0, logs_1.deleteOldLogs)(30);
        (0, vitest_1.expect)(mockPrisma.log.deleteMany).toHaveBeenCalled();
        const callArgs = mockPrisma.log.deleteMany.mock.calls[0][0];
        (0, vitest_1.expect)(callArgs.where.createdAt.lt).toBeInstanceOf(Date);
        const cutoff = callArgs.where.createdAt.lt;
        const thirtyDaysAgo = new Date();
        thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
        const diffMs = Math.abs(cutoff.getTime() - thirtyDaysAgo.getTime());
        (0, vitest_1.expect)(diffMs).toBeLessThan(5000);
        (0, vitest_1.expect)(result).toEqual({ count: 42 });
    });
    (0, vitest_1.it)("should use default of 30 days", async () => {
        mockPrisma.log.deleteMany.mockResolvedValue({ count: 0 });
        await (0, logs_1.deleteOldLogs)();
        const callArgs = mockPrisma.log.deleteMany.mock.calls[0][0];
        const cutoff = callArgs.where.createdAt.lt;
        const thirtyDaysAgo = new Date();
        thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
        const diffMs = Math.abs(cutoff.getTime() - thirtyDaysAgo.getTime());
        (0, vitest_1.expect)(diffMs).toBeLessThan(5000);
    });
    (0, vitest_1.it)("should handle custom days", async () => {
        mockPrisma.log.deleteMany.mockResolvedValue({ count: 5 });
        await (0, logs_1.deleteOldLogs)(7);
        const callArgs = mockPrisma.log.deleteMany.mock.calls[0][0];
        const cutoff = callArgs.where.createdAt.lt;
        const sevenDaysAgo = new Date();
        sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);
        const diffMs = Math.abs(cutoff.getTime() - sevenDaysAgo.getTime());
        (0, vitest_1.expect)(diffMs).toBeLessThan(5000);
    });
});
(0, vitest_1.describe)("sendErrorLog", () => {
    (0, vitest_1.beforeEach)(() => {
        vitest_1.vi.clearAllMocks();
    });
    (0, vitest_1.it)("should log the error to logger.error regardless of config", async () => {
        const { config } = await Promise.resolve().then(() => __importStar(require("../config")));
        config.logChannel = null;
        // consoleSpy replaced with logger.error
        const err = new Error("Test error message");
        (0, logs_1.sendErrorLog)("TestModule", err);
        // console.error is called with (contexte, erreur) - check both args
        const calls = logger_1.default.error.mock.calls.map((c) => c.map(String).join(" "));
        (0, vitest_1.expect)(calls.some((c) => c.includes("TestModule"))).toBe(true);
        (0, vitest_1.expect)(calls.some((c) => c.includes("Test error message"))).toBe(true);
        // consoleSpy.mockRestore() replaced
    });
    (0, vitest_1.it)("should return early when config.logChannel is null (no client needed)", async () => {
        const { config } = await Promise.resolve().then(() => __importStar(require("../config")));
        config.logChannel = null;
        // consoleSpy replaced with logger.error
        const err = new Error("Silent error");
        // Should not throw
        (0, vitest_1.expect)(() => (0, logs_1.sendErrorLog)("Module", err)).not.toThrow();
        // console.error should still have been called
        (0, vitest_1.expect)(logger_1.default.error).toHaveBeenCalled();
        // consoleSpy.mockRestore() replaced
    });
    (0, vitest_1.it)("should return early when config.logChannel is set but client is not provided", async () => {
        const { config } = await Promise.resolve().then(() => __importStar(require("../config")));
        config.logChannel = "channel-123";
        // consoleSpy replaced with logger.error
        const err = new Error("No client error");
        // No client passed, channel.get will be undefined, but should not throw
        (0, vitest_1.expect)(() => (0, logs_1.sendErrorLog)("Module", err)).not.toThrow();
        // consoleSpy.mockRestore() replaced
    });
    (0, vitest_1.it)("should attempt to send embed when logChannel and client are provided", async () => {
        const { config } = await Promise.resolve().then(() => __importStar(require("../config")));
        config.logChannel = "channel-123";
        const mockSend = vitest_1.vi.fn().mockResolvedValue(undefined);
        const mockClient = {
            channels: {
                cache: {
                    get: vitest_1.vi.fn().mockReturnValue({
                        isTextBased: () => true,
                        send: mockSend,
                    }),
                },
            },
        };
        // consoleSpy replaced with logger.error
        const err = new Error("Critical failure");
        err.stack = "Error: Critical failure\n    at test.ts:1:1";
        (0, logs_1.sendErrorLog)("Database", err, mockClient);
        (0, vitest_1.expect)(mockClient.channels.cache.get).toHaveBeenCalledWith("channel-123");
        (0, vitest_1.expect)(mockSend).toHaveBeenCalledTimes(1);
        const embed = mockSend.mock.calls[0][0].embeds[0];
        (0, vitest_1.expect)(embed.data.title).toBe("🚨 Erreur Critique");
        (0, vitest_1.expect)(embed.data.color).toBe(0xff3344);
        (0, vitest_1.expect)(embed.data.fields[0].value).toBe("Database");
        (0, vitest_1.expect)(embed.data.fields[2].value).toBe("Critical failure");
        (0, vitest_1.expect)(embed.data.fields[3].value).toBe(err.stack);
        // consoleSpy.mockRestore() replaced
    });
    (0, vitest_1.it)("should truncate long error messages to 1024 chars", async () => {
        const { config } = await Promise.resolve().then(() => __importStar(require("../config")));
        config.logChannel = "channel-123";
        const mockSend = vitest_1.vi.fn().mockResolvedValue(undefined);
        const mockClient = {
            channels: {
                cache: {
                    get: vitest_1.vi.fn().mockReturnValue({
                        isTextBased: () => true,
                        send: mockSend,
                    }),
                },
            },
        };
        // consoleSpy replaced with logger.error
        const longMessage = "A".repeat(2000);
        const err = new Error(longMessage);
        (0, logs_1.sendErrorLog)("Test", err, mockClient);
        const embed = mockSend.mock.calls[0][0].embeds[0];
        (0, vitest_1.expect)(embed.data.fields[2].value.length).toBeLessThanOrEqual(1024);
        // consoleSpy.mockRestore() replaced
    });
    (0, vitest_1.it)("should silently catch errors when channel send fails", async () => {
        const { config } = await Promise.resolve().then(() => __importStar(require("../config")));
        config.logChannel = "channel-123";
        const mockSend = vitest_1.vi.fn().mockRejectedValue(new Error("Send failed"));
        const mockClient = {
            channels: {
                cache: {
                    get: vitest_1.vi.fn().mockReturnValue({
                        isTextBased: () => true,
                        send: mockSend,
                    }),
                },
            },
        };
        // consoleSpy replaced with logger.error
        // Should not throw even though send fails
        (0, vitest_1.expect)(() => (0, logs_1.sendErrorLog)("Module", new Error("test"), mockClient)).not.toThrow();
        // The outer console.error + the inner catch console.error
        (0, vitest_1.expect)(logger_1.default.error).toHaveBeenCalled();
        // consoleSpy.mockRestore() replaced
    });
    (0, vitest_1.it)("should skip sending if log channel is not text-based", async () => {
        const { config } = await Promise.resolve().then(() => __importStar(require("../config")));
        config.logChannel = "channel-456";
        const mockSend = vitest_1.vi.fn();
        const mockClient = {
            channels: {
                cache: {
                    get: vitest_1.vi.fn().mockReturnValue({
                        isTextBased: () => false,
                        send: mockSend,
                    }),
                },
            },
        };
        // consoleSpy replaced with logger.error
        (0, logs_1.sendErrorLog)("Module", new Error("test"), mockClient);
        (0, vitest_1.expect)(mockSend).not.toHaveBeenCalled();
        // consoleSpy.mockRestore() replaced
    });
});
(0, vitest_1.describe)("sendBanPurgeLog", () => {
    (0, vitest_1.beforeEach)(() => {
        vitest_1.vi.clearAllMocks();
    });
    (0, vitest_1.it)("should return early when config.logChannel is null", async () => {
        const { config } = await Promise.resolve().then(() => __importStar(require("../config")));
        config.logChannel = null;
        const mockClient = {};
        // consoleSpy replaced with logger.error
        (0, vitest_1.expect)(() => (0, logs_1.sendBanPurgeLog)("User#1234", "user-1", 10, 5, mockClient)).not.toThrow();
        // consoleSpy.mockRestore() replaced
    });
    (0, vitest_1.it)("should return early when log channel is not found", async () => {
        const { config } = await Promise.resolve().then(() => __importStar(require("../config")));
        config.logChannel = "channel-missing";
        const mockClient = {
            channels: {
                cache: {
                    get: vitest_1.vi.fn().mockReturnValue(undefined),
                },
            },
        };
        (0, vitest_1.expect)(() => (0, logs_1.sendBanPurgeLog)("User#1234", "user-1", 10, 5, mockClient)).not.toThrow();
        (0, vitest_1.expect)(mockClient.channels.cache.get).toHaveBeenCalledWith("channel-missing");
    });
    (0, vitest_1.it)("should return early when log channel is not text-based", async () => {
        const { config } = await Promise.resolve().then(() => __importStar(require("../config")));
        config.logChannel = "channel-voice";
        const mockSend = vitest_1.vi.fn();
        const mockClient = {
            channels: {
                cache: {
                    get: vitest_1.vi.fn().mockReturnValue({
                        isTextBased: () => false,
                        send: mockSend,
                    }),
                },
            },
        };
        (0, logs_1.sendBanPurgeLog)("User#1234", "user-1", 10, 5, mockClient);
        (0, vitest_1.expect)(mockSend).not.toHaveBeenCalled();
    });
    (0, vitest_1.it)("should send a properly structured embed to the log channel", async () => {
        const { config } = await Promise.resolve().then(() => __importStar(require("../config")));
        config.logChannel = "channel-logs";
        const mockSend = vitest_1.vi.fn().mockResolvedValue(undefined);
        const mockClient = {
            channels: {
                cache: {
                    get: vitest_1.vi.fn().mockReturnValue({
                        isTextBased: () => true,
                        send: mockSend,
                    }),
                },
            },
        };
        (0, logs_1.sendBanPurgeLog)("TestUser#0001", "user-42", 15, 8, mockClient);
        (0, vitest_1.expect)(mockClient.channels.cache.get).toHaveBeenCalledWith("channel-logs");
        (0, vitest_1.expect)(mockSend).toHaveBeenCalledTimes(1);
        const embed = mockSend.mock.calls[0][0].embeds[0];
        (0, vitest_1.expect)(embed.data.title).toBe("🔨 Bannissement & Purge Automatique");
        (0, vitest_1.expect)(embed.data.color).toBe(0xff0033);
        const fields = embed.data.fields;
        (0, vitest_1.expect)(fields[0].value).toContain("TestUser#0001");
        (0, vitest_1.expect)(fields[0].value).toContain("user-42");
        (0, vitest_1.expect)(fields[1].value).toBe("15 message(s)");
        (0, vitest_1.expect)(fields[2].value).toBe("8");
    });
    (0, vitest_1.it)("should silently catch errors when channel send fails", async () => {
        const { config } = await Promise.resolve().then(() => __importStar(require("../config")));
        config.logChannel = "channel-err";
        const mockSend = vitest_1.vi.fn().mockRejectedValue(new Error("Send failed"));
        const mockClient = {
            channels: {
                cache: {
                    get: vitest_1.vi.fn().mockReturnValue({
                        isTextBased: () => true,
                        send: mockSend,
                    }),
                },
            },
        };
        // consoleSpy replaced with logger.error
        // sendBanPurgeLog is async - await it so the catch block executes
        await (0, logs_1.sendBanPurgeLog)("User#X", "user-x", 0, 1, mockClient);
        (0, vitest_1.expect)(logger_1.default.error).toHaveBeenCalled();
        // consoleSpy.mockRestore() replaced
    });
});
//# sourceMappingURL=logs.test.js.map