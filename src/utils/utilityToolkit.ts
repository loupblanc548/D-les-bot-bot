/**
 * utilityToolkit.ts — Outils utilitaires divers
 *
 * - Timestamp converter (Unix ↔ human)
 * - Number base converter (bin/dec/hex/oct)
 * - UUID v4/v7 generator
 * - Regex tester
 * - JSON formatter/minifier
 * - Binary ↔ text converter
 * - Hex ↔ text converter
 * - Morse code encoder/decoder
 * - Caesar cipher
 * - ROT13
 * - Multi-hash generator (MD5/SHA1/SHA256/SHA512)
 * - Lorem ipsum generator
 * - Color converter (HEX ↔ RGB ↔ HSL)
 */

import { createHash, randomUUID, randomInt } from "crypto";

// ─── 1. Timestamp Converter ──────────────────────────────────────────────────

export interface TimestampResult {
  input: string | number;
  unix: number;
  iso: string;
  utc: string;
  local: string;
  relative: string;
}

export function convertTimestamp(input: string | number): TimestampResult {
  let ts: number;
  if (typeof input === "number") {
    ts = input;
  } else {
    ts = parseInt(input, 10);
    if (isNaN(ts)) {
      const parsed = Date.parse(input);
      ts = isNaN(parsed) ? 0 : Math.floor(parsed / 1000);
    }
  }

  const isSeconds = ts < 1e12;
  const ms = isSeconds ? ts * 1000 : ts;
  const date = new Date(ms);

  const now = Date.now();
  const diff = ms - now;
  let relative: string;
  if (Math.abs(diff) < 60000) relative = "maintenant";
  else if (diff > 0) {
    const mins = Math.floor(diff / 60000);
    if (mins < 60) relative = `dans ${mins}min`;
    else if (mins < 1440) relative = `dans ${Math.floor(mins / 60)}h`;
    else relative = `dans ${Math.floor(mins / 1440)}j`;
  } else {
    const mins = Math.floor(-diff / 60000);
    if (mins < 60) relative = `il y a ${mins}min`;
    else if (mins < 1440) relative = `il y a ${Math.floor(mins / 60)}h`;
    else relative = `il y a ${Math.floor(mins / 1440)}j`;
  }

  return {
    input,
    unix: isSeconds ? ts : Math.floor(ts / 1000),
    iso: date.toISOString(),
    utc: date.toUTCString(),
    local: date.toLocaleString("fr-FR"),
    relative,
  };
}

// ─── 2. Number Base Converter ────────────────────────────────────────────────

export interface BaseConvertResult {
  input: string;
  fromBase: string;
  decimal: number;
  binary: string;
  octal: string;
  hexadecimal: string;
  valid: boolean;
}

export function convertBase(input: string, fromBase: 2 | 8 | 10 | 16): BaseConvertResult {
  const baseNames: Record<number, string> = { 2: "binary", 8: "octal", 10: "decimal", 16: "hex" };
  const num = parseInt(input, fromBase);

  if (isNaN(num)) {
    return {
      input,
      fromBase: baseNames[fromBase],
      decimal: NaN,
      binary: "",
      octal: "",
      hexadecimal: "",
      valid: false,
    };
  }

  return {
    input,
    fromBase: baseNames[fromBase],
    decimal: num,
    binary: num.toString(2),
    octal: num.toString(8),
    hexadecimal: num.toString(16).toUpperCase(),
    valid: true,
  };
}

// ─── 3. UUID Generator ───────────────────────────────────────────────────────

export function generateUuids(count: number, version: 4 | 7 = 4): string[] {
  const uuids: string[] = [];
  for (let i = 0; i < count; i++) {
    if (version === 4) {
      uuids.push(randomUUID());
    } else {
      // UUID v7 approximation: timestamp + random
      const ts = Date.now();
      const tsHex = ts.toString(16).padStart(12, "0");
      const rand = randomInt(0, 0x0fff).toString(16).padStart(3, "0");
      const rand2 = randomInt(0, 0x3fffffff).toString(16).padStart(7, "0");
      uuids.push(`${tsHex}-${rand}-${7}${rand2.slice(0, 3)}-${rand2.slice(3)}`);
    }
  }
  return uuids;
}

// ─── 4. Regex Tester ─────────────────────────────────────────────────────────

export interface RegexTestResult {
  pattern: string;
  flags: string;
  testString: string;
  matches: { match: string; index: number; groups: string[] }[];
  isValid: boolean;
  error?: string;
}

export function testRegex(pattern: string, flags: string, testString: string): RegexTestResult {
  try {
    const regex = new RegExp(pattern, flags);
    const matches: { match: string; index: number; groups: string[] }[] = [];

    if (flags.includes("g")) {
      let match: RegExpExecArray | null;
      while ((match = regex.exec(testString)) !== null) {
        matches.push({
          match: match[0],
          index: match.index,
          groups: match.slice(1).map(String),
        });
        if (match.index === regex.lastIndex) regex.lastIndex++;
      }
    } else {
      const match = regex.exec(testString);
      if (match) {
        matches.push({
          match: match[0],
          index: match.index,
          groups: match.slice(1).map(String),
        });
      }
    }

    return { pattern, flags, testString, matches, isValid: true };
  } catch (err) {
    return {
      pattern,
      flags,
      testString,
      matches: [],
      isValid: false,
      error: err instanceof Error ? err.message : String(err),
    };
  }
}

// ─── 5. JSON Formatter ───────────────────────────────────────────────────────

export function formatJson(input: string, indent: number = 2): { output: string; valid: boolean; error?: string } {
  try {
    const parsed = JSON.parse(input);
    return { output: JSON.stringify(parsed, null, indent), valid: true };
  } catch (err) {
    return { output: "", valid: false, error: err instanceof Error ? err.message : String(err) };
  }
}

export function minifyJson(input: string): { output: string; valid: boolean; error?: string } {
  try {
    const parsed = JSON.parse(input);
    return { output: JSON.stringify(parsed), valid: true };
  } catch (err) {
    return { output: "", valid: false, error: err instanceof Error ? err.message : String(err) };
  }
}

// ─── 6. Binary ↔ Text ────────────────────────────────────────────────────────

export function textToBinary(text: string): string {
  return text
    .split("")
    .map((c) => c.charCodeAt(0).toString(2).padStart(8, "0"))
    .join(" ");
}

export function binaryToText(binary: string): string {
  return binary
    .split(/\s+/)
    .filter((b) => b.length > 0)
    .map((b) => String.fromCharCode(parseInt(b, 2)))
    .join("");
}

// ─── 7. Hex ↔ Text ───────────────────────────────────────────────────────────

export function textToHex(text: string): string {
  return Buffer.from(text, "utf-8").toString("hex");
}

export function hexToText(hex: string): string {
  try {
    return Buffer.from(hex, "hex").toString("utf-8");
  } catch {
    return "Hex invalide";
  }
}

// ─── 8. Morse Code ───────────────────────────────────────────────────────────

const MORSE_CODE: Record<string, string> = {
  A: ".-", B: "-...", C: "-.-.", D: "-..", E: ".", F: "..-.", G: "--.", H: "....",
  I: "..", J: ".---", K: "-.-", L: ".-..", M: "--", N: "-.", O: "---", P: ".--.",
  Q: "--.-", R: ".-.", S: "...", T: "-", U: "..-", V: "...-", W: ".--", X: "-..-",
  Y: "-.--", Z: "--..", "0": "-----", "1": ".----", "2": "..---", "3": "...--",
  "4": "....-", "5": ".....", "6": "-....", "7": "--...", "8": "---..", "9": "----.",
  ".": ".-.-.-", ",": "--..--", "?": "..--..", "!": "-.-.--", "/": "-..-.",
  "(": "-.--.", ")": "-.--.-", "&": ".-...", ":": "---...", ";": "-.-.-.",
  "=": "-...-", "+": ".-.-.", "-": "-....-", _: "..--.-", '"': ".-..-.",
  "@": ".--.-.", " ": "/",
};

const MORSE_REVERSE: Record<string, string> = Object.fromEntries(
  Object.entries(MORSE_CODE).map(([k, v]) => [v, k]),
);

export function textToMorse(text: string): string {
  return text
    .toUpperCase()
    .split("")
    .map((c) => MORSE_CODE[c] || "")
    .filter(Boolean)
    .join(" ");
}

export function morseToText(morse: string): string {
  return morse
    .split(/\s+/)
    .map((code) => MORSE_REVERSE[code] || "")
    .join("");
}

// ─── 9. Caesar Cipher ────────────────────────────────────────────────────────

export function caesarCipher(text: string, shift: number): string {
  return text
    .split("")
    .map((c) => {
      const code = c.charCodeAt(0);
      if (code >= 65 && code <= 90) {
        return String.fromCharCode(((code - 65 + shift) % 26 + 26) % 26 + 65);
      }
      if (code >= 97 && code <= 122) {
        return String.fromCharCode(((code - 97 + shift) % 26 + 26) % 26 + 97);
      }
      return c;
    })
    .join("");
}

// ─── 10. ROT13 ───────────────────────────────────────────────────────────────

export function rot13(text: string): string {
  return caesarCipher(text, 13);
}

// ─── 11. Multi-Hash Generator ────────────────────────────────────────────────

export interface MultiHashResult {
  input: string;
  md5: string;
  sha1: string;
  sha256: string;
  sha512: string;
}

export function generateHashes(input: string): MultiHashResult {
  return {
    input: input.length > 50 ? input.slice(0, 50) + "..." : input,
    md5: createHash("md5").update(input).digest("hex"),
    sha1: createHash("sha1").update(input).digest("hex"),
    sha256: createHash("sha256").update(input).digest("hex"),
    sha512: createHash("sha512").update(input).digest("hex"),
  };
}

// ─── 12. Lorem Ipsum Generator ───────────────────────────────────────────────

const LOREM_WORDS = "lorem ipsum dolor sit amet consectetur adipiscing elit sed do eiusmod tempor incididunt ut labore et dolore magna aliqua enim ad minim veniam quis nostrud exercitation ullamco laboris nisi aliquip ex ea commodo consequat duis aute irure in reprehenderit voluptate velit esse cillum eu fugiat nulla pariatur excepteur sint occaecat cupidatat non proident sunt culpa qui officia deserunt mollit anim id est laborum".split(" ");

export function generateLoremIpsum(paragraphs: number = 1): string {
  const result: string[] = [];
  for (let p = 0; p < paragraphs; p++) {
    const sentences: string[] = [];
    const sentenceCount = 4 + Math.floor(Math.random() * 4);
    for (let s = 0; s < sentenceCount; s++) {
      const wordCount = 8 + Math.floor(Math.random() * 12);
      const words: string[] = [];
      for (let w = 0; w < wordCount; w++) {
        words.push(LOREM_WORDS[Math.floor(Math.random() * LOREM_WORDS.length)]);
      }
      let sentence = words.join(" ");
      sentence = sentence.charAt(0).toUpperCase() + sentence.slice(1) + ".";
      sentences.push(sentence);
    }
    result.push(sentences.join(" "));
  }
  return result.join("\n\n");
}

// ─── 13. Color Converter ─────────────────────────────────────────────────────

export interface ColorConvertResult {
  input: string;
  hex: string;
  rgb: { r: number; g: number; b: number };
  hsl: { h: number; s: number; l: number };
  valid: boolean;
}

export function convertColor(input: string): ColorConvertResult {
  let r = 0, g = 0, b = 0;
  let valid = false;

  // HEX
  const hexMatch = input.match(/^#?([0-9a-f]{6}|[0-9a-f]{3})$/i);
  if (hexMatch) {
    let hex = hexMatch[1];
    if (hex.length === 3) hex = hex.split("").map((c) => c + c).join("");
    r = parseInt(hex.slice(0, 2), 16);
    g = parseInt(hex.slice(2, 4), 16);
    b = parseInt(hex.slice(4, 6), 16);
    valid = true;
  }

  // RGB
  const rgbMatch = input.match(/rgb\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)\s*\)/i);
  if (rgbMatch) {
    r = parseInt(rgbMatch[1], 10);
    g = parseInt(rgbMatch[2], 10);
    b = parseInt(rgbMatch[3], 10);
    valid = true;
  }

  if (!valid) {
    return { input, hex: "", rgb: { r: 0, g: 0, b: 0 }, hsl: { h: 0, s: 0, l: 0 }, valid: false };
  }

  const hex = `#${r.toString(16).padStart(2, "0")}${g.toString(16).padStart(2, "0")}${b.toString(16).padStart(2, "0")}`.toUpperCase();

  // RGB to HSL
  const rNorm = r / 255, gNorm = g / 255, bNorm = b / 255;
  const max = Math.max(rNorm, gNorm, bNorm);
  const min = Math.min(rNorm, gNorm, bNorm);
  let h = 0, s = 0;
  const l = (max + min) / 2;

  if (max !== min) {
    const d = max - min;
    s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
    switch (max) {
      case rNorm: h = ((gNorm - bNorm) / d + (gNorm < bNorm ? 6 : 0)) / 6; break;
      case gNorm: h = ((bNorm - rNorm) / d + 2) / 6; break;
      case bNorm: h = ((rNorm - gNorm) / d + 4) / 6; break;
    }
  }

  return {
    input,
    hex,
    rgb: { r, g, b },
    hsl: { h: Math.round(h * 360), s: Math.round(s * 100), l: Math.round(l * 100) },
    valid: true,
  };
}
