/**
 * killSwitch.ts — Kill switch global pour les boucles autonomes
 *
 * Quand activé, coupe immédiatement:
 * - L'agent loop (traitement auto des messages)
 * - L'agent brain (scan proactif)
 * - L'active defense engine
 * - Les outils medium/high risk
 *
 * Les commandes admin de base (/debug, /hotreload, /osint) restent disponibles.
 */

import logger from "../utils/logger.js";

let killed = false;
let killedAt: Date | null = null;
let killedBy: string | null = null;

export function isKilled(): boolean {
  return killed;
}

export function getKillInfo(): { killed: boolean; killedAt: Date | null; killedBy: string | null } {
  return { killed, killedAt, killedBy };
}

export function activateKillSwitch(activatedBy: string): void {
  killed = true;
  killedAt = new Date();
  killedBy = activatedBy;
  logger.warn(
    `[KillSwitch] 🔴 KILL SWITCH ACTIVATED by ${activatedBy} at ${killedAt.toISOString()}`,
  );
}

export function deactivateKillSwitch(deactivatedBy: string): void {
  killed = false;
  logger.info(
    `[KillSwitch] 🟢 Kill switch deactivated by ${deactivatedBy} at ${new Date().toISOString()}`,
  );
  killedAt = null;
  killedBy = null;
}
