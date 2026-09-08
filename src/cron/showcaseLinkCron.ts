/**
 * showcaseLinkCron.ts — John poste le lien du showcase dans le chat du salon vocal.
 * Un seul message à la fois : l'ancien est remplacé à chaque passage.
 */

import { schedule, ScheduledTask } from "node-cron";
import { EmbedBuilder } from "discord.js";
import type { Client, TextBasedChannel } from "discord.js";
import logger from "../utils/logger.js";

const CRON_EXPR = process.env.SHOWCASE_LINK_CRON || "0 */2 * * *";
const STARTUP_DELAY_MS = 20_000;

function getVoiceChannelId(): string {
  return process.env.GAME_RELEASE_VOICE_CHANNEL_ID || "";
}

export function getShowcaseUrl(): string {
  const host = process.env.VPS_PUBLIC_HOST || "31.220.79.90";
  const port = process.env.HEALTH_PORT || "3000";
  return `http://${host}:${port}/releases/showcase`;
}

let cronJob: ScheduledTask | null = null;
let lastMessageId: string | null = null;

function isVoiceChat(channel: { messages?: unknown; isTextBased?: () => boolean }): boolean {
  if (typeof channel.isTextBased === "function") return channel.isTextBased();
  return channel.messages !== undefined;
}

export async function postShowcaseLink(client: Client): Promise<void> {
  const voiceChannelId = getVoiceChannelId();
  if (!voiceChannelId) return;

  const showcaseUrl = getShowcaseUrl();

  try {
    const channel = await client.channels.fetch(voiceChannelId);
    if (!channel) {
      logger.warn(`[ShowcaseLink] Salon ${voiceChannelId} introuvable`);
      return;
    }
    if (!isVoiceChat(channel)) {
      logger.warn(`[ShowcaseLink] Salon ${voiceChannelId} ne supporte pas les messages texte`);
      return;
    }

    const textChannel = channel as TextBasedChannel & {
      messages: {
        fetch: (id: string) => Promise<{ delete: () => Promise<unknown> }>;
      };
      send: (payload: { embeds: EmbedBuilder[] }) => Promise<{ id: string }>;
    };

    if (lastMessageId) {
      try {
        const oldMsg = await textChannel.messages.fetch(lastMessageId);
        if (oldMsg) await oldMsg.delete();
      } catch {
        /* déjà parti */
      }
    }

    const embed = new EmbedBuilder()
      .setTitle("🎮 Sorties jeux — page web")
      .setDescription(
        `Le showcase tourne aussi **en Go Live** dans ce salon.\n\n` +
          `**Ouvre la page :**\n${showcaseUrl}\n\n` +
          `Compte à rebours en direct • cartes de la semaine en or / violet / bleu`,
      )
      .setURL(showcaseUrl)
      .setColor(0x5865f2)
      .setFooter({
        text: `John • lien toutes les 2 h • ${new Date().toLocaleDateString("fr-FR")}`,
      })
      .setTimestamp();

    const sent = await textChannel.send({ embeds: [embed] });
    lastMessageId = sent.id;
    logger.info(`[ShowcaseLink] Lien posté dans ${voiceChannelId}`);
  } catch (err) {
    logger.error(`[ShowcaseLink] Erreur: ${err instanceof Error ? err.message : String(err)}`);
  }
}

export function startShowcaseLinkCron(client: Client): void {
  if (cronJob) {
    logger.warn("[ShowcaseLink] Déjà actif — ignoré");
    return;
  }

  const voiceChannelId = getVoiceChannelId();
  if (!voiceChannelId) {
    logger.info("[ShowcaseLink] Désactivé — GAME_RELEASE_VOICE_CHANNEL_ID non configuré");
    return;
  }

  cronJob = schedule(CRON_EXPR, () => {
    void postShowcaseLink(client).catch((err) =>
      logger.error(
        `[ShowcaseLink] Erreur cron: ${err instanceof Error ? err.message : String(err)}`,
      ),
    );
  });

  setTimeout(() => {
    void postShowcaseLink(client).catch(() => {});
  }, STARTUP_DELAY_MS);

  logger.info(
    `[ShowcaseLink] Cron démarré (${CRON_EXPR}) → ${getShowcaseUrl()} salon ${voiceChannelId}`,
  );
}

export function stopShowcaseLinkCron(): void {
  if (cronJob) {
    cronJob.stop();
    cronJob = null;
    logger.info("[ShowcaseLink] Cron arrêté");
  }
}

export function resetShowcaseLinkStateForTests(): void {
  lastMessageId = null;
  if (cronJob) {
    cronJob.stop();
    cronJob = null;
  }
}
