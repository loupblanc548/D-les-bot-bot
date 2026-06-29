/**
 * voiceAgent.test.ts — Tests du Voice Agent
 */

import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("../utils/logger.js", () => ({
  default: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
}));

vi.mock("./logs.js", () => ({ createLog: vi.fn().mockResolvedValue(undefined) }));

vi.mock("@discordjs/voice", () => ({
  joinVoiceChannel: vi.fn().mockReturnValue({
    on: vi.fn(),
    subscribe: vi.fn(),
    destroy: vi.fn(),
  }),
  getVoiceConnection: vi.fn().mockReturnValue(null),
  createAudioResource: vi.fn().mockReturnValue({}),
  createAudioPlayer: vi.fn().mockReturnValue({
    play: vi.fn(),
    on: vi.fn(),
  }),
  AudioPlayerStatus: { Idle: "idle", Playing: "playing" },
  VoiceConnectionStatus: { Disconnected: "disconnected" },
  NoSubscriberBehavior: { Pause: "pause" },
}));

import {
  getVoiceAgentConfig,
  updateVoiceAgentConfig,
  getAlertQueue,
  clearAlertQueue,
  isInVoiceChannel,
  leaveVoiceChannel,
  buildVoiceAgentEmbed,
} from "./voiceAgent.js";

describe("Voice Agent", () => {
  beforeEach(() => {
    clearAlertQueue();
    updateVoiceAgentConfig({
      enabled: false,
      announceAlerts: true,
      announceInvestigations: true,
      voiceChannelId: null,
      language: "fr",
      speed: 1.0,
    });
    vi.clearAllMocks();
  });

  describe("Configuration", () => {
    it("retourne la config par défaut", () => {
      const config = getVoiceAgentConfig();
      expect(config.enabled).toBe(false);
      expect(config.language).toBe("fr");
    });

    it("met à jour la config", () => {
      const config = updateVoiceAgentConfig({ enabled: true, voiceChannelId: "ch123" });
      expect(config.enabled).toBe(true);
      expect(config.voiceChannelId).toBe("ch123");
    });
  });

  describe("Voice Channel", () => {
    it("isInVoiceChannel retourne false par défaut", () => {
      expect(isInVoiceChannel("g1")).toBe(false);
    });

    it("leaveVoiceChannel retourne false sans connexion", () => {
      expect(leaveVoiceChannel("g1")).toBe(false);
    });
  });

  describe("Alert Queue", () => {
    it("getAlertQueue retourne un array vide par défaut", () => {
      expect(getAlertQueue()).toHaveLength(0);
    });

    it("clearAlertQueue vide la queue", () => {
      clearAlertQueue();
      expect(getAlertQueue()).toHaveLength(0);
    });
  });

  describe("buildVoiceAgentEmbed", () => {
    it("génère un embed avec la config", () => {
      const config = getVoiceAgentConfig();
      const embed = buildVoiceAgentEmbed(config);
      expect(embed).toBeDefined();
    });
  });
});
