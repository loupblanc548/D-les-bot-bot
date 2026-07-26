/**
 * antiRaid.ts — Détection anti-raid et anti-spam avancé
 *
 * Détecte: burst de joins, nouveaux comptes, messages similaires en rafale
 */

import type { GuildMember, Message, TextChannel } from "discord.js";
import logger from "../utils/logger.js";

interface RaidConfig {
  joinThreshold: number;
  joinWindowMs: number;
  minAccountAgeMs: number;
  similarityThreshold: number;
  similarityWindowSize: number;
}

export const DEFAULT_RAID_CONFIG: RaidConfig = {
  joinThreshold: 10,
  joinWindowMs: 10_000,
  minAccountAgeMs: 86_400_000,
  similarityThreshold: 0.8,
  similarityWindowSize: 20,
};

const joinTimestamps: number[] = [];
const recentMessages: Array<{ content: string; userId: string }> = [];

export interface RaidAlert {
  type: "join_burst" | "new_accounts" | "message_spam";
  detail: string;
  severity: "low" | "medium" | "high";
}

export function checkJoinBurst(member: GuildMember, config: RaidConfig = DEFAULT_RAID_CONFIG): RaidAlert | null {
  const now = Date.now();
  joinTimestamps.push(now);
  // Keep only recent joins
  while (joinTimestamps.length > 0 && now - joinTimestamps[0] > config.joinWindowMs) {
    joinTimestamps.shift();
  }

  if (joinTimestamps.length >= config.joinThreshold) {
    logger.warn(`[AntiRaid] Join burst detected: ${joinTimestamps.length} joins in ${config.joinWindowMs}ms`);
    return {
      type: "join_burst",
      detail: `${joinTimestamps.length} joins en ${config.joinWindowMs / 1000}s`,
      severity: "high",
    };
  }

  // Check for new accounts
  const accountAge = Date.now() - member.user.createdTimestamp;
  if (accountAge < config.minAccountAgeMs) {
    const days = Math.floor(accountAge / 86_400_000);
    return {
      type: "new_accounts",
      detail: `Compte créé il y a ${days}j (${member.user.tag})`,
      severity: days < 1 ? "high" : "medium",
    };
  }

  return null;
}

export function checkMessageSimilarity(message: Message, config: RaidConfig = DEFAULT_RAID_CONFIG): RaidAlert | null {
  const content = message.content.toLowerCase().trim();
  if (content.length < 5) return null;

  recentMessages.push({ content, userId: message.author.id });
  if (recentMessages.length > config.similarityWindowSize) recentMessages.shift();

  // Count similar messages from different users
  let similarCount = 0;
  const uniqueUsers = new Set<string>();
  for (const msg of recentMessages) {
    if (msg.userId === message.author.id) continue;
    const similarity = computeSimilarity(content, msg.content);
    if (similarity >= config.similarityThreshold) {
      similarCount++;
      uniqueUsers.add(msg.userId);
    }
  }

  if (uniqueUsers.size >= 3) {
    logger.warn(`[AntiRaid] Message spam detected: ${uniqueUsers.size} users posting similar content`);
    return {
      type: "message_spam",
      detail: `${uniqueUsers.size} utilisateurs postant du contenu similaire`,
      severity: "medium",
    };
  }

  return null;
}

function computeSimilarity(a: string, b: string): number {
  if (a === b) return 1;
  const setA = new Set(a.split(/\s+/));
  const setB = new Set(b.split(/\s+/));
  let common = 0;
  for (const word of setA) {
    if (setB.has(word)) common++;
  }
  return common / Math.max(setA.size, setB.size);
}

export function resetRaidTracking(): void {
  joinTimestamps.length = 0;
  recentMessages.length = 0;
}
