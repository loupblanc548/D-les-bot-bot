import { describe, it, expect, vi } from "vitest";
import winston from "winston";

// ── Mock Sentry avant l'import du logger ─────────────────────────
const mockCaptureException = vi.fn();
vi.mock("@sentry/node", () => ({
  init: vi.fn(),
  captureException: (...args: unknown[]) => mockCaptureException(...args),
  close: vi.fn(),
}));

// Import après les mocks (re-importe le module pour que les mocks soient actifs)
import logger, { fortniteLogger } from "./logger.js";

// ================================================================
// Logger principal
// ================================================================

describe("logger (principal)", () => {
  it("doit avoir 2 transports : Console + File (combined.log)", () => {
    const transports = (logger as any).transports as winston.transport[];
    expect(transports.length).toBe(2);

    const types = transports.map((t) => t.constructor.name);
    expect(types).toContain("Console");
    expect(types).toContain("File");
  });

  it("le transport Console doit être au niveau 'info' (ou configuré via LOG_LEVEL)", () => {
    const transports = (logger as any).transports as winston.transport[];
    const consoleTransport = transports.find(
      (t) => t.constructor.name === "Console",
    );
    expect(consoleTransport).toBeDefined();
    // Le niveau par défaut du logger est 'info', le transport hérite de ce niveau
    expect(consoleTransport!.level).toBeUndefined(); // pas de niveau propre → hérite du logger
  });

  it("le transport File doit écrire dans logs/combined.log", () => {
    const transports = (logger as any).transports as winston.transport[];
    const anyFile = transports.find(
      (t) => t.constructor.name === "File",
    ) as any;
    expect(anyFile).toBeDefined();
    expect(anyFile._baseFilename || anyFile.filename).toContain("combined");
  });

  it("doit exporter logger comme export par défaut et fortniteLogger comme export nommé", () => {
    expect(logger).toBeDefined();
    expect(fortniteLogger).toBeDefined();
    expect(logger).not.toBe(fortniteLogger);
  });

  it("logger.error() doit déclencher Sentry.captureException", () => {
    mockCaptureException.mockClear();
    logger.error("Test error for Sentry");
    expect(mockCaptureException).toHaveBeenCalledTimes(1);
    const err = mockCaptureException.mock.calls[0][0];
    expect(err).toBeInstanceOf(Error);
    expect(err.message).toBe("Test error for Sentry");
  });

  it("logger.info() et logger.warn() ne doivent PAS déclencher Sentry", () => {
    mockCaptureException.mockClear();
    logger.info("Info test");
    logger.warn("Warn test");
    expect(mockCaptureException).not.toHaveBeenCalled();
  });
});

// ================================================================
// fortniteLogger — Transports
// ================================================================

describe("fortniteLogger", () => {
  it("doit avoir exactement 3 transports", () => {
    const transports = (fortniteLogger as any)
      .transports as winston.transport[];
    expect(transports.length).toBe(3);
  });

  it("doit avoir 2 transports File (combined.log + fortnite.log)", () => {
    const transports = (fortniteLogger as any)
      .transports as winston.transport[];
    const fileTransports = transports.filter(
      (t) => t.constructor.name === "File",
    );
    expect(fileTransports.length).toBe(2);
  });

  it("un File doit écrire dans logs/fortnite.log", () => {
    const transports = (fortniteLogger as any)
      .transports as winston.transport[];
    const fortniteFile = transports.find(
      (t) =>
        t.constructor.name === "File" &&
        ((t as any)._baseFilename || (t as any).filename || "").includes(
          "fortnite",
        ),
    );
    expect(fortniteFile).toBeDefined();
  });

  it("l'autre File doit écrire dans logs/combined.log", () => {
    const transports = (fortniteLogger as any)
      .transports as winston.transport[];
    const combinedFile = transports.find(
      (t) =>
        t.constructor.name === "File" &&
        ((t as any)._baseFilename || (t as any).filename || "").includes(
          "combined",
        ),
    );
    expect(combinedFile).toBeDefined();
  });

  it("doit avoir 1 transport Console configuré en niveau 'error' uniquement", () => {
    const transports = (fortniteLogger as any)
      .transports as winston.transport[];
    const consoleTransport = transports.find(
      (t) => t.constructor.name === "Console",
    ) as any;

    expect(consoleTransport).toBeDefined();
    expect(consoleTransport.level).toBe("error");
  });

  it("fortniteLogger.error() doit déclencher Sentry.captureException avec module 'fortnite'", () => {
    mockCaptureException.mockClear();
    fortniteLogger.error("Fortnite crash test");
    expect(mockCaptureException).toHaveBeenCalledTimes(1);
    const err = mockCaptureException.mock.calls[0][0];
    expect(err).toBeInstanceOf(Error);
    expect(err.message).toBe("Fortnite crash test");
    // Vérifie que le tag module: 'fortnite' est présent dans l'appel Sentry
    const callArgs = mockCaptureException.mock.calls[0];
    expect(callArgs[1]).toHaveProperty("extra.module", "fortnite");
  });

  it("fortniteLogger.info() et fortniteLogger.warn() ne doivent PAS déclencher Sentry", () => {
    mockCaptureException.mockClear();
    fortniteLogger.info("Fortnite info");
    fortniteLogger.warn("Fortnite warn");
    expect(mockCaptureException).not.toHaveBeenCalled();
  });
});

// ================================================================
// Vérification clé : pas de flood console pour info/warn Fortnite
// ================================================================

describe("Protection anti-flood console", () => {
  it("fortniteLogger NE doit PAS avoir de Console transport au niveau info ou warn", () => {
    const transports = (fortniteLogger as any)
      .transports as winston.transport[];
    const consoleTransports = transports.filter(
      (t) => t.constructor.name === "Console",
    );

    // Un seul Console transport
    expect(consoleTransports.length).toBe(1);

    // Il doit être strictement au niveau 'error'
    const consoleTransport = consoleTransports[0] as any;
    expect(consoleTransport.level).toBe("error");
  });

  it("le logger principal NE doit PAS avoir de transport pointant vers fortnite.log", () => {
    const transports = (logger as any).transports as winston.transport[];
    const fortniteFiles = transports.filter(
      (t) =>
        t.constructor.name === "File" &&
        ((t as any)._baseFilename || (t as any).filename || "").includes(
          "fortnite",
        ),
    );
    expect(fortniteFiles.length).toBe(0);
  });
});
