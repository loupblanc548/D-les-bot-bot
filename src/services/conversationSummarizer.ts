import { Client, TextChannel, EmbedBuilder, Message } from "discord.js";
import logger from "../utils/logger.js";

const SUMMARY_THRESHOLD = 50;

export async function summarizeChannel(client: Client, channelId: string, messageCount: number = 100): Promise<string | null> {
  try {
    const channel = client.channels.cache.get(channelId) as TextChannel;
    if (!channel?.isTextBased()) return null;

    const messages = await channel.messages.fetch({ limit: messageCount });
    const sortedMsgs = [...messages.values()].sort((a, b) => a.createdTimestamp - b.createdTimestamp);

    const conversation = sortedMsgs
      .filter((m) => !m.author.bot && m.content.length > 0)
      .map((m) => `${m.author.username}: ${m.content.substring(0, 200)}`)
      .join("\n")
      .substring(0, 4000);

    if (conversation.length < 100) return null;

    const summary = generateSimpleSummary(conversation);
    return summary;
  } catch (err) {
    logger.error(`[Summary] Erreur: ${err instanceof Error ? err.message : String(err)}`);
    return null;
  }
}

function generateSimpleSummary(conversation: string): string {
  const lines = conversation.split("\n");
  const participants = new Set<string>();
  const keywords = new Map<string, number>();

  for (const line of lines) {
    const match = line.match(/^([^:]+):/);
    if (match) participants.add(match[1]);

    const words = line.toLowerCase().match(/\b[a-zA-Zà-ÿ]{4,}\b/g) ?? [];
    for (const word of words) {
      if (!["avec", "mais", "pour", "dans", "plus", "fait", "être", "avoir", "cette", "tout"].includes(word)) {
        keywords.set(word, (keywords.get(word) ?? 0) + 1);
      }
    }
  }

  const topKeywords = [...keywords.entries()].sort((a, b) => b[1] - a[1]).slice(0, 10);
  const firstMessages = lines.slice(0, 5);
  const lastMessages = lines.slice(-5);

  return [
    `**📋 Résumé de conversation**`,
    `**Participants:** ${[...participants].slice(0, 10).join(", ")}`,
    `**Mots-clés principaux:** ${topKeywords.map(([kw, count]) => `${kw} (${count}x)`).join(", ")}`,
    `**Début:**`,
    ...firstMessages.map((m) => `> ${m.substring(0, 150)}`),
    `**Fin:**`,
    ...lastMessages.map((m) => `> ${m.substring(0, 150)}`),
  ].join("\n");
}

export async function autoSummarizeLongThreads(client: Client): Promise<void> {
  try {
    for (const guild of client.guilds.cache.values()) {
      const channels = guild.channels.cache.filter((c) => c.isTextBased()) as Map<string, TextChannel>;
      for (const channel of channels) {
        const textChannel = channel[1];
        const threads = textChannel.threads.cache;
        for (const thread of threads.values()) {
          if ((thread.messageCount ?? 0) < SUMMARY_THRESHOLD) continue;

          const summary = await summarizeChannel(client, thread.id, 100);
          if (!summary) continue;

          const embed = new EmbedBuilder()
            .setTitle("📋 Résumé automatique")
            .setDescription(summary.substring(0, 4000))
            .setColor(0x00aaff)
            .setFooter({ text: "Surveillance System • Auto Summary" })
            .setTimestamp();

          await thread.send({ embeds: [embed] });
          logger.info(`[Summary] Thread ${thread.name} résumé automatiquement`);
        }
      }
    }
  } catch (err) {
    logger.error(`[Summary] Erreur auto: ${err instanceof Error ? err.message : String(err)}`);
  }
}

export function startConversationSummarizer(client: Client): void {
  client.on("threadCreate", async (thread) => {
    logger.info(`[Summary] Nouveau thread détecté: ${thread.name} — résumé auto si > ${SUMMARY_THRESHOLD} messages`);
  });

  logger.info("[Summary] Résumé automatique de conversations activé");
}
