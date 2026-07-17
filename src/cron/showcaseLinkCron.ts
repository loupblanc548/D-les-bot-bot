/**
 * showcaseLinkCron.ts — Poste le lien du showcase chaque jour à midi
 * dans le salon vocal, en supprimant l'ancien message.
 */

import { schedule, ScheduledTask } from "node-cron";
import { ChannelType, EmbedBuilder } from "discord.js";
import type { Client } from "discord.js";
import logger from "../utils/logger.js";

const VOICE_CHANNEL_ID = process.env.GAME_RELEASE_VOICE_CHANNEL_ID || "";
const VPS_HOST = process.env.VPS_PUBLIC_HOST || "31.220.79.90";
const HEALTH_PORT = process.env.HEALTH_PORT || "3000";
const SHOWCASE_URL = `http://${VPS_HOST}:${HEALTH_PORT}/releases/showcase`;

let cronJob: ScheduledTask | null = null;
let lastMessageId: string | null = null;

async function postShowcaseLink(client: Client): Promise<void> {
  if (!VOICE_CHANNEL_ID) return;

  try {
    const channel = await client.channels.fetch(VOICE_CHANNEL_ID);
    if (!channel || channel.type !== ChannelType.GuildText) {
      // Voice channels can have text too
      if (!channel) {
        logger.warn(`[ShowcaseLink] Salon ${VOICE_CHANNEL_ID} introuvable`);
        return;
      }
    }

    // Delete previous message if exists
    if (lastMessageId) {
      try {
        const oldMsg = await (channel as any).messages?.fetch(lastMessageId);
        if (oldMsg) await oldMsg.delete();
        logger.debug("[ShowcaseLink] Ancien message supprimé");
      } catch {
        // Message already deleted or not found
      }
    }

    const embed = new EmbedBuilder()
      .setTitle("🎮 Sorties à venir — Showcase en direct")
      .setDescription(
        `**Regardez le showcase en temps réel :**\n` +
          `>>> ${SHOWCASE_URL}\n\n` +
          `📅 Mise à jour quotidienne • Compte à rebours en direct\n` +
          `🔥 Jeux imminents mis en évidence en or`,
      )
      .setColor(0x5865f2)
      .setThumbnail(
        "https://external-content.duckduckgo.com/iu/?u=https%3A%2F%2Fimages.wallpapersden.com%2Fimage%2Fdownload%2Fhelldivers-2-super-citizen_bmdoa2yUmZqaraWkpJRmbmdlrWZlbWU.jpg&f=1&nofb=1",
      )
      .setFooter({
        text: `Bot #6851 • Lien quotidien • ${new Date().toLocaleDateString("fr-FR")}`,
      })
      .setTimestamp();

    const sent = await (channel as any).send({ embeds: [embed] });
    lastMessageId = sent.id;
    logger.info(`[ShowcaseLink] Lien showcase posté dans ${VOICE_CHANNEL_ID}`);
  } catch (err) {
    logger.error(
      `[ShowcaseLink] Erreur: ${err instanceof Error ? err.message : String(err)}`,
    );
  }
}

export function startShowcaseLinkCron(client: Client): void {
  if (cronJob) {
    logger.warn("[ShowcaseLink] Déjà actif — ignoré");
    return;
  }

  if (!VOICE_CHANNEL_ID) {
    logger.info("[ShowcaseLink] Désactivé — GAME_RELEASE_VOICE_CHANNEL_ID non configuré");
    return;
  }

  // Post every day at noon (12:00)
  cronJob = schedule("0 12 * * *", () => {
    void postShowcaseLink(client).catch((err) =>
      logger.error(`[ShowcaseLink] Erreur cron: ${err instanceof Error ? err.message : String(err)}`),
    );
  });

  // Post once on startup (after 60s delay to let bot connect)
  setTimeout(() => {
    void postShowcaseLink(client).catch(() => {});
  }, 60_000);

  logger.info(`[ShowcaseLink] Cron démarré — lien quotidien à 12:00 → ${SHOWCASE_URL}`);
}

export function stopShowcaseLinkCron(): void {
  if (cronJob) {
    cronJob.stop();
    cronJob = null;
    logger.info("[ShowcaseLink] Cron arrêté");
  }
}
