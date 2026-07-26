/**
 * random.ts — Utilitaires aléatoires cryptographiquement sûrs
 */

import { randomInt, randomBytes } from "node:crypto";

/** Génère un token aléatoire hexadécimal de n octets (default 32 = 64 chars) */
export function secureToken(bytes = 32): string {
  return randomBytes(bytes).toString("hex");
}

/** Génère un UUID court (8 chars hex) */
export function shortUuid(): string {
  return randomBytes(4).toString("hex");
}

/** Génère une couleur aléatoire (entier 0-16777215) */
export function randomColor(): number {
  return randomInt(0, 0xffffff + 1);
}
