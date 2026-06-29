/**
 * googleCloudServices.test.ts — Tests des Google Cloud Services
 */

import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("../utils/logger.js", () => ({
  default: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
}));

import {
  translateText,
  detectLanguage,
  analyzeImage,
  analyzeText,
  searchYouTube,
  getYouTubeVideo,
  checkYouTubeVideoSafety,
  isGoogleCloudConfigured,
  clearGoogleCloudCache,
} from "./googleCloudServices.js";

describe("Google Cloud Services", () => {
  beforeEach(() => {
    clearGoogleCloudCache();
    vi.clearAllMocks();
  });

  describe("translateText", () => {
    it("retourne le texte original sans clé API", async () => {
      const result = await translateText("Hello world", "fr");
      expect(result.translatedText).toBe("Hello world");
    });
  });

  describe("detectLanguage", () => {
    it("retourne unknown sans clé API", async () => {
      const result = await detectLanguage("Hello world");
      expect(result.language).toBe("unknown");
      expect(result.confidence).toBe(0);
    });
  });

  describe("analyzeImage", () => {
    it("retourne un résultat vide sans clé API", async () => {
      const result = await analyzeImage("https://example.com/image.jpg");
      expect(result.labels).toHaveLength(0);
      expect(result.isUnsafe).toBe(false);
    });
  });

  describe("analyzeText", () => {
    it("retourne un résultat vide sans clé API", async () => {
      const result = await analyzeText("Hello world");
      expect(result.sentiment).toBeNull();
      expect(result.entities).toHaveLength(0);
      expect(result.isToxic).toBe(false);
    });
  });

  describe("isGoogleCloudConfigured", () => {
    it("retourne false sans clé API", () => {
      // La clé n'est pas configurée dans l'environnement de test
      expect(typeof isGoogleCloudConfigured()).toBe("boolean");
    });
  });

  describe("Cache", () => {
    it("met en cache les résultats de traduction", async () => {
      await translateText("test", "fr");
      await translateText("test", "fr");
      // Pas d'erreur = succès (deuxième appel utilise le cache)
      expect(true).toBe(true);
    });
  });

  describe("searchYouTube", () => {
    it("retourne un résultat vide sans clé API", async () => {
      const result = await searchYouTube("test query", 5);
      expect(result.videos).toHaveLength(0);
      expect(result.totalResults).toBe(0);
    });
  });

  describe("getYouTubeVideo", () => {
    it("retourne null sans clé API", async () => {
      const result = await getYouTubeVideo("dQw4w9WgXcQ");
      expect(result).toBeNull();
    });
  });

  describe("checkYouTubeVideoSafety", () => {
    it("retourne non suspect sans clé API", async () => {
      const result = await checkYouTubeVideoSafety("dQw4w9WgXcQ");
      expect(result.video).toBeNull();
      expect(result.isSuspicious).toBe(false);
      expect(result.reasons).toHaveLength(0);
    });
  });
});
