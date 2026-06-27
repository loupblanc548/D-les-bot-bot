import { describe, it, expect, vi, beforeEach } from "vitest";

const { mockLogger, mockConfig, mockMiddleware } = vi.hoisted(() => ({
  mockLogger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
  mockConfig: { token: "mock-token", clientId: "mock-client-id", guildId: null },
  mockMiddleware: {
    createLoggingMiddleware: vi.fn(() => vi.fn()),
    createRateLimitMiddleware: vi.fn(() => vi.fn()),
    withMiddleware: vi.fn((h: unknown) => h),
  },
}));

vi.mock("./utils/logger", () => ({ default: mockLogger }));
vi.mock("./config", () => ({ config: mockConfig }));
vi.mock("./middleware", () => mockMiddleware);

// Mocker TOUS les modules de commandes pour éviter de charger leurs imports discord.js
vi.mock("./commands/main", () => ({
  commands: [{ name: "start", description: "Start" }],
  handleCommand: vi.fn(),
  handleSelectMenu: vi.fn(),
}));
vi.mock("./commands/sources", () => ({
  commands: [{ name: "addsource", description: "Source" }],
  handleCommand: vi.fn(),
}));
vi.mock("./commands/admin", () => ({
  commands: [{ name: "broadcast", description: "Broadcast" }],
  handleCommand: vi.fn(),
}));
vi.mock("./commands/ai", () => ({
  commands: [{ name: "chat", description: "Chat" }],
  handleCommand: vi.fn(),
}));
vi.mock("./commands/moderation", () => ({ commands: [], handleCommand: vi.fn() }));
vi.mock("./commands/casier", () => ({ commands: [], handleCommand: vi.fn() }));
vi.mock("./commands/gaming", () => ({ commands: [], handleCommand: vi.fn() }));
vi.mock("./commands/community", () => ({ commands: [], handleCommand: vi.fn() }));
vi.mock("./commands/utility", () => ({ commands: [], handleCommand: vi.fn() }));
vi.mock("./commands/vocal", () => ({ commands: [], handleCommand: vi.fn() }));
vi.mock("./commands/retrospective", () => ({ commands: [], handleCommand: vi.fn() }));
vi.mock("./commands/twitch", () => ({ commands: [], handleCommand: vi.fn() }));
vi.mock("./commands/steam", () => ({ commands: [], handleCommand: vi.fn() }));
vi.mock("./commands/trackGame", () => ({ commands: [], handleCommand: vi.fn() }));
vi.mock("./commands/psn", () => ({ commands: [], handleCommand: vi.fn() }));
vi.mock("./commands/dictee", () => ({ commands: [], handleCommand: vi.fn() }));
vi.mock("./commands/alertcenter", () => ({ commands: [], handleCommand: vi.fn() }));
vi.mock("./commands/mp3", () => ({ commands: [], handleCommand: vi.fn() }));
vi.mock("./commands/tts", () => ({ commands: [], handleCommand: vi.fn() }));
vi.mock("./commands/ai-extra", () => ({ commands: [], handleCommand: vi.fn() }));
vi.mock("./commands/security/core", () => ({ commands: [], handleCommand: vi.fn() }));
vi.mock("./commands/clean-duplicates", () => ({ commands: [], handleCommand: vi.fn() }));
vi.mock("./commands/maintenance", () => ({ commands: [], handleCommand: vi.fn() }));
vi.mock("./commands/uptime", () => ({ commands: [], handleCommand: vi.fn() }));
vi.mock("./commands/healthz", () => ({ commands: [], handleCommand: vi.fn() }));
vi.mock("./commands/security-audit", () => ({ commands: [], handleCommand: vi.fn() }));
vi.mock("./commands/userinfo", () => ({ commands: [], handleCommand: vi.fn() }));
vi.mock("./commands/advanced", () => ({ commands: [], handleCommand: vi.fn() }));
vi.mock("./commands/fun/echoTds", () => ({ commands: [], handleCommand: vi.fn() }));
vi.mock("./commands/fun/askBot", () => ({ commands: [], handleCommand: vi.fn() }));
vi.mock("./commands/fun/wishlist", () => ({ commands: [], handleCommand: vi.fn() }));
vi.mock("./commands/fun/shop", () => ({ commands: [], handleCommand: vi.fn() }));
vi.mock("./commands/fun/boutique", () => ({ commands: [], handleCommand: vi.fn() }));
vi.mock("./commands/mod", () => ({ commands: [], handleCommand: vi.fn() }));
vi.mock("./commands/securityGroup", () => ({ commands: [], handleCommand: vi.fn() }));
vi.mock("./commands/sourcesGroup", () => ({ commands: [], handleCommand: vi.fn() }));
vi.mock("./commands/trackGroup", () => ({ commands: [], handleCommand: vi.fn() }));
vi.mock("./commands/casierGroup", () => ({ commands: [], handleCommand: vi.fn() }));
vi.mock("./commands/alertGroup", () => ({ commands: [], handleCommand: vi.fn() }));
vi.mock("./commands/aiGroup", () => ({ commands: [], handleCommand: vi.fn() }));

// IMPORTANT: mockReturnValue pour éviter le probleme "new" avec les arrow functions
vi.mock("discord.js", () => ({
  REST: vi.fn(function () {
    return { setToken: vi.fn().mockReturnThis(), put: vi.fn().mockResolvedValue(undefined) };
  }),
  Routes: { applicationGuildCommands: vi.fn(), applicationCommands: vi.fn() },
  PermissionFlagsBits: { Administrator: 8n },
  SlashCommandBuilder: vi.fn().mockImplementation(function () {
    return {
      setName: vi.fn().mockReturnThis(),
      setDescription: vi.fn().mockReturnThis(),
      setDefaultMemberPermissions: vi.fn().mockReturnThis(),
      addSubcommand: vi.fn().mockReturnThis(),
      addStringOption: vi.fn().mockReturnThis(),
      addIntegerOption: vi.fn().mockReturnThis(),
      addNumberOption: vi.fn().mockReturnThis(),
      addBooleanOption: vi.fn().mockReturnThis(),
      addUserOption: vi.fn().mockReturnThis(),
      addChannelOption: vi.fn().mockReturnThis(),
      addRoleOption: vi.fn().mockReturnThis(),
      setMinValue: vi.fn().mockReturnThis(),
      setMaxValue: vi.fn().mockReturnThis(),
      setMinLength: vi.fn().mockReturnThis(),
      setAutocomplete: vi.fn().mockReturnThis(),
      addChoices: vi.fn().mockReturnThis(),
      addChannelTypes: vi.fn().mockReturnThis(),
      toJSON: vi.fn().mockReturnValue({}),
    };
  }),
}));

import {
  commandRouter,
  buildCommandRouter,
  applyCommandMiddleware,
  registerCommands,
} from "./commandRouter.js";

describe("commandRouter", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe("buildCommandRouter", () => {
    it("enregistre les commandes dans le router", () => {
      buildCommandRouter();
      expect(commandRouter["start"]).toBeDefined();
      expect(commandRouter["help"]).toBeDefined();
      expect(commandRouter["add-source"]).toBeDefined();
      expect(commandRouter["broadcast"]).toBeDefined();
      expect(commandRouter["chat"]).toBeDefined();
    });

    it("enregistre les commandes fun", () => {
      buildCommandRouter();
      expect(commandRouter["wishlist"]).toBeDefined();
    });

    it("ne crée pas de route pour des commandes inexistantes", () => {
      buildCommandRouter();
      expect(commandRouter["nonexistent"]).toBeUndefined();
    });
  });

  describe("applyCommandMiddleware", () => {
    it("applique le middleware", () => {
      buildCommandRouter();
      applyCommandMiddleware();
      expect(mockMiddleware.withMiddleware).toHaveBeenCalled();
    });
  });

  describe("registerCommands", () => {
    it("s'exécute et log les infos de demarrage", async () => {
      await registerCommands();
      expect(mockLogger.info).toHaveBeenCalled();
    });
  });

  describe("handleMainSelectMenu re-export", () => {
    it("exporte le handler depuis main", async () => {
      const mod = await import("./commandRouter.js");
      expect(mod.handleMainSelectMenu).toBeDefined();
    });
  });
});
