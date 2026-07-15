import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("../prisma.js", () => ({
  default: {
    riskProfile: {
      findUnique: vi.fn(),
      create: vi.fn(),
      update: vi.fn(),
    },
    modAction: {
      create: vi.fn(),
    },
    riskEvent: {
      create: vi.fn(),
    },
  },
}));

vi.mock("../utils/logger.js", () => ({
  default: {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
  },
}));

import { calculateRiskScore, getRiskLevel } from "./risk-engine.js";

describe("risk-engine — calculateRiskScore", () => {
  it("retourne 0 sans sanctions ni événements", () => {
    const score = calculateRiskScore(
      { warn: 0, timeout: 0, kick: 0, tempban: 0, ban: 0, softban: 0 },
      { antiRaid: 0, antiSpam: 0, antiPhishing: 0, suspicious: 0 },
      null,
    );
    expect(score).toBe(0);
  });

  it("calcule le score pour un warn (10 points)", () => {
    const score = calculateRiskScore(
      { warn: 1, timeout: 0, kick: 0, tempban: 0, ban: 0, softban: 0 },
      { antiRaid: 0, antiSpam: 0, antiPhishing: 0, suspicious: 0 },
      null,
    );
    expect(score).toBe(10);
  });

  it("calcule le score pour un ban (50 points)", () => {
    const score = calculateRiskScore(
      { warn: 0, timeout: 0, kick: 0, tempban: 0, ban: 1, softban: 0 },
      { antiRaid: 0, antiSpam: 0, antiPhishing: 0, suspicious: 0 },
      null,
    );
    expect(score).toBe(50);
  });

  it("additionne plusieurs sanctions", () => {
    const score = calculateRiskScore(
      { warn: 2, timeout: 1, kick: 1, tempban: 0, ban: 0, softban: 0 },
      { antiRaid: 0, antiSpam: 0, antiPhishing: 0, suspicious: 0 },
      null,
    );
    expect(score).toBe(2 * 10 + 15 + 25);
  });

  it("ajoute les événements", () => {
    const score = calculateRiskScore(
      { warn: 0, timeout: 0, kick: 0, tempban: 0, ban: 0, softban: 0 },
      { antiRaid: 1, antiSpam: 1, antiPhishing: 1, suspicious: 1 },
      null,
    );
    expect(score).toBe(20 + 15 + 30 + 25);
  });

  it("applique un bonus de récidive (+20%) si sanction dans les 7 jours", () => {
    const recent = new Date(Date.now() - 3 * 24 * 60 * 60 * 1000);
    const score = calculateRiskScore(
      { warn: 1, timeout: 0, kick: 0, tempban: 0, ban: 0, softban: 0 },
      { antiRaid: 0, antiSpam: 0, antiPhishing: 0, suspicious: 0 },
      recent,
    );
    expect(score).toBe(Math.floor(10 * 1.2));
  });

  it("applique une décroissance au-delà de 7 jours", () => {
    const old = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
    const score = calculateRiskScore(
      { warn: 1, timeout: 0, kick: 0, tempban: 0, ban: 0, softban: 0 },
      { antiRaid: 0, antiSpam: 0, antiPhishing: 0, suspicious: 0 },
      old,
    );
    expect(score).toBeLessThan(10);
    expect(score).toBeGreaterThan(0);
  });

  it("ne descend pas en dessous de 0", () => {
    const veryOld = new Date(Date.now() - 365 * 24 * 60 * 60 * 1000);
    const score = calculateRiskScore(
      { warn: 1, timeout: 0, kick: 0, tempban: 0, ban: 0, softban: 0 },
      { antiRaid: 0, antiSpam: 0, antiPhishing: 0, suspicious: 0 },
      veryOld,
    );
    expect(score).toBeGreaterThanOrEqual(0);
  });
});

describe("risk-engine — getRiskLevel", () => {
  it("retourne FAIBLE pour score < 30", () => {
    expect(getRiskLevel(0)).toBe("FAIBLE");
    expect(getRiskLevel(29)).toBe("FAIBLE");
  });

  it("retourne MOYEN pour score >= 30", () => {
    expect(getRiskLevel(30)).toBe("MOYEN");
    expect(getRiskLevel(59)).toBe("MOYEN");
  });

  it("retourne ELEVE pour score >= 60", () => {
    expect(getRiskLevel(60)).toBe("ELEVE");
    expect(getRiskLevel(99)).toBe("ELEVE");
  });

  it("retourne CRITIQUE pour score >= 100", () => {
    expect(getRiskLevel(100)).toBe("CRITIQUE");
    expect(getRiskLevel(500)).toBe("CRITIQUE");
  });
});
