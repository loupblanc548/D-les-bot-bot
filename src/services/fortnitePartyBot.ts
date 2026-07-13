/**
 * fortnitePartyBot.ts — Fortnite Party Bot via fnbr.js
 *
 * Connecte un compte Fortnite au bot Discord. Le compte peut:
 * - Accepter automatiquement les demandes d'amis
 * - Rejoindre automatiquement les invitations de groupe (party)
 * - Changer de skin, emote, backbling, pickaxe via commandes slash Discord
 *
 * Auth: obtenir un code d'autorisation sur
 * https://www.epicgames.com/id/api/redirect?clientId=3446cd72694c4a4485d81b77adbb2141&responseType=code
 * Puis le mettre dans FORTNITE_AUTH_CODE du .env
 */

import { config } from "../config.js";
import logger from "../utils/logger.js";

// Type minimal pour fnbr Client (le package n'a pas de types TS officiels complets)
interface FnbrClient {
  login: (authCode?: string) => Promise<void>;
  on: (event: string, listener: (...args: unknown[]) => void) => void;
  party: {
    me: {
      setOutfit: (path: string) => Promise<void>;
      setEmote: (path: string) => Promise<void>;
      setBackpack: (path: string) => Promise<void>;
      setPickaxe: (path: string) => Promise<void>;
      clearEmote: () => Promise<void>;
      ready: (isReady: boolean) => Promise<void>;
      setLevel: (level: number) => Promise<void>;
    };
  };
  user?: {
    self?: {
      displayName?: string;
    };
  };
}

let fnbrClient: FnbrClient | null = null;
let isConnected = false;

/**
 * Configure les event handlers sur le client fnbr.
 */
function setupClientEvents(client: FnbrClient): void {
  client.on("ready", () => {
    const name = client.user?.self?.displayName || "inconnu";
    logger.info(`[FortniteBot] Connecté en tant que ${name}`);
    isConnected = true;
  });

  // Accepter automatiquement les demandes d'amis
  client.on("friend:request", (request: unknown) => {
    const r = request as { accept?: () => Promise<void>; id?: string };
    logger.info(`[FortniteBot] Demande d'ami reçue de ${r.id || "?"}`);
    if (r.accept) {
      r.accept().catch((err) => {
        logger.warn(`[FortniteBot] Erreur acceptation ami: ${err}`);
      });
    }
  });

  // Accepter automatiquement les invitations de party
  client.on("party:invite", (invitation: unknown) => {
    const inv = invitation as { accept?: () => Promise<void>; sender?: { displayName?: string } };
    const senderName = inv.sender?.displayName || "?";
    logger.info(`[FortniteBot] Invitation de party reçue de ${senderName}`);
    if (inv.accept) {
      inv.accept().catch((err) => {
        logger.warn(`[FortniteBot] Erreur acceptation party: ${err}`);
      });
    }
  });
}

/**
 * Démarre le client Fortnite Party Bot au démarrage du bot.
 * Utilise FORTNITE_AUTH_CODE du .env si configuré.
 */
export async function startFortnitePartyBot(): Promise<void> {
  if (!config.fortniteAuthCode) {
    logger.info(
      "[FortniteBot] FORTNITE_AUTH_CODE non configuré — party bot désactivé (utilisez /game bot-login)",
    );
    return;
  }

  await connectFortniteBot(config.fortniteAuthCode);
}

/**
 * Connecte le bot Fortnite avec un code d'autorisation fourni à la volée.
 * Peut être appelé depuis une commande slash Discord (/game bot-login).
 * @param authCode — Code d'autorisation Epic Games
 * @returns true si la connexion a réussi
 */
export async function connectFortniteBot(authCode: string): Promise<boolean> {
  if (!authCode || authCode.trim().length < 10) {
    throw new Error("Code d'autorisation invalide (trop court)");
  }

  // Déconnecter l'ancien client si existant
  if (fnbrClient) {
    isConnected = false;
    fnbrClient = null;
  }

  try {
    const { Client } = await import("fnbr");
    fnbrClient = new Client() as unknown as FnbrClient;
    setupClientEvents(fnbrClient);
    await fnbrClient.login(authCode.trim());
    logger.info("[FortniteBot] Connexion en cours...");
    return true;
  } catch (err) {
    logger.error(
      `[FortniteBot] Échec de connexion: ${err instanceof Error ? err.message : String(err)}`,
    );
    fnbrClient = null;
    isConnected = false;
    throw err;
  }
}

/**
 * Déconnecte le bot Fortnite.
 */
export async function disconnectFortniteBot(): Promise<void> {
  isConnected = false;
  fnbrClient = null;
  logger.info("[FortniteBot] Déconnecté");
}

/**
 * Retourne true si le party bot est connecté et en party.
 */
export function isFortniteBotReady(): boolean {
  return isConnected && fnbrClient !== null;
}

/**
 * Retourne le nom d'affichage du compte Fortnite connecté, ou null.
 */
export function getBotDisplayName(): string | null {
  if (!fnbrClient || !isConnected) return null;
  return fnbrClient.user?.self?.displayName || null;
}

/**
 * Construit le chemin d'un cosmetic Fortnite pour fnbr.js.
 * Format: /Game/Athena/Items/Cosmetics/{Type}/{ID}.{ID}
 */
function buildCosmeticPath(
  type: "Characters" | "Dances" | "Backpacks" | "Pickaxes",
  id: string,
): string {
  return `/Game/Athena/Items/Cosmetics/${type}/${id}.${id}`;
}

/**
 * Change le skin (outfit) du bot.
 * @param cosmeticId — CID du cosmetic (ex: CID_001_Athena_Commando_F_Default)
 */
export async function setBotSkin(cosmeticId: string): Promise<void> {
  if (!fnbrClient || !isConnected) {
    throw new Error("Le bot Fortnite n'est pas connecté");
  }
  const path = buildCosmeticPath("Characters", cosmeticId);
  await fnbrClient.party.me.setOutfit(path);
  logger.info(`[FortniteBot] Skin changé: ${cosmeticId}`);
}

/**
 * Change l'emote (danse) du bot.
 * @param cosmeticId — EID de l'emote (ex: EID_Wave)
 */
export async function setBotEmote(cosmeticId: string): Promise<void> {
  if (!fnbrClient || !isConnected) {
    throw new Error("Le bot Fortnite n'est pas connecté");
  }
  const path = buildCosmeticPath("Dances", cosmeticId);
  await fnbrClient.party.me.setEmote(path);
  logger.info(`[FortniteBot] Emote changée: ${cosmeticId}`);
}

/**
 * Change le backbling du bot.
 * @param cosmeticId — BID du backbling
 */
export async function setBotBackbling(cosmeticId: string): Promise<void> {
  if (!fnbrClient || !isConnected) {
    throw new Error("Le bot Fortnite n'est pas connecté");
  }
  const path = buildCosmeticPath("Backpacks", cosmeticId);
  await fnbrClient.party.me.setBackpack(path);
  logger.info(`[FortniteBot] Backbling changé: ${cosmeticId}`);
}

/**
 * Change le pickaxe du bot.
 * @param cosmeticId — PICKAXE_ID du pickaxe
 */
export async function setBotPickaxe(cosmeticId: string): Promise<void> {
  if (!fnbrClient || !isConnected) {
    throw new Error("Le bot Fortnite n'est pas connecté");
  }
  const path = buildCosmeticPath("Pickaxes", cosmeticId);
  await fnbrClient.party.me.setPickaxe(path);
  logger.info(`[FortniteBot] Pickaxe changé: ${cosmeticId}`);
}

/**
 * Arrête l'emote en cours.
 */
export async function clearBotEmote(): Promise<void> {
  if (!fnbrClient || !isConnected) {
    throw new Error("Le bot Fortnite n'est pas connecté");
  }
  await fnbrClient.party.me.clearEmote();
  logger.info("[FortniteBot] Emote arrêtée");
}

/**
 * Définit le niveau du bot.
 */
export async function setBotLevel(level: number): Promise<void> {
  if (!fnbrClient || !isConnected) {
    throw new Error("Le bot Fortnite n'est pas connecté");
  }
  await fnbrClient.party.me.setLevel(Math.min(level, 2147483647));
  logger.info(`[FortniteBot] Niveau défini: ${level}`);
}

/**
 * Ready/unready le bot.
 */
export async function setBotReady(ready: boolean): Promise<void> {
  if (!fnbrClient || !isConnected) {
    throw new Error("Le bot Fortnite n'est pas connecté");
  }
  await fnbrClient.party.me.ready(ready);
  logger.info(`[FortniteBot] Ready: ${ready}`);
}
