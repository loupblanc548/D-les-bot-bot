import { describe, it, expect, vi, beforeEach } from "vitest";

// ── Hoisted mocks ──────────────────────────────────────────────
const { mockLogger, mockSentry } = vi.hoisted(() => ({
  mockLogger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
  mockSentry: { captureException: vi.fn() },
}));

vi.mock("./utils/logger", () => ({ default: mockLogger }));
vi.mock("@sentry/node", () => ({ default: mockSentry, captureException: mockSentry.captureException }));

import { attachProcessHandlers } from "./processHandlers.js";

describe("processHandlers", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe("attachProcessHandlers", () => {
    let processOnSpy: ReturnType<typeof vi.spyOn>;

    beforeEach(() => {
      processOnSpy = vi.spyOn(process, "on").mockImplementation(() => process as any);
    });

    it("enregistre les handlers unhandledRejection et uncaughtException", () => {
      attachProcessHandlers();
      expect(processOnSpy).toHaveBeenCalledWith("unhandledRejection", expect.any(Function));
      expect(processOnSpy).toHaveBeenCalledWith("uncaughtException", expect.any(Function));
    });

    it("appelle logger.error et Sentry.captureException sur unhandledRejection", () => {
      // Récupérer le handler enregistré
      attachProcessHandlers();
      const handler = processOnSpy.mock.calls.find((c: any[]) => c[0] === "unhandledRejection")?.[1] as Function;
      expect(handler).toBeDefined();

      const error = new Error("Test rejection");
      handler(error, Promise.resolve());

      expect(mockLogger.error).toHaveBeenCalledWith(
        expect.stringContaining("Unhandled Rejection"),
        expect.objectContaining({ stack: error.stack })
      );
      expect(mockSentry.captureException).toHaveBeenCalledWith(error, { tags: { type: "unhandledRejection" } });
    });

    it("appelle logger.error et Sentry.captureException sur uncaughtException", () => {
      attachProcessHandlers();
      const handler = processOnSpy.mock.calls.find((c: any[]) => c[0] === "uncaughtException")?.[1] as Function;
      expect(handler).toBeDefined();

      const error = new Error("Test exception");
      handler(error);

      expect(mockLogger.error).toHaveBeenCalledWith(
        expect.stringContaining("Uncaught Exception"),
        expect.objectContaining({ stack: error.stack })
      );
      expect(mockSentry.captureException).toHaveBeenCalledWith(error, { tags: { type: "uncaughtException" } });
    });

    it("convertit raison non-Error en Error pour unhandledRejection", () => {
      attachProcessHandlers();
      const handler = processOnSpy.mock.calls.find((c: any[]) => c[0] === "unhandledRejection")?.[1] as Function;

      handler("string reason", Promise.resolve());

      expect(mockSentry.captureException).toHaveBeenCalledWith(
        expect.any(Error),
        expect.objectContaining({ tags: { type: "unhandledRejection" } })
      );
      const captured = mockSentry.captureException.mock.calls[0][0] as Error;
      expect(captured.message).toBe("string reason");
    });
  });
});
