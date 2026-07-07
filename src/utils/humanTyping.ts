/**
 * humanTyping.ts — Simule le temps de frappe d'un humain sur Discord.
 *
 * Maintient l'indicateur "est en train d'écrire..." pendant une durée
 * réaliste basée sur la longueur du message de l'utilisateur et de la réponse.
 */

import type { TextChannel } from "discord.js";

/**
 * Calcule un temps de frappe réaliste en ms.
 * - Minimum 1.5s (même pour un message court)
 * - Maximum 8s (même pour un long message)
 * - Basé sur la longueur du message utilisateur + un peu d'aléatoire
 */
function calculateTypingDelay(userMessageLength: number): number {
  const baseDelay = 1500; // 1.5s minimum
  const charsPerSecond = 80; // vitesse de frappe moyenne
  const calculated = (userMessageLength / charsPerSecond) * 1000;
  const jitter = Math.random() * 1500; // 0-1.5s d'aléatoire
  return Math.min(baseDelay + calculated + jitter, 8000);
}

/**
 * Maintient l'indicateur "est en train d'écrire..." pendant un temps réaliste.
 * Discord fait expirer l'indicateur après ~10s, donc on le refresh.
 *
 * @param channel Le salon Discord
 * @param userMessageLength Longueur du message de l'utilisateur (pour calculer le délai)
 */
export async function simulateHumanTyping(
  channel: TextChannel,
  userMessageLength: number,
): Promise<void> {
  const delay = calculateTypingDelay(userMessageLength);

  // Premier typing immédiat
  await channel.sendTyping();

  // Si le délai est court (< 5s), on attend juste
  if (delay < 5000) {
    await sleep(delay);
    return;
  }

  // Si le délai est long, on refresh le typing toutes les 5s
  const intervals = Math.ceil(delay / 5000);
  for (let i = 0; i < intervals; i++) {
    await sleep(Math.min(5000, delay - i * 5000));
    try {
      await channel.sendTyping();
    } catch {
      // Channel potentiellement supprimé, on ignore
    }
  }
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
