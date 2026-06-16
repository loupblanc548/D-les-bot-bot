import { describe, it, expect } from "vitest";
import {
  checkSuspiciousLinks,
  checkSuspiciousLinksDetailed,
} from "./utils";

describe("checkSuspiciousLinks", () => {
  it("retourne false pour un texte sans URL", () => {
    expect(checkSuspiciousLinks("Bonjour à tous !")).toBe(false);
  });

  it("détecte une IP directe", () => {
    expect(checkSuspiciousLinks("Visitez http://192.168.1.1/login")).toBe(true);
  });

  it("détecte un TLD suspect", () => {
    expect(checkSuspiciousLinks("Promo sur http://free-stuff.tk")).toBe(true);
  });

  it("détecte un raccourcisseur d'URL", () => {
    expect(checkSuspiciousLinks("Voir https://bit.ly/abc123")).toBe(true);
  });

  it("détecte un motif de phishing (nitro)", () => {
    expect(checkSuspiciousLinks("Claim your free-nitro http://evil.com")).toBe(true);
  });

  it("retourne false pour une URL bénigne", () => {
    expect(checkSuspiciousLinks("Voir https://discord.com/channels/@me")).toBe(false);
  });
});

describe("checkSuspiciousLinksDetailed", () => {
  it("retourne un tableau vide pour un texte sûr", () => {
    expect(checkSuspiciousLinksDetailed("Salut !")).toEqual([]);
  });

  it("retourne plusieurs flags pour un contenu très suspect", () => {
    const flags = checkSuspiciousLinksDetailed("http://1.2.3.4 https://bit.ly/abc");
    expect(flags.length).toBeGreaterThanOrEqual(2);
  });

  it("détecte les URL malformées", () => {
    const flags = checkSuspiciousLinksDetailed("http://[invalid");
    expect(flags).toContain("URL malformée");
  });
});
