import { describe, it, expect, vi, beforeEach } from "vitest";

// ── Hoisted mocks ──────────────────────────────────────────────
const { mockLogger, mockPrisma, mockSentry, mockCommandRouter, mockHandlers } = vi.hoisted(() => ({
  mockLogger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
  mockPrisma: {
    source: {
      findMany: vi.fn().mockResolvedValue([]),
    },
  },
  mockSentry: { captureException: vi.fn(), close: vi.fn() },
  mockCommandRouter: {
    start: vi.fn().mockResolvedValue(undefined),
    help: vi.fn().mockResolvedValue(undefined),
  },
  mockHandlers: {
    handleHelpSelectMenu: vi.fn().mockResolvedValue(undefined),
    handleVerifButton: vi.fn().mockReturnValue(false),
    handleAutocomplete: vi.fn().mockResolvedValue(undefined),
    handleMp3Autocomplete: vi.fn().mockResolvedValue(undefined),
    handleWishlistAutocomplete: vi.fn().mockResolvedValue(undefined),
  },
}));

vi.mock("./utils/logger", () => ({ default: mockLogger }));
vi.mock("./prisma", () => ({ default: mockPrisma }));
vi.mock("@sentry/node", () => ({
  default: mockSentry,
  captureException: mockSentry.captureException,
}));
vi.mock("./commandRouter", () => ({
  commandRouter: mockCommandRouter,
}));
vi.mock("./commands/helpSystem", () => ({
  handleHelpSelectMenu: mockHandlers.handleHelpSelectMenu,
}));
vi.mock("./commands/security", () => ({ handleVerifButton: mockHandlers.handleVerifButton }));
vi.mock("./commands/trackGame", () => ({ handleAutocomplete: mockHandlers.handleAutocomplete }));
vi.mock("./commands/mp3", () => ({ handleAutocomplete: mockHandlers.handleMp3Autocomplete }));
vi.mock("./commands/fun/wishlist", () => ({
  handleAutocomplete: mockHandlers.handleWishlistAutocomplete,
}));
vi.mock("./commands/twitch", () => ({ handleAutocomplete: vi.fn().mockResolvedValue(undefined) }));
vi.mock("./commands/follow", () => ({ handleAutocomplete: vi.fn().mockResolvedValue(undefined) }));
vi.mock("./commands/fun/fortniteParty", () => ({
  handleAutocomplete: vi.fn().mockResolvedValue(undefined),
}));
vi.mock("./commands/profile", () => ({ handleAutocomplete: vi.fn().mockResolvedValue(undefined) }));
vi.mock("./services/ticketService", () => ({
  createTicket: vi.fn(),
  closeTicket: vi.fn(),
  claimTicket: vi.fn(),
  getPanel: vi.fn(),
}));
vi.mock("./services/triviaService", () => ({ handleTriviaButton: vi.fn() }));
vi.mock("./services/agentFeedback", () => ({ resetConversationTracking: vi.fn() }));
vi.mock("./infrastructure/bridge/remoteRouter", () => ({
  tryRemoteExecution: vi.fn().mockResolvedValue(null),
  applyRemoteResult: vi.fn(),
  notifyRemoteProcessing: vi.fn(),
}));
vi.mock("./infrastructure/monitors/offloadController", () => ({
  evaluateOffload: vi.fn().mockReturnValue({ shouldOffload: false }),
  recordExecution: vi.fn(),
}));
vi.mock("./infrastructure/bridge/bridgeTypes", () => ({
  isOffloadableCommand: vi.fn().mockReturnValue(false),
}));

import { Events } from "discord.js";
import { attachInteractionHandlers } from "./interactionHandler.js";

describe("interactionHandler", () => {
  let mockClient: any;
  let _interactionHandler: (...args: unknown[]) => unknown;

  beforeEach(() => {
    vi.clearAllMocks();
    mockClient = {
      on: vi.fn(),
    };
  });

  function extractHandler(eventName: string, index: number = 0): (...args: unknown[]) => unknown {
    const calls = mockClient.on.mock.calls.filter((c: any[]) => c[0] === eventName);
    return calls[index] ? calls[index][1] : (null as any);
  }

  describe("attachInteractionHandlers", () => {
    it("enregistre les 3 events InteractionCreate", () => {
      attachInteractionHandlers(mockClient);

      // Devrait y avoir 3 appels à client.on pour InteractionCreate
      expect(mockClient.on).toHaveBeenCalledWith(Events.InteractionCreate, expect.any(Function));
    });
  });

  describe("Slash command handler (2ème event)", () => {
    it("exécute le handler de la commande via le commandRouter", async () => {
      attachInteractionHandlers(mockClient);
      const handler = extractHandler(Events.InteractionCreate, 1);
      expect(handler).toBeDefined();

      const interaction = {
        isChatInputCommand: () => true,
        isContextMenuCommand: () => false,
        commandName: "start",
        replied: false,
        deferred: false,
        deferReply: vi.fn().mockResolvedValue(undefined),
        editReply: vi.fn().mockResolvedValue(undefined),
      };

      await handler(interaction);

      expect(mockCommandRouter.start).toHaveBeenCalledWith(interaction, mockClient);
    });

    it("ignore les interactions qui ne sont pas des commandes slash", async () => {
      attachInteractionHandlers(mockClient);
      const handler = extractHandler(Events.InteractionCreate, 1);

      const interaction = {
        isChatInputCommand: () => false,
        isContextMenuCommand: () => false,
      };

      await handler(interaction);

      // Aucun handler de commande ne devrait être appelé
      expect(mockCommandRouter.start).not.toHaveBeenCalled();
    });

    it("gère les erreurs des commandes avec Sentry + message utilisateur", async () => {
      mockCommandRouter.start.mockRejectedValueOnce(new Error("Command error"));

      attachInteractionHandlers(mockClient);
      const handler = extractHandler(Events.InteractionCreate, 1);

      const interaction = {
        isChatInputCommand: () => true,
        isContextMenuCommand: () => false,
        commandName: "start",
        reply: vi.fn().mockResolvedValue(undefined),
        deferReply: vi.fn().mockResolvedValue(undefined),
        editReply: vi.fn().mockResolvedValue(undefined),
        replied: false,
        deferred: false,
      };

      await handler(interaction);

      expect(mockSentry.captureException).toHaveBeenCalled();
      expect(interaction.reply).toHaveBeenCalledWith(
        expect.objectContaining({
          content: expect.stringContaining("erreur"),
        }),
      );
    });
  });

  describe("Button + Select menu handler (3ème event)", () => {
    it("délègue les boutons à handleVerifButton", async () => {
      attachInteractionHandlers(mockClient);
      const handler = extractHandler(Events.InteractionCreate, 2);

      const interaction = {
        isChatInputCommand: () => false,
        isContextMenuCommand: () => false,
        isButton: () => true,
        isStringSelectMenu: () => false,
        customId: "verif_btn",
        user: { id: "123" },
      };

      await handler(interaction);

      expect(mockHandlers.handleVerifButton).toHaveBeenCalledWith(interaction);
    });

    it("délègue le select menu help_category_select à handleHelpSelectMenu", async () => {
      attachInteractionHandlers(mockClient);
      const handler = extractHandler(Events.InteractionCreate, 2);

      const interaction = {
        isChatInputCommand: () => false,
        isButton: () => false,
        isStringSelectMenu: () => true,
        customId: "help_category_select",
        replied: false,
        deferred: false,
        reply: vi.fn().mockResolvedValue(undefined),
        followUp: vi.fn().mockResolvedValue(undefined),
      };

      await handler(interaction);

      expect(mockHandlers.handleHelpSelectMenu).toHaveBeenCalledWith(interaction);
    });
  });

  describe("Autocomplete handler (4ème event)", () => {
    it("gère l'autocomplete removesource via Prisma", async () => {
      mockPrisma.source.findMany.mockResolvedValue([
        { urlOrHandle: "@testuser", type: "twitter" },
        { urlOrHandle: "@another", type: "youtube" },
      ]);

      attachInteractionHandlers(mockClient);
      const handler = extractHandler(Events.InteractionCreate, 3);

      const interaction = {
        isChatInputCommand: () => false,
        isAutocomplete: () => true,
        commandName: "removesource",
        options: {
          getFocused: vi.fn().mockReturnValue("test"),
        },
        respond: vi.fn().mockResolvedValue(undefined),
      };

      await handler(interaction);

      expect(mockPrisma.source.findMany).toHaveBeenCalled();
      expect(interaction.respond).toHaveBeenCalledWith(
        expect.arrayContaining([
          expect.objectContaining({ name: expect.stringContaining("@testuser") }),
        ]),
      );
    });

    it("gère l'autocomplete untrack-game", async () => {
      attachInteractionHandlers(mockClient);
      const handler = extractHandler(Events.InteractionCreate, 3);

      const interaction = {
        isChatInputCommand: () => false,
        isAutocomplete: () => true,
        commandName: "untrack-game",
        options: { getFocused: vi.fn() },
        respond: vi.fn().mockResolvedValue(undefined),
      };

      await handler(interaction);

      expect(mockHandlers.handleAutocomplete).toHaveBeenCalledWith(interaction);
    });

    it("gère l'autocomplete mp3", async () => {
      attachInteractionHandlers(mockClient);
      const handler = extractHandler(Events.InteractionCreate, 3);

      const interaction = {
        isChatInputCommand: () => false,
        isContextMenuCommand: () => false,
        isButton: () => false,
        isStringSelectMenu: () => false,
        isAutocomplete: () => true,
        commandName: "mp3",
        options: { getFocused: vi.fn() },
        respond: vi.fn().mockResolvedValue(undefined),
      };

      await handler(interaction);

      expect(mockHandlers.handleMp3Autocomplete).toHaveBeenCalledWith(interaction);
    });
  });
});
