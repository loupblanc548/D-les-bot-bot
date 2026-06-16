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
Object.defineProperty(exports, "__esModule", { value: true });
const vitest_1 = require("vitest");
// ── Mock Sentry avant l'import du logger ─────────────────────────
const mockCaptureException = vitest_1.vi.fn();
vitest_1.vi.mock("@sentry/node", () => ({
    init: vitest_1.vi.fn(),
    captureException: (...args) => mockCaptureException(...args),
    close: vitest_1.vi.fn(),
}));
// Import après les mocks (re-importe le module pour que les mocks soient actifs)
const logger_1 = __importStar(require("./logger"));
// ================================================================
// Logger principal
// ================================================================
(0, vitest_1.describe)("logger (principal)", () => {
    (0, vitest_1.it)("doit avoir 2 transports : Console + File (combined.log)", () => {
        const transports = logger_1.default.transports;
        (0, vitest_1.expect)(transports.length).toBe(2);
        const types = transports.map((t) => t.constructor.name);
        (0, vitest_1.expect)(types).toContain("Console");
        (0, vitest_1.expect)(types).toContain("File");
    });
    (0, vitest_1.it)("le transport Console doit être au niveau 'info' (ou configuré via LOG_LEVEL)", () => {
        const transports = logger_1.default.transports;
        const consoleTransport = transports.find((t) => t.constructor.name === "Console");
        (0, vitest_1.expect)(consoleTransport).toBeDefined();
        // Le niveau par défaut du logger est 'info', le transport hérite de ce niveau
        (0, vitest_1.expect)(consoleTransport.level).toBeUndefined(); // pas de niveau propre → hérite du logger
    });
    (0, vitest_1.it)("le transport File doit écrire dans logs/combined.log", () => {
        const transports = logger_1.default.transports;
        const anyFile = transports.find((t) => t.constructor.name === "File");
        (0, vitest_1.expect)(anyFile).toBeDefined();
        (0, vitest_1.expect)(anyFile._baseFilename || anyFile.filename).toContain("combined");
    });
    (0, vitest_1.it)("doit exporter logger comme export par défaut et fortniteLogger comme export nommé", () => {
        (0, vitest_1.expect)(logger_1.default).toBeDefined();
        (0, vitest_1.expect)(logger_1.fortniteLogger).toBeDefined();
        (0, vitest_1.expect)(logger_1.default).not.toBe(logger_1.fortniteLogger);
    });
    (0, vitest_1.it)("logger.error() doit déclencher Sentry.captureException", () => {
        mockCaptureException.mockClear();
        logger_1.default.error("Test error for Sentry");
        (0, vitest_1.expect)(mockCaptureException).toHaveBeenCalledTimes(1);
        const err = mockCaptureException.mock.calls[0][0];
        (0, vitest_1.expect)(err).toBeInstanceOf(Error);
        (0, vitest_1.expect)(err.message).toBe("Test error for Sentry");
    });
    (0, vitest_1.it)("logger.info() et logger.warn() ne doivent PAS déclencher Sentry", () => {
        mockCaptureException.mockClear();
        logger_1.default.info("Info test");
        logger_1.default.warn("Warn test");
        (0, vitest_1.expect)(mockCaptureException).not.toHaveBeenCalled();
    });
});
// ================================================================
// fortniteLogger — Transports
// ================================================================
(0, vitest_1.describe)("fortniteLogger", () => {
    (0, vitest_1.it)("doit avoir exactement 3 transports", () => {
        const transports = logger_1.fortniteLogger
            .transports;
        (0, vitest_1.expect)(transports.length).toBe(3);
    });
    (0, vitest_1.it)("doit avoir 2 transports File (combined.log + fortnite.log)", () => {
        const transports = logger_1.fortniteLogger
            .transports;
        const fileTransports = transports.filter((t) => t.constructor.name === "File");
        (0, vitest_1.expect)(fileTransports.length).toBe(2);
    });
    (0, vitest_1.it)("un File doit écrire dans logs/fortnite.log", () => {
        const transports = logger_1.fortniteLogger
            .transports;
        const fortniteFile = transports.find((t) => t.constructor.name === "File" &&
            (t._baseFilename || t.filename || "").includes("fortnite"));
        (0, vitest_1.expect)(fortniteFile).toBeDefined();
    });
    (0, vitest_1.it)("l'autre File doit écrire dans logs/combined.log", () => {
        const transports = logger_1.fortniteLogger
            .transports;
        const combinedFile = transports.find((t) => t.constructor.name === "File" &&
            (t._baseFilename || t.filename || "").includes("combined"));
        (0, vitest_1.expect)(combinedFile).toBeDefined();
    });
    (0, vitest_1.it)("doit avoir 1 transport Console configuré en niveau 'error' uniquement", () => {
        const transports = logger_1.fortniteLogger
            .transports;
        const consoleTransport = transports.find((t) => t.constructor.name === "Console");
        (0, vitest_1.expect)(consoleTransport).toBeDefined();
        (0, vitest_1.expect)(consoleTransport.level).toBe("error");
    });
    (0, vitest_1.it)("fortniteLogger.error() doit déclencher Sentry.captureException avec module 'fortnite'", () => {
        mockCaptureException.mockClear();
        logger_1.fortniteLogger.error("Fortnite crash test");
        (0, vitest_1.expect)(mockCaptureException).toHaveBeenCalledTimes(1);
        const err = mockCaptureException.mock.calls[0][0];
        (0, vitest_1.expect)(err).toBeInstanceOf(Error);
        (0, vitest_1.expect)(err.message).toBe("Fortnite crash test");
        // Vérifie que le tag module: 'fortnite' est présent dans l'appel Sentry
        const callArgs = mockCaptureException.mock.calls[0];
        (0, vitest_1.expect)(callArgs[1]).toHaveProperty("extra.module", "fortnite");
    });
    (0, vitest_1.it)("fortniteLogger.info() et fortniteLogger.warn() ne doivent PAS déclencher Sentry", () => {
        mockCaptureException.mockClear();
        logger_1.fortniteLogger.info("Fortnite info");
        logger_1.fortniteLogger.warn("Fortnite warn");
        (0, vitest_1.expect)(mockCaptureException).not.toHaveBeenCalled();
    });
});
// ================================================================
// Vérification clé : pas de flood console pour info/warn Fortnite
// ================================================================
(0, vitest_1.describe)("Protection anti-flood console", () => {
    (0, vitest_1.it)("fortniteLogger NE doit PAS avoir de Console transport au niveau info ou warn", () => {
        const transports = logger_1.fortniteLogger
            .transports;
        const consoleTransports = transports.filter((t) => t.constructor.name === "Console");
        // Un seul Console transport
        (0, vitest_1.expect)(consoleTransports.length).toBe(1);
        // Il doit être strictement au niveau 'error'
        const consoleTransport = consoleTransports[0];
        (0, vitest_1.expect)(consoleTransport.level).toBe("error");
    });
    (0, vitest_1.it)("le logger principal NE doit PAS avoir de transport pointant vers fortnite.log", () => {
        const transports = logger_1.default.transports;
        const fortniteFiles = transports.filter((t) => t.constructor.name === "File" &&
            (t._baseFilename || t.filename || "").includes("fortnite"));
        (0, vitest_1.expect)(fortniteFiles.length).toBe(0);
    });
});
//# sourceMappingURL=logger.test.js.map