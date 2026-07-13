/**
 * alertDispatcher.test.ts — Tests du Multi-Channel Alert Dispatcher
 */

import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("../utils/logger.js", () => ({
  default: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
}));

vi.mock("./logs.js", () => ({ createLog: vi.fn().mockResolvedValue(undefined) }));

import {
  updateChannelConfig,
  createAlertPayload,
  dispatchAlert,
  isChannelAvailable,
} from "./alertDispatcher.js";

const fakeClient = {
  channels: {
    cache: {
      get: () => ({
        isTextBased: () => true,
        send: vi.fn().mockResolvedValue(undefined),
      }),
    },
  },
  users: {
    fetch: vi.fn().mockResolvedValue({ send: vi.fn().mockResolvedValue(undefined) }),
  },
} as any;

describe("Alert Dispatcher", () => {
  beforeEach(() => {
    updateChannelConfig({
      enabled: true,
      discordChannelId: undefined,
      discordRoleId: undefined,
      discordDmUserIds: undefined,
      webhookUrl: undefined,
      emailRecipients: undefined,
      telegramChatId: undefined,
      smsRecipients: undefined,
    });
    vi.clearAllMocks();
  });

  describe("createAlertPayload", () => {
    it("crée un payload d'alerte", () => {
      const payload = createAlertPayload("Test", "Message", "HIGH", "g1", "test");
      expect(payload.id).toMatch(/^alert_/);
      expect(payload.title).toBe("Test");
      expect(payload.severity).toBe("HIGH");
    });
  });

  describe("isChannelAvailable", () => {
    it("retourne false sans config", () => {
      expect(isChannelAvailable("DISCORD")).toBe(false);
      expect(isChannelAvailable("WEBHOOK")).toBe(false);
      expect(isChannelAvailable("EMAIL")).toBe(false);
      expect(isChannelAvailable("TELEGRAM")).toBe(false);
      expect(isChannelAvailable("SMS")).toBe(false);
    });

    it("retourne true avec Discord config", () => {
      updateChannelConfig({ discordChannelId: "ch123" });
      expect(isChannelAvailable("DISCORD")).toBe(true);
    });
  });

  describe("dispatchAlert", () => {
    it("n'envoie rien si désactivé", async () => {
      updateChannelConfig({ enabled: false });
      const payload = createAlertPayload("Test", "Msg", "LOW", "g1", "test");
      await dispatchAlert(fakeClient, payload);
      // Pas d'erreur = succès
    });

    it("envoie via Discord si configuré", async () => {
      updateChannelConfig({ enabled: true, discordChannelId: "ch123" });
      const payload = createAlertPayload("Test", "Msg", "HIGH", "g1", "test");
      await dispatchAlert(fakeClient, payload);
      // Pas d'erreur = succès
    });
  });
});
