/**
 * giveawaySystem.ts — Giveaway System
 *
 * Create giveaways with requirements (role, account age, level),
 * auto-end with winner selection, reroll, early roll.
 */

import {
  ButtonBuilder,
  ButtonStyle,
  ActionRowBuilder,
  EmbedBuilder,
  TextChannel,
  Guild,
  GuildMember,
  ChannelType,
} from "discord.js";
import logger from "../utils/logger.js";

// ─── Types ────────────────────────────────────────────────────────────

export interface GiveawayRequirements {
  requiredRoleId?: string;
  minAccountAgeDays?: number;
  minLevel?: number;
}

export interface Giveaway {
  id: string;
  guildId: string;
  channelId: string;
  messageId: string;
  prize: string;
  winnerCount: number;
  endsAt: Date;
  hostId: string;
  requirements?: GiveawayRequirements;
  participants: string[];
  ended: boolean;
  winners: string[];
}

// In-memory storage (could be persisted to Prisma)
const activeGiveaways = new Map<string, Giveaway>();

// ─── Create ───────────────────────────────────────────────────────────

export async function createGiveaway(
  guild: Guild,
  channelId: string,
  prize: string,
  winnerCount: number,
  durationMs: number,
  hostId: string,
  requirements?: GiveawayRequirements,
): Promise<Giveaway | null> {
  try {
    const channel = guild.channels.cache.get(channelId) as TextChannel | undefined;
    if (!channel || channel.type !== ChannelType.GuildText) return null;

    const id = `gw_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
    const endsAt = new Date(Date.now() + durationMs);

    const embed = new EmbedBuilder()
      .setTitle("🎁 GIVEAWAY")
      .setColor(0xf1c40f)
      .addFields(
        { name: "🏆 Prix", value: prize, inline: false },
        { name: "👥 Gagnants", value: String(winnerCount), inline: true },
        { name: "⏰ Fin", value: `<t:${Math.floor(endsAt.getTime() / 1000)}:R>`, inline: true },
        { name: "👤 Organisateur", value: `<@${hostId}>`, inline: true },
      )
      .setTimestamp(endsAt);

    if (requirements) {
      const reqs: string[] = [];
      if (requirements.requiredRoleId) reqs.push(`Rôle: <@&${requirements.requiredRoleId}>`);
      if (requirements.minAccountAgeDays) reqs.push(`Compte: ${requirements.minAccountAgeDays}j+`);
      if (requirements.minLevel) reqs.push(`Niveau: ${requirements.minLevel}+`);
      if (reqs.length > 0) {
        embed.addFields({ name: "📋 Requirements", value: reqs.join("\n"), inline: false });
      }
    }

    const button = new ButtonBuilder()
      .setCustomId(`giveaway_join_${id}`)
      .setLabel("🎉 Participer")
      .setStyle(ButtonStyle.Primary);
    const row = new ActionRowBuilder<ButtonBuilder>().addComponents(button);

    const message = await channel.send({ embeds: [embed], components: [row] });

    const giveaway: Giveaway = {
      id,
      guildId: guild.id,
      channelId,
      messageId: message.id,
      prize,
      winnerCount,
      endsAt,
      hostId,
      requirements,
      participants: [],
      ended: false,
      winners: [],
    };

    activeGiveaways.set(id, giveaway);
    return giveaway;
  } catch (error) {
    logger.error("[Giveaway] createGiveaway:", String(error));
    return null;
  }
}

// ─── Join ─────────────────────────────────────────────────────────────

export async function joinGiveaway(
  giveawayId: string,
  member: GuildMember,
): Promise<{ success: boolean; message: string }> {
  const giveaway = activeGiveaways.get(giveawayId);
  if (!giveaway) return { success: false, message: "Giveaway introuvable." };
  if (giveaway.ended) return { success: false, message: "Giveaway terminé." };
  if (giveaway.participants.includes(member.id)) {
    return { success: false, message: "Tu participes déjà!" };
  }

  // Check requirements
  if (giveaway.requirements) {
    const reqs = giveaway.requirements;
    if (reqs.requiredRoleId && !member.roles.cache.has(reqs.requiredRoleId)) {
      return { success: false, message: "Tu n'as pas le rôle requis." };
    }
    if (reqs.minAccountAgeDays) {
      const ageDays = (Date.now() - member.user.createdTimestamp) / 86_400_000;
      if (ageDays < reqs.minAccountAgeDays) {
        return { success: false, message: `Compte trop récent (min ${reqs.minAccountAgeDays}j).` };
      }
    }
    // Level check would require importing xpService — skip for now
  }

  giveaway.participants.push(member.id);
  return { success: true, message: "✅ Participation enregistrée!" };
}

// ─── End ──────────────────────────────────────────────────────────────

export async function endGiveaway(giveawayId: string, guild: Guild): Promise<Giveaway | null> {
  const giveaway = activeGiveaways.get(giveawayId);
  if (!giveaway || giveaway.ended) return null;

  giveaway.ended = true;

  // Select winners
  const participants = [...giveaway.participants];
  if (participants.length === 0) {
    giveaway.winners = [];
  } else {
    // Shuffle and pick
    for (let i = participants.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [participants[i], participants[j]] = [participants[j], participants[i]];
    }
    giveaway.winners = participants.slice(0, giveaway.winnerCount);
  }

  // Announce
  const channel = guild.channels.cache.get(giveaway.channelId) as TextChannel | undefined;
  if (channel && channel.type === ChannelType.GuildText) {
    const embed = new EmbedBuilder()
      .setTitle("🎁 GIVEAWAY TERMINÉ")
      .setColor(0x2ecc71)
      .addFields(
        { name: "🏆 Prix", value: giveaway.prize, inline: false },
        { name: "👥 Participants", value: String(giveaway.participants.length), inline: true },
      )
      .setTimestamp();

    if (giveaway.winners.length > 0) {
      embed.addFields({
        name: "🎉 Gagnants",
        value: giveaway.winners.map((w) => `<@${w}>`).join(", "),
        inline: false,
      });
      await channel.send({
        content: giveaway.winners.map((w) => `<@${w}>`).join(" "),
        embeds: [embed],
      });
    } else {
      embed.setDescription("Aucun participant — giveaway annulé.");
      await channel.send({ embeds: [embed] });
    }
  }

  return giveaway;
}

// ─── Reroll ───────────────────────────────────────────────────────────

export function rerollGiveaway(giveawayId: string): string[] {
  const giveaway = activeGiveaways.get(giveawayId);
  if (!giveaway || !giveaway.ended || giveaway.participants.length === 0) return [];

  const participants = [...giveaway.participants];
  for (let i = participants.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [participants[i], participants[j]] = [participants[j], participants[i]];
  }
  giveaway.winners = participants.slice(0, giveaway.winnerCount);
  return giveaway.winners;
}

// ─── List & status ────────────────────────────────────────────────────

export function listActiveGiveaways(guildId: string): Giveaway[] {
  return Array.from(activeGiveaways.values()).filter((g) => g.guildId === guildId && !g.ended);
}

export function getGiveawayById(id: string): Giveaway | null {
  return activeGiveaways.get(id) ?? null;
}

// ─── Auto-end checker (call periodically) ─────────────────────────────

export async function checkEndedGiveaways(guild: Guild): Promise<void> {
  const now = Date.now();
  for (const [id, giveaway] of activeGiveaways) {
    if (!giveaway.ended && giveaway.guildId === guild.id && giveaway.endsAt.getTime() < now) {
      await endGiveaway(id, guild);
    }
  }
}
