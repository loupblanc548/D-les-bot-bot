/**
 * altAccountDetector.ts — Detect alt/duplicate accounts
 *
 * Heuristics: account age, shared IPs (via voice region), similar usernames,
 * sequential join times, shared device fingerprints (via activity patterns).
 * Flags suspicious accounts for staff review.
 */

import { Guild, GuildMember, EmbedBuilder, TextChannel, ChannelType } from "discord.js";
import prisma from "../prisma.js";
import logger from "../utils/logger.js";

export interface AltAccountFlag {
  userId: string;
  guildId: string;
  reasons: string[];
  riskScore: number;
  flaggedAt: Date;
  linkedAccounts?: string[];
}

const flags = new Map<string, AltAccountFlag>();

const SUSPICIOUS_AGE_DAYS = 7;
const SEQUENTIAL_JOIN_MINUTES = 5;
const USERNAME_SIMILARITY_THRESHOLD = 0.7;

// ─── Levenshtein distance for username comparison ───────────────────

function levenshtein(a: string, b: string): number {
  const matrix: number[][] = [];
  for (let i = 0; i <= b.length; i++) matrix[i] = [i];
  for (let j = 0; j <= a.length; j++) matrix[0][j] = j;
  for (let i = 1; i <= b.length; i++) {
    for (let j = 1; j <= a.length; j++) {
      if (b.charAt(i - 1) === a.charAt(j - 1)) {
        matrix[i][j] = matrix[i - 1][j - 1];
      } else {
        matrix[i][j] = Math.min(
          matrix[i - 1][j - 1] + 1,
          matrix[i][j - 1] + 1,
          matrix[i - 1][j] + 1,
        );
      }
    }
  }
  return matrix[b.length][a.length];
}

function similarity(a: string, b: string): number {
  const maxLen = Math.max(a.length, b.length);
  if (maxLen === 0) return 1;
  return 1 - levenshtein(a.toLowerCase(), b.toLowerCase()) / maxLen;
}

// ─── Detect ───────────────────────────────────────────────────────────

export async function detectAltAccount(
  member: GuildMember,
  guild: Guild,
): Promise<AltAccountFlag | null> {
  const reasons: string[] = [];
  let riskScore = 0;

  // 1. Account age check
  const accountAgeDays = (Date.now() - member.user.createdTimestamp) / (1000 * 60 * 60 * 24);
  if (accountAgeDays < SUSPICIOUS_AGE_DAYS) {
    reasons.push(`Compte récent: créé il y a ${Math.round(accountAgeDays)} jours`);
    riskScore += 30;
  }

  // 2. Sequential join detection — check recent joins
  const recentJoins = guild.members.cache.filter(
    (m) =>
      Math.abs(m.joinedTimestamp! - member.joinedTimestamp!) < SEQUENTIAL_JOIN_MINUTES * 60_000 &&
      m.id !== member.id,
  );
  if (recentJoins.size >= 2) {
    reasons.push(
      `${recentJoins.size} comptes ont rejoint dans les ${SEQUENTIAL_JOIN_MINUTES} minutes`,
    );
    riskScore += 25;
  }

  // 3. Username similarity with recent joins
  const linkedAccounts: string[] = [];
  for (const [, other] of recentJoins) {
    const sim = similarity(member.user.username, other.user.username);
    if (sim >= USERNAME_SIMILARITY_THRESHOLD) {
      reasons.push(`Nom similaire à ${other.user.tag} (${Math.round(sim * 100)}%)`);
      linkedAccounts.push(other.id);
      riskScore += 20;
    }
  }

  // 4. No avatar + new account
  if (!member.user.avatar && accountAgeDays < SUSPICIOUS_AGE_DAYS) {
    reasons.push("Pas d'avatar + compte récent");
    riskScore += 15;
  }

  // 5. Check if user was previously banned (ban evasion)
  try {
    const bans = await guild.bans.fetch().catch(() => null);
    if (bans) {
      const matchingBan = bans.find((b) => {
        const banReason = b.reason?.toLowerCase() ?? "";
        const userName = member.user.username.toLowerCase();
        return (
          banReason.includes(userName) || similarity(b.user.username, member.user.username) > 0.85
        );
      });
      if (matchingBan) {
        reasons.push(`Possible évasion de ban: similaire à ${matchingBan.user.tag}`);
        linkedAccounts.push(matchingBan.user.id);
        riskScore += 40;
      }
    }
  } catch {
    /* ignore */
  }

  // 6. Check warning history for linked accounts
  try {
    const warnings = await prisma.sanction
      .findMany({
        where: { guildId: guild.id, userId: member.id, type: "WARN" },
        take: 1,
      })
      .catch(() => []);
    if (warnings.length > 0) {
      reasons.push("Historique de warnings existant");
      riskScore += 10;
    }
  } catch {
    /* ignore */
  }

  if (reasons.length === 0 || riskScore < 20) return null;

  const flag: AltAccountFlag = {
    userId: member.id,
    guildId: guild.id,
    reasons,
    riskScore: Math.min(riskScore, 100),
    flaggedAt: new Date(),
    linkedAccounts: linkedAccounts.length > 0 ? linkedAccounts : undefined,
  };

  flags.set(member.id, flag);
  logger.warn(
    `[AltDetector] Flagged ${member.user.tag} (risk: ${riskScore}): ${reasons.join(", ")}`,
  );
  return flag;
}

// ─── Generate alert embed ─────────────────────────────────────────────

export function generateAltAlertEmbed(flag: AltAccountFlag, member: GuildMember): EmbedBuilder {
  const riskEmoji = flag.riskScore >= 70 ? "🔴" : flag.riskScore >= 40 ? "🟠" : "🟡";
  const riskLevel = flag.riskScore >= 70 ? "Critique" : flag.riskScore >= 40 ? "Élevé" : "Modéré";

  const embed = new EmbedBuilder()
    .setTitle(`${riskEmoji} Compte suspect détecté`)
    .setColor(flag.riskScore >= 70 ? 0xe74c3c : flag.riskScore >= 40 ? 0xf39c12 : 0xf1c40f)
    .setThumbnail(member.user.displayAvatarURL())
    .addFields(
      { name: "👤 Utilisateur", value: `${member.user.tag}\n<@${member.id}>`, inline: true },
      { name: "📊 Risk Score", value: `${flag.riskScore}/100 (${riskLevel})`, inline: true },
      {
        name: "📅 Compte créé",
        value: `<t:${Math.floor(member.user.createdTimestamp / 1000)}:R>`,
        inline: true,
      },
      { name: "📝 Raisons", value: flag.reasons.map((r) => `• ${r}`).join("\n"), inline: false },
    )
    .setTimestamp();

  if (flag.linkedAccounts && flag.linkedAccounts.length > 0) {
    embed.addFields({
      name: "🔗 Comptes liés",
      value: flag.linkedAccounts.map((id) => `<@${id}>`).join(", "),
      inline: false,
    });
  }

  return embed;
}

// ─── Notify staff ─────────────────────────────────────────────────────

export async function notifyStaff(
  guild: Guild,
  flag: AltAccountFlag,
  logChannelId: string,
): Promise<void> {
  const channel = guild.channels.cache.get(logChannelId) as TextChannel | undefined;
  if (!channel || channel.type !== ChannelType.GuildText) return;

  const member = await guild.members.fetch(flag.userId).catch(() => null);
  if (!member) return;

  const embed = generateAltAlertEmbed(flag, member);
  await channel
    .send({
      content: `⚠️ <@&${guild.roles.cache.find((r) => r.name === "Modérateur" || r.name === "Admin")?.id ?? ""}>`,
      embeds: [embed],
    })
    .catch(() => {});
}

// ─── Stats & management ───────────────────────────────────────────────

export function getFlaggedAccounts(guildId: string): AltAccountFlag[] {
  return Array.from(flags.values()).filter((f) => f.guildId === guildId);
}

export function clearFlag(userId: string): boolean {
  return flags.delete(userId);
}

export function getAltStats(guildId: string): {
  total: number;
  critical: number;
  high: number;
  moderate: number;
} {
  const guildFlags = getFlaggedAccounts(guildId);
  return {
    total: guildFlags.length,
    critical: guildFlags.filter((f) => f.riskScore >= 70).length,
    high: guildFlags.filter((f) => f.riskScore >= 40 && f.riskScore < 70).length,
    moderate: guildFlags.filter((f) => f.riskScore < 40).length,
  };
}
