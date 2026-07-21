/**
 * passwordGenerator.ts — Générateur de mot de passe 100% local
 *
 * Utilise crypto.randomInt() (CSPRNG) — jamais Math.random().
 * Aucun appel réseau, aucun stockage, aucune dépendance externe.
 *
 * Entropie calculée réellement: length × log2(tailleAlphabet)
 */

import { randomInt } from "node:crypto";

export interface PasswordOptions {
  length: number;
  uppercase: boolean;
  lowercase: boolean;
  numbers: boolean;
  symbols: boolean;
  excludeAmbiguous: boolean;
}

export interface PasswordResult {
  password: string;
  entropyBits: number;
  strengthLabel: "Faible" | "Moyenne" | "Forte" | "Très forte";
}

const UPPER = "ABCDEFGHIJKLMNOPQRSTUVWXYZ";
const LOWER = "abcdefghijklmnopqrstuvwxyz";
const DIGITS = "0123456789";
const SYMBOLS = "!@#$%^&*()-_=+[]{}|;:,.<>?";

const AMBIGUOUS = new Set([
  "0",
  "O",
  "o",
  "1",
  "l",
  "I",
  "|",
  "5",
  "S",
  "s",
  "2",
  "Z",
  "z",
  "8",
  "B",
  "G",
  "6",
  "b",
]);

function filterAmbiguous(charset: string): string {
  return [...charset].filter((c) => !AMBIGUOUS.has(c)).join("");
}

export function generatePassword(options: PasswordOptions): PasswordResult {
  const length = Math.min(128, Math.max(4, Math.floor(options.length) || 16));

  let charset = "";
  if (options.lowercase) charset += LOWER;
  if (options.uppercase) charset += UPPER;
  if (options.numbers) charset += DIGITS;
  if (options.symbols) charset += SYMBOLS;

  if (charset.length === 0) {
    charset = LOWER + UPPER + DIGITS;
  }

  if (options.excludeAmbiguous) {
    charset = filterAmbiguous(charset);
    if (charset.length === 0) {
      charset = filterAmbiguous(LOWER + UPPER + DIGITS);
    }
  }

  const chars: string[] = [];
  for (let i = 0; i < length; i++) {
    chars.push(charset[randomInt(charset.length)]);
  }

  const password = chars.join("");
  const entropyBits = length * Math.log2(charset.length);

  let strengthLabel: PasswordResult["strengthLabel"];
  if (entropyBits < 40) strengthLabel = "Faible";
  else if (entropyBits < 60) strengthLabel = "Moyenne";
  else if (entropyBits < 80) strengthLabel = "Forte";
  else strengthLabel = "Très forte";

  return { password, entropyBits: Math.round(entropyBits * 10) / 10, strengthLabel };
}

export function generateMultiplePasswords(
  options: PasswordOptions,
  count: number,
): PasswordResult[] {
  const n = Math.min(10, Math.max(1, Math.floor(count) || 1));
  const results: PasswordResult[] = [];
  for (let i = 0; i < n; i++) {
    results.push(generatePassword(options));
  }
  return results;
}
