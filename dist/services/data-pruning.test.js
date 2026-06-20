import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
const { mockPrisma, mockLogger } = vi.hoisted(() => ({
    mockPrisma: {
        log: { deleteMany: vi.fn() },
        notification: { deleteMany: vi.fn() },
        chatHistory: { deleteMany: vi.fn() },
    },
    mockLogger: {
        info: vi.fn(),
        error: vi.fn(),
        warn: vi.fn(),
    },
}));
vi.mock("../prisma", () => ({ default: mockPrisma }));
vi.mock("../utils/logger", () => ({ default: mockLogger }));
import { pruneOldData, startDataPruning, stopDataPruning } from "./data-pruning.js";
describe("data-pruning", () => {
    beforeEach(() => {
        vi.clearAllMocks();
        vi.useFakeTimers();
        // Clear any running interval from previous tests
        stopDataPruning();
    });
    afterEach(() => {
        vi.useRealTimers();
    });
    describe("pruneOldData", () => {
        it("should delete logs older than 30 days", async () => {
            mockPrisma.log.deleteMany.mockResolvedValue({ count: 5 });
            mockPrisma.notification.deleteMany.mockResolvedValue({ count: 0 });
            mockPrisma.chatHistory.deleteMany.mockResolvedValue({ count: 0 });
            const result = await pruneOldData();
            expect(mockPrisma.log.deleteMany).toHaveBeenCalledWith({
                where: { createdAt: { lt: expect.any(Date) } },
            });
            expect(result.logsDeleted).toBe(5);
        });
        it("should delete notifications older than 90 days", async () => {
            mockPrisma.log.deleteMany.mockResolvedValue({ count: 0 });
            mockPrisma.notification.deleteMany.mockResolvedValue({ count: 12 });
            mockPrisma.chatHistory.deleteMany.mockResolvedValue({ count: 0 });
            const result = await pruneOldData();
            expect(mockPrisma.notification.deleteMany).toHaveBeenCalledWith({
                where: { sentAt: { lt: expect.any(Date) } },
            });
            expect(result.notificationsDeleted).toBe(12);
        });
        it("should delete chat history older than 7 days", async () => {
            mockPrisma.log.deleteMany.mockResolvedValue({ count: 0 });
            mockPrisma.notification.deleteMany.mockResolvedValue({ count: 0 });
            mockPrisma.chatHistory.deleteMany.mockResolvedValue({ count: 3 });
            const result = await pruneOldData();
            expect(mockPrisma.chatHistory.deleteMany).toHaveBeenCalledWith({
                where: { createdAt: { lt: expect.any(Date) } },
            });
            expect(result.chatHistoryDeleted).toBe(3);
        });
        it("should log when data was actually deleted", async () => {
            mockPrisma.log.deleteMany.mockResolvedValue({ count: 2 });
            mockPrisma.notification.deleteMany.mockResolvedValue({ count: 1 });
            mockPrisma.chatHistory.deleteMany.mockResolvedValue({ count: 0 });
            await pruneOldData();
            expect(mockLogger.info).toHaveBeenCalledWith(expect.stringContaining("[DataPruning] Nettoyage terminé"));
        });
        it("should not log when nothing was deleted", async () => {
            mockPrisma.log.deleteMany.mockResolvedValue({ count: 0 });
            mockPrisma.notification.deleteMany.mockResolvedValue({ count: 0 });
            mockPrisma.chatHistory.deleteMany.mockResolvedValue({ count: 0 });
            await pruneOldData();
            expect(mockLogger.info).not.toHaveBeenCalled();
        });
        it("should handle partial failures gracefully", async () => {
            mockPrisma.log.deleteMany.mockResolvedValue({ count: 3 });
            mockPrisma.notification.deleteMany.mockRejectedValue(new Error("DB error"));
            mockPrisma.chatHistory.deleteMany.mockResolvedValue({ count: 1 });
            const result = await pruneOldData();
            expect(result.logsDeleted).toBe(3);
            expect(result.notificationsDeleted).toBe(0); // failed -> 0
            expect(result.chatHistoryDeleted).toBe(1);
        });
    });
    describe("startDataPruning / stopDataPruning", () => {
        it("should set up interval and log activation", () => {
            const setIntervalSpy = vi.spyOn(global, "setInterval");
            startDataPruning();
            expect(mockLogger.info).toHaveBeenCalledWith(expect.stringContaining("[DataPruning] Nettoyage automatique"));
            expect(setIntervalSpy).toHaveBeenCalled();
        });
        it("should not start twice", () => {
            startDataPruning();
            mockLogger.info.mockClear();
            startDataPruning();
            expect(mockLogger.info).not.toHaveBeenCalled();
        });
        it("should clear interval on stop", () => {
            const clearIntervalSpy = vi.spyOn(global, "clearInterval");
            startDataPruning();
            stopDataPruning();
            expect(clearIntervalSpy).toHaveBeenCalled();
        });
        it("should handle stop without start gracefully", () => {
            expect(() => stopDataPruning()).not.toThrow();
        });
    });
});
//# sourceMappingURL=data-pruning.test.js.map