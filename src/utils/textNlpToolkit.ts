/**
 * textNlpToolkit.ts — Text analysis & NLP utilities
 * Called by Quant (the AI brain) via tool handlers in agentToolsExtended.ts
 */

// ─── Text extract entities (NER) ────────────────────────────────────────────
export function textExtractEntities(text: string): string {
  const entities: { type: string; value: string }[] = [];

  // Emails
  const emails = text.match(/[\w.+-]+@[\w-]+\.[\w.-]+/g) || [];
  emails.forEach((e) => entities.push({ type: "EMAIL", value: e }));

  // URLs
  const urls = text.match(/https?:\/\/[^\s]+/g) || [];
  urls.forEach((u) => entities.push({ type: "URL", value: u }));

  // IP addresses
  const ips = text.match(/\b\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3}\b/g) || [];
  ips.forEach((ip) => entities.push({ type: "IP", value: ip }));

  // Phone numbers (basic)
  const phones = text.match(/(\+?\d{1,3}[-.\s]?)?\(?\d{3}\)?[-.\s]?\d{3,4}[-.\s]?\d{4}/g) || [];
  phones.forEach((p) => entities.push({ type: "PHONE", value: p }));

  // Dates
  const dates = text.match(/\b\d{1,2}[/-]\d{1,2}[/-]\d{2,4}\b|\b\d{4}-\d{2}-\d{2}\b/g) || [];
  dates.forEach((d) => entities.push({ type: "DATE", value: d }));

  // Credit card numbers
  const cards = text.match(/\b(?:\d[ -]*?){13,16}\b/g) || [];
  cards.forEach((c) => entities.push({ type: "CREDIT_CARD", value: c.replace(/[-\s]/g, "") }));

  // Hash values
  const hashes = text.match(/\b[a-f0-9]{32,64}\b/gi) || [];
  hashes.forEach((h) => entities.push({ type: "HASH", value: h }));

  // Mentions (@username)
  const mentions = text.match(/@\w+/g) || [];
  mentions.forEach((m) => entities.push({ type: "MENTION", value: m }));

  // Hashtags
  const hashtags = text.match(/#\w+/g) || [];
  hashtags.forEach((h) => entities.push({ type: "HASHTAG", value: h }));

  return JSON.stringify({ total: entities.length, entities }, null, 2);
}

// ─── Text summarize advanced ────────────────────────────────────────────────
export function textSummarizeAdvanced(text: string, sentences: number): string {
  try {
    const numSentences = sentences || 3;
    const originalSentences = text.match(/[^.!?]+[.!?]+/g) || [text];
    if (originalSentences.length <= numSentences) return text;

    // Word frequency
    const words = text.toLowerCase().match(/\b\w+\b/g) || [];
    const freq: Record<string, number> = {};
    const stopWords = new Set([
      "the",
      "a",
      "an",
      "and",
      "or",
      "but",
      "in",
      "on",
      "at",
      "to",
      "for",
      "of",
      "with",
      "by",
      "is",
      "are",
      "was",
      "were",
      "be",
      "been",
      "being",
      "have",
      "has",
      "had",
      "do",
      "does",
      "did",
      "will",
      "would",
      "could",
      "should",
      "may",
      "might",
      "must",
      "shall",
      "can",
      "this",
      "that",
      "these",
      "those",
      "i",
      "you",
      "he",
      "she",
      "it",
      "we",
      "they",
      "le",
      "la",
      "les",
      "de",
      "du",
      "des",
      "un",
      "une",
      "et",
      "ou",
      "mais",
      "dans",
      "pour",
      "par",
      "avec",
      "sans",
      "sur",
      "sous",
      "est",
      "sont",
      "était",
      "été",
    ]);
    words.forEach((w) => {
      if (!stopWords.has(w)) freq[w] = (freq[w] || 0) + 1;
    });

    // Score sentences
    const scored = originalSentences.map((s, i) => {
      const sWords = s.toLowerCase().match(/\b\w+\b/g) || [];
      const score = sWords.reduce((sum, w) => sum + (freq[w] || 0), 0) / Math.sqrt(sWords.length);
      return { sentence: s.trim(), score, index: i };
    });

    const top = scored
      .sort((a, b) => b.score - a.score)
      .slice(0, numSentences)
      .sort((a, b) => a.index - b.index);
    return top.map((t) => t.sentence).join(" ");
  } catch (err) {
    return `Error: ${(err as Error).message}`;
  }
}

// ─── Text keyword extract ───────────────────────────────────────────────────
export function textKeywordExtract(text: string, numKeywords: number): string {
  try {
    const words = text.toLowerCase().match(/\b[a-z]{3,}\b/g) || [];
    const stopWords = new Set([
      "the",
      "and",
      "for",
      "are",
      "but",
      "not",
      "you",
      "all",
      "can",
      "her",
      "was",
      "one",
      "our",
      "out",
      "his",
      "has",
      "had",
      "how",
      "its",
      "who",
      "two",
      "way",
      "new",
      "now",
      "old",
      "see",
      "use",
      "get",
      "got",
      "let",
      "say",
      "she",
      "too",
      "any",
      "man",
      "men",
      "run",
      "did",
      "yet",
      "yes",
      "try",
      "put",
      "end",
      "set",
      "own",
      "few",
      "lot",
      "big",
      "low",
      "top",
      "off",
      "back",
      "more",
      "most",
      "some",
      "such",
      "than",
      "them",
      "then",
      "these",
      "those",
      "only",
      "very",
      "just",
      "also",
      "been",
      "were",
      "what",
      "when",
      "where",
      "which",
      "while",
      "with",
      "would",
      "could",
      "should",
      "there",
      "their",
      "about",
      "after",
      "again",
      "against",
      "between",
      "into",
      "through",
      "during",
      "before",
      "above",
      "below",
      "from",
      "down",
      "over",
      "under",
      "further",
      "once",
      "here",
      "both",
      "each",
      "other",
      "same",
      "so",
      "than",
      "too",
      "very",
      "will",
      "can",
      "just",
      "don",
      "should",
      "now",
    ]);
    const freq: Record<string, number> = {};
    words.forEach((w) => {
      if (!stopWords.has(w)) freq[w] = (freq[w] || 0) + 1;
    });
    const sorted = Object.entries(freq)
      .sort((a, b) => b[1] - a[1])
      .slice(0, numKeywords || 10);
    return JSON.stringify(
      sorted.map(([word, count]) => ({ keyword: word, frequency: count })),
      null,
      2,
    );
  } catch (err) {
    return `Error: ${(err as Error).message}`;
  }
}

// ─── Text readability score ─────────────────────────────────────────────────
export function textReadabilityScore(text: string): string {
  try {
    const sentences = (text.match(/[.!?]+/g) || []).length || 1;
    const words = (text.match(/\b\w+\b/g) || []).length;
    const syllables = (text.match(/[aeiouy]+/gi) || []).length;
    const chars = text.length;

    // Flesch-Kincaid
    const fk = 206.835 - 1.015 * (words / sentences) - 84.6 * (syllables / words);
    // Gunning Fog
    const complexWords = (text.match(/\b\w{7,}\b/g) || []).length;
    const gf = 0.4 * (words / sentences + 100 * (complexWords / words));
    // SMOG
    const smog = 1.043 * Math.sqrt(complexWords * (30 / sentences)) + 3.1291;

    const grade = (s: number) =>
      s >= 90
        ? "Very Easy (5th grade)"
        : s >= 80
          ? "Easy (6th grade)"
          : s >= 70
            ? "Fairly Easy (7th grade)"
            : s >= 60
              ? "Standard (8-9th grade)"
              : s >= 50
                ? "Fairly Difficult (10-12th grade)"
                : s >= 30
                  ? "Difficult (College)"
                  : "Very Difficult (Graduate)";

    return JSON.stringify(
      {
        words,
        sentences,
        syllables,
        complexWords,
        fleschKincaid: { score: parseFloat(fk.toFixed(2)), level: grade(fk) },
        gunningFog: parseFloat(gf.toFixed(2)),
        smog: parseFloat(smog.toFixed(2)),
      },
      null,
      2,
    );
  } catch (err) {
    return `Error: ${(err as Error).message}`;
  }
}

// ─── Text language detect advanced ──────────────────────────────────────────
export function textLanguageDetectAdvanced(text: string): string {
  const patterns: Record<string, RegExp[]> = {
    English: [/\b(the|and|is|are|was|were|have|has|you|your)\b/gi],
    French: [/\b(le|la|les|de|du|des|et|ou|est|sont|avec|pour|dans|sur)\b/gi],
    Spanish: [/\b(el|la|los|las|de|y|es|son|con|para|en|por|que)\b/gi],
    German: [/\b(der|die|das|und|ist|sind|mit|für|in|auf|ein|eine)\b/gi],
    Italian: [/\b(il|la|lo|le|di|e|è|sono|con|per|in|che)\b/gi],
    Portuguese: [/\b(o|a|os|as|de|e|é|são|com|para|em|que)\b/gi],
    Russian: [/[\u0400-\u04FF]/g],
    Chinese: [/[\u4e00-\u9fff]/g],
    Japanese: [/[\u3040-\u309f\u30a0-\u30ff]/g],
    Korean: [/[\uac00-\ud7af]/g],
    Arabic: [/[\u0600-\u06ff]/g],
  };

  const scores: Record<string, number> = {};
  for (const [lang, regexes] of Object.entries(patterns)) {
    scores[lang] = regexes.reduce((sum, re) => sum + (text.match(re) || []).length, 0);
  }

  const sorted = Object.entries(scores).sort((a, b) => b[1] - a[1]);
  const [topLang, topScore] = sorted[0];
  const total = sorted.reduce((s, [, score]) => s + score, 0) || 1;
  const confidence = ((topScore / total) * 100).toFixed(1);

  return JSON.stringify(
    {
      detected: topLang,
      confidence: `${confidence}%`,
      scores: sorted.filter(([, s]) => s > 0).slice(0, 5),
    },
    null,
    2,
  );
}

// ─── Text transliterate ─────────────────────────────────────────────────────
export function textTransliterate(text: string, fromScript: string, toScript: string): string {
  // Basic Cyrillic to Latin transliteration
  if (fromScript === "cyrillic" && toScript === "latin") {
    const map: Record<string, string> = {
      а: "a",
      б: "b",
      в: "v",
      г: "g",
      д: "d",
      е: "e",
      ё: "yo",
      ж: "zh",
      з: "z",
      и: "i",
      й: "y",
      к: "k",
      л: "l",
      м: "m",
      н: "n",
      о: "o",
      п: "p",
      р: "r",
      с: "s",
      т: "t",
      у: "u",
      ф: "f",
      х: "h",
      ц: "ts",
      ч: "ch",
      ш: "sh",
      щ: "sch",
      ъ: "",
      ы: "y",
      ь: "",
      э: "e",
      ю: "yu",
      я: "ya",
    };
    return text
      .split("")
      .map((c) => map[c.toLowerCase()] || c)
      .join("");
  }
  return `Transliteration from ${fromScript} to ${toScript} not supported. Available: cyrillic -> latin`;
}

// ─── Text phonetic match ────────────────────────────────────────────────────
export function textPhoneticMatch(word1: string, word2: string): string {
  // Soundex algorithm
  const soundex = (s: string): string => {
    const codes: Record<string, string> = {
      b: "1",
      f: "1",
      p: "1",
      v: "1",
      c: "2",
      g: "2",
      j: "2",
      k: "2",
      q: "2",
      s: "2",
      x: "2",
      z: "2",
      d: "3",
      t: "3",
      l: "4",
      m: "5",
      n: "5",
      r: "6",
    };
    let result = s[0].toUpperCase();
    let prev = codes[s[0].toLowerCase()] || "";
    for (let i = 1; i < s.length && result.length < 4; i++) {
      const code = codes[s[i].toLowerCase()] || "";
      if (code && code !== prev) result += code;
      prev = code;
    }
    return result.padEnd(4, "0");
  };

  const s1 = soundex(word1);
  const s2 = soundex(word2);
  return JSON.stringify({ word1, soundex1: s1, word2, soundex2: s2, match: s1 === s2 });
}

// ─── Text stem lemmatize ────────────────────────────────────────────────────
export function textStemLemmatize(text: string, operation: string): string {
  // Simple Porter-like stemmer
  const stem = (word: string): string => {
    let w = word.toLowerCase();
    if (w.length <= 3) return w;
    // Remove common suffixes
    w = w.replace(/(ies)$/, "y");
    w = w.replace(/(sses)$/, "ss");
    w = w.replace(/(ss)$/, "ss");
    w = w.replace(/(ing)$/, "");
    w = w.replace(/(ed)$/, "");
    w = w.replace(/(ly)$/, "");
    w = w.replace(/(ment)$/, "");
    w = w.replace(/(ness)$/, "");
    w = w.replace(/(tion)$/, "t");
    w = w.replace(/(s)$/, "");
    return w;
  };

  const words = text.match(/\b\w+\b/g) || [];
  const processed = words.map(operation === "lemmatize" ? (w) => w.toLowerCase() : stem);
  return processed.join(" ");
}

// ─── Text n-gram generator ──────────────────────────────────────────────────
export function textNgramGenerator(text: string, n: number): string {
  try {
    const words = text.toLowerCase().match(/\b\w+\b/g) || [];
    const useN = n || 2;
    const grams: Record<string, number> = {};
    for (let i = 0; i <= words.length - useN; i++) {
      const gram = words.slice(i, i + useN).join(" ");
      grams[gram] = (grams[gram] || 0) + 1;
    }
    const sorted = Object.entries(grams)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 20);
    return JSON.stringify(
      {
        n: useN,
        total: Object.keys(grams).length,
        topGrams: sorted.map(([gram, count]) => ({ gram, count })),
      },
      null,
      2,
    );
  } catch (err) {
    return `Error: ${(err as Error).message}`;
  }
}

// ─── Text regex tester ──────────────────────────────────────────────────────
export function textRegexTester(pattern: string, flags: string, testString: string): string {
  try {
    const re = new RegExp(pattern, flags || "g");
    const matches: { match: string; index: number; groups: string[] }[] = [];
    let m: RegExpExecArray | null;
    while ((m = re.exec(testString)) !== null) {
      matches.push({ match: m[0], index: m.index, groups: m.slice(1) });
      if (!re.global) break;
    }
    return JSON.stringify(
      { pattern, flags, totalMatches: matches.length, matches: matches.slice(0, 20) },
      null,
      2,
    );
  } catch (err) {
    return `Error: ${(err as Error).message}`;
  }
}

// ─── Text fuzzy match ───────────────────────────────────────────────────────
export function textFuzzyMatch(s1: string, s2: string): string {
  // Levenshtein distance
  const matrix: number[][] = Array(s1.length + 1)
    .fill(0)
    .map(() => Array(s2.length + 1).fill(0));
  for (let i = 0; i <= s1.length; i++) matrix[i][0] = i;
  for (let j = 0; j <= s2.length; j++) matrix[0][j] = j;
  for (let i = 1; i <= s1.length; i++) {
    for (let j = 1; j <= s2.length; j++) {
      const cost = s1[i - 1] === s2[j - 1] ? 0 : 1;
      matrix[i][j] = Math.min(
        matrix[i - 1][j] + 1,
        matrix[i][j - 1] + 1,
        matrix[i - 1][j - 1] + cost,
      );
    }
  }
  const distance = matrix[s1.length][s2.length];
  const maxLen = Math.max(s1.length, s2.length);
  const similarity = ((1 - distance / maxLen) * 100).toFixed(1);

  // Jaro-Winkler
  const jaro = (() => {
    const matchDist = Math.floor(Math.max(s1.length, s2.length) / 2) - 1;
    const s1Matches = Array(s1.length).fill(false);
    const s2Matches = Array(s2.length).fill(false);
    let matches = 0;
    for (let i = 0; i < s1.length; i++) {
      const start = Math.max(0, i - matchDist);
      const end = Math.min(i + matchDist + 1, s2.length);
      for (let j = start; j < end; j++) {
        if (!s2Matches[j] && s1[i] === s2[j]) {
          s1Matches[i] = true;
          s2Matches[j] = true;
          matches++;
          break;
        }
      }
    }
    if (matches === 0) return 0;
    let transpositions = 0,
      k = 0;
    for (let i = 0; i < s1.length; i++) {
      if (s1Matches[i]) {
        while (!s2Matches[k]) k++;
        if (s1[i] !== s2[k]) transpositions++;
        k++;
      }
    }
    return (
      (matches / s1.length + matches / s2.length + (matches - transpositions / 2) / matches) / 3
    );
  })();

  return JSON.stringify(
    {
      levenshteinDistance: distance,
      similarity: `${similarity}%`,
      jaroWinkler: parseFloat(jaro.toFixed(4)),
    },
    null,
    2,
  );
}

// ─── Text extract emails ────────────────────────────────────────────────────
export function textExtractEmails(text: string): string {
  const emails = [...new Set(text.match(/[\w.+-]+@[\w-]+\.[\w.-]+/g) || [])];
  return JSON.stringify({ total: emails.length, emails }, null, 2);
}

// ─── Text extract URLs ──────────────────────────────────────────────────────
export function textExtractUrls(text: string): string {
  const urls = [...new Set(text.match(/https?:\/\/[^\s<>"']+/g) || [])];
  return JSON.stringify({ total: urls.length, urls }, null, 2);
}

// ─── Text extract IPs ───────────────────────────────────────────────────────
export function textExtractIps(text: string): string {
  const ips = [...new Set(text.match(/\b(?:\d{1,3}\.){3}\d{1,3}\b/g) || [])];
  return JSON.stringify({ total: ips.length, ips }, null, 2);
}

// ─── Text extract phone numbers ─────────────────────────────────────────────
export function textExtractPhoneNumbers(text: string): string {
  const phones = [
    ...new Set(text.match(/(\+?\d{1,3}[-.\s]?)?\(?\d{3}\)?[-.\s]?\d{3,4}[-.\s]?\d{4}/g) || []),
  ];
  return JSON.stringify({ total: phones.length, phones }, null, 2);
}

// ─── Text redact PII ────────────────────────────────────────────────────────
export function textRedactPii(text: string): string {
  let redacted = text;
  redacted = redacted.replace(/[\w.+-]+@[\w-]+\.[\w.-]+/g, "[EMAIL REDACTED]");
  redacted = redacted.replace(
    /(\+?\d{1,3}[-.\s]?)?\(?\d{3}\)?[-.\s]?\d{3,4}[-.\s]?\d{4}/g,
    "[PHONE REDACTED]",
  );
  redacted = redacted.replace(/\b\d{3}-\d{2}-\d{4}\b/g, "[SSN REDACTED]");
  redacted = redacted.replace(/\b(?:\d[ -]*?){13,16}\b/g, "[CARD REDACTED]");
  redacted = redacted.replace(/\b\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3}\b/g, "[IP REDACTED]");
  return redacted;
}

// ─── Text markdown to plain ──────────────────────────────────────────────────
export function textMarkdownToPlain(markdown: string): string {
  return markdown
    .replace(/!\[([^\]]*)\]\([^)]+\)/g, "$1")
    .replace(/\[([^\]]*)\]\([^)]+\)/g, "$1")
    .replace(/```[\s\S]*?```/g, "[CODE BLOCK]")
    .replace(/`([^`]+)`/g, "$1")
    .replace(/[*_]{1,3}([^*_]+)[*_]{1,3}/g, "$1")
    .replace(/^#+\s+/gm, "")
    .replace(/^>\s+/gm, "")
    .replace(/^[-*+]\s+/gm, "")
    .replace(/^\d+\.\s+/gm, "")
    .replace(/\|/g, " ")
    .replace(/-{3,}/g, "")
    .trim();
}

// ─── Text HTML to markdown ───────────────────────────────────────────────────
export function textHtmlToMarkdown(html: string): string {
  return html
    .replace(/<h1[^>]*>(.*?)<\/h1>/gi, "# $1\n")
    .replace(/<h2[^>]*>(.*?)<\/h2>/gi, "## $1\n")
    .replace(/<h3[^>]*>(.*?)<\/h3>/gi, "### $1\n")
    .replace(/<strong[^>]*>(.*?)<\/strong>/gi, "**$1**")
    .replace(/<b[^>]*>(.*?)<\/b>/gi, "**$1**")
    .replace(/<em[^>]*>(.*?)<\/em>/gi, "*$1*")
    .replace(/<i[^>]*>(.*?)<\/i>/gi, "*$1*")
    .replace(/<code[^>]*>(.*?)<\/code>/gi, "`$1`")
    .replace(/<a[^>]*href="([^"]+)"[^>]*>(.*?)<\/a>/gi, "[$2]($1)")
    .replace(/<img[^>]*src="([^"]+)"[^>]*alt="([^"]*)"[^>]*>/gi, "![$2]($1)")
    .replace(/<li[^>]*>(.*?)<\/li>/gi, "- $1\n")
    .replace(/<ul[^>]*>([\s\S]*?)<\/ul>/gi, "$1")
    .replace(/<ol[^>]*>([\s\S]*?)<\/ol>/gi, "$1")
    .replace(/<p[^>]*>(.*?)<\/p>/gi, "$1\n\n")
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<[^>]+>/g, "")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

// ─── Text CSV to JSON ────────────────────────────────────────────────────────
export function textCsvToJson(csv: string): string {
  try {
    const lines = csv.trim().split("\n");
    const headers = lines[0].split(",").map((h) => h.trim());
    const rows = lines.slice(1).map((line) => {
      const values = line.split(",");
      const obj: Record<string, string> = {};
      headers.forEach((h, i) => {
        obj[h] = (values[i] || "").trim();
      });
      return obj;
    });
    return JSON.stringify(rows, null, 2);
  } catch (err) {
    return `Error: ${(err as Error).message}`;
  }
}

// ─── Text JSON to CSV ────────────────────────────────────────────────────────
export function textJsonToCsv(jsonStr: string): string {
  try {
    const data = JSON.parse(jsonStr);
    if (!Array.isArray(data)) return "JSON must be an array of objects";
    const headers = Object.keys(data[0]);
    const csvLines = [headers.join(",")];
    for (const row of data) {
      csvLines.push(headers.map((h) => `"${String(row[h] ?? "").replace(/"/g, '""')}"`).join(","));
    }
    return csvLines.join("\n");
  } catch (err) {
    return `Error: ${(err as Error).message}`;
  }
}
