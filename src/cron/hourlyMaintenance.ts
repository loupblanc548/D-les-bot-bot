import cron from "node-cron";
import { Client, EmbedBuilder, TextChannel, ChannelType, DMChannel } from "discord.js";
import prisma from "../prisma.js";
import logger from "../utils/logger.js";
import { config } from "../config.js";
import { isNotificationsSilenced } from "../utils/persistentCooldown.js";

const FOOTER = { text: "Maintenance Bi-hebdomadaire • Iskan Auto-Clean" };
const MESSAGE_RETENTION_DAYS = 14; // Supprimer les anciens rapports après 2 semaines

// Lock anti-concurrence
let isRunning = false;

// Nettoie les anciens enregistrements NotifiedMessage (> 7 jours)
async function cleanupOldNotifiedMessages(): Promise<number> {
  const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
  const result = await prisma.notifiedMessage.deleteMany({
    where: { sentAt: { lt: sevenDaysAgo } },
  });
  return result.count;
}

// Fait quitter tous les salons vocaux au bot
async function leaveAllVoiceChannels(client: Client): Promise<number> {
  let leftCount = 0;
  for (const guild of client.guilds.cache.values()) {
    const me = guild.members.me;
    if (!me?.voice.channelId) continue;
    try {
      await me.voice.disconnect("Maintenance horaire automatique");
      leftCount++;
      logger.info(
        `[BiWeeklyMaint] Quitté le salon vocal ${me.voice.channel?.name} (${guild.name})`,
      );
    } catch (err) {
      logger.error(`[BiWeeklyMaint] Erreur déconnexion vocale ${guild.name}:`, String(err));
    }
  }
  return leftCount;
}

// Supprime les messages dupliqués dans les salons textuels
// Détecte les doublons par contenu identique dans les 50 derniers messages
async function deleteDuplicateMessages(
  client: Client,
): Promise<{ channel: string; deleted: number }> {
  let totalDeleted = 0;
  let channelsScanned = 0;

  for (const guild of client.guilds.cache.values()) {
    const channels = guild.channels.cache.filter(
      (c) => c.type === ChannelType.GuildText && c.viewable,
    );

    for (const channel of channels.values()) {
      const textChannel = channel as TextChannel;
      try {
        // Récupère les 50 derniers messages
        const messages = await textChannel.messages.fetch({ limit: 50 });
        if (messages.size < 2) continue;
        channelsScanned++;

        // Grouper par contenu (hors bot commands et embeds vides)
        const seenContent = new Map<string, string>(); // content -> first messageId
        const toDelete: string[] = [];

        // Trier par date (plus récent en dernier)
        const sorted = [...messages.values()].sort(
          (a, b) => a.createdTimestamp - b.createdTimestamp,
        );

        for (const msg of sorted) {
          // Ignorer les messages non-texte, vides, ou des autres bots
          if (!msg.content || msg.content.trim().length === 0) continue;
          if (msg.author.bot && msg.author.id !== client.user?.id) continue;

          // Normaliser le contenu (enlever whitespace, lowercase)
          const normalized = msg.content.trim().toLowerCase().replace(/\s+/g, " ");

          // Ignorer les messages trop courts (< 10 chars) pour éviter les faux positifs
          if (normalized.length < 10) continue;

          if (seenContent.has(normalized)) {
            // Doublon détecté — supprimer le message le plus récent
            toDelete.push(msg.id);
            // Enregistrer dans NotifiedMessage pour tracer
            await prisma.notifiedMessage
              .upsert({
                where: {
                  messageId_channelOrDm: {
                    messageId: msg.id,
                    channelOrDm: textChannel.id,
                  },
                },
                update: {},
                create: {
                  messageId: msg.id,
                  channelOrDm: textChannel.id,
                  content: `DUPLICATE_DELETED: ${normalized.slice(0, 200)}`,
                },
              })
              .catch(() => {});
          } else {
            seenContent.set(normalized, msg.id);
          }
        }

        // Supprimer les doublons (bulk delete si < 14 jours, sinon un par un)
        if (toDelete.length > 0) {
          const recentMsgs = toDelete.filter((id) => {
            const m = messages.get(id);
            return m && Date.now() - m.createdTimestamp < 14 * 24 * 60 * 60 * 1000;
          });

          if (recentMsgs.length > 1) {
            await textChannel.bulkDelete(recentMsgs).catch((err) => {
              logger.error(`[BiWeeklyMaint] Erreur bulkDelete ${textChannel.name}:`, String(err));
            });
            totalDeleted += recentMsgs.length;
          } else {
            for (const id of recentMsgs) {
              const msg = messages.get(id);
              if (msg) {
                await msg.delete().catch(() => {});
                totalDeleted++;
              }
            }
          }
          // Messages > 14 jours : suppression individuelle
          const oldMsgs = toDelete.filter((id) => !recentMsgs.includes(id));
          for (const id of oldMsgs) {
            const msg = messages.get(id);
            if (msg) {
              await msg.delete().catch(() => {});
              totalDeleted++;
            }
          }
        }
      } catch (err) {
        logger.error(`[BiWeeklyMaint] Erreur scan ${textChannel.name}:`, String(err));
      }
    }
  }

  return { channel: String(channelsScanned), deleted: totalDeleted };
}

// Supprime les messages du bot contenant certains mots-clés et plus anciens que N jours
// Fonctionne sur les DMs et les salons textuels
async function deleteOldBotMessages(
  channel: TextChannel | DMChannel,
  retentionDays: number,
  titleKeywords: string[],
): Promise<void> {
  try {
    const cutoff = Date.now() - retentionDays * 24 * 60 * 60 * 1000;
    const messages = await channel.messages.fetch({ limit: 100 });
    const toDelete = messages.filter((msg) => {
      if (!msg.author.bot) return false;
      if (msg.createdTimestamp > cutoff) return false;
      const hasKeyword = msg.embeds.some(
        (e) => e.data.title && titleKeywords.some((kw) => e.data.title?.includes(kw)),
      );
      return hasKeyword;
    });

    if (toDelete.size === 0) return;

    // bulkDelete fonctionne pour < 14 jours, sinon suppression individuelle
    const recent = toDelete.filter(
      (m) => Date.now() - m.createdTimestamp < 14 * 24 * 60 * 60 * 1000,
    );
    const old = toDelete.filter((m) => Date.now() - m.createdTimestamp >= 14 * 24 * 60 * 60 * 1000);

    if (channel instanceof TextChannel && recent.size > 1) {
      await channel.bulkDelete(recent).catch(() => {});
    } else {
      for (const msg of recent.values()) {
        await msg.delete().catch(() => {});
      }
    }
    for (const msg of old.values()) {
      await msg.delete().catch(() => {});
    }

    logger.info(
      `[BiWeeklyMaint] ${toDelete.size} ancien(s) rapport(s) supprimé(s) (${channel instanceof DMChannel ? "DM" : `#${(channel as TextChannel).name}`})`,
    );
  } catch (err) {
    logger.debug(
      `[BiWeeklyMaint] Erreur suppression anciens messages: ${err instanceof Error ? err.message : String(err)}`,
    );
  }
}

// Envoie un rapport Discord UNIQUEMENT si une action a été effectuée.
// Si tout est à 0 (rien à signaler), log local uniquement — pas de spam Discord.
async function sendReport(
  client: Client,
  voiceLeft: number,
  duplicates: { channel: string; deleted: number },
  oldNotifsCleaned: number,
): Promise<void> {
  const hasAction = voiceLeft > 0 || duplicates.deleted > 0 || oldNotifsCleaned > 0;

  // Log local dans tous les cas
  logger.info(
    `[BiWeeklyMaint] Rapport — voix: ${voiceLeft}, doublons: ${duplicates.deleted} (${duplicates.channel} salons), notifs: ${oldNotifsCleaned}` +
      (hasAction ? "" : " — tout OK, pas d'alerte Discord"),
  );

  // Pas d'action = pas de spam Discord
  if (!hasAction) return;

  const embed = new EmbedBuilder()
    .setTitle("🧹 Maintenance Bi-hebdomadaire — Rapport")
    .setColor(0x3498db)
    .setFooter(FOOTER)
    .setTimestamp()
    .addFields(
      {
        name: "🎤 Salons vocaux quittés",
        value: `**${voiceLeft}** salon(s)`,
        inline: true,
      },
      {
        name: "📋 Salons textuels scannés",
        value: `**${duplicates.channel}** salon(s)`,
        inline: true,
      },
      {
        name: "🗑️ Doublons supprimés",
        value: `**${duplicates.deleted}** message(s)`,
        inline: true,
      },
      {
        name: "🗂️ Anciens enregistrements nettoyés",
        value: `**${oldNotifsCleaned}** entrée(s) > 7j`,
        inline: true,
      },
    );

  // DM à l'owner — nettoyer les anciens puis envoyer
  if (config.ownerId && !isNotificationsSilenced()) {
    const owner = await client.users.fetch(config.ownerId).catch(() => null);
    if (owner) {
      await deleteOldBotMessages(
        owner.dmChannel ?? (await owner.createDM()),
        MESSAGE_RETENTION_DAYS,
        ["Maintenance", "Bot Health Check"],
      );
      await owner.send({ embeds: [embed] }).catch(() => {
        logger.warn("[BiWeeklyMaint] Impossible de DM l'owner");
      });
    }
  }

  // Salon de log — nettoyer les anciens puis envoyer
  if (config.logChannel) {
    const logChannel = await client.channels.fetch(config.logChannel).catch(() => null);
    if (logChannel && logChannel.type === ChannelType.GuildText) {
      await deleteOldBotMessages(logChannel as TextChannel, MESSAGE_RETENTION_DAYS, [
        "Maintenance",
        "Bot Health Check",
      ]);
      await (logChannel as TextChannel).send({ embeds: [embed] }).catch(() => {
        logger.warn("[BiWeeklyMaint] Impossible d'envoyer dans le salon de log");
      });
    }
  }
}

async function runHourlyMaintenance(client: Client): Promise<void> {
  if (isRunning) {
    logger.warn("[BiWeeklyMaint] Déjà en cours, skip");
    return;
  }
  isRunning = true;
  logger.info("[BiWeeklyMaint] Démarrage de la maintenance bi-hebdomadaire...");

  try {
    // 1. Nettoyer les anciens enregistrements NotifiedMessage
    const oldNotifsCleaned = await cleanupOldNotifiedMessages();
    logger.info(`[BiWeeklyMaint] ${oldNotifsCleaned} anciens enregistrements nettoyés`);

    // 2. Quitter tous les salons vocaux
    const voiceLeft = await leaveAllVoiceChannels(client);
    logger.info(`[BiWeeklyMaint] ${voiceLeft} salon(s) vocal(aux) quitté(s)`);

    // 3. Supprimer les doublons dans les salons textuels
    const duplicates = await deleteDuplicateMessages(client);
    logger.info(
      `[BiWeeklyMaint] ${duplicates.channel} salons scannés, ${duplicates.deleted} doublons supprimés`,
    );

    // 4. Envoyer le rapport (DM owner + salon de log)
    await sendReport(client, voiceLeft, duplicates, oldNotifsCleaned);

    logger.info("[BiWeeklyMaint] Maintenance bi-hebdomadaire terminée");
  } catch (err) {
    logger.error("[BiWeeklyMaint] Erreur:", String(err));
  } finally {
    isRunning = false;
  }
}

export function startHourlyMaintenance(client: Client): void {
  // Les 1er et 15 du mois à 4h00 — toutes les 2 semaines
  cron.schedule("0 4 1,15 * *", () => {
    void runHourlyMaintenance(client);
  });

  logger.info("[BiWeeklyMaint] Cron maintenance démarré (1er et 15 du mois à 04:00)");
}
