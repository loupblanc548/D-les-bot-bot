/**
 * pollSystem.ts — Advanced polls with reactions
 *
 * Create polls with multiple options, vote via reactions, auto-end with results.
 */

import { EmbedBuilder, Guild, TextChannel, ChannelType, Message } from "discord.js";
import logger from "../utils/logger.js";

export interface PollOption {
  emoji: string;
  label: string;
  votes: string[];
}

export interface Poll {
  id: string;
  guildId: string;
  channelId: string;
  messageId: string;
  question: string;
  options: PollOption[];
  endsAt: Date;
  authorId: string;
  anonymous: boolean;
  ended: boolean;
}

const activePolls = new Map<string, Poll>();

export async function createPoll(
  guild: Guild,
  channelId: string,
  question: string,
  options: { emoji: string; label: string }[],
  durationMs: number,
  authorId: string,
  anonymous = false,
): Promise<Poll | null> {
  try {
    const channel = guild.channels.cache.get(channelId) as TextChannel | undefined;
    if (!channel || channel.type !== ChannelType.GuildText) return null;

    const id = `poll_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
    const endsAt = new Date(Date.now() + durationMs);

    const pollOptions: PollOption[] = options.map((o) => ({
      emoji: o.emoji,
      label: o.label,
      votes: [],
    }));

    const embed = new EmbedBuilder()
      .setTitle("📊 Sondage")
      .setColor(0x3498db)
      .setDescription(`**${question}**`)
      .addFields(
        { name: "Options", value: pollOptions.map((o) => `${o.emoji} ${o.label}`).join("\n"), inline: false },
        { name: "⏰ Fin", value: `<t:${Math.floor(endsAt.getTime() / 1000)}:R>`, inline: true },
        { name: "👤 Par", value: `<@${authorId}>`, inline: true },
      )
      .setTimestamp(endsAt);

    const message = await channel.send({ embeds: [embed] });

    // Add reactions
    for (const opt of pollOptions) {
      await message.react(opt.emoji).catch(() => {});
    }

    const poll: Poll = {
      id,
      guildId: guild.id,
      channelId,
      messageId: message.id,
      question,
      options: pollOptions,
      endsAt,
      authorId,
      anonymous,
      ended: false,
    };

    activePolls.set(id, poll);
    return poll;
  } catch (error) {
    logger.error("[Poll] createPoll:", String(error));
    return null;
  }
}

export function vote(pollId: string, userId: string, emoji: string): { success: boolean; message: string } {
  const poll = activePolls.get(pollId);
  if (!poll) return { success: false, message: "Sondage introuvable." };
  if (poll.ended) return { success: false, message: "Sondage terminé." };

  // Remove previous vote if exists
  for (const opt of poll.options) {
    opt.votes = opt.votes.filter((v) => v !== userId);
  }

  // Add new vote
  const option = poll.options.find((o) => o.emoji === emoji);
  if (!option) return { success: false, message: "Option invalide." };

  option.votes.push(userId);
  return { success: true, message: "Vote enregistré!" };
}

export async function endPoll(pollId: string, guild: Guild): Promise<Poll | null> {
  const poll = activePolls.get(pollId);
  if (!poll || poll.ended) return null;

  poll.ended = true;

  // Sort results
  const sorted = [...poll.options].sort((a, b) => b.votes.length - a.votes.length);
  const totalVotes = poll.options.reduce((sum, o) => sum + o.votes.length, 0);

  const channel = guild.channels.cache.get(poll.channelId) as TextChannel | undefined;
  if (channel && channel.type === ChannelType.GuildText) {
    const resultsText = sorted
      .map((opt, i) => {
        const pct = totalVotes > 0 ? Math.round((opt.votes.length / totalVotes) * 100) : 0;
        const bar = "█".repeat(Math.round(pct / 10)) + "░".repeat(10 - Math.round(pct / 10));
        const medal = i === 0 ? "🏆" : i === 1 ? "🥈" : i === 2 ? "🥉" : "  ";
        return `${medal} ${opt.emoji} ${opt.label}\n\`${bar}\` ${opt.votes.length} votes (${pct}%)`;
      })
      .join("\n\n");

    const embed = new EmbedBuilder()
      .setTitle("📊 Résultats du sondage")
      .setColor(0x2ecc71)
      .setDescription(`**${poll.question}**\n\n${resultsText}`)
      .addFields({ name: "Total votes", value: String(totalVotes), inline: true })
      .setTimestamp();

    await channel.send({ embeds: [embed] }).catch(() => {});
  }

  return poll;
}

export function getPoll(id: string): Poll | null {
  return activePolls.get(id) ?? null;
}

export function listActivePolls(guildId: string): Poll[] {
  return Array.from(activePolls.values()).filter((p) => p.guildId === guildId && !p.ended);
}

export async function checkEndedPolls(guild: Guild): Promise<void> {
  const now = Date.now();
  for (const [id, poll] of activePolls) {
    if (!poll.ended && poll.guildId === guild.id && poll.endsAt.getTime() < now) {
      await endPoll(id, guild);
    }
  }
}

export async function syncVotesFromReactions(
  pollId: string,
  message: Message,
): Promise<void> {
  const poll = activePolls.get(pollId);
  if (!poll) return;

  for (const option of poll.options) {
    const reaction = message.reactions.cache.get(option.emoji);
    if (reaction) {
      const users = await reaction.users.fetch().catch(() => null);
      if (users) {
        option.votes = users.filter((u) => !u.bot).map((u) => u.id);
      }
    }
  }
}
