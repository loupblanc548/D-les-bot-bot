import type { ToolCallResult } from "../agentTools.js";

const ok = (d: string): ToolCallResult => ({ success: true, data: d });
const err = (d: string): ToolCallResult => ({ success: false, data: d });

export async function toolGrammarCheck(args: Record<string, unknown>): Promise<ToolCallResult> {
  const text = String(args.text || "").trim();
  const lang = String(args.language || "fr").trim();
  if (!text) return err("Paramètre manquant: text");
  try {
    const body = new URLSearchParams({ text, language: lang, enabledOnly: "false" });
    const res = await fetch("https://api.languagetool.org/v2/check", {
      method: "POST",
      body,
      signal: AbortSignal.timeout(15_000),
    });
    if (!res.ok) return err(`API error: ${res.status}`);
    const data = (await res.json()) as {
      matches?: Array<{
        message: string;
        offset: number;
        length: number;
        replacements?: Array<{ value: string }>;
      }>;
    };
    const m = data.matches || [];
    if (!m.length) return ok("✅ Aucune erreur!");
    const issues = m.slice(0, 10).map((x, i) => {
      const ex = text.slice(x.offset, x.offset + x.length);
      const s = x.replacements?.[0]?.value ? ` → **${x.replacements[0].value}**` : "";
      return `${i + 1}. ❌ "${ex}"${s}\n   ${x.message}`;
    });
    return ok(`📝 **${m.length} erreur(s):**\n\n${issues.join("\n\n")}`);
  } catch (e) {
    return err(`Erreur: ${e}`);
  }
}

export async function toolTextSummarize(args: Record<string, unknown>): Promise<ToolCallResult> {
  const text = String(args.text || "").trim();
  const n = Number(args.sentences) || 3;
  if (!text) return err("Paramètre: text");
  const sents = text.match(/[^.!?]+[.!?]+/g) || [text];
  if (sents.length <= n) return ok(`📄 ${text}`);
  const words = text.toLowerCase().split(/\s+/);
  const freq: Record<string, number> = {};
  const stop = new Set([
    "le",
    "la",
    "les",
    "de",
    "du",
    "des",
    "et",
    "en",
    "un",
    "une",
    "the",
    "a",
    "an",
    "is",
    "are",
    "in",
    "on",
    "of",
    "to",
    "for",
    "and",
    "or",
  ]);
  for (const w of words) {
    const c = w.replace(/[^a-zàâäéèêëïîôöùûüÿ]/gi, "");
    if (c.length > 3 && !stop.has(c)) freq[c] = (freq[c] || 0) + 1;
  }
  const scored = sents.map((s, i) => ({
    s,
    i,
    score: s
      .toLowerCase()
      .split(/\s+/)
      .reduce((sum, w) => sum + (freq[w.replace(/[^a-zàâäéèêëïîôöùûüÿ]/gi, "")] || 0), 0),
  }));
  const top = scored
    .sort((a, b) => b.score - a.score)
    .slice(0, n)
    .sort((a, b) => a.i - b.i);
  return ok(`📄 **Résumé:**\n${top.map((t) => t.s).join(" ")}`);
}

export async function toolTextCaseConvert(args: Record<string, unknown>): Promise<ToolCallResult> {
  const text = String(args.text || "");
  const mode = String(args.mode || "upper").trim();
  if (!text) return err("Paramètre: text");
  let r = text;
  if (mode === "upper") r = text.toUpperCase();
  else if (mode === "lower") r = text.toLowerCase();
  else if (mode === "title")
    r = text.replace(/\w\S*/g, (t) => t[0].toUpperCase() + t.slice(1).toLowerCase());
  else if (mode === "camel")
    r = text.toLowerCase().replace(/[^a-zA-Z0-9]+(.)/g, (_, c) => c.toUpperCase());
  else if (mode === "snake")
    r = text
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "_")
      .replace(/^_|_$/g, "");
  else if (mode === "kebab")
    r = text
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-|-$/g, "");
  else if (mode === "pascal")
    r = text.replace(/(?:^|\s|[-_])(\w)/g, (_, c) => c.toUpperCase()).replace(/[^a-zA-Z0-9]/g, "");
  return ok(`📝 **${mode}:** \`${r}\``);
}

export async function toolWordCounter(args: Record<string, unknown>): Promise<ToolCallResult> {
  const text = String(args.text || "");
  if (!text) return err("Paramètre: text");
  const w = text.trim().split(/\s+/).filter(Boolean).length;
  return ok(
    `📊 Mots: ${w} | Caractères: ${text.length} | Phrases: ${(text.match(/[.!?]+/g) || []).length || 1} | Lecture: ~${Math.ceil(w / 200)}min`,
  );
}

export async function toolTextToMorse(args: Record<string, unknown>): Promise<ToolCallResult> {
  const text = String(args.text || "").trim();
  const mode = String(args.mode || "encode").trim();
  if (!text) return err("Paramètre: text");
  const map: Record<string, string> = {
    A: ".-",
    B: "-...",
    C: "-.-.",
    D: "-..",
    E: ".",
    F: "..-.",
    G: "--.",
    H: "....",
    I: "..",
    J: ".---",
    K: "-.-",
    L: ".-..",
    M: "--",
    N: "-.",
    O: "---",
    P: ".--.",
    Q: "--.-",
    R: ".-.",
    S: "...",
    T: "-",
    U: "..-",
    V: "...-",
    W: ".--",
    X: "-..-",
    Y: "-.--",
    Z: "--..",
    "0": "-----",
    "1": ".----",
    "2": "..---",
    "3": "...--",
    "4": "....-",
    "5": ".....",
    "6": "-....",
    "7": "--...",
    "8": "---..",
    "9": "----.",
    ".": ".-.-.-",
    ",": "--..--",
    "?": "..--..",
    "!": "-.-.--",
    " ": "/",
  };
  if (mode === "encode")
    return ok(
      `📡 **Morse:** ${text
        .toUpperCase()
        .split("")
        .map((c) => map[c] || "")
        .filter(Boolean)
        .join(" ")}`,
    );
  const rev = Object.fromEntries(Object.entries(map).map(([k, v]) => [v, k]));
  return ok(
    `📡 **Décodé:** ${text
      .split(" ")
      .map((c) => rev[c] || "")
      .join("")}`,
  );
}

export async function toolRot13(args: Record<string, unknown>): Promise<ToolCallResult> {
  const text = String(args.text || "");
  if (!text) return err("Paramètre: text");
  return ok(
    `🔐 **ROT13:** ${text.replace(/[a-zA-Z]/g, (c) => {
      const b = c.charCodeAt(0) >= 97 ? 97 : 65;
      return String.fromCharCode(((c.charCodeAt(0) - b + 13) % 26) + b);
    })}`,
  );
}

export async function toolCaesarCipher(args: Record<string, unknown>): Promise<ToolCallResult> {
  const text = String(args.text || "");
  let shift = Number(args.shift) || 3;
  const mode = String(args.mode || "encrypt").trim();
  if (!text) return err("Paramètre: text");
  if (mode === "decrypt") shift = -shift;
  return ok(
    `🔐 **César (${shift}):** ${text.replace(/[a-zA-Z]/g, (c) => {
      const b = c.charCodeAt(0) >= 97 ? 97 : 65;
      return String.fromCharCode(((c.charCodeAt(0) - b + shift + 260) % 26) + b);
    })}`,
  );
}

export async function toolPalindromeCheck(args: Record<string, unknown>): Promise<ToolCallResult> {
  const text = String(args.text || "").trim();
  if (!text) return err("Paramètre: text");
  const c = text.toLowerCase().replace(/[^a-z0-9]/g, "");
  const isP = c === c.split("").reverse().join("");
  return ok(`${isP ? "✅" : "❌"} "${text}" ${isP ? "est" : "n'est pas"} un palindrome`);
}

export async function toolAnagramSolver(args: Record<string, unknown>): Promise<ToolCallResult> {
  const word = String(args.word || "")
    .trim()
    .toLowerCase();
  if (!word) return err("Paramètre: word");
  if (word.length > 8) return err("Max 8 lettres");
  const perms = new Set<string>();
  const permute = (s: string, p: string) => {
    if (s.length <= 1) {
      if (p !== word) perms.add(p);
      return;
    }
    for (let i = 0; i < s.length; i++) permute(s.slice(0, i) + s.slice(i + 1), p + s[i]);
  };
  permute(word, "");
  return ok(`🔤 **Anagrammes de "${word}":**\n${[...perms].slice(0, 20).join(", ") || "Aucune"}`);
}

export async function toolRomanNumeralConvert(
  args: Record<string, unknown>,
): Promise<ToolCallResult> {
  const input = String(args.input || "").trim();
  if (!input) return err("Paramètre: input");
  if (/^[0-9]+$/.test(input)) {
    const num = parseInt(input);
    if (num < 1 || num > 3999) return err("1-3999");
    const vals: [number, string][] = [
      [1000, "M"],
      [900, "CM"],
      [500, "D"],
      [400, "CD"],
      [100, "C"],
      [90, "XC"],
      [50, "L"],
      [40, "XL"],
      [10, "X"],
      [9, "IX"],
      [5, "V"],
      [4, "IV"],
      [1, "I"],
    ];
    let r = "",
      n = num;
    for (const [v, s] of vals)
      while (n >= v) {
        r += s;
        n -= v;
      }
    return ok(`🔢 ${input} → **${r}**`);
  }
  const vals: Record<string, number> = { I: 1, V: 5, X: 10, L: 50, C: 100, D: 500, M: 1000 };
  let r = 0;
  for (let i = 0; i < input.length; i++) {
    const c = vals[input[i].toUpperCase()],
      n = vals[input[i + 1]?.toUpperCase()];
    if (n && c < n) {
      r += n - c;
      i++;
    } else r += c;
  }
  return ok(`🔢 ${input} → **${r}**`);
}

export async function toolLeetSpeak(args: Record<string, unknown>): Promise<ToolCallResult> {
  const text = String(args.text || "");
  if (!text) return err("Paramètre: text");
  const map: Record<string, string> = {
    a: "4",
    e: "3",
    g: "6",
    i: "1",
    l: "1",
    o: "0",
    s: "5",
    t: "7",
    b: "8",
    A: "4",
    E: "3",
    G: "6",
    I: "1",
    L: "1",
    O: "0",
    S: "5",
    T: "7",
    B: "8",
  };
  return ok(
    `💻 **Leet:** ${text
      .split("")
      .map((c) => map[c] || c)
      .join("")}`,
  );
}

export async function toolAccentRemover(args: Record<string, unknown>): Promise<ToolCallResult> {
  const text = String(args.text || "");
  if (!text) return err("Paramètre: text");
  return ok(`📝 **Sans accents:** ${text.normalize("NFD").replace(/[\u0300-\u036f]/g, "")}`);
}

export async function toolTextReverse(args: Record<string, unknown>): Promise<ToolCallResult> {
  const text = String(args.text || "");
  const mode = String(args.mode || "chars").trim();
  if (!text) return err("Paramètre: text");
  return ok(
    `🔄 **Inversé:** ${mode === "words" ? text.split(/\s+/).reverse().join(" ") : text.split("").reverse().join("")}`,
  );
}

export async function toolTextSimilarity(args: Record<string, unknown>): Promise<ToolCallResult> {
  const t1 = String(args.text1 || ""),
    t2 = String(args.text2 || "");
  if (!t1 || !t2) return err("Paramètres: text1, text2");
  const lev = (a: string, b: string): number => {
    const m = a.length,
      n = b.length;
    const dp = Array.from({ length: m + 1 }, () => new Array(n + 1).fill(0));
    for (let i = 0; i <= m; i++) dp[i][0] = i;
    for (let j = 0; j <= n; j++) dp[0][j] = j;
    for (let i = 1; i <= m; i++)
      for (let j = 1; j <= n; j++)
        dp[i][j] =
          a[i - 1] === b[j - 1]
            ? dp[i - 1][j - 1]
            : 1 + Math.min(dp[i - 1][j], dp[i][j - 1], dp[i - 1][j - 1]);
    return dp[m][n];
  };
  const dist = lev(t1, t2),
    max = Math.max(t1.length, t2.length);
  return ok(
    `📊 **Similarité: ${max > 0 ? ((1 - dist / max) * 100).toFixed(1) : "100"}%** (distance: ${dist})`,
  );
}

export async function toolTextDiff(args: Record<string, unknown>): Promise<ToolCallResult> {
  const t1 = String(args.text1 || ""),
    t2 = String(args.text2 || "");
  if (!t1 || !t2) return err("Paramètres: text1, text2");
  const l1 = t1.split("\n"),
    l2 = t2.split("\n");
  const max = Math.max(l1.length, l2.length);
  const diffs: string[] = [];
  for (let i = 0; i < max; i++)
    if (l1[i] !== l2[i]) {
      if (l1[i] !== undefined) diffs.push(`- L${i + 1}: ${l1[i]}`);
      if (l2[i] !== undefined) diffs.push(`+ L${i + 1}: ${l2[i]}`);
    }
  if (!diffs.length) return ok("✅ Textes identiques!");
  return ok(`📝 **Diff:**\n\`\`\`diff\n${diffs.slice(0, 30).join("\n")}\n\`\`\``);
}

export async function toolMarkdownToHtml(args: Record<string, unknown>): Promise<ToolCallResult> {
  const md = String(args.markdown || "");
  if (!md) return err("Paramètre: markdown");
  const html = md
    .replace(/^### (.+)$/gm, "<h3>$1</h3>")
    .replace(/^## (.+)$/gm, "<h2>$1</h2>")
    .replace(/^# (.+)$/gm, "<h1>$1</h1>")
    .replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>")
    .replace(/\*(.+?)\*/g, "<em>$1</em>")
    .replace(/`(.+?)`/g, "<code>$1</code>")
    .replace(/\[(.+?)\]\((.+?)\)/g, '<a href="$2">$1</a>')
    .replace(/^\- (.+)$/gm, "<li>$1</li>");
  return ok(`📝 **HTML:**\n\`\`\`html\n${html.slice(0, 1800)}\n\`\`\``);
}

export async function toolJsonFormatter(args: Record<string, unknown>): Promise<ToolCallResult> {
  const j = String(args.json || "");
  const min = args.minify === true;
  if (!j) return err("Paramètre: json");
  try {
    const p = JSON.parse(j);
    const r = min ? JSON.stringify(p) : JSON.stringify(p, null, 2);
    return ok(`📋 **JSON:**\n\`\`\`json\n${r.slice(0, 1800)}\n\`\`\``);
  } catch (e) {
    return err(`JSON invalide: ${e}`);
  }
}

export async function toolUrlEncodeDecode(args: Record<string, unknown>): Promise<ToolCallResult> {
  const text = String(args.text || "");
  const mode = String(args.mode || "encode").trim();
  if (!text) return err("Paramètre: text");
  return ok(
    `🔗 **URL ${mode}d:** ${mode === "encode" ? encodeURIComponent(text) : decodeURIComponent(text)}`,
  );
}

export async function toolHtmlEntityEncodeDecode(
  args: Record<string, unknown>,
): Promise<ToolCallResult> {
  const text = String(args.text || "");
  const mode = String(args.mode || "encode").trim();
  if (!text) return err("Paramètre: text");
  if (mode === "encode")
    return ok(
      `📝 **HTML:** ${text.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c] || c)}`,
    );
  return ok(
    `📝 **HTML décodé:** ${text
      .replace(/&amp;/g, "&")
      .replace(/&lt;/g, "<")
      .replace(/&gt;/g, ">")
      .replace(/&quot;/g, '"')
      .replace(/&#39;/g, "'")}`,
  );
}

export async function toolBase32EncodeDecode(
  args: Record<string, unknown>,
): Promise<ToolCallResult> {
  const text = String(args.text || "");
  const mode = String(args.mode || "encode").trim();
  if (!text) return err("Paramètre: text");
  const alpha = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";
  if (mode === "encode") {
    const bytes = Buffer.from(text, "utf8");
    let bits = 0,
      val = 0,
      out = "";
    for (const b of bytes) {
      val = (val << 8) | b;
      bits += 8;
      while (bits >= 5) {
        out += alpha[(val >>> (bits - 5)) & 31];
        bits -= 5;
      }
    }
    if (bits > 0) out += alpha[(val << (5 - bits)) & 31];
    return ok(`🔐 **Base32:** ${out}`);
  }
  const lookup: Record<string, number> = {};
  alpha.split("").forEach((c, i) => (lookup[c] = i));
  let bits = 0,
    val = 0;
  const bytes: number[] = [];
  for (const c of text.toUpperCase()) {
    if (c in lookup) {
      val = (val << 5) | lookup[c];
      bits += 5;
      if (bits >= 8) {
        bytes.push((val >>> (bits - 8)) & 255);
        bits -= 8;
      }
    }
  }
  return ok(`🔐 **Décodé:** ${Buffer.from(bytes).toString("utf8")}`);
}

export async function toolHashIdentifier(args: Record<string, unknown>): Promise<ToolCallResult> {
  const hash = String(args.hash || "").trim();
  if (!hash) return err("Paramètre: hash");
  const types: Array<{ n: string; r: RegExp }> = [
    { n: "MD5", r: /^[a-f0-9]{32}$/i },
    { n: "SHA-1", r: /^[a-f0-9]{40}$/i },
    { n: "SHA-256", r: /^[a-f0-9]{64}$/i },
    { n: "SHA-384", r: /^[a-f0-9]{96}$/i },
    { n: "SHA-512", r: /^[a-f0-9]{128}$/i },
    { n: "bcrypt", r: /^\$2[abxy]\$/ },
    { n: "argon2", r: /^\$argon2/ },
    { n: "Base64", r: /^[A-Za-z0-9+/]+={0,2}$/ },
  ];
  const m = types.filter((t) => t.r.test(hash));
  return ok(`🔍 **Hash:** ${m.length ? m.map((x) => x.n).join(" ou ") : "Non identifié"}`);
}
