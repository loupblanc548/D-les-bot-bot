/**
 * fortnite-broadcast.ts — Module partagé pour la diffusion Fortnite
 *
 * Contient l'état Fortnite, les fonctions de broadcast WebSocket,
 * et les helpers de détection. Importé par control-server.ts,
 * fortnite-api.ts, et twitterCron.ts sans dépendance circulaire.
 */

import { WebSocket } from "ws";

// ─── Types ────────────────────────────────────────────────────────────────

export interface FortniteUpdatePayload {
  type: 'fortnite-update';
  tweets: number;
  news: number;
  skins: number;
  accounts: Array<{ name: string; platform: string; type: string; lastDetection: string; active: boolean }>;
  detections: Array<{ type: 'tweets' | 'news' | 'skins'; time: string; message: string }>;
  shop: Array<{ name: string; rarity: string; price: number; icon?: string }>;
}

// ─── État global ───────────────────────────────────────────────────────────

export const fortniteState: FortniteUpdatePayload = {
  type: 'fortnite-update',
  tweets: 0,
  news: 0,
  skins: 0,
  accounts: [],
  detections: [],
  shop: [],
};

/** Set de clients WebSocket — alimenté par control-server.ts au démarrage. */
const wsClients = new Set<WebSocket>();

let broadcasting = false;

function rawBroadcast(data: object): void {
  if (broadcasting) return;
  broadcasting = true;
  try {
    const payload = JSON.stringify(data);
    for (const client of wsClients) {
      if (client.readyState === WebSocket.OPEN) {
        client.send(payload);
      }
    }
  } catch {
    // silently ignore broadcast errors
  } finally {
    broadcasting = false;
  }
}

// ─── API publique ──────────────────────────────────────────────────────────

/** Appelé par control-server.ts pour enregistrer/désenregistrer les clients. */
export function addWsClient(client: WebSocket): void {
  wsClients.add(client);
}

export function removeWsClient(client: WebSocket): void {
  wsClients.delete(client);
}

export function clearWsClients(): void {
  for (const client of wsClients) {
    client.close();
  }
  wsClients.clear();
}

/**
 * Diffuse une mise à jour partielle de l'état Fortnite.
 */
export function broadcastFortniteUpdate(update: Partial<FortniteUpdatePayload>): void {
  Object.assign(fortniteState, update);
  rawBroadcast(fortniteState);
}

/**
 * Ajoute une détection et la diffuse en temps réel.
 */
export function pushFortniteDetection(
  type: 'tweets' | 'news' | 'skins',
  message: string
): void {
  fortniteState.detections = [
    { type, time: new Date().toISOString(), message },
    ...fortniteState.detections,
  ].slice(0, 100);

  if (type === 'tweets') fortniteState.tweets++;
  else if (type === 'news') fortniteState.news++;
  else if (type === 'skins') fortniteState.skins++;

  rawBroadcast(fortniteState);
}

/**
 * Retourne l'état Fortnite actuel (pour l'endpoint API).
 */
export function getFortniteState(): FortniteUpdatePayload {
  return { ...fortniteState, accounts: [...fortniteState.accounts], detections: [...fortniteState.detections], shop: [...fortniteState.shop] };
}

/**
 * Reset les compteurs quotidiens (appelé depuis resetDailyStats).
 */
export function resetFortniteCounters(): void {
  fortniteState.tweets = 0;
  fortniteState.news = 0;
  fortniteState.skins = 0;
  fortniteState.detections = [];
  fortniteState.shop = [];
}

/**
 * Met à jour la liste des comptes surveillés.
 */
export function setFortniteAccounts(accounts: FortniteUpdatePayload['accounts']): void {
  fortniteState.accounts = accounts;
  rawBroadcast(fortniteState);
}
