/**
 * xpService.ts — Système XP/Leveling
 *
 * - Gain d'XP par message (avec cooldown anti-spam)
 * - Calcul du niveau (formule exponentielle)
 * - Leaderboard par guilde
 * - Role rewards par niveau (optionnel)
 * - Carte de rang via imageService
 */

import prisma from "../prisma.js";
import logger from "../utils/logger.js";

const XP_COOLDOWN_MS = 60_000; // 1 minute entre chaque gain
const XP_MIN = 15;
const XP_MAX = 25;
const _BASE_XP = 100; // XP requis pour le niveau 2

/**
 * Formule : XP requis pour atteindre le niveau N
 * = 5 * N^2 + 50 * N + 100 (formule MEE6-like)
 */
export function xpForLevel(level: number): number {
  return 5 * level * level + 50 * level + 100;
}

/**
 * XP total requis pour atteindre un niveau donné (somme cumulée)
 */
export function totalXpForLevel(level: number): number {
  let total = 0;
  for (let i = 0; i < level; i++) {
    total += xpForLevel(i);
  }
  return total;
}

/**
 * Calcule le niveau et l'XP restante à partir de l'XP total
 */
export function levelFromXp(totalXp: number): { level: number; xp: number; xpNeeded: number } {
  let level = 0;
  let remaining = totalXp;

  while (remaining >= xpForLevel(level)) {
    remaining -= xpForLevel(level);
    level++;
  }

  return {
    level,
    xp: remaining,
    xpNeeded: xpForLevel(level),
  };
}

/**
 * Ajoute de l'XP à un utilisateur. Retourne true si level up.
 */
export async function addXp(
  discordId: string,
  _guildId: string,
): Promise<{ leveledUp: boolean; newLevel: number; oldLevel: number }> {
  try {
    const user = await prisma.user.findUnique({ where: { discordId } });
    if (!user) return { leveledUp: false, newLevel: 0, oldLevel: 0 };

    // Cooldown check
    if (user.lastMessageDate && Date.now() - user.lastMessageDate.getTime() < XP_COOLDOWN_MS) {
      return { leveledUp: false, newLevel: user.level, oldLevel: user.level };
    }

    const xpGain = Math.floor(Math.random() * (XP_MAX - XP_MIN + 1)) + XP_MIN;
    const oldLevel = user.level;
    const newTotalXp = user.xp + xpGain;
    const { level: newLevel } = levelFromXp(newTotalXp);

    await prisma.user.update({
      where: { discordId },
      data: {
        xp: newTotalXp,
        level: newLevel,
        lastMessageDate: new Date(),
      },
    });

    return {
      leveledUp: newLevel > oldLevel,
      newLevel,
      oldLevel,
    };
  } catch (error) {
    logger.error("[XP] Error adding XP:", error);
    return { leveledUp: false, newLevel: 0, oldLevel: 0 };
  }
}

/**
 * Récupère l'XP et le niveau d'un utilisateur
 */
export async function getUserXp(
  discordId: string,
): Promise<{ xp: number; level: number; rank: number } | null> {
  try {
    const user = await prisma.user.findUnique({ where: { discordId } });
    if (!user) return null;

    // Calculer le rang
    const higherCount = await prisma.user.count({
      where: { xp: { gt: user.xp } },
    });

    return {
      xp: user.xp,
      level: user.level,
      rank: higherCount + 1,
    };
  } catch {
    return null;
  }
}

/**
 * Récupère le leaderboard d'une guilde (top 10)
 */
export async function getLeaderboard(
  limit = 10,
): Promise<Array<{ discordId: string; xp: number; level: number }>> {
  try {
    const users = await prisma.user.findMany({
      where: { xp: { gt: 0 } },
      orderBy: { xp: "desc" },
      take: limit,
      select: { discordId: true, xp: true, level: true },
    });
    return users;
  } catch {
    return [];
  }
}

/**
 * Définit l'XP d'un utilisateur (admin)
 */
export async function setUserXp(discordId: string, xp: number): Promise<boolean> {
  try {
    const { level } = levelFromXp(xp);
    await prisma.user.update({
      where: { discordId },
      data: { xp, level },
    });
    return true;
  } catch {
    return false;
  }
}
