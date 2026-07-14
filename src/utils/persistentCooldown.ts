/**
 * persistentCooldown.ts — Cooldowns persistants via fichier
 *
 * Les cooldowns en mémoire (Map, variables) se réinitialisent à chaque restart.
 * En cas de crash loop, cela cause un spam de notifications.
 *
 * Ce module stocke les timestamps de cooldown dans un fichier JSON pour
 * qu'ils survivent aux redémarrages.
 */

import { existsSync, readFileSync, writeFileSync } from "fs";
import { join } from "path";
import logger from "./logger.js";

const COOLDOWN_FILE = join(process.cwd(), ".cooldown-state");
const MAX_ENTRIES = 100; // Limite pour éviter un fichier qui grossit indéfiniment

interface CooldownState {
  [key: string]: number; // key -> timestamp of last alert
}

let state: CooldownState = {};
let loaded = false;

function loadState(): void {
  if (loaded) return;
  loaded = true;
  try {
    if (existsSync(COOLDOWN_FILE)) {
      state = JSON.parse(readFileSync(COOLDOWN_FILE, "utf-8")) as CooldownState;
    }
  } catch {
    state = {};
  }
}

function saveState(): void {
  try {
    // Limiter le nombre d'entrées
    const keys = Object.keys(state);
    if (keys.length > MAX_ENTRIES) {
      const sorted = keys.sort((a, b) => state[a] - state[b]);
      const toRemove = sorted.slice(0, keys.length - MAX_ENTRIES);
      for (const key of toRemove) delete state[key];
    }
    writeFileSync(COOLDOWN_FILE, JSON.stringify(state));
  } catch (err) {
    logger.debug(`[PersistentCooldown] Save failed: ${err}`);
  }
}

/**
 * Vérifie si une alerte peut être envoyée (cooldown respecté).
 * Si oui, met à jour le timestamp et retourne true.
 * Si non, retourne false.
 */
export function canAlertPersistent(key: string, cooldownMs: number): boolean {
  loadState();
  const now = Date.now();
  const last = state[key] ?? 0;
  if (now - last < cooldownMs) return false;
  state[key] = now;
  saveState();
  return true;
}

/**
 * Vérifie si on est dans une crash loop (via .restart-lock).
 */
export function isCrashLoop(): boolean {
  try {
    const lockPath = join(process.cwd(), ".restart-lock");
    if (!existsSync(lockPath)) return false;
    const data = JSON.parse(readFileSync(lockPath, "utf-8")) as {
      count: number;
      lastRestart: number;
    };
    const elapsed = Date.now() - data.lastRestart;
    return data.count > 2 && elapsed < 120_000; // 2 min de fenêtre
  } catch {
    return false;
  }
}
