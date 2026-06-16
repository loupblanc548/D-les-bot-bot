"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const vitest_1 = require("vitest");
const { mockPrisma, mockLogger } = vitest_1.vi.hoisted(() => ({
    mockPrisma: {
        log: { deleteMany: vitest_1.vi.fn() },
        notification: { deleteMany: vitest_1.vi.fn() },
        chatHistory: { deleteMany: vitest_1.vi.fn() },
    },
    mockLogger: {
        info: vitest_1.vi.fn(),
        error: vitest_1.vi.fn(),
        warn: vitest_1.vi.fn(),
    },
}));
vitest_1.vi.mock("../prisma", () => ({ default: mockPrisma }));
vitest_1.vi.mock("../utils/logger", () => ({ default: mockLogger }));
const data_pruning_1 = require("./data-pruning");
(0, vitest_1.describe)("data-pruning", () => {
    (0, vitest_1.beforeEach)(() => {
        vitest_1.vi.clearAllMocks();
        vitest_1.vi.useFakeTimers();
        // Clear any running interval from previous tests
        (0, data_pruning_1.stopDataPruning)();
    });
    (0, vitest_1.afterEach)(() => {
        vitest_1.vi.useRealTimers();
    });
    (0, vitest_1.describe)("pruneOldData", () => {
        (0, vitest_1.it)("should delete logs older than 30 days", async () => {
            mockPrisma.log.deleteMany.mockResolvedValue({ count: 5 });
            mockPrisma.notification.deleteMany.mockResolvedValue({ count: 0 });
            mockPrisma.chatHistory.deleteMany.mockResolvedValue({ count: 0 });
            const result = await (0, data_pruning_1.pruneOldData)();
            (0, vitest_1.expect)(mockPrisma.log.deleteMany).toHaveBeenCalledWith({
                where: { createdAt: { lt: vitest_1.expect.any(Date) } },
            });
            (0, vitest_1.expect)(result.logsDeleted).toBe(5);
        });
        (0, vitest_1.it)("should delete notifications older than 90 days", async () => {
            mockPrisma.log.deleteMany.mockResolvedValue({ count: 0 });
            mockPrisma.notification.deleteMany.mockResolvedValue({ count: 12 });
            mockPrisma.chatHistory.deleteMany.mockResolvedValue({ count: 0 });
            const result = await (0, data_pruning_1.pruneOldData)();
            (0, vitest_1.expect)(mockPrisma.notification.deleteMany).toHaveBeenCalledWith({
                where: { sentAt: { lt: vitest_1.expect.any(Date) } },
            });
            (0, vitest_1.expect)(result.notificationsDeleted).toBe(12);
        });
        (0, vitest_1.it)("should delete chat history older than 7 days", async () => {
            mockPrisma.log.deleteMany.mockResolvedValue({ count: 0 });
            mockPrisma.notification.deleteMany.mockResolvedValue({ count: 0 });
            mockPrisma.chatHistory.deleteMany.mockResolvedValue({ count: 3 });
            const result = await (0, data_pruning_1.pruneOldData)();
            (0, vitest_1.expect)(mockPrisma.chatHistory.deleteMany).toHaveBeenCalledWith({
                where: { createdAt: { lt: vitest_1.expect.any(Date) } },
            });
            (0, vitest_1.expect)(result.chatHistoryDeleted).toBe(3);
        });
        (0, vitest_1.it)("should log when data was actually deleted", async () => {
            mockPrisma.log.deleteMany.mockResolvedValue({ count: 2 });
            mockPrisma.notification.deleteMany.mockResolvedValue({ count: 1 });
            mockPrisma.chatHistory.deleteMany.mockResolvedValue({ count: 0 });
            await (0, data_pruning_1.pruneOldData)();
            (0, vitest_1.expect)(mockLogger.info).toHaveBeenCalledWith(vitest_1.expect.stringContaining("[DataPruning] Nettoyage terminé"));
        });
        (0, vitest_1.it)("should not log when nothing was deleted", async () => {
            mockPrisma.log.deleteMany.mockResolvedValue({ count: 0 });
            mockPrisma.notification.deleteMany.mockResolvedValue({ count: 0 });
            mockPrisma.chatHistory.deleteMany.mockResolvedValue({ count: 0 });
            await (0, data_pruning_1.pruneOldData)();
            (0, vitest_1.expect)(mockLogger.info).not.toHaveBeenCalled();
        });
        (0, vitest_1.it)("should handle partial failures gracefully", async () => {
            mockPrisma.log.deleteMany.mockResolvedValue({ count: 3 });
            mockPrisma.notification.deleteMany.mockRejectedValue(new Error("DB error"));
            mockPrisma.chatHistory.deleteMany.mockResolvedValue({ count: 1 });
            const result = await (0, data_pruning_1.pruneOldData)();
            (0, vitest_1.expect)(result.logsDeleted).toBe(3);
            (0, vitest_1.expect)(result.notificationsDeleted).toBe(0); // failed -> 0
            (0, vitest_1.expect)(result.chatHistoryDeleted).toBe(1);
        });
    });
    (0, vitest_1.describe)("startDataPruning / stopDataPruning", () => {
        (0, vitest_1.it)("should set up interval and log activation", () => {
            const setIntervalSpy = vitest_1.vi.spyOn(global, "setInterval");
            (0, data_pruning_1.startDataPruning)();
            (0, vitest_1.expect)(mockLogger.info).toHaveBeenCalledWith(vitest_1.expect.stringContaining("[DataPruning] Nettoyage automatique"));
            (0, vitest_1.expect)(setIntervalSpy).toHaveBeenCalled();
        });
        (0, vitest_1.it)("should not start twice", () => {
            (0, data_pruning_1.startDataPruning)();
            mockLogger.info.mockClear();
            (0, data_pruning_1.startDataPruning)();
            (0, vitest_1.expect)(mockLogger.info).not.toHaveBeenCalled();
        });
        (0, vitest_1.it)("should clear interval on stop", () => {
            const clearIntervalSpy = vitest_1.vi.spyOn(global, "clearInterval");
            (0, data_pruning_1.startDataPruning)();
            (0, data_pruning_1.stopDataPruning)();
            (0, vitest_1.expect)(clearIntervalSpy).toHaveBeenCalled();
        });
        (0, vitest_1.it)("should handle stop without start gracefully", () => {
            (0, vitest_1.expect)(() => (0, data_pruning_1.stopDataPruning)()).not.toThrow();
        });
    });
});
//# sourceMappingURL=data-pruning.test.js.map