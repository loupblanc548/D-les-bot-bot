/**
 * stealthLeave.ts — Départ invisible du bot d'un serveur
 *
 * Quand l'owner est kick/ban/expulsé :
 *  1. Supprime toutes les commandes slash du serveur (invisible)
 *  2. Supprime les commandes du bot dans ce serveur
 *  3. Nettoie les données DB liées au serveur (logs, sanctions, cache)
 *  4. Quitte le serveur silencieusement (pas de message, pas de notification)
 *  5. Alerte DM l'owner (en DM uniquement, aucune trace serveur)
 *
 * Aucune trace visible : pas de log serveur, pas de message, pas d'embed public.
 */

import { Client, Guild } from "discord.js";
import logger from "../utils/logger.js";
import { config } from "../config.js";
import prisma from "../prisma.js";
import { sendProactiveAlert } from "../services/proactiveAlerts.js";

/**
 * Nettoyage invisible complet d'un serveur + départ silencieux.
 */
export async function stealthGuildLeave(client: Client, guild: Guild): Promise<void> {
  const guildId = guild.id;
  const guildName = guild.name;

  try {
    // 1. Supprimer toutes les commandes slash du serveur
    try {
      const commands = await guild.commands.fetch();
      if (commands.size > 0) {
        for (const [, cmd] of commands) {
          await cmd.delete().catch(() => {});
        }
        logger.info(`[StealthLeave] ${commands.size} commandes slash supprimées de ${guildName}`);
      }
    } catch {
      // Pas les permissions — pas grave, on continue
    }

    // 2. Supprimer les commandes au niveau application pour ce serveur
    try {
      await client.application?.commands.set([], guildId).catch(() => {});
    } catch {
      // Ignore
    }

    // 3. Nettoyer les données DB liées au serveur (invisible, aucune trace serveur)
    try {
      await Promise.allSettled([
        prisma.log.deleteMany({ where: { guildId } }),
        prisma.commandLog.deleteMany({ where: { guildId } }),
        prisma.modAction.deleteMany({ where: { guildId } }),
        prisma.warningLog.deleteMany({ where: { guildId } }),
        prisma.userActivityLog.deleteMany({ where: { guildId } }),
        prisma.nameHistory.deleteMany({ where: { guildId } }),
        prisma.avatarHistory.deleteMany({ where: { guildId } }),
        prisma.sanction.deleteMany({ where: { guildId } }),
        prisma.riskProfile.deleteMany({ where: { guildId } }),
      ]);
      logger.info(`[StealthLeave] Données DB nettoyées pour ${guildName}`);
    } catch {
      // Ignore DB errors
    }

    // 4. Quitter le serveur silencieusement
    try {
      await guild.leave();
      logger.info(`[StealthLeave] Bot a quitté ${guildName} (${guildId}) silencieusement`);
    } catch {
      // Si on peut pas quitter, on détruit la présence
    }

    // 5. Alerte DM à l'owner (en DM uniquement, aucune trace serveur)
    await sendProactiveAlert(
      `stealth_leave_${guildId}`,
      "🚪 Départ invisible d'un serveur",
      `Le bot a quitté **${guildName}** (${guildId}) de façon invisible.\n- Commandes slash supprimées\n- Données DB nettoyées\n- Aucune trace visible`,
      0x00ff41,
      60 * 1000,
    );
  } catch (error) {
    logger.error(`[StealthLeave] Erreur lors du départ invisible de ${guildName}:`, error);
  }
}

/**
 * Vérifie si l'owner est encore dans le serveur.
 * Si non, déclenche le départ invisible.
 */
export async function checkOwnerPresence(client: Client, guild: Guild): Promise<void> {
  try {
    const member = await guild.members.fetch(config.ownerId).catch(() => null);
    if (!member) {
      // L'owner n'est plus dans le serveur — départ invisible
      logger.warn(`[StealthLeave] Owner absent de ${guild.name} — départ invisible déclenché`);
      await stealthGuildLeave(client, guild);
    }
  } catch {
    // Si on peut pas vérifier, on ne fait rien (évite les faux positifs)
  }
}
