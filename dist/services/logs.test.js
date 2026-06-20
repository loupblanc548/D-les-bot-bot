import { describe, it, expect, vi, beforeEach } from "vitest";
const { mockPrisma } = vi.hoisted(() => {
    return {
        mockPrisma: {
            log: {
                create: vi.fn(),
                findMany: vi.fn(),
                deleteMany: vi.fn(),
            },
        },
    };
});
vi.mock("../prisma", () => ({
    default: mockPrisma,
}));
vi.mock("../utils/logger", () => ({
    default: {
        info: vi.fn(),
        warn: vi.fn(),
        error: vi.fn(),
    },
}));
vi.mock("../config", () => ({
    config: {
        logChannel: null,
    },
}));
import { createLog, getLogs, getLogsByType, getLogsByUser, deleteOldLogs, sendErrorLog, sendBanPurgeLog } from "./logs.js";
import logger from "../utils/logger.js";
describe("createLog", () => {
    beforeEach(() => {
        vi.clearAllMocks();
    });
    it("should create a log with all fields populated", async () => {
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
        const result = await createLog(entry);
        expect(mockPrisma.log.create).toHaveBeenCalledWith({
            data: {
                type: "MODERATION",
                action: "BAN",
                userId: "user-1",
                targetId: "target-1",
                details: "Banned for spam",
                moderator: "mod-1",
            },
        });
        expect(result).toEqual(expected);
    });
    it("should convert undefined optional fields to null", async () => {
        const entry = {
            type: "SYSTEM",
            action: "STARTUP",
        };
        mockPrisma.log.create.mockResolvedValue({ id: "log-2" });
        await createLog(entry);
        expect(mockPrisma.log.create).toHaveBeenCalledWith({
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
    it("should handle empty string optional fields as null", async () => {
        const entry = {
            type: "TEST",
            action: "DEBUG",
            userId: "",
            targetId: "",
            details: "",
            moderator: "",
        };
        mockPrisma.log.create.mockResolvedValue({ id: "log-3" });
        await createLog(entry);
        expect(mockPrisma.log.create).toHaveBeenCalledWith({
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
    it("should propagate prisma errors", async () => {
        mockPrisma.log.create.mockRejectedValue(new Error("DB error"));
        const entry = { type: "X", action: "Y" };
        await expect(createLog(entry)).rejects.toThrow("DB error");
    });
});
describe("getLogs", () => {
    beforeEach(() => {
        vi.clearAllMocks();
    });
    it("should fetch logs with default limit of 50", async () => {
        const mockLogs = [{ id: "1", type: "A", action: "B" }];
        mockPrisma.log.findMany.mockResolvedValue(mockLogs);
        const result = await getLogs();
        expect(mockPrisma.log.findMany).toHaveBeenCalledWith({
            orderBy: { createdAt: "desc" },
            take: 50,
        });
        expect(result).toEqual(mockLogs);
    });
    it("should fetch logs with custom limit", async () => {
        mockPrisma.log.findMany.mockResolvedValue([]);
        await getLogs(10);
        expect(mockPrisma.log.findMany).toHaveBeenCalledWith({
            orderBy: { createdAt: "desc" },
            take: 10,
        });
    });
});
describe("getLogsByType", () => {
    beforeEach(() => {
        vi.clearAllMocks();
    });
    it("should fetch logs filtered by type with default limit", async () => {
        mockPrisma.log.findMany.mockResolvedValue([]);
        await getLogsByType("MODERATION");
        expect(mockPrisma.log.findMany).toHaveBeenCalledWith({
            where: { type: "MODERATION" },
            orderBy: { createdAt: "desc" },
            take: 50,
        });
    });
    it("should fetch logs filtered by type with custom limit", async () => {
        mockPrisma.log.findMany.mockResolvedValue([]);
        await getLogsByType("ERROR", 5);
        expect(mockPrisma.log.findMany).toHaveBeenCalledWith({
            where: { type: "ERROR" },
            orderBy: { createdAt: "desc" },
            take: 5,
        });
    });
});
describe("getLogsByUser", () => {
    beforeEach(() => {
        vi.clearAllMocks();
    });
    it("should fetch logs filtered by userId with custom limit", async () => {
        const mockLogs = [{ id: "1", userId: "user-1", type: "X", action: "Y" }];
        mockPrisma.log.findMany.mockResolvedValue(mockLogs);
        const result = await getLogsByUser("user-1", 20);
        expect(mockPrisma.log.findMany).toHaveBeenCalledWith({
            where: { userId: "user-1" },
            orderBy: { createdAt: "desc" },
            take: 20,
        });
        expect(result).toEqual(mockLogs);
    });
    it("should use default limit of 50", async () => {
        mockPrisma.log.findMany.mockResolvedValue([]);
        await getLogsByUser("user-2");
        expect(mockPrisma.log.findMany).toHaveBeenCalledWith({
            where: { userId: "user-2" },
            orderBy: { createdAt: "desc" },
            take: 50,
        });
    });
});
describe("deleteOldLogs", () => {
    beforeEach(() => {
        vi.clearAllMocks();
    });
    it("should delete logs older than specified days", async () => {
        mockPrisma.log.deleteMany.mockResolvedValue({ count: 42 });
        const result = await deleteOldLogs(30);
        expect(mockPrisma.log.deleteMany).toHaveBeenCalled();
        const callArgs = mockPrisma.log.deleteMany.mock.calls[0][0];
        expect(callArgs.where.createdAt.lt).toBeInstanceOf(Date);
        const cutoff = callArgs.where.createdAt.lt;
        const thirtyDaysAgo = new Date();
        thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
        const diffMs = Math.abs(cutoff.getTime() - thirtyDaysAgo.getTime());
        expect(diffMs).toBeLessThan(5000);
        expect(result).toEqual({ count: 42 });
    });
    it("should use default of 30 days", async () => {
        mockPrisma.log.deleteMany.mockResolvedValue({ count: 0 });
        await deleteOldLogs();
        const callArgs = mockPrisma.log.deleteMany.mock.calls[0][0];
        const cutoff = callArgs.where.createdAt.lt;
        const thirtyDaysAgo = new Date();
        thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
        const diffMs = Math.abs(cutoff.getTime() - thirtyDaysAgo.getTime());
        expect(diffMs).toBeLessThan(5000);
    });
    it("should handle custom days", async () => {
        mockPrisma.log.deleteMany.mockResolvedValue({ count: 5 });
        await deleteOldLogs(7);
        const callArgs = mockPrisma.log.deleteMany.mock.calls[0][0];
        const cutoff = callArgs.where.createdAt.lt;
        const sevenDaysAgo = new Date();
        sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);
        const diffMs = Math.abs(cutoff.getTime() - sevenDaysAgo.getTime());
        expect(diffMs).toBeLessThan(5000);
    });
});
describe("sendErrorLog", () => {
    beforeEach(() => {
        vi.clearAllMocks();
    });
    it("should log the error to logger.error regardless of config", async () => {
        const { config } = await import("../config.js");
        config.logChannel = null;
        // consoleSpy replaced with logger.error
        const err = new Error("Test error message");
        sendErrorLog("TestModule", err);
        // console.error is called with (contexte, erreur) - check both args
        const calls = logger.error.mock.calls.map((c) => c.map(String).join(" "));
        expect(calls.some((c) => c.includes("TestModule"))).toBe(true);
        expect(calls.some((c) => c.includes("Test error message"))).toBe(true);
        // consoleSpy.mockRestore() replaced
    });
    it("should return early when config.logChannel is null (no client needed)", async () => {
        const { config } = await import("../config.js");
        config.logChannel = null;
        // consoleSpy replaced with logger.error
        const err = new Error("Silent error");
        // Should not throw
        expect(() => sendErrorLog("Module", err)).not.toThrow();
        // console.error should still have been called
        expect(logger.error).toHaveBeenCalled();
        // consoleSpy.mockRestore() replaced
    });
    it("should return early when config.logChannel is set but client is not provided", async () => {
        const { config } = await import("../config.js");
        config.logChannel = "channel-123";
        // consoleSpy replaced with logger.error
        const err = new Error("No client error");
        // No client passed, channel.get will be undefined, but should not throw
        expect(() => sendErrorLog("Module", err)).not.toThrow();
        // consoleSpy.mockRestore() replaced
    });
    it("should attempt to send embed when logChannel and client are provided", async () => {
        const { config } = await import("../config.js");
        config.logChannel = "channel-123";
        const mockSend = vi.fn().mockResolvedValue(undefined);
        const mockClient = {
            channels: {
                cache: {
                    get: vi.fn().mockReturnValue({
                        isTextBased: () => true,
                        send: mockSend,
                    }),
                },
            },
        };
        // consoleSpy replaced with logger.error
        const err = new Error("Critical failure");
        err.stack = "Error: Critical failure\n    at test.ts:1:1";
        sendErrorLog("Database", err, mockClient);
        expect(mockClient.channels.cache.get).toHaveBeenCalledWith("channel-123");
        expect(mockSend).toHaveBeenCalledTimes(1);
        const embed = mockSend.mock.calls[0][0].embeds[0];
        expect(embed.data.title).toBe("🚨 Erreur Critique");
        expect(embed.data.color).toBe(0xff3344);
        expect(embed.data.fields[0].value).toBe("Database");
        expect(embed.data.fields[2].value).toBe("Critical failure");
        expect(embed.data.fields[3].value).toBe(err.stack);
        // consoleSpy.mockRestore() replaced
    });
    it("should truncate long error messages to 1024 chars", async () => {
        const { config } = await import("../config.js");
        config.logChannel = "channel-123";
        const mockSend = vi.fn().mockResolvedValue(undefined);
        const mockClient = {
            channels: {
                cache: {
                    get: vi.fn().mockReturnValue({
                        isTextBased: () => true,
                        send: mockSend,
                    }),
                },
            },
        };
        // consoleSpy replaced with logger.error
        const longMessage = "A".repeat(2000);
        const err = new Error(longMessage);
        sendErrorLog("Test", err, mockClient);
        const embed = mockSend.mock.calls[0][0].embeds[0];
        expect(embed.data.fields[2].value.length).toBeLessThanOrEqual(1024);
        // consoleSpy.mockRestore() replaced
    });
    it("should silently catch errors when channel send fails", async () => {
        const { config } = await import("../config.js");
        config.logChannel = "channel-123";
        const mockSend = vi.fn().mockRejectedValue(new Error("Send failed"));
        const mockClient = {
            channels: {
                cache: {
                    get: vi.fn().mockReturnValue({
                        isTextBased: () => true,
                        send: mockSend,
                    }),
                },
            },
        };
        // consoleSpy replaced with logger.error
        // Should not throw even though send fails
        expect(() => sendErrorLog("Module", new Error("test"), mockClient)).not.toThrow();
        // The outer console.error + the inner catch console.error
        expect(logger.error).toHaveBeenCalled();
        // consoleSpy.mockRestore() replaced
    });
    it("should skip sending if log channel is not text-based", async () => {
        const { config } = await import("../config.js");
        config.logChannel = "channel-456";
        const mockSend = vi.fn();
        const mockClient = {
            channels: {
                cache: {
                    get: vi.fn().mockReturnValue({
                        isTextBased: () => false,
                        send: mockSend,
                    }),
                },
            },
        };
        // consoleSpy replaced with logger.error
        sendErrorLog("Module", new Error("test"), mockClient);
        expect(mockSend).not.toHaveBeenCalled();
        // consoleSpy.mockRestore() replaced
    });
});
describe("sendBanPurgeLog", () => {
    beforeEach(() => {
        vi.clearAllMocks();
    });
    it("should return early when config.logChannel is null", async () => {
        const { config } = await import("../config.js");
        config.logChannel = null;
        const mockClient = {};
        // consoleSpy replaced with logger.error
        expect(() => sendBanPurgeLog("User#1234", "user-1", 10, 5, mockClient)).not.toThrow();
        // consoleSpy.mockRestore() replaced
    });
    it("should return early when log channel is not found", async () => {
        const { config } = await import("../config.js");
        config.logChannel = "channel-missing";
        const mockClient = {
            channels: {
                cache: {
                    get: vi.fn().mockReturnValue(undefined),
                },
            },
        };
        expect(() => sendBanPurgeLog("User#1234", "user-1", 10, 5, mockClient)).not.toThrow();
        expect(mockClient.channels.cache.get).toHaveBeenCalledWith("channel-missing");
    });
    it("should return early when log channel is not text-based", async () => {
        const { config } = await import("../config.js");
        config.logChannel = "channel-voice";
        const mockSend = vi.fn();
        const mockClient = {
            channels: {
                cache: {
                    get: vi.fn().mockReturnValue({
                        isTextBased: () => false,
                        send: mockSend,
                    }),
                },
            },
        };
        sendBanPurgeLog("User#1234", "user-1", 10, 5, mockClient);
        expect(mockSend).not.toHaveBeenCalled();
    });
    it("should send a properly structured embed to the log channel", async () => {
        const { config } = await import("../config.js");
        config.logChannel = "channel-logs";
        const mockSend = vi.fn().mockResolvedValue(undefined);
        const mockClient = {
            channels: {
                cache: {
                    get: vi.fn().mockReturnValue({
                        isTextBased: () => true,
                        send: mockSend,
                    }),
                },
            },
        };
        sendBanPurgeLog("TestUser#0001", "user-42", 15, 8, mockClient);
        expect(mockClient.channels.cache.get).toHaveBeenCalledWith("channel-logs");
        expect(mockSend).toHaveBeenCalledTimes(1);
        const embed = mockSend.mock.calls[0][0].embeds[0];
        expect(embed.data.title).toBe("🔨 Bannissement & Purge Automatique");
        expect(embed.data.color).toBe(0xff0033);
        const fields = embed.data.fields;
        expect(fields[0].value).toContain("TestUser#0001");
        expect(fields[0].value).toContain("user-42");
        expect(fields[1].value).toBe("15 message(s)");
        expect(fields[2].value).toBe("8");
    });
    it("should silently catch errors when channel send fails", async () => {
        const { config } = await import("../config.js");
        config.logChannel = "channel-err";
        const mockSend = vi.fn().mockRejectedValue(new Error("Send failed"));
        const mockClient = {
            channels: {
                cache: {
                    get: vi.fn().mockReturnValue({
                        isTextBased: () => true,
                        send: mockSend,
                    }),
                },
            },
        };
        // consoleSpy replaced with logger.error
        // sendBanPurgeLog is async - await it so the catch block executes
        await sendBanPurgeLog("User#X", "user-x", 0, 1, mockClient);
        expect(logger.error).toHaveBeenCalled();
        // consoleSpy.mockRestore() replaced
    });
});
//# sourceMappingURL=logs.test.js.map