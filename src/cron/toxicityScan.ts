/**
 * toxicityScan.ts — Scan de toxicité quotidien automatique
 *
 * Tous les jours à 22h00, analyse rétrospective de toxicité
 * de tous les salons textuels actifs du serveur principal.
 * Poste un rapport détaillé dans le salon de logs.
 *
 * Utilise l'API Discord (fetch messages) + analyse heuristique
 * (caps, mentions, répétitions, bursts) pour calculer un score
 * de toxicité par salon et un classement global.
 */

import cron from "node-cron";
import { Client, TextChannel, EmbedBuilder } from "discord.js";
import * as Sentry from "@sentry/node";
import logger from "../utils/logger.js";
import { config } from "../config.js";

const SCAN_CRON_EXPRESSION = "0 22 * * *"; // 22h00 tous les jours
const HOURS_WINDOW = 24;
const MAX_CHANNELS = 15;
const MAX_MESSAGES_PER_CHANNEL = 200;

interface ChannelToxicityReport {
  channelId: string;
  channelName: string;
  totalMessages: number;
  toxicityScore: number;
  capsMessages: number;
  mentionHeavyMessages: number;
  duplicateRatio: number;
  maxBurst: number;
  topToxicUsers: Map<string, number>;
}

/**
 * Démarre le cron de scan de toxicité quotidien.
 */
export function startToxicityScanCron(client: Client): void {
  cron.schedule(SCAN_CRON_EXPRESSION, () => {
    void runDailyToxicityScan(client);
  });

  logger.info("[ToxicityScan] Cron démarré — exécution quotidienne à 22h00");
}

/**
 * Exécute le scan de toxicité quotidien.
 */
async function runDailyToxicityScan(client: Client): Promise<void> {
  try {
    logger.info("[ToxicityScan] Début du scan quotidien...");

    const guildId = config.guildId || process.env.GUILD_ID;
    if (!guildId) {
      logger.warn("[ToxicityScan] Aucun GUILD_ID configuré — skip");
      return;
    }

    const guild = client.guilds.cache.get(guildId);
    if (!guild) {
      logger.warn(`[ToxicityScan] Guild ${guildId} introuvable`);
      return;
    }

    // Récupérer les salons textuels
    const textChannels = guild.channels.cache.filter(
      (c): c is TextChannel => c.isTextBased() && !c.isThread() && !c.isDMBased(),
    );

    if (textChannels.size === 0) {
      logger.warn("[ToxicityScan] Aucun salon textuel trouvé");
      return;
    }

    const channelsToScan = textChannels.first(MAX_CHANNELS);
    const reports: ChannelToxicityReport[] = [];

    const sinceTimestamp = Date.now() - HOURS_WINDOW * 60 * 60 * 1000;

    for (const channel of channelsToScan) {
      try {
        const report = await scanChannel(channel, sinceTimestamp);
        if (report && report.totalMessages > 0) {
          reports.push(report);
        }
      } catch (error) {
        logger.warn(
          `[ToxicityScan] Skip channel ${channel.name}: ${error instanceof Error ? error.message : String(error)}`,
        );
      }
    }

    if (reports.length === 0) {
      logger.info("[ToxicityScan] Aucun message dans les dernières 24h — skip rapport");
      return;
    }

    // Trier par score de toxicité décroissant
    reports.sort((a, b) => b.toxicityScore - a.toxicityScore);

    // Générer et envoyer le rapport
    await sendToxicityReport(client, reports);

    logger.info(`[ToxicityScan] Scan terminé — ${reports.length} salons analysés`);
  } catch (error) {
    logger.error(
      `[ToxicityScan] Erreur: ${error instanceof Error ? error.message : String(error)}`,
    );
    Sentry.captureException(error);
  }
}

/**
 * Analyse un salon et retourne son rapport de toxicité.
 */
async function scanChannel(
  channel: TextChannel,
  sinceTimestamp: number,
): Promise<ChannelToxicityReport | null> {
  interface CollectedMessage {
    content: string;
    authorId: string;
    createdAt: number;
  }

  const messages: CollectedMessage[] = [];
  let lastId: string | undefined;

  for (let batch = 0; batch < 3; batch++) {
    try {
      const fetched = await channel.messages.fetch({
        limit: 100,
        ...(lastId ? { before: lastId } : {}),
      });
      if (fetched.size === 0) break;

      for (const [, msg] of fetched) {
        if (msg.createdTimestamp < sinceTimestamp) {
          lastId = undefined;
          break;
        }
        if (msg.author.bot) continue;
        messages.push({
          content: msg.content,
          authorId: msg.author.id,
          createdAt: msg.createdTimestamp,
        });
      }
      if (!lastId) break;
      lastId = fetched.last()?.id;
    } catch {
      break;
    }
  }

  if (messages.length === 0) return null;

  // Analyse
  const totalMessages = messages.length;
  let capsMessages = 0;
  let mentionHeavyMessages = 0;
  let duplicateCount = 0;
  let maxBurst = 0;

  const contentCounts = new Map<string, number>();
  const userToxicity = new Map<string, number>();

  for (const msg of messages) {
    const content = msg.content;

    // Caps
    if (content.length > 10) {
      const capsRatio = (content.match(/[A-Z]/g)?.length ?? 0) / content.length;
      if (capsRatio > 0.6) {
        capsMessages++;
        userToxicity.set(msg.authorId, (userToxicity.get(msg.authorId) ?? 0) + 2);
      }
    }

    // Mentions lourdes
    const mentionCount = (content.match(/<@!?\d+>/g) ?? []).length;
    if (mentionCount >= 3) {
      mentionHeavyMessages++;
      userToxicity.set(msg.authorId, (userToxicity.get(msg.authorId) ?? 0) + 3);
    }

    // Duplications
    const normalized = content.trim().toLowerCase().slice(0, 200);
    if (normalized) {
      const count = (contentCounts.get(normalized) ?? 0) + 1;
      contentCounts.set(normalized, count);
      if (count > 1) duplicateCount++;
    }
  }

  // Burst detection (3s window)
  messages.sort((a, b) => a.createdAt - b.createdAt);
  for (let i = 0; i < messages.length; i++) {
    const windowEnd = messages[i].createdAt + 3000;
    let burstCount = 1;
    for (let j = i + 1; j < messages.length; j++) {
      if (messages[j].createdAt <= windowEnd) {
        burstCount++;
      } else break;
    }
    if (burstCount > maxBurst) maxBurst = burstCount;
  }

  const duplicateRatio = totalMessages > 0 ? (duplicateCount / totalMessages) * 100 : 0;

  // Score composite
  const toxicityScore = Math.min(
    100,
    Math.round(
      duplicateRatio * 0.3 +
        (maxBurst >= 5 ? 25 : (maxBurst / 5) * 25) +
        (capsMessages / totalMessages) * 100 * 0.2 +
        (mentionHeavyMessages / totalMessages) * 100 * 0.25,
    ),
  );

  return {
    channelId: channel.id,
    channelName: channel.name,
    totalMessages,
    toxicityScore,
    capsMessages,
    mentionHeavyMessages,
    duplicateRatio: Math.round(duplicateRatio * 10) / 10,
    maxBurst,
    topToxicUsers: userToxicity,
  };
}

/**
 * Envoie le rapport de toxicité dans le salon de logs.
 */
async function sendToxicityReport(client: Client, reports: ChannelToxicityReport[]): Promise<void> {
  const logChannelId = process.env.LOG_CHANNEL_ID || config.logChannel;
  if (!logChannelId) {
    logger.warn(
      "[ToxicityScan] Aucun LOG_CHANNEL_ID configuré — rapport en logs console uniquement",
    );
    return;
  }

  const guild = client.guilds.cache.get(config.guildId || process.env.GUILD_ID || "");
  if (!guild) return;

  const logChannel = (await guild.channels.fetch(logChannelId)) as TextChannel | null;
  if (!logChannel?.isTextBased()) {
    logger.warn(`[ToxicityScan] Salon de logs ${logChannelId} introuvable ou non textuel`);
    return;
  }

  const totalMessages = reports.reduce((sum, r) => sum + r.totalMessages, 0);
  const avgToxicity = Math.round(
    reports.reduce((sum, r) => sum + r.toxicityScore, 0) / reports.length,
  );
  const mostToxic = reports[0];
  const leastToxic = reports[reports.length - 1];

  // Salon le plus toxique
  let mostToxicUser = "N/A";
  if (mostToxic.topToxicUsers.size > 0) {
    const topUser = [...mostToxic.topToxicUsers.entries()].sort((a, b) => b[1] - a[1])[0];
    try {
      const member = await guild.members.fetch(topUser[0]).catch(() => null);
      mostToxicUser = member ? member.user.tag : `<@${topUser[0]}>`;
    } catch {
      mostToxicUser = `<@${topUser[0]}>`;
    }
  }

  const embed = new EmbedBuilder()
    .setTitle("🧪 Rapport de Toxicité Quotidien")
    .setColor(avgToxicity >= 50 ? 0xed4245 : avgToxicity >= 25 ? 0xeeeeee : 0x57f287)
    .setDescription(`Analyse des dernières **${HOURS_WINDOW}h** — ${reports.length} salons scannés`)
    .addFields(
      { name: "📊 Messages analysés", value: `${totalMessages}`, inline: true },
      { name: "🌡️ Toxicité moyenne", value: `${avgToxicity}/100`, inline: true },
      { name: "📋 Salons actifs", value: `${reports.length}`, inline: true },
      {
        name: "🔴 Salon le plus toxique",
        value: `**#${mostToxic.channelName}** (${mostToxic.toxicityScore}/100)`,
        inline: true,
      },
      {
        name: "🟢 Salon le plus sain",
        value: `**#${leastToxic.channelName}** (${leastToxic.toxicityScore}/100)`,
        inline: true,
      },
      { name: "👤 User le plus toxique", value: mostToxicUser, inline: true },
    )
    .setFooter({ text: "Toxicity Scan Auto • Quotidien 22h00" })
    .setTimestamp();

  // Top 10 salons par toxicité
  const rankingText = reports
    .slice(0, 10)
    .map((r, i) => {
      const emoji = r.toxicityScore >= 50 ? "🔴" : r.toxicityScore >= 25 ? "🟡" : "🟢";
      return `${emoji} ${i + 1}. **#${r.channelName}** — ${r.toxicityScore}/100 (${r.totalMessages} msgs, ${r.duplicateRatio}% dup, ${r.capsMessages} caps, ${r.mentionHeavyMessages} spam mentions)`;
    })
    .join("\n");

  embed.addFields({
    name: "🏆 Classement des salons",
    value: rankingText.slice(0, 1024),
    inline: false,
  });

  // Recommandations
  const recommendations: string[] = [];
  if (mostToxic.toxicityScore >= 60) {
    recommendations.push(
      `⚠️ **#${mostToxic.channelName}** nécessite attention — slowmode recommandé`,
    );
  }
  if (mostToxic.maxBurst >= 8) {
    recommendations.push(
      `⚡ Burst de ${mostToxic.maxBurst} messages en 3s détecté dans **#${mostToxic.channelName}**`,
    );
  }
  if (avgToxicity >= 40) {
    recommendations.push("🌡️ Toxicité globale élevée — envisager un auto-modération renforcé");
  }
  if (recommendations.length === 0) {
    recommendations.push("✅ Aucune action requise — le serveur est calme");
  }

  embed.addFields({ name: "💡 Recommandations", value: recommendations.join("\n"), inline: false });

  await logChannel.send({ embeds: [embed] });
  logger.info(`[ToxicityScan] Rapport envoyé dans #${logChannel.name}`);
}
