/**
 * idleCheckup.ts — Checkup automatique des utilisateurs inactifs
 *
 * Suit la dernière activité par utilisateur (userId → entrée mémoire).
 * À intervalle régulier, parcourt les entrées : si un utilisateur n'a pas
 * posté depuis `hoursThreshold` heures, on lui envoie un DM chaleureux
 * généré par l'IA (OpenRouter via le module `ai.ts`), puis on retire
 * l'entrée pour éviter le spam.
 *
 * Si le DM échoue (MP fermés, permissions, etc.), on enregistre
 * l'événement en debug et on retire tout de même l'entrée — le but est
 * de prendre des nouvelles, pas de harceler.
 */

import type { Client } from "discord.js";
import { config } from "../config.js";
import { getOpenAIClient } from "./ai.js";
import logger from "../utils/logger.js";

// ─── Types ────────────────────────────────────────────────────────

export interface IdleCheckupEntry {
  userId: string;
  lastMessageAt: Date;
  guildId: string;
}

/** Prompt système recommandé pour la prise de nouvelles — court et chaleureux. */
export const IDLE_CHECKUP_PROMPT =
  "Tu es un ami bienveillant qui prend des nouvelles après une période d'absence. Sois bref et chaleureux.";

// ─── Store en mémoire ─────────────────────────────────────────────
// Clé = userId. Une entry par utilisateur suffit : la dernière
// activité remplace la précédente même si elle vient d'un autre
// serveur (on assimile "inactif" à "inactif n'importe où"). Si on
// veut un suivi par serveur, il faudra basculer la clé sur
// `${guildId}:${userId}`.
const activityMap = new Map<string, IdleCheckupEntry>();

// ─── API publique ─────────────────────────────────────────────────

/**
 * Enregistre/met à jour le timestamp de dernière activité pour `userId`.
 * À appeler depuis le router de messages à chaque message utilisateur.
 */
export function updateActivity(userId: string, guildId: string): void {
  if (!userId) return;
  activityMap.set(userId, {
    userId,
    lastMessageAt: new Date(),
    guildId,
  });
}

/**
 * Parcourt les entrées et envoie un DM à toute personne inactive depuis
 * plus de `hoursThreshold` heures, puis la retire du store.
 *
 * - AI : OpenRouter (`config.openRouterModel`) via `getOpenAIClient()`.
 *   Max 100 tokens, temperature 0.7 — on veut du court et naturel.
 * - DM désactivé / permissions manquantes : on log en debug et on continue
 *   sans bloquer les autres utilisateurs.
 */
export async function checkIdleUsers(
  client: Client,
  hoursThreshold: number,
  systemPrompt: string = IDLE_CHECKUP_PROMPT,
): Promise<void> {
  if (!client) {
    logger.warn("[idleCheckup] Client Discord manquant — check annulé");
    return;
  }
  if (!Number.isFinite(hoursThreshold) || hoursThreshold <= 0) {
    logger.warn(
      `[idleCheckup] hoursThreshold invalide (${hoursThreshold}) — check annulé`,
    );
    return;
  }

  // Snapshot des clés pour itérer en sécurité pendant qu'on supprime.
  const userIds = Array.from(activityMap.keys());
  const cutoffMs = Date.now() - hoursThreshold * 60 * 60 * 1000;

  logger.info(
    `[idleCheckup] Vérification de ${userIds.length} utilisateur(s) — seuil ${hoursThreshold}h`,
  );

  for (const userId of userIds) {
    const entry = activityMap.get(userId);
    if (!entry) continue; // déjà retiré entre-temps
    if (entry.lastMessageAt.getTime() > cutoffMs) continue; // encore actif

    try {
      await sendCheckupDM(client, entry, systemPrompt);
    } catch (error) {
      // Tout passe ici pour n'arrêter la boucle sur aucun utilisateur.
      logger.error(
        `[idleCheckup] Échec checkup pour ${entry.userId} (${entry.guildId}): ${
          error instanceof Error ? error.message : String(error)
        }`,
      );
    } finally {
      // On retire dans tous les cas (succès ou échec) — l'utilisateur a
      // eu sa chance, on évite le spam aux itérations suivantes.
      activityMap.delete(userId);
    }
  }
}

/**
 * Inspection / debug : retourne le nombre d'utilisateurs actuellement
 * suivis. Utile pour un dashboard ou pour les tests.
 */
export function getTrackedUserCount(): number {
  return activityMap.size;
}

/** Réinitialise complètement le store (utile pour les tests). */
export function resetActivity(): void {
  activityMap.clear();
}

// ─── Helpers ──────────────────────────────────────────────────────

async function sendCheckupDM(
  client: Client,
  entry: IdleCheckupEntry,
  systemPrompt: string,
): Promise<void> {
  // Récupération de l'utilisateur. fetch() peut jeter si l'utilisateur
  // n'existe plus sur Discord — on capture pour classifier en "DM impossible"
  // et passer en mode silencieux.
  const user = await client.users.fetch(entry.userId).catch(() => null);
  if (!user) {
    logger.debug(
      `[idleCheckup] Utilisateur ${entry.userId} introuvable — check skippé`,
    );
    return;
  }
  if (user.bot) {
    logger.debug(`[idleCheckup] ${entry.userId} est un bot — check skippé`);
    return;
  }

  // Construction du prompt utilisateur : on laisse le modèle personnaliser
  // selon la durée d'absence (en heures, arrondi à 1 décimale).
  const idleHours = Math.max(
    0,
    (Date.now() - entry.lastMessageAt.getTime()) / (60 * 60 * 1000),
  );
  const userMessage = `L'utilisateur Discord <@${entry.userId}> (pseudo: ${user.username}) n'a pas donné signe de vie sur le serveur ${entry.guildId} depuis environ ${idleHours.toFixed(1)} heures. Prends de ses nouvelles en une ou deux phrases max.`;

  let reply: string;
  try {
    reply = await generateCheckupMessage(systemPrompt, userMessage);
  } catch (error) {
    // Échec IA → on log et on remonte l'erreur pour ne pas spammer une
    // entrée vouée à l'échec dans la boucle appelante.
    logger.error(
      `[idleCheckup] Échec génération IA pour ${entry.userId}: ${
        error instanceof Error ? error.message : String(error)
      }`,
    );
    throw error;
  }

  // Envoi du DM. La lib discord.js jette DiscordAPIError si les MP sont
  // fermés ; on capture, on log en debug et on sort proprement.
  try {
    await user.send(reply);
    logger.info(
      `[idleCheckup] DM envoyé à ${user.tag} (inactif depuis ${idleHours.toFixed(1)}h)`,
    );
  } catch (error) {
    logger.debug(
      `[idleCheckup] DM non délivré à ${entry.userId} (MP fermés ?): ${
        error instanceof Error ? error.message : String(error)
      }`,
    );
  }
}

async function generateCheckupMessage(
  systemPrompt: string,
  userMessage: string,
): Promise<string> {
  const client = getOpenAIClient();
  const completion = await client.chat.completions.create({
    model: config.openRouterModel,
    messages: [
      { role: "system", content: systemPrompt },
      { role: "user", content: userMessage },
    ],
    max_tokens: 100,
    temperature: 0.7,
  });
  const content = completion.choices[0]?.message?.content;
  if (!content || content.trim().length === 0) {
    throw new Error("Réponse IA vide");
  }
  return content.trim();
}
