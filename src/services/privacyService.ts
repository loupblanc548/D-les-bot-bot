/**
 * privacyService.ts — RGPD compliance: right to erasure & data portability
 *
 * Implements:
 *  - forgetUser(): deletes all personal data for a user (except moderation logs)
 *  - exportUserData(): exports all personal data as JSON (right of access)
 *  - purgeStaleMemory(): cron-based retention policy for old memory data
 *
 * Excluded from deletion (legitimate security interest):
 *  - Sanction, ModAction — moderation logs needed for server safety
 */

import prisma from "../prisma.js";
import logger from "../utils/logger.js";

/** Retention period for memory data — 12 months without interaction */
export const MEMORY_RETENTION_MONTHS = 12;

export interface DeletionPreview {
  table: string;
  count: number;
  excluded: boolean;
  reason?: string;
}

export async function previewUserDeletion(userId: string): Promise<DeletionPreview[]> {
  const results: DeletionPreview[] = [];

  // Memory tables (cascade delete from UserMemory)
  const userMemory = await prisma.userMemory.findUnique({ where: { userId } });
  results.push({ table: "UserMemory", count: userMemory ? 1 : 0, excluded: false });

  const memoryFacts = await prisma.memoryFact.count({ where: { userId } });
  results.push({ table: "MemoryFact", count: memoryFacts, excluded: false });

  const memoryMessages = await prisma.memoryMessage.count({ where: { userId } });
  results.push({ table: "MemoryMessage", count: memoryMessages, excluded: false });

  const memoryEmbeddings = await prisma.memoryEmbedding.count({ where: { userId } });
  results.push({ table: "MemoryEmbedding", count: memoryEmbeddings, excluded: false });

  const memoryLinks = await prisma.memoryLink.count({ where: { userId } });
  results.push({ table: "MemoryLink", count: memoryLinks, excluded: false });

  // Preferences
  const userPref = await prisma.userPreference.count({ where: { userId } });
  results.push({ table: "UserPreference", count: userPref, excluded: false });

  const gamePrefs = await prisma.userGamePreference.count({ where: { userId } });
  results.push({ table: "UserGamePreference", count: gamePrefs, excluded: false });

  const platformPrefs = await prisma.userPlatformPreference.count({ where: { userId } });
  results.push({ table: "UserPlatformPreference", count: platformPrefs, excluded: false });

  // Linked profiles
  const steam = await prisma.steamProfile.count({ where: { userId } });
  results.push({ table: "SteamProfile", count: steam, excluded: false });

  const minecraft = await prisma.minecraftProfile.count({ where: { userId } });
  results.push({ table: "MinecraftProfile", count: minecraft, excluded: false });

  // Inventory & wishlist
  const inventory = await prisma.inventory.count({ where: { userId } });
  results.push({ table: "Inventory", count: inventory, excluded: false });

  const userInventory = await prisma.userInventory.count({ where: { userId } });
  results.push({ table: "UserInventory", count: userInventory, excluded: false });

  const wishlist = await prisma.wishlist.count({ where: { userId } });
  results.push({ table: "Wishlist", count: wishlist, excluded: false });

  // History
  const nameHistory = await prisma.nameHistory.count({ where: { userId } });
  results.push({ table: "NameHistory", count: nameHistory, excluded: false });

  const avatarHistory = await prisma.avatarHistory.count({ where: { userId } });
  results.push({ table: "AvatarHistory", count: avatarHistory, excluded: false });

  // Chat & translation
  const chatHistory = await prisma.chatHistory.count({ where: { userId } });
  results.push({ table: "ChatHistory", count: chatHistory, excluded: false });

  const chatConv = await prisma.chatConversation.count({ where: { userId } });
  results.push({ table: "ChatConversation", count: chatConv, excluded: false });

  const translations = await prisma.translationHistory.count({ where: { userId } });
  results.push({ table: "TranslationHistory", count: translations, excluded: false });

  // Behavior & profile
  const behavior = await prisma.behaviorPattern.count({ where: { userId } });
  results.push({ table: "BehaviorPattern", count: behavior, excluded: false });

  const userProfile = await prisma.userProfile.count({ where: { userId } });
  results.push({ table: "UserProfile", count: userProfile, excluded: false });

  // Activity logs
  const commandLogs = await prisma.commandLog.count({ where: { userId } });
  results.push({ table: "CommandLog", count: commandLogs, excluded: false });

  const activityLogs = await prisma.userActivityLog.count({ where: { userId } });
  results.push({ table: "UserActivityLog", count: activityLogs, excluded: false });

  // Risk & alerts
  const riskProfiles = await prisma.riskProfile.count({ where: { userId } });
  results.push({ table: "RiskProfile", count: riskProfiles, excluded: false });

  const alerts = await prisma.alert.count({ where: { userId } });
  results.push({ table: "Alert", count: alerts, excluded: false });

  // Misc
  const reminders = await prisma.reminder.count({ where: { userId } });
  results.push({ table: "Reminder", count: reminders, excluded: false });

  const afk = await prisma.afk.count({ where: { userId } });
  results.push({ table: "Afk", count: afk, excluded: false });

  const suggestions = await prisma.suggestion.count({ where: { userId } });
  results.push({ table: "Suggestion", count: suggestions, excluded: false });

  const pollVotes = await prisma.pollVote.count({ where: { userId } });
  results.push({ table: "PollVote", count: pollVotes, excluded: false });

  // ─── EXCLUDED (legitimate security interest) ───
  const sanctions = await prisma.sanction.count({ where: { userId } });
  results.push({
    table: "Sanction",
    count: sanctions,
    excluded: true,
    reason: "Logs de modération — intérêt légitime de sécurité (RGPD Art. 6(1)(f))",
  });

  const modActions = await prisma.modAction.count({ where: { targetId: userId } });
  results.push({
    table: "ModAction",
    count: modActions,
    excluded: true,
    reason: "Actions de modération — intérêt légitime de sécurité (RGPD Art. 6(1)(f))",
  });

  return results;
}

export interface DeletionResult {
  userId: string;
  deletedAt: Date;
  deletedTables: string[];
  excludedTables: string[];
  totalDeleted: number;
}

export async function forgetUser(userId: string): Promise<DeletionResult> {
  logger.info(`[RGPD] Starting forgetUser for ${userId}`);
  const deletedTables: string[] = [];

  // Delete memory data (cascade from UserMemory handles Fact/Message/Embedding)
  // But MemoryLink has no cascade — delete manually first
  await prisma.memoryLink.deleteMany({ where: { userId } });
  await prisma.userMemory.deleteMany({ where: { userId } });
  deletedTables.push("UserMemory", "MemoryFact", "MemoryMessage", "MemoryEmbedding", "MemoryLink");

  // Preferences
  await prisma.userPreference.deleteMany({ where: { userId } });
  await prisma.userGamePreference.deleteMany({ where: { userId } });
  await prisma.userPlatformPreference.deleteMany({ where: { userId } });
  deletedTables.push("UserPreference", "UserGamePreference", "UserPlatformPreference");

  // Linked profiles
  await prisma.steamProfile.deleteMany({ where: { userId } });
  await prisma.minecraftProfile.deleteMany({ where: { userId } });
  deletedTables.push("SteamProfile", "MinecraftProfile");

  // Inventory & wishlist
  await prisma.inventory.deleteMany({ where: { userId } });
  await prisma.userInventory.deleteMany({ where: { userId } });
  await prisma.wishlist.deleteMany({ where: { userId } });
  deletedTables.push("Inventory", "UserInventory", "Wishlist");

  // History
  await prisma.nameHistory.deleteMany({ where: { userId } });
  await prisma.avatarHistory.deleteMany({ where: { userId } });
  deletedTables.push("NameHistory", "AvatarHistory");

  // Chat & translation
  await prisma.chatHistory.deleteMany({ where: { userId } });
  await prisma.chatConversation.deleteMany({ where: { userId } });
  await prisma.translationHistory.deleteMany({ where: { userId } });
  deletedTables.push("ChatHistory", "ChatConversation", "TranslationHistory");

  // Behavior & profile
  await prisma.behaviorPattern.deleteMany({ where: { userId } });
  await prisma.userProfile.deleteMany({ where: { userId } });
  deletedTables.push("BehaviorPattern", "UserProfile");

  // Activity logs
  await prisma.commandLog.deleteMany({ where: { userId } });
  await prisma.userActivityLog.deleteMany({ where: { userId } });
  deletedTables.push("CommandLog", "UserActivityLog");

  // Risk & alerts
  await prisma.riskProfile.deleteMany({ where: { userId } });
  await prisma.alert.deleteMany({ where: { userId } });
  deletedTables.push("RiskProfile", "Alert");

  // Misc
  await prisma.reminder.deleteMany({ where: { userId } });
  await prisma.afk.deleteMany({ where: { userId } });
  await prisma.suggestion.deleteMany({ where: { userId } });
  await prisma.pollVote.deleteMany({ where: { userId } });
  deletedTables.push("Reminder", "Afk", "Suggestion", "PollVote");

  const result: DeletionResult = {
    userId,
    deletedAt: new Date(),
    deletedTables,
    excludedTables: ["Sanction", "ModAction"],
    totalDeleted: deletedTables.length,
  };

  logger.info(`[RGPD] forgetUser completed for ${userId} — ${deletedTables.length} tables cleared`);

  // Log the deletion action (not the content) for compliance proof
  await prisma.userActivityLog.create({
    data: {
      guildId: "system",
      userId,
      activity: "RGPD_DELETE",
      details: `RGPD right to be forgotten. Tables cleared: ${deletedTables.join(", ")}. Excluded: Sanction, ModAction (legitimate security interest RGPD Art. 6(1)(f)).`,
    },
  });

  return result;
}

export async function exportUserData(userId: string): Promise<Record<string, unknown>> {
  const data: Record<string, unknown> = {};

  // Memory
  data.userMemory = await prisma.userMemory.findUnique({ where: { userId } });
  data.memoryFacts = await prisma.memoryFact.findMany({ where: { userId } });
  data.memoryMessages = await prisma.memoryMessage.findMany({ where: { userId } });
  data.memoryEmbeddings = await prisma.memoryEmbedding.findMany({ where: { userId } });
  data.memoryLinks = await prisma.memoryLink.findMany({ where: { userId } });

  // Preferences
  data.userPreference = await prisma.userPreference.findUnique({ where: { userId } });
  data.userGamePreferences = await prisma.userGamePreference.findMany({ where: { userId } });
  data.userPlatformPreferences = await prisma.userPlatformPreference.findMany({
    where: { userId },
  });

  // Linked profiles
  data.steamProfile = await prisma.steamProfile.findUnique({ where: { userId } });
  data.minecraftProfile = await prisma.minecraftProfile.findUnique({ where: { userId } });

  // Inventory & wishlist
  data.inventory = await prisma.inventory.findMany({ where: { userId } });
  data.userInventory = await prisma.userInventory.findMany({ where: { userId } });
  data.wishlist = await prisma.wishlist.findMany({ where: { userId } });

  // History
  data.nameHistory = await prisma.nameHistory.findMany({ where: { userId } });
  data.avatarHistory = await prisma.avatarHistory.findMany({ where: { userId } });

  // Chat & translation
  data.chatHistory = await prisma.chatHistory.findMany({ where: { userId } });
  data.chatConversations = await prisma.chatConversation.findMany({ where: { userId } });
  data.translationHistory = await prisma.translationHistory.findMany({ where: { userId } });

  // Behavior & profile
  data.behaviorPattern = await prisma.behaviorPattern.findUnique({ where: { userId } });
  data.userProfile = await prisma.userProfile.findUnique({ where: { userId } });

  // Activity logs
  data.commandLogs = await prisma.commandLog.findMany({ where: { userId } });
  data.activityLogs = await prisma.userActivityLog.findMany({ where: { userId } });

  // Risk & alerts
  data.riskProfiles = await prisma.riskProfile.findMany({ where: { userId } });
  data.alerts = await prisma.alert.findMany({ where: { userId } });

  // Misc
  data.reminders = await prisma.reminder.findMany({ where: { userId } });
  data.afk = await prisma.afk.findUnique({ where: { userId } });
  data.suggestions = await prisma.suggestion.findMany({ where: { userId } });
  data.pollVotes = await prisma.pollVote.findMany({ where: { userId } });

  // Moderation data (included in export but not deletable)
  data.sanctions = await prisma.sanction.findMany({ where: { userId } });
  data.modActions = await prisma.modAction.findMany({ where: { targetId: userId } });

  data._exportedAt = new Date().toISOString();
  data._userId = userId;
  data._note =
    "Sanctions and ModActions are retained for security purposes (RGPD Art. 6(1)(f)) and cannot be deleted via forget-me.";

  return data;
}

export async function purgeStaleMemory(): Promise<{
  factsDeleted: number;
  messagesDeleted: number;
}> {
  const cutoff = new Date();
  cutoff.setMonth(cutoff.getMonth() - MEMORY_RETENTION_MONTHS);

  logger.info(
    `[RGPD] Purging memory data older than ${MEMORY_RETENTION_MONTHS} months (cutoff: ${cutoff.toISOString()})`,
  );

  const factsResult = await prisma.memoryFact.deleteMany({
    where: {
      accessedAt: { lt: cutoff },
    },
  });

  const messagesResult = await prisma.memoryMessage.deleteMany({
    where: {
      createdAt: { lt: cutoff },
    },
  });

  logger.info(
    `[RGPD] Purge complete: ${factsResult.count} facts, ${messagesResult.count} messages deleted`,
  );

  // Log the purge for compliance
  await prisma.memoryDecayLog.create({
    data: {
      factsBefore: factsResult.count,
      factsAfter: 0,
      notes: `Automated RGPD retention purge. Cutoff: ${cutoff.toISOString()}. Retention: ${MEMORY_RETENTION_MONTHS} months. Facts deleted: ${factsResult.count}, Messages deleted: ${messagesResult.count}.`,
    },
  });

  return { factsDeleted: factsResult.count, messagesDeleted: messagesResult.count };
}
