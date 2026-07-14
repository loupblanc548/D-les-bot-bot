/**
 * dmCleanup.ts — Purge automatique des messages du bot en DM et log channel
 *
 * Au démarrage, supprime tous les messages du bot (embeds de statut, alertes,
 * notifications de redémarrage) datant de plus de 7 jours dans :
 *  - Le DM avec l'owner
 *  - Le channel de logs (config.logChannel)
 *
 * Ensuite, un cron hebdomadaire relance la purge.
 */

import { Client, TextChannel, DMChannel } from "discord.js";
import logger from "../utils/logger.js";
import { config } from "../config.js";

const PURGE_AGE_MS = 7 * 24 * 60 * 60 * 1000; // 7 jours
const PURGE_BATCH_SIZE = 50; // Discord limite 100 messages par bulkDelete, on fait 50 par safety
const WEEKLY_INTERVAL_MS = 7 * 24 * 60 * 60 * 1000;

let purgeInterval: ReturnType<typeof setInterval> | null = null;

/**
 * Purge les messages du bot dans un channel donné (DM ou textuel).
 * Ne supprime que les messages du bot datant de plus de PURGE_AGE_MS.
 */
async function purgeBotMessages(
  channel: DMChannel | TextChannel,
  channelName: string,
): Promise<number> {
  let deletedCount = 0;
  const cutoff = Date.now() - PURGE_AGE_MS;

  try {
    // Discord ne permet bulkDelete que sur les messages < 14 jours
    // Pour les messages > 14 jours, il faut delete un par un
    let lastId: string | undefined;
    let hasMore = true;

    while (hasMore) {
      const messages = await channel.messages.fetch({
        limit: PURGE_BATCH_SIZE,
        before: lastId,
      });

      if (messages.size === 0) {
        hasMore = false;
        break;
      }

      const toDelete = messages.filter(
        (msg) =>
          msg.author.id === config.clientId && // Seulement les messages du bot
          msg.createdTimestamp < cutoff,
      );

      if (toDelete.size === 0) {
        // Si le message le plus vieux est plus récent que le cutoff, on arrête
        const oldest = messages.last();
        if (oldest && oldest.createdTimestamp >= cutoff) {
          hasMore = false;
          break;
        }
        lastId = messages.last()?.id;
        continue;
      }

      // Pour les DMs, bulkDelete n'est pas disponible — on delete un par un
      if (channel instanceof DMChannel) {
        for (const msg of toDelete.values()) {
          try {
            await msg.delete();
            deletedCount++;
          } catch {
            // Message peut déjà être supprimé
          }
        }
      } else {
        // Pour les text channels, essayer bulkDelete si tous < 14 jours
        const allYoung = [...toDelete.values()].every(
          (m) => Date.now() - m.createdTimestamp < 14 * 24 * 60 * 60 * 1000,
        );

        if (allYoung && toDelete.size >= 2) {
          try {
            await channel.bulkDelete(toDelete);
            deletedCount += toDelete.size;
          } catch {
            // Fallback: delete un par un
            for (const msg of toDelete.values()) {
              try {
                await msg.delete();
                deletedCount++;
              } catch {
                // ignore
              }
            }
          }
        } else {
          for (const msg of toDelete.values()) {
            try {
              await msg.delete();
              deletedCount++;
            } catch {
              // ignore
            }
          }
        }
      }

      lastId = messages.last()?.id;

      // Si le plus vieux message de ce batch est plus récent que le cutoff, on arrête
      const oldest = messages.last();
      if (oldest && oldest.createdTimestamp >= cutoff) {
        hasMore = false;
      }

      // Petit délai pour éviter le rate limiting
      await new Promise((resolve) => setTimeout(resolve, 500));
    }

    if (deletedCount > 0) {
      logger.info(`[DMCleanup] ${deletedCount} message(s) supprimé(s) dans ${channelName}`);
    }
  } catch (err) {
    logger.error(
      `[DMCleanup] Erreur purge ${channelName}: ${err instanceof Error ? err.message : String(err)}`,
    );
  }

  return deletedCount;
}

/**
 * Lance la purge complète : DM owner + log channel.
 */
export async function runDmCleanup(client: Client): Promise<void> {
  let totalDeleted = 0;

  // 1. Purge DM owner
  if (config.ownerId) {
    try {
      const owner = await client.users.fetch(config.ownerId);
      const dmChannel = await owner.createDM();
      totalDeleted += await purgeBotMessages(dmChannel, "DM owner");
    } catch (err) {
      logger.warn(
        `[DMCleanup] Impossible d'accéder au DM owner: ${err instanceof Error ? err.message : String(err)}`,
      );
    }
  }

  // 2. Purge log channel
  if (config.logChannel) {
    try {
      const logChannel = client.channels.cache.get(config.logChannel);
      if (logChannel && logChannel.isTextBased() && !(logChannel instanceof DMChannel)) {
        totalDeleted += await purgeBotMessages(logChannel as TextChannel, "log channel");
      }
    } catch (err) {
      logger.warn(
        `[DMCleanup] Impossible d'accéder au log channel: ${err instanceof Error ? err.message : String(err)}`,
      );
    }
  }

  if (totalDeleted > 0) {
    logger.info(`[DMCleanup] Purge terminée: ${totalDeleted} message(s) au total`);
    // Pas de DM de notification — le nettoyage doit être silencieux
  }
}

/**
 * Démarre le cron de purge hebdomadaire + purge initiale au démarrage.
 */
export function startDmCleanup(client: Client): void {
  // Purge initiale après 10s (le temps que le client soit prêt)
  setTimeout(() => {
    void runDmCleanup(client).catch((err) =>
      logger.error(`[DMCleanup] Erreur purge initiale: ${err}`),
    );
  }, 10_000);

  // Cron hebdomadaire
  purgeInterval = setInterval(() => {
    void runDmCleanup(client).catch((err) =>
      logger.error(`[DMCleanup] Erreur purge hebdomadaire: ${err}`),
    );
  }, WEEKLY_INTERVAL_MS);

  if (purgeInterval.unref) purgeInterval.unref();
  logger.info("[DMCleanup] Service de purge démarré (initial + hebdomadaire)");
}

/**
 * Arrête le cron de purge.
 */
export function stopDmCleanup(): void {
  if (purgeInterval) {
    clearInterval(purgeInterval);
    purgeInterval = null;
  }
}
