/**
 * math.ts — Utilitaires mathématiques
 */

import { randomInt } from "node:crypto";

/** Limite une valeur entre min et max */
export function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max);
}

/** Entier aléatoire dans [min, max] inclus */
export function randomRange(min: number, max: number): number {
  if (min > max) [min, max] = [max, min];
  return randomInt(min, max + 1);
}

/** Formate un nombre avec séparateurs de milliers */
export function formatNumber(n: number, locale = "fr-FR"): string {
  return new Intl.NumberFormat(locale).format(n);
}

/** Moyenne d'un tableau de nombres */
export function average(numbers: readonly number[]): number {
  if (numbers.length === 0) return 0;
  return numbers.reduce((sum, n) => sum + n, 0) / numbers.length;
}

/** Médiane d'un tableau de nombres */
export function median(numbers: readonly number[]): number {
  if (numbers.length === 0) return 0;
  const sorted = [...numbers].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 0
    ? (sorted[mid - 1] + sorted[mid]) / 2
    : sorted[mid];
}
