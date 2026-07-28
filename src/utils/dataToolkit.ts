/**
 * dataToolkit.ts — Data science, math, text analysis & conversions
 *
 * Outils:
 * - Unit converter (length, weight, temperature, data, speed)
 * - Math expression evaluator
 * - Statistical calculator (mean, median, std, variance, min, max, quartiles)
 * - Text sentiment analyzer
 * - Language detector (basic)
 * - Word frequency analyzer
 * - String case converter
 * - Slug generator
 * - QR code generator (ASCII)
 * - Cron expression parser
 * - IP range generator
 * - Number to words (FR)
 * - Password generator
 * - Data size formatter
 * - Diff calculator (text comparison)
 */

// ─── 1. Unit Converter ───────────────────────────────────────────────────────

export interface UnitResult {
  category: string;
  input: string;
  conversions: { unit: string; value: number }[];
  success: boolean;
  error?: string;
}

const UNIT_TABLES: Record<string, { unit: string; factor: number }[]> = {
  length: [
    { unit: "mm", factor: 0.001 },
    { unit: "cm", factor: 0.01 },
    { unit: "m", factor: 1 },
    { unit: "km", factor: 1000 },
    { unit: "in", factor: 0.0254 },
    { unit: "ft", factor: 0.3048 },
    { unit: "yd", factor: 0.9144 },
    { unit: "mi", factor: 1609.344 },
  ],
  weight: [
    { unit: "mg", factor: 0.000001 },
    { unit: "g", factor: 0.001 },
    { unit: "kg", factor: 1 },
    { unit: "t", factor: 1000 },
    { unit: "lb", factor: 0.453592 },
    { unit: "oz", factor: 0.0283495 },
  ],
  data: [
    { unit: "B", factor: 1 },
    { unit: "KB", factor: 1024 },
    { unit: "MB", factor: 1024 ** 2 },
    { unit: "GB", factor: 1024 ** 3 },
    { unit: "TB", factor: 1024 ** 4 },
    { unit: "PB", factor: 1024 ** 5 },
  ],
  speed: [
    { unit: "m/s", factor: 1 },
    { unit: "km/h", factor: 0.277778 },
    { unit: "mph", factor: 0.44704 },
    { unit: "knot", factor: 0.514444 },
    { unit: "ft/s", factor: 0.3048 },
  ],
};

export function convertUnit(value: number, fromUnit: string, category: string): UnitResult {
  const table = UNIT_TABLES[category];
  if (!table) return { category, input: `${value} ${fromUnit}`, conversions: [], success: false, error: `Catégorie inconnue: ${category}` };

  const fromEntry = table.find((e) => e.unit.toLowerCase() === fromUnit.toLowerCase());
  if (!fromEntry) return { category, input: `${value} ${fromUnit}`, conversions: [], success: false, error: `Unité inconnue: ${fromUnit}` };

  const baseValue = value * fromEntry.factor;
  const conversions = table.map((e) => ({
    unit: e.unit,
    value: Math.round((baseValue / e.factor) * 1e6) / 1e6,
  }));

  return { category, input: `${value} ${fromUnit}`, conversions, success: true };
}

export function convertTemperature(value: number, from: "C" | "F" | "K"): UnitResult {
  const conversions: { unit: string; value: number }[] = [];
  let celsius: number;

  if (from === "C") celsius = value;
  else if (from === "F") celsius = (value - 32) * 5 / 9;
  else celsius = value - 273.15;

  conversions.push({ unit: "°C", value: Math.round(celsius * 100) / 100 });
  conversions.push({ unit: "°F", value: Math.round((celsius * 9 / 5 + 32) * 100) / 100 });
  conversions.push({ unit: "K", value: Math.round((celsius + 273.15) * 100) / 100 });

  return { category: "temperature", input: `${value} ${from}`, conversions, success: true };
}

// ─── 2. Math Expression Evaluator ────────────────────────────────────────────

export interface MathResult {
  expression: string;
  result: number;
  success: boolean;
  error?: string;
}

export function evalMath(expression: string): MathResult {
  // Sanitize: only allow numbers, operators, parentheses, and math functions
  const sanitized = expression.replace(/\s/g, "");
  if (!/^[\d+\-*/().,%^a-z]+$/i.test(sanitized)) {
    return { expression, result: 0, success: false, error: "Caractères non autorisés" };
  }

  try {
    // Replace ^ with ** for exponentiation
    const jsExpr = sanitized.replace(/\^/g, "**");
    // Replace common math functions
    const withFuncs = jsExpr
      .replace(/sqrt/gi, "Math.sqrt")
      .replace(/sin/gi, "Math.sin")
      .replace(/cos/gi, "Math.cos")
      .replace(/tan/gi, "Math.tan")
      .replace(/log/gi, "Math.log10")
      .replace(/ln/gi, "Math.log")
      .replace(/abs/gi, "Math.abs")
      .replace(/pi/gi, "Math.PI")
      .replace(/e(?![a-z])/gi, "Math.E");

    const result = Function(`"use strict"; return (${withFuncs});`)();
    if (typeof result !== "number" || !isFinite(result)) {
      return { expression, result: 0, success: false, error: "Résultat non numérique" };
    }
    return { expression, result: Math.round(result * 1e10) / 1e10, success: true };
  } catch {
    return { expression, result: 0, success: false, error: "Expression invalide" };
  }
}

// ─── 3. Statistical Calculator ───────────────────────────────────────────────

export interface StatsResult {
  count: number;
  mean: number;
  median: number;
  std: number;
  variance: number;
  min: number;
  max: number;
  range: number;
  q1: number;
  q3: number;
  sum: number;
  success: boolean;
  error?: string;
}

export function calculateStats(values: number[]): StatsResult {
  if (!values || values.length === 0) {
    return { count: 0, mean: 0, median: 0, std: 0, variance: 0, min: 0, max: 0, range: 0, q1: 0, q3: 0, sum: 0, success: false, error: "Aucune valeur" };
  }

  const sorted = [...values].sort((a, b) => a - b);
  const n = sorted.length;
  const sum = sorted.reduce((a, b) => a + b, 0);
  const mean = sum / n;
  const median = n % 2 === 0 ? (sorted[n / 2 - 1] + sorted[n / 2]) / 2 : sorted[Math.floor(n / 2)];
  const variance = sorted.reduce((acc, v) => acc + (v - mean) ** 2, 0) / n;
  const std = Math.sqrt(variance);

  const q1Idx = Math.floor(n * 0.25);
  const q3Idx = Math.floor(n * 0.75);

  return {
    count: n,
    mean: Math.round(mean * 1000) / 1000,
    median: Math.round(median * 1000) / 1000,
    std: Math.round(std * 1000) / 1000,
    variance: Math.round(variance * 1000) / 1000,
    min: sorted[0],
    max: sorted[n - 1],
    range: sorted[n - 1] - sorted[0],
    q1: sorted[q1Idx],
    q3: sorted[q3Idx],
    sum: Math.round(sum * 1000) / 1000,
    success: true,
  };
}

// ─── 4. Text Sentiment Analyzer ───────────────────────────────────────────────

export interface SentimentResult {
  text: string;
  score: number;
  rating: string;
  positiveWords: string[];
  negativeWords: string[];
  success: boolean;
}

const POSITIVE_WORDS = [
  "bon", "super", "génial", "excellent", "parfait", "aimer", "content",
  "heureux", "merci", "bravo", "cool", "top", "awesome", "great", "good",
  "love", "amazing", "fantastic", "wonderful", "best", "nice", "perfect",
];

const NEGATIVE_WORDS = [
  "mauvais", "nul", "horrible", "terrible", "hate", "triste", "colère",
  "problème", "bug", "erreur", "fail", "bad", "worst", "awful", "broken",
  "crash", "dead", "wrong", "stupid", "boring",
];

export function analyzeSentiment(text: string): SentimentResult {
  const lower = text.toLowerCase();
  const positiveWords: string[] = [];
  const negativeWords: string[] = [];

  for (const word of POSITIVE_WORDS) {
    if (lower.includes(word)) positiveWords.push(word);
  }
  for (const word of NEGATIVE_WORDS) {
    if (lower.includes(word)) negativeWords.push(word);
  }

  const score = positiveWords.length - negativeWords.length;
  let rating = "Neutre";
  if (score > 2) rating = "Très positif 😊";
  else if (score > 0) rating = "Positif 🙂";
  else if (score < -2) rating = "Très négatif 😠";
  else if (score < 0) rating = "Négatif 😞";

  return {
    text: text.slice(0, 80),
    score,
    rating,
    positiveWords: [...new Set(positiveWords)],
    negativeWords: [...new Set(negativeWords)],
    success: true,
  };
}

// ─── 5. Language Detector ────────────────────────────────────────────────────

export interface LangResult {
  text: string;
  detected: string;
  confidence: number;
  success: boolean;
}

const LANG_MARKERS: { lang: string; words: string[] }[] = [
  { lang: "Français", words: ["le", "la", "les", "de", "et", "est", "que", "dans", "pour", "avec", "ce", "une", "pas"] },
  { lang: "English", words: ["the", "and", "is", "that", "in", "for", "with", "this", "not", "have", "are", "was"] },
  { lang: "Español", words: ["el", "la", "los", "de", "y", "es", "que", "en", "para", "con", "no", "una"] },
  { lang: "Deutsch", words: ["der", "die", "das", "und", "ist", "nicht", "ein", "mit", "für", "auf", "auch"] },
  { lang: "Italiano", words: ["il", "la", "di", "e", "che", "non", "per", "con", "una", "sono", "questo"] },
  { lang: "Português", words: ["o", "a", "de", "e", "que", "não", "para", "com", "uma", "é", "este"] },
];

export function detectLanguage(text: string): LangResult {
  const lower = text.toLowerCase();
  const words = lower.split(/\s+/);
  let bestLang = "Inconnu";
  let bestScore = 0;

  for (const { lang, words: markers } of LANG_MARKERS) {
    let score = 0;
    for (const marker of markers) {
      if (words.includes(marker)) score++;
    }
    if (score > bestScore) {
      bestScore = score;
      bestLang = lang;
    }
  }

  const confidence = bestScore > 0 ? Math.min(bestScore / 5, 1) : 0;

  return {
    text: text.slice(0, 80),
    detected: bestLang,
    confidence: Math.round(confidence * 100) / 100,
    success: true,
  };
}

// ─── 6. Word Frequency ───────────────────────────────────────────────────────

export interface WordFreqResult {
  text: string;
  totalWords: number;
  uniqueWords: number;
  topWords: { word: string; count: number }[];
  success: boolean;
}

export function wordFrequency(text: string, topN: number = 10): WordFreqResult {
  const words = text.toLowerCase().replace(/[^\w\sàâäéèêëïîôöùûüÿç]/gi, "").split(/\s+/).filter(Boolean);
  const freq = new Map<string, number>();

  for (const word of words) {
    if (word.length < 2) continue;
    freq.set(word, (freq.get(word) || 0) + 1);
  }

  const sorted = [...freq.entries()].sort((a, b) => b[1] - a[1]).slice(0, topN);

  return {
    text: text.slice(0, 50),
    totalWords: words.length,
    uniqueWords: freq.size,
    topWords: sorted.map(([word, count]) => ({ word, count })),
    success: true,
  };
}

// ─── 7. String Case Converter ─────────────────────────────────────────────────

export interface CaseResult {
  input: string;
  camelCase: string;
  pascalCase: string;
  snakeCase: string;
  kebabCase: string;
  constantCase: string;
  lower: string;
  upper: string;
  titleCase: string;
  success: boolean;
}

export function convertCase(input: string): CaseResult {
  const words = input.trim().split(/[\s_-]+/).filter(Boolean);
  if (words.length === 0) {
    return { input, camelCase: "", pascalCase: "", snakeCase: "", kebabCase: "", constantCase: "", lower: "", upper: "", titleCase: "", success: false };
  }

  const camel = words.map((w, i) => i === 0 ? w.toLowerCase() : w.charAt(0).toUpperCase() + w.slice(1).toLowerCase()).join("");
  const pascal = words.map((w) => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase()).join("");
  const snake = words.map((w) => w.toLowerCase()).join("_");
  const kebab = words.map((w) => w.toLowerCase()).join("-");
  const constant = words.map((w) => w.toUpperCase()).join("_");
  const title = words.map((w) => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase()).join(" ");

  return {
    input,
    camelCase: camel,
    pascalCase: pascal,
    snakeCase: snake,
    kebabCase: kebab,
    constantCase: constant,
    lower: input.toLowerCase(),
    upper: input.toUpperCase(),
    titleCase: title,
    success: true,
  };
}

// ─── 8. Slug Generator ───────────────────────────────────────────────────────

export function generateSlug(input: string, maxLength: number = 80): string {
  return input
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9\s-]/g, "")
    .trim()
    .replace(/[\s]+/g, "-")
    .replace(/-+/g, "-")
    .slice(0, maxLength)
    .replace(/-$/, "");
}

// ─── 9. QR Code Generator (ASCII) ────────────────────────────────────────────

export interface QrResult {
  text: string;
  qrCode: string;
  success: boolean;
  error?: string;
}

export function generateQrAscii(text: string): QrResult {
  // Simplified ASCII QR placeholder — real QR requires a library
  // We generate a visual block representation
  const lines: string[] = [];
  const padding = 4;
  const size = 21; // Version 1 QR

  // Create a pseudo-random but deterministic pattern from the text
  const hash = Array.from(text).reduce((acc, c) => (acc * 31 + c.charCodeAt(0)) & 0x7fffffff, 0);

  for (let y = 0; y < size + padding * 2; y++) {
    let line = "";
    for (let x = 0; x < size + padding * 2; x++) {
      // Finder patterns (corners)
      const inFinder = (px: number, py: number) => {
        if (px < 7 && py < 7) return true;
        if (px >= size && py < 7) return false;
        if (px < 7 && py >= size) return true;
        return false;
      };

      if (y < padding || y >= size + padding || x < padding || x >= size + padding) {
        line += "  ";
      } else {
        const px = x - padding;
        const py = y - padding;
        const bit = ((hash >> ((px * 3 + py * 7) % 31)) & 1) === 1;
        if (inFinder(px, py)) {
          const fx = px % 7;
          const fy = py % 7;
          const border = fx === 0 || fx === 6 || fy === 0 || fy === 6;
          const center = fx >= 2 && fx <= 4 && fy >= 2 && fy <= 4;
          line += border || center ? "██" : "  ";
        } else {
          line += bit ? "██" : "  ";
        }
      }
    }
    lines.push(line);
  }

  return { text: text.slice(0, 50), qrCode: lines.join("\n"), success: true };
}

// ─── 10. Cron Expression Parser ───────────────────────────────────────────────

export interface CronResult {
  expression: string;
  description: string;
  fields: { field: string; value: string; meaning: string }[];
  nextRun: string;
  success: boolean;
  error?: string;
}

export function parseCron(expression: string): CronResult {
  const parts = expression.trim().split(/\s+/);
  if (parts.length !== 5) {
    return { expression, description: "", fields: [], nextRun: "", success: false, error: "Format cron invalide (5 champs requis: min hour day month weekday)" };
  }

  const [min, hour, day, month, weekday] = parts;
  const fields = [
    { field: "Minute", value: min, meaning: min === "*" ? "Chaque minute" : `Minute ${min}` },
    { field: "Heure", value: hour, meaning: hour === "*" ? "Chaque heure" : `Heure ${hour}` },
    { field: "Jour du mois", value: day, meaning: day === "*" ? "Chaque jour" : `Jour ${day}` },
    { field: "Mois", value: month, meaning: month === "*" ? "Chaque mois" : `Mois ${month}` },
    { field: "Jour de la semaine", value: weekday, meaning: weekday === "*" ? "Chaque jour de la semaine" : `Jour ${weekday}` },
  ];

  let desc = "";
  if (min === "*" && hour === "*") desc = "Chaque minute";
  else if (hour === "*") desc = `Chaque heure à la minute ${min}`;
  else if (day === "*" && month === "*" && weekday === "*") desc = `Chaque jour à ${hour}:${min.padStart(2, "0")}`;
  else if (weekday !== "*") desc = `À ${hour}:${min.padStart(2, "0")} le jour de semaine ${weekday}`;
  else desc = `À ${hour}:${min.padStart(2, "0")} le jour ${day} du mois ${month}`;

  // Approximate next run
  const now = new Date();
  const next = new Date(now);
  next.setMinutes(parseInt(min === "*" ? String(now.getMinutes() + 1) : min, 10));
  next.setHours(parseInt(hour === "*" ? String(now.getHours()) : hour, 10));

  return {
    expression,
    description: desc,
    fields,
    nextRun: next.toISOString(),
    success: true,
  };
}

// ─── 11. IP Range Generator ──────────────────────────────────────────────────

export interface IpRangeResult {
  cidr: string;
  ips: string[];
  count: number;
  success: boolean;
  error?: string;
}

export function generateIpRange(cidr: string, maxResults: number = 256): IpRangeResult {
  const match = cidr.match(/^(\d+)\.(\d+)\.(\d+)\.(\d+)\/(\d+)$/);
  if (!match) {
    return { cidr, ips: [], count: 0, success: false, error: "Format CIDR invalide (ex: 192.168.1.0/24)" };
  }

  const [, a, b, c, d, maskStr] = match;
  const mask = parseInt(maskStr, 10);
  const ipInt = (parseInt(a, 10) << 24) | (parseInt(b, 10) << 16) | (parseInt(c, 10) << 8) | parseInt(d, 10);
  const networkMask = mask === 0 ? 0 : (0xffffffff << (32 - mask)) >>> 0;
  const network = (ipInt & networkMask) >>> 0;
  const broadcast = (network | (~networkMask >>> 0)) >>> 0;
  const count = Math.min(broadcast - network + 1, maxResults);

  const ips: string[] = [];
  for (let i = 0; i < count; i++) {
    const ip = (network + i) >>> 0;
    ips.push(`${(ip >> 24) & 0xff}.${(ip >> 16) & 0xff}.${(ip >> 8) & 0xff}.${ip & 0xff}`);
  }

  return { cidr, ips, count, success: true };
}

// ─── 12. Number to Words (FR) ────────────────────────────────────────────────

const UNITS_FR = ["zéro", "un", "deux", "trois", "quatre", "cinq", "six", "sept", "huit", "neuf", "dix", "onze", "douze", "treize", "quatorze", "quinze", "seize", "dix-sept", "dix-huit", "dix-neuf"];
const TENS_FR = ["", "", "vingt", "trente", "quarante", "cinquante", "soixante", "soixante", "quatre-vingt", "quatre-vingt"];

export function numberToWordsFr(n: number): string {
  if (n < 0) return "moins " + numberToWordsFr(-n);
  if (n < 20) return UNITS_FR[n];
  if (n < 100) {
    const ten = Math.floor(n / 10);
    const unit = n % 10;
    if (ten === 7 || ten === 9) {
      return TENS_FR[ten] + "-" + UNITS_FR[10 + unit];
    }
    if (unit === 0) return TENS_FR[ten];
    if (unit === 1 && ten !== 8) return TENS_FR[ten] + "-et-un";
    return TENS_FR[ten] + "-" + UNITS_FR[unit];
  }
  if (n < 1000) {
    const hundred = Math.floor(n / 100);
    const rest = n % 100;
    let h = hundred === 1 ? "cent" : UNITS_FR[hundred] + " cent";
    if (rest === 0 && hundred > 1) h += "s";
    return rest > 0 ? h + " " + numberToWordsFr(rest) : h;
  }
  if (n < 1000000) {
    const thousand = Math.floor(n / 1000);
    const rest = n % 1000;
    const t = thousand === 1 ? "mille" : numberToWordsFr(thousand) + " mille";
    return rest > 0 ? t + " " + numberToWordsFr(rest) : t;
  }
  if (n < 1000000000) {
    const million = Math.floor(n / 1000000);
    const rest = n % 1000000;
    const m = million === 1 ? "un million" : numberToWordsFr(million) + " millions";
    return rest > 0 ? m + " " + numberToWordsFr(rest) : m;
  }
  return n.toLocaleString("fr-FR");
}

// ─── 13. Password Generator ──────────────────────────────────────────────────

export interface PasswordGenResult {
  passwords: string[];
  length: number;
  strength: string;
  success: boolean;
}

export function generatePasswords(
  count: number = 1,
  length: number = 16,
  options?: { upper?: boolean; lower?: boolean; numbers?: boolean; symbols?: boolean },
): PasswordGenResult {
  const upper = options?.upper !== false ? "ABCDEFGHIJKLMNOPQRSTUVWXYZ" : "";
  const lower = options?.lower !== false ? "abcdefghijklmnopqrstuvwxyz" : "";
  const numbers = options?.numbers !== false ? "0123456789" : "";
  const symbols = options?.symbols !== false ? "!@#$%^&*()_+-=[]{}|;:,.<>?" : "";
  const charset = upper + lower + numbers + symbols;

  if (!charset) return { passwords: [], length, strength: "N/A", success: false };

  const passwords: string[] = [];
  for (let p = 0; p < count; p++) {
    let pw = "";
    const bytes = crypto.getRandomValues(new Uint8Array(length));
    for (let i = 0; i < length; i++) {
      pw += charset[bytes[i] % charset.length];
    }
    passwords.push(pw);
  }

  const entropy = Math.log2(charset.length) * length;
  let strength = "Faible";
  if (entropy > 60) strength = "Fort";
  if (entropy > 80) strength = "Très fort";
  if (entropy > 100) strength = "Extrême";

  return { passwords, length, strength: `${strength} (${Math.round(entropy)} bits)`, success: true };
}

// ─── 14. Data Size Formatter ─────────────────────────────────────────────────

export interface DataSizeResult {
  bytes: number;
  formatted: string;
  binary: string;
  decimal: string;
  success: boolean;
}

export function formatDataSize(bytes: number): DataSizeResult {
  const binaryUnits = ["B", "KiB", "MiB", "GiB", "TiB", "PiB"];
  const decimalUnits = ["B", "KB", "MB", "GB", "TB", "PB"];

  let binIdx = 0;
  let binVal = bytes;
  while (binVal >= 1024 && binIdx < binaryUnits.length - 1) {
    binVal /= 1024;
    binIdx++;
  }

  let decIdx = 0;
  let decVal = bytes;
  while (decVal >= 1000 && decIdx < decimalUnits.length - 1) {
    decVal /= 1000;
    decIdx++;
  }

  return {
    bytes,
    formatted: `${Math.round(binVal * 100) / 100} ${binaryUnits[binIdx]}`,
    binary: `${Math.round(binVal * 100) / 100} ${binaryUnits[binIdx]}`,
    decimal: `${Math.round(decVal * 100) / 100} ${decimalUnits[decIdx]}`,
    success: true,
  };
}

// ─── 15. Text Diff Calculator ─────────────────────────────────────────────────

export interface DiffResult {
  additions: number;
  deletions: number;
  unchanged: number;
  diff: string[];
  similarity: number;
  success: boolean;
}

export function textDiff(text1: string, text2: string): DiffResult {
  const lines1 = text1.split("\n");
  const lines2 = text2.split("\n");
  const diff: string[] = [];
  let additions = 0;
  let deletions = 0;
  let unchanged = 0;

  const maxLen = Math.max(lines1.length, lines2.length);
  for (let i = 0; i < maxLen; i++) {
    if (i < lines1.length && i < lines2.length) {
      if (lines1[i] === lines2[i]) {
        diff.push(`  ${lines1[i]}`);
        unchanged++;
      } else {
        diff.push(`- ${lines1[i]}`);
        diff.push(`+ ${lines2[i]}`);
        deletions++;
        additions++;
      }
    } else if (i < lines1.length) {
      diff.push(`- ${lines1[i]}`);
      deletions++;
    } else {
      diff.push(`+ ${lines2[i]}`);
      additions++;
    }
  }

  const total = additions + deletions + unchanged;
  const similarity = total > 0 ? Math.round((unchanged / total) * 100) : 100;

  return { additions, deletions, unchanged, diff: diff.slice(0, 50), similarity, success: true };
}
