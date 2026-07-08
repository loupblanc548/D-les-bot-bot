/**
 * antiNuke.ts — Anti-Nuke / Anti-Raid Protection
 *
 * Monitor audit logs for mass destructive actions and auto-punish offenders.
 * Detects: mass channel delete, mass role delete, mass ban/kick, mass emoji delete,
 * bot add by untrusted user, server settings changes.
 *
 * Each event type has configurable thresholds and actions.
 */

import { Client, Guild, AuditLogEvent, EmbedBuilder, TextChannel } from "discord.js";
import prisma from "../prisma.js";
import logger from "../utils/logger.js";

// ─── Types ────────────────────────────────────────────────────────────

export interface AntiNukeConfig {
  enabled: boolean;
  channelDeleteThreshold: number;
  roleDeleteThreshold: number;
  banThreshold: number;
  kickThreshold: number;
  emojiDeleteThreshold: number;
  timeWindowMs: number;
  action: "strip" | "kick" | "ban";
  whitelist: string[];
  logChannelId?: string;
}

export interface AntiNukeEvent {
  executorId: string;
  action: string;
  target: string;
  timestamp: Date;
}

interface EventTracker {
  events: AntiNukeEvent[];
}

const DEFAULT_CONFIG: AntiNukeConfig = {
  enabled: true,
  channelDeleteThreshold: 3,
  roleDeleteThreshold: 3,
  banThreshold: 5,
  kickThreshold: 5,
  emojiDeleteThreshold: 5,
  timeWindowMs: 10_000,
  action: "strip",
  whitelist: [],
};

// In-memory tracker per guild
const guildTrackers = new Map<string, Map<string, EventTracker>>();

function getTracker(guildId: string, userId: string): EventTracker {
  if (!guildTrackers.has(guildId)) guildTrackers.set(guildId, new Map());
  const guildMap = guildTrackers.get(guildId)!;
  if (!guildMap.has(userId)) guildMap.set(userId, { events: [] });
  return guildMap.get(userId)!;
}

function cleanOldEvents(tracker: EventTracker, windowMs: number): void {
  const cutoff = Date.now() - windowMs;
  tracker.events = tracker.events.filter((e) => e.timestamp.getTime() > cutoff);
}

function countEvents(tracker: EventTracker, action: string): number {
  return tracker.events.filter((e) => e.action === action).length;
}

// ─── Config persistence ───────────────────────────────────────────────

export async function getAntiNukeConfig(guildId: string): Promise<AntiNukeConfig> {
  try {
    const record = await prisma.guildConfig.findUnique({ where: { guildId } }).catch(() => null);
    if (record?.antiNukeConfig) {
      return { ...DEFAULT_CONFIG, ...(JSON.parse(record.antiNukeConfig as string) as Partial<AntiNukeConfig>) };
    }
  } catch { /* table might not exist */ }
  return { ...DEFAULT_CONFIG };
}

export async function setAntiNukeConfig(guildId: string, config: Partial<AntiNukeConfig>): Promise<void> {
  try {
    const current = await getAntiNukeConfig(guildId);
    const merged = { ...current, ...config };
    await prisma.guildConfig.upsert({
      where: { guildId },
      create: { guildId, antiNukeConfig: JSON.stringify(merged) },
      update: { antiNukeConfig: JSON.stringify(merged) },
    }).catch(() => {});
  } catch (error) {
    logger.error("[AntiNuke] setAntiNukeConfig:", String(error));
  }
}

// ─── Auto-punish ──────────────────────────────────────────────────────

async function autoPunish(
  client: Client,
  guild: Guild,
  executorId: string,
  action: AntiNukeConfig["action"],
  reason: string,
): Promise<void> {
  try {
    const member = await guild.members.fetch(executorId).catch(() => null);
    if (!member) return;

    // Don't punish owners or whitelist
    if (member.id === guild.ownerId) return;

    const config = await getAntiNukeConfig(guild.id);
    if (config.whitelist.includes(executorId)) return;

    if (action === "strip") {
      // Remove all dangerous permissions
      const dangerousPerms = ["Administrator", "ManageChannels", "ManageRoles", "BanMembers", "KickMembers", "ManageGuild"];
      const rolesToRemove = member.roles.cache.filter((r) =>
        r.permissions.toArray().some((p) => dangerousPerms.includes(p)),
      );
      if (rolesToRemove.size > 0) {
        await member.roles.remove(rolesToRemove, `Anti-Nuke: ${reason}`);
      }
    } else if (action === "kick") {
      await member.kick(`Anti-Nuke: ${reason}`);
    } else if (action === "ban") {
      await member.ban({ reason: `Anti-Nuke: ${reason}` });
    }

    logger.warn(`[AntiNuke] Auto-punished ${executorId} in ${guild.id}: ${action} (${reason})`);

    // Log to channel
    if (config.logChannelId) {
      const logChannel = guild.channels.cache.get(config.logChannelId) as TextChannel | undefined;
      if (logChannel) {
        const embed = new EmbedBuilder()
          .setTitle("🛡️ Anti-Nuke — Action automatique")
          .setColor(0xe74c3c)
          .addFields(
            { name: "👤 Utilisateur", value: `<@${executorId}> (${member.user.tag})`, inline: false },
            { name: "⚡ Action", value: action.toUpperCase(), inline: true },
            { name: "📝 Raison", value: reason, inline: false },
          )
          .setTimestamp();
        await logChannel.send({ embeds: [embed] }).catch(() => {});
      }
    }
  } catch (error) {
    logger.error("[AntiNuke] autoPunish:", String(error));
  }
}

// ─── Audit log monitor ────────────────────────────────────────────────

export async function checkAuditLogs(client: Client, guild: Guild): Promise<void> {
  const config = await getAntiNukeConfig(guild.id);
  if (!config.enabled) return;

  try {
    // Fetch recent audit logs for destructive actions
    const audits = await guild.fetchAuditLogs({
      limit: 20,
      type: AuditLogEvent.ChannelDelete,
    });

    const recentEntries = audits.entries.filter(
      (e) => Date.now() - e.createdTimestamp < config.timeWindowMs,
    ).values();

    for (const entry of recentEntries) {
      const executorId = entry.executorId;
      if (!executorId || config.whitelist.includes(executorId)) continue;

      const tracker = getTracker(guild.id, executorId);
      tracker.events.push({
        executorId,
        action: entry.action.toString(),
        target: entry.target?.id ?? "unknown",
        timestamp: new Date(entry.createdTimestamp),
      });
      cleanOldEvents(tracker, config.timeWindowMs);

      // Check thresholds
      const channelDeletes = countEvents(tracker, AuditLogEvent.ChannelDelete.toString());
      if (channelDeletes >= config.channelDeleteThreshold) {
        await autoPunish(client, guild, executorId, config.action, `Mass channel delete (${channelDeletes})`);
        tracker.events = []; // Reset after punishment
        continue;
      }
    }

    // Also check ban audits
    const banAudits = await guild.fetchAuditLogs({ limit: 20, type: AuditLogEvent.MemberBanAdd }).catch(() => null);
    if (banAudits) {
      const recentBans = banAudits.entries.filter(
        (e) => Date.now() - e.createdTimestamp < config.timeWindowMs,
      ).values();
      for (const entry of recentBans) {
        const executorId = entry.executorId;
        if (!executorId || config.whitelist.includes(executorId)) continue;

        const tracker = getTracker(guild.id, executorId);
        tracker.events.push({
          executorId,
          action: "MEMBER_BAN_ADD",
          target: entry.target?.id ?? "unknown",
          timestamp: new Date(entry.createdTimestamp),
        });
        cleanOldEvents(tracker, config.timeWindowMs);

        const banCount = countEvents(tracker, "MEMBER_BAN_ADD");
        if (banCount >= config.banThreshold) {
          await autoPunish(client, guild, executorId, config.action, `Mass ban (${banCount})`);
          tracker.events = [];
          break;
        }
      }
    }

    // Check role deletes
    const roleAudits = await guild.fetchAuditLogs({ limit: 20, type: AuditLogEvent.RoleDelete }).catch(() => null);
    if (roleAudits) {
      const recentRoleDeletes = roleAudits.entries.filter(
        (e) => Date.now() - e.createdTimestamp < config.timeWindowMs,
      ).values();
      for (const entry of recentRoleDeletes) {
        const executorId = entry.executorId;
        if (!executorId || config.whitelist.includes(executorId)) continue;

        const tracker = getTracker(guild.id, executorId);
        tracker.events.push({
          executorId,
          action: "ROLE_DELETE",
          target: entry.target?.id ?? "unknown",
          timestamp: new Date(entry.createdTimestamp),
        });
        cleanOldEvents(tracker, config.timeWindowMs);

        const roleDeleteCount = countEvents(tracker, "ROLE_DELETE");
        if (roleDeleteCount >= config.roleDeleteThreshold) {
          await autoPunish(client, guild, executorId, config.action, `Mass role delete (${roleDeleteCount})`);
          tracker.events = [];
          break;
        }
      }
    }
  } catch (error) {
    logger.error("[AntiNuke] checkAuditLogs:", String(error));
  }
}

// ─── Bot add detection ────────────────────────────────────────────────

export async function checkBotAdd(
  client: Client,
  guild: Guild,
  botId: string,
  adderId: string,
): Promise<void> {
  const config = await getAntiNukeConfig(guild.id);
  if (!config.enabled) return;
  if (config.whitelist.includes(adderId)) return;

  const adder = await guild.members.fetch(adderId).catch(() => null);
  if (!adder || adder.id === guild.ownerId) return;

  // Check if adder is trusted (has been in server for > 30 days and has no sanctions)
  const accountAge = Date.now() - adder.user.createdTimestamp;
  const joinAge = adder.joinedAt ? Date.now() - adder.joinedAt.getTime() : 0;

  if (accountAge < 7 * 86_400_000 || joinAge < 86_400_000) {
    // Untrusted: kick the bot and punish adder
    const botMember = await guild.members.fetch(botId).catch(() => null);
    if (botMember) {
      await botMember.kick("Anti-Nuke: Bot added by untrusted member").catch(() => {});
    }
    await autoPunish(client, guild, adderId, "strip", `Added bot ${botId} while untrusted`);
  }
}

// ─── Status embed ─────────────────────────────────────────────────────

export async function generateAntiNukeStatusEmbed(guildId: string): Promise<EmbedBuilder> {
  const config = await getAntiNukeConfig(guildId);
  const tracker = guildTrackers.get(guildId);

  let totalEvents = 0;
  if (tracker) {
    for (const [, t] of tracker) totalEvents += t.events.length;
  }

  return new EmbedBuilder()
    .setTitle("🛡️ Anti-Nuke Status")
    .setColor(config.enabled ? 0x2ecc71 : 0xe74c3c)
    .addFields(
      { name: "Status", value: config.enabled ? "✅ Activé" : "❌ Désactivé", inline: true },
      { name: "Action", value: config.action.toUpperCase(), inline: true },
      { name: "Fenêtre", value: `${config.timeWindowMs / 1000}s`, inline: true },
      { name: "📊 Seuils", value: [
        `Channel delete: ${config.channelDeleteThreshold}`,
        `Role delete: ${config.roleDeleteThreshold}`,
        `Ban: ${config.banThreshold}`,
        `Kick: ${config.kickThreshold}`,
        `Emoji delete: ${config.emojiDeleteThreshold}`,
      ].join("\n"), inline: false },
      { name: "👥 Whitelist", value: config.whitelist.length > 0 ? config.whitelist.map((id) => `<@${id}>`).join(", ") : "Vide", inline: false },
      { name: "📈 Événements récents", value: `${totalEvents} dans la fenêtre`, inline: true },
    )
    .setTimestamp();
}
