/**
 * knowledgeSources.ts — Sources de connaissances gratuites (sans clé API)
 *
 * Chaque fonction détecte si la question correspond à son domaine,
 * fetch les données, et retourne un contexte formaté pour l'IA.
 * Intégré dans gatherExternalKnowledge() de aichat.ts.
 */

import logger from "../utils/logger.js";

// ── 1. Séismes (USGS) ─────────────────────────────────────────────

async function fetchEarthquakes(query: string): Promise<string | null> {
  const lower = query.toLowerCase();
  if (!lower.match(/s[éèe]isme|earthquake|tremblement/)) return null;

  try {
    const res = await fetch(
      "https://earthquake.usgs.gov/earthquakes/feed/v1.0/summary/significant_week.geojson",
      { signal: AbortSignal.timeout(8_000) },
    );
    if (!res.ok) return null;
    const data = (await res.json()) as {
      features?: Array<{
        properties?: { mag?: number; place?: string; time?: number; url?: string };
      }>;
    };
    const quakes = (data.features || []).slice(0, 5);
    if (quakes.length === 0) return "Aucun séisme significatif cette semaine.";

    const lines = quakes.map((q) => {
      const p = q.properties || {};
      const date = p.time ? new Date(p.time).toLocaleDateString("fr-FR") : "?";
      return `🌍 M${p.mag || "?"} — ${p.place || "?"} (${date})${p.url ? ` | ${p.url}` : ""}`;
    });
    return `📊 **Séismes significatifs (7 derniers jours):**\n${lines.join("\n")}`;
  } catch {
    return null;
  }
}

// ── 2. Conversion de devises ───────────────────────────────────────

async function fetchCurrencyConversion(query: string): Promise<string | null> {
  const lower = query.toLowerCase();
  const match = lower.match(/(\d+(?:[.,]\d+)?)\s*([a-z]{3})\s*(?:en|to|vers|in)\s*([a-z]{3})/);
  if (!match) return null;

  const amount = parseFloat(match[1].replace(",", "."));
  const from = match[2].toUpperCase();
  const to = match[3].toUpperCase();

  try {
    const res = await fetch(`https://open.er-api.com/v6/latest/${from}`, {
      signal: AbortSignal.timeout(5_000),
    });
    if (!res.ok) return null;
    const data = (await res.json()) as { rates?: Record<string, number> };
    const rate = data.rates?.[to];
    if (!rate) return null;
    const result = (amount * rate).toFixed(2);
    return `💱 **${amount} ${from}** = **${result} ${to}** (taux: 1 ${from} = ${rate.toFixed(4)} ${to})`;
  } catch {
    return null;
  }
}

// ── 3. Dictionnaire (Free Dictionary API) ──────────────────────────

async function fetchDictionary(query: string): Promise<string | null> {
  const lower = query.toLowerCase();
  const match =
    lower.match(/d[ée]finition(?:de\s+)?(.+)/) ||
    lower.match(/meaning of\s+(.+)/) ||
    lower.match(/que veut dire\s+(.+)/);
  if (!match) return null;

  const word = match[1].replace(/[?.!]/g, "").trim().split(/\s+/)[0];
  if (!word || word.length < 2) return null;

  try {
    const res = await fetch(
      `https://api.dictionaryapi.dev/api/v2/entries/en/${encodeURIComponent(word)}`,
      { signal: AbortSignal.timeout(5_000) },
    );
    if (!res.ok) return null;
    const data = (await res.json()) as Array<{
      meanings?: Array<{
        partOfSpeech?: string;
        definitions?: Array<{ definition?: string; example?: string }>;
      }>;
      phonetic?: string;
    }>;
    if (!data[0]?.meanings?.[0]) return null;

    const meanings = data[0].meanings.slice(0, 3);
    const lines = meanings.map((m) => {
      const def = m.definitions?.[0]?.definition || "";
      const pos = m.partOfSpeech || "";
      return `**${pos}**: ${def}`;
    });
    const phonetic = data[0].phonetic || "";
    return `📖 **${word}**${phonetic ? ` ${phonetic}` : ""}\n${lines.join("\n")}`;
  } catch {
    return null;
  }
}

// ── 4. Articles scientifiques (Crossref) ───────────────────────────

async function fetchScientificArticles(query: string): Promise<string | null> {
  const lower = query.toLowerCase();
  if (
    !lower.match(
      /article scientifique|scientific|recherche scientifique|study|paper|étude scientifique|publication/,
    )
  )
    return null;

  const searchTerm = lower
    .replace(
      /article scientifique sur|recherche scientifique sur|étude scientifique sur|scientific articles? about|study on|paper on|publication sur/,
      "",
    )
    .trim();
  if (!searchTerm || searchTerm.length < 3) return null;

  try {
    const res = await fetch(
      `https://api.crossref.org/works?query=${encodeURIComponent(searchTerm)}&rows=5&select=title,abstract,URL,published`,
      { signal: AbortSignal.timeout(8_000) },
    );
    if (!res.ok) return null;
    const data = (await res.json()) as {
      message?: {
        items?: Array<{ title?: string[]; URL?: string; published?: { dateParts?: number[][] } }>;
      };
    };
    const items = data.message?.items || [];
    if (items.length === 0) return null;

    const lines = items.map((item) => {
      const title = item.title?.[0] || "Sans titre";
      const year = item.published?.dateParts?.[0]?.[0] || "?";
      const url = item.URL || "";
      return `📄 **${title}** (${year})${url ? `\n   ${url}` : ""}`;
    });
    return `🔬 **Articles scientifiques:**\n${lines.join("\n")}`;
  } catch {
    return null;
  }
}

// ── 5. Fact-checking (Google Fact Check) ───────────────────────────

async function fetchFactCheck(query: string): Promise<string | null> {
  const lower = query.toLowerCase();
  if (!lower.match(/vrai|faux|fact.?check|info ou intox|rumeur|fake news|true or false/))
    return null;

  const claim = lower
    .replace(
      /est.?ce que c'est vrai|vrai ou faux|fact check|rumeur|fake news|info ou intox|is it true|true or false/,
      "",
    )
    .trim();
  if (!claim || claim.length < 5) return null;

  try {
    const apiKey = process.env.GEMINI_API_KEY || process.env.GOOGLE_API_KEY;
    if (!apiKey) return null;
    const res = await fetch(
      `https://factchecktools.googleapis.com/v1factcheckclaims:search?query=${encodeURIComponent(claim)}&key=${apiKey}`,
      { signal: AbortSignal.timeout(8_000) },
    );
    if (!res.ok) return null;
    const data = (await res.json()) as {
      claims?: Array<{
        text?: string;
        claimReview?: Array<{
          textualRating?: string;
          publisher?: { name?: string };
          url?: string;
        }>;
      }>;
    };
    const claims = (data.claims || []).slice(0, 3);
    if (claims.length === 0) return null;

    const lines = claims.map((c) => {
      const review = c.claimReview?.[0];
      const rating = review?.textualRating || "Non vérifié";
      const publisher = review?.publisher?.name || "?";
      const url = review?.url || "";
      return `✅/❌ **${rating}** — ${publisher}${url ? `\n   ${url}` : ""}`;
    });
    return `🔍 **Fact-check:**\n${lines.join("\n")}`;
  } catch {
    return null;
  }
}

// ── 6. QR Code ─────────────────────────────────────────────────────

async function fetchQrCode(query: string): Promise<string | null> {
  const lower = query.toLowerCase();
  const match =
    lower.match(/qr code(?:de|pour|for)?\s*(.+)/) || lower.match(/g[ée]n[ée]re?\s*(?:un)?\s*qr/);
  if (!match) return null;

  const content = match[1]?.replace(/[?.!]/g, "").trim();
  if (!content || content.length < 2) return null;

  const qrUrl = `https://api.qrserver.com/v1/create-qr-code/?size=300x300&data=${encodeURIComponent(content)}`;
  return `📱 **QR Code généré:**\n${qrUrl}\nScannez cette URL pour obtenir le QR code.`;
}

// ── 7. Calculatrice scientifique ───────────────────────────────────

async function fetchCalculator(query: string): Promise<string | null> {
  const lower = query.toLowerCase();
  const match =
    lower.match(/calcule\s+(.+)/) || lower.match(/combien fait\s+(.+)/) || lower.match(/=\s*(.+)/);
  if (!match) return null;

  const expr = match[1].replace(/[?]/g, "").trim();
  if (!expr || expr.length < 1) return null;

  // Only allow numbers, operators, parentheses, decimal points
  if (!/^[\d\s+\-*/().%^]+$/.test(expr)) return null;

  try {
    // Safe evaluation: replace ^ with ** and % with /100*, then use a restricted eval
    const jsExpr = expr.replace(/\^/g, "**").replace(/%/g, "/100*");
    // Double-check no letters or dangerous tokens remain
    if (/[a-zA-Z]/.test(jsExpr)) return null;
    const result = Function(`"use strict"; return (${jsExpr})`)();
    if (typeof result === "number" && !isNaN(result) && isFinite(result)) {
      return `🧮 **${expr}** = **${result}**`;
    }
  } catch {
    return null;
  }
  return null;
}

// ── 8. Encodeur/Décodeur ───────────────────────────────────────────

async function fetchEncodeDecode(query: string): Promise<string | null> {
  const lower = query.toLowerCase();

  const b64enc = lower.match(/base64\s*(?:encode|encoder)\s+(.+)/);
  if (b64enc) {
    try {
      const result = Buffer.from(b64enc[1].trim()).toString("base64");
      return `🔐 **Base64 encode:**\n\`${result}\``;
    } catch {
      return null;
    }
  }

  const b64dec = lower.match(/base64\s*(?:decode|d[ée]coder)\s+(.+)/);
  if (b64dec) {
    try {
      const result = Buffer.from(b64dec[1].trim(), "base64").toString("utf-8");
      return `🔓 **Base64 decode:**\n\`${result}\``;
    } catch {
      return null;
    }
  }

  const urlEnc = lower.match(/url\s*(?:encode|encoder)\s+(.+)/);
  if (urlEnc) {
    const result = encodeURIComponent(urlEnc[1].trim());
    return `🔗 **URL encode:**\n\`${result}\``;
  }

  const urlDec = lower.match(/url\s*(?:decode|d[ée]coder)\s+(.+)/);
  if (urlDec) {
    try {
      const result = decodeURIComponent(urlDec[1].trim());
      return `🔗 **URL decode:**\n\`${result}\``;
    } catch {
      return null;
    }
  }

  const hexEnc = lower.match(/hex\s*(?:encode|encoder)\s+(.+)/);
  if (hexEnc) {
    const result = Buffer.from(hexEnc[1].trim()).toString("hex");
    return `🔐 **Hex encode:**\n\`${result}\``;
  }

  return null;
}

// ── 9. Hash calculator ─────────────────────────────────────────────

async function fetchHash(query: string): Promise<string | null> {
  const lower = query.toLowerCase();
  const match = lower.match(/(?:hash|md5|sha256|sha512)\s+(?:de|of)?\s+(.+)/);
  if (!match) return null;

  const algoMatch = lower.match(/(md5|sha256|sha512)/);
  const algo = algoMatch?.[1] || "sha256";
  const input = match[1].replace(/[?.!]/g, "").trim();
  if (!input) return null;

  try {
    const crypto = await import("node:crypto");
    const hash = crypto.createHash(algo).update(input).digest("hex");
    return `🔐 **${algo.toUpperCase()}** de \`${input}\`:\n\`${hash}\``;
  } catch {
    return null;
  }
}

// ── 10. UUID Generator ─────────────────────────────────────────────

async function fetchUuid(query: string): Promise<string | null> {
  const lower = query.toLowerCase();
  if (!lower.match(/g[ée]n[ée]re?\s*(?:un)?\s*uuid|generate uuid|uuid al[ée]atoire/)) return null;

  try {
    const crypto = await import("node:crypto");
    const uuid = crypto.randomUUID();
    return `🆔 **UUID généré:**\n\`${uuid}\``;
  } catch {
    return null;
  }
}

// ── 11. Géolocalisation IP (ip-api.com — gratuit, pas de clé) ──────

async function fetchIpGeo(query: string): Promise<string | null> {
  const lower = query.toLowerCase();
  const match = lower.match(
    /(?:localise|g[ée]olocalise|ip info|where is|localisation)\s+(?:l'?ip\s+)?(\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3})/,
  );
  if (!match) return null;

  const ip = match[2];
  try {
    const res = await fetch(
      `http://ip-api.com/json/${ip}?lang=fr&fields=status,country,regionName,city,zip,lat,lon,timezone,isp,org,as`,
      { signal: AbortSignal.timeout(5_000) },
    );
    if (!res.ok) return null;
    const data = (await res.json()) as {
      status?: string;
      country?: string;
      regionName?: string;
      city?: string;
      zip?: string;
      lat?: number;
      lon?: number;
      timezone?: string;
      isp?: string;
      org?: string;
    };
    if (data.status !== "success") return null;
    return `🌍 **IP ${ip}**\n📍 ${data.city}, ${data.regionName}, ${data.country} ${data.zip || ""}\n🕐 ${data.timezone || "?"}\n🌐 ISP: ${data.isp || "?"}${data.org ? ` (${data.org})` : ""}\n🗺️ Coordonnées: ${data.lat}, ${data.lon}`;
  } catch {
    return null;
  }
}

// ── 12. Wayback Machine ────────────────────────────────────────────

async function fetchWayback(query: string): Promise<string | null> {
  const lower = query.toLowerCase();
  const match = lower.match(/wayback|archive web|ancienne version du site|cached version/);
  if (!match) return null;

  const urlMatch = lower.match(/(https?:\/\/[^\s]+)/);
  if (!urlMatch) return null;
  const url = urlMatch[1];

  try {
    const res = await fetch(
      `https://archive.org/wayback/available?url=${encodeURIComponent(url)}`,
      { signal: AbortSignal.timeout(8_000) },
    );
    if (!res.ok) return null;
    const data = (await res.json()) as {
      archived_snapshots?: { closest?: { available?: boolean; url?: string; timestamp?: string } };
    };
    const snapshot = data.archived_snapshots?.closest;
    if (!snapshot?.available) return `Aucune archive trouvée pour ${url}`;
    const date = snapshot.timestamp
      ? new Date(
          snapshot.timestamp.replace(
            /(\d{4})(\d{2})(\d{2})(\d{2})(\d{2})(\d{2})/,
            "$1-$2-$3 $4:$5:$6",
          ),
        ).toLocaleString("fr-FR")
      : "?";
    return `🗄️ **Archive Wayback Machine**\n${url}\n📅 Sauvegarde la plus proche: ${date}\n🔗 ${snapshot.url}`;
  } catch {
    return null;
  }
}

// ── 13. Open Trivia DB ─────────────────────────────────────────────

async function fetchTrivia(query: string): Promise<string | null> {
  const lower = query.toLowerCase();
  if (!lower.match(/trivia|question quiz|quiz question|culture g[ée]n[ée]rale/)) return null;

  try {
    const res = await fetch(
      "https://opentdb.com/api.php?amount=1&type=multiple&difficulty=medium",
      { signal: AbortSignal.timeout(5_000) },
    );
    if (!res.ok) return null;
    const data = (await res.json()) as {
      results?: Array<{ question?: string; correct_answer?: string; incorrect_answers?: string[] }>;
    };
    const q = data.results?.[0];
    if (!q) return null;
    const answers = [q.correct_answer, ...(q.incorrect_answers || [])].sort(
      () => Math.random() - 0.5,
    );
    const letters = ["A", "B", "C", "D"];
    const options = answers.map((a, i) => `${letters[i]}) ${a}`).join("\n");
    return `🧠 **Question trivia:**\n❓ ${q.question}\n\n${options}\n\n*(Réponse: ${q.correct_answer})*`;
  } catch {
    return null;
  }
}

// ── 14. Joke (free, no key) ────────────────────────────────────────

async function fetchJoke(query: string): Promise<string | null> {
  const lower = query.toLowerCase();
  if (!lower.match(/blague|joke|fais.?moi rire|raconte.?une blague/)) return null;

  try {
    const res = await fetch("https://v2.jokeapi.dev/joke/Any?lang=fr&type=single&safe-mode", {
      signal: AbortSignal.timeout(5_000),
    });
    if (!res.ok) return null;
    const data = (await res.json()) as {
      joke?: string;
      setup?: string;
      delivery?: string;
      type?: string;
    };
    if (data.type === "single" && data.joke) return `😄 **Blague:**\n${data.joke}`;
    if (data.setup && data.delivery) return `😄 ${data.setup}\n\n${data.delivery}`;
    return null;
  } catch {
    return null;
  }
}

// ── 15. Advice (free, no key) ──────────────────────────────────────

async function fetchAdvice(query: string): Promise<string | null> {
  const lower = query.toLowerCase();
  if (!lower.match(/conseil|advice|donne.?moi un conseil/)) return null;

  try {
    const res = await fetch("https://api.adviceslip.com/advice", {
      signal: AbortSignal.timeout(5_000),
    });
    if (!res.ok) return null;
    const data = (await res.json()) as { slip?: { advice?: string } };
    if (data.slip?.advice) return `💡 **Conseil du jour:**\n${data.slip.advice}`;
    return null;
  } catch {
    return null;
  }
}

// ── ORCHESTRATEUR ──────────────────────────────────────────────────

// ── 16. TMDB (films/séries) ────────────────────────────────────────

async function fetchTmdb(query: string): Promise<string | null> {
  const lower = query.toLowerCase();
  if (
    !lower.includes("film") &&
    !lower.includes("movie") &&
    !lower.includes("série") &&
    !lower.includes("serie") &&
    !lower.includes("tv show") &&
    !lower.includes("acteur") &&
    !lower.includes("actor")
  )
    return null;

  const searchMatch = lower.match(/(?:film|movie|série|serie|tv show)\s+(.+)/);
  if (!searchMatch) return null;
  const searchTerm = searchMatch[1].replace(/[?]/g, "").trim();
  if (!searchTerm || searchTerm.length < 2) return null;

  const apiKey = process.env.TMDB_API_KEY;
  if (!apiKey) return null;

  try {
    const url = `https://api.themoviedb.org/3/search/multi?api_key=${apiKey}&query=${encodeURIComponent(searchTerm)}&language=fr-FR&limit=3`;
    const res = await fetch(url, { signal: AbortSignal.timeout(8_000) });
    if (!res.ok) return null;
    const data = (await res.json()) as {
      results?: Array<{
        id: number;
        title?: string;
        name?: string;
        overview?: string;
        vote_average?: number;
        release_date?: string;
        media_type?: string;
        poster_path?: string;
      }>;
    };
    if (!data.results || data.results.length === 0) return null;

    const top = data.results.slice(0, 3);
    const lines = top.map((r) => {
      const title = r.title || r.name || "Inconnu";
      const type = r.media_type === "tv" ? "Série" : r.media_type === "movie" ? "Film" : "Autre";
      const note = r.vote_average ? ` ⭐${r.vote_average.toFixed(1)}` : "";
      const date = r.release_date ? ` (${r.release_date.slice(0, 4)})` : "";
      const overview = r.overview ? r.overview.slice(0, 200) : "Pas de synopsis";
      return `**${title}**${date}${note} [${type}]\n${overview}`;
    });
    return `🎬 **Résultats TMDB pour "${searchTerm}":**\n\n${lines.join("\n\n")}`;
  } catch {
    return null;
  }
}

// ── 17. NASA APOD (Astronomy Picture of the Day) ───────────────────

async function fetchNasaApod(query: string): Promise<string | null> {
  const lower = query.toLowerCase();
  if (
    !lower.includes("nasa") &&
    !lower.includes("apod") &&
    !lower.includes("astronomie") &&
    !lower.includes("astronomy") &&
    !lower.includes("espace") &&
    !lower.includes("photo du jour de l'espace")
  )
    return null;

  const apiKey = process.env.NASA_API_KEY || "DEMO_KEY";
  try {
    const url = `https://api.nasa.gov/planetary/apod?api_key=${apiKey}`;
    const res = await fetch(url, { signal: AbortSignal.timeout(8_000) });
    if (!res.ok) return null;
    const data = (await res.json()) as {
      title?: string;
      explanation?: string;
      url?: string;
      hdurl?: string;
      date?: string;
      media_type?: string;
    };
    if (data.media_type === "image" && data.url) {
      return `🚀 **NASA APOD — ${data.title || "Photo du jour"}** (${data.date || "aujourd'hui"})\n\n${data.explanation?.slice(0, 500) || ""}\n\n📸 ${data.url}`;
    }
    return null;
  } catch {
    return null;
  }
}

// ── 18. SSL Certificate Checker ────────────────────────────────────

async function fetchSslCheck(query: string): Promise<string | null> {
  const lower = query.toLowerCase();
  const match = lower.match(/(?:ssl|certificat|certificate)\s+(?:de\s+)?(.+)/);
  if (!match) return null;
  const domain = match[1]
    .replace(/^https?:\/\//, "")
    .replace(/\/.*$/, "")
    .replace(/[?]/g, "")
    .trim();
  if (!domain || !domain.includes(".")) return null;

  try {
    const url = `https://ssl-checker.io/api/v1/check/${encodeURIComponent(domain)}`;
    const res = await fetch(url, { signal: AbortSignal.timeout(10_000) });
    if (!res.ok) return null;
    const data = (await res.json()) as {
      valid?: boolean;
      issuer?: string;
      valid_from?: string;
      valid_to?: string;
      days_remaining?: number;
    };
    const status = data.valid ? "✅ Valide" : "❌ Invalide";
    const expiry = data.valid_to ? `Expire le: ${data.valid_to}` : "";
    const days =
      data.days_remaining !== undefined ? ` (${data.days_remaining} jours restants)` : "";
    const issuer = data.issuer ? `Émetteur: ${data.issuer}` : "";
    return `🔒 **SSL Check — ${domain}**\n${status}\n${issuer}\n${expiry}${days}`;
  } catch {
    return null;
  }
}

// ── 19. Open Graph Extractor ───────────────────────────────────────

async function fetchOpenGraph(query: string): Promise<string | null> {
  const lower = query.toLowerCase();
  if (
    !lower.includes("open graph") &&
    !lower.includes("og:") &&
    !lower.includes("métadonnées") &&
    !lower.includes("metadata")
  )
    return null;
  const urlMatch = lower.match(/https?:\/\/[^\s]+/);
  if (!urlMatch) return null;
  const targetUrl = urlMatch[0];

  try {
    const res = await fetch(targetUrl, { signal: AbortSignal.timeout(8_000) });
    if (!res.ok) return null;
    const html = await res.text();
    const ogTitle = html.match(/<meta\s+property="og:title"\s+content="([^"]+)"/i)?.[1];
    const ogDesc = html.match(/<meta\s+property="og:description"\s+content="([^"]+)"/i)?.[1];
    const ogImage = html.match(/<meta\s+property="og:image"\s+content="([^"]+)"/i)?.[1];
    const ogType = html.match(/<meta\s+property="og:type"\s+content="([^"]+)"/i)?.[1];
    if (!ogTitle && !ogDesc) return null;
    const parts = [`📋 **Open Graph — ${targetUrl}**`];
    if (ogTitle) parts.push(`**Titre:** ${ogTitle}`);
    if (ogType) parts.push(`**Type:** ${ogType}`);
    if (ogDesc) parts.push(`**Description:** ${ogDesc.slice(0, 300)}`);
    if (ogImage) parts.push(`**Image:** ${ogImage}`);
    return parts.join("\n");
  } catch {
    return null;
  }
}

// ── 20. Unit Converter ─────────────────────────────────────────────

async function fetchUnitConverter(query: string): Promise<string | null> {
  const lower = query.toLowerCase();
  const match = lower.match(/(?:convertir|convert)\s+([\d.]+)\s*(\w+)\s+(?:en|to|vers)\s*(\w+)/);
  if (!match) return null;
  const value = parseFloat(match[1]);
  const from = match[2].toLowerCase();
  const to = match[3].toLowerCase();

  type ConversionFactor = number | ((v: number) => number);
  const conversions: Record<string, Record<string, ConversionFactor>> = {
    cm: { inch: 0.393701, in: 0.393701, m: 0.01, mm: 10, ft: 0.0328084 },
    m: {
      cm: 100,
      km: 0.001,
      inch: 39.3701,
      in: 39.3701,
      ft: 3.28084,
      mile: 0.000621371,
      mi: 0.000621371,
    },
    km: { m: 1000, mile: 0.621371, mi: 0.621371 },
    mile: { km: 1.60934, m: 1609.34 },
    mi: { km: 1.60934, m: 1609.34 },
    kg: { lb: 2.20462, g: 1000, oz: 35.274 },
    g: { kg: 0.001, lb: 0.00220462, oz: 0.035274 },
    lb: { kg: 0.453592, g: 453.592, oz: 16 },
    c: { f: (v: number) => (v * 9) / 5 + 32, k: (v: number) => v + 273.15 },
    f: { c: (v: number) => ((v - 32) * 5) / 9, k: (v: number) => ((v - 32) * 5) / 9 + 273.15 },
    k: { c: (v: number) => v - 273.15, f: (v: number) => ((v - 273.15) * 9) / 5 + 32 },
    byte: { kb: 0.001, mb: 0.000001, gb: 0.000000001 },
    kb: { byte: 1000, mb: 0.001, gb: 0.000001 },
    mb: { byte: 1000000, kb: 1000, gb: 0.001 },
    gb: { mb: 1000, kb: 1000000, tb: 0.001 },
  };

  const fromTable = conversions[from];
  if (!fromTable || !(to in fromTable)) return null;
  const factor = fromTable[to];
  if (typeof factor === "function") {
    const result = factor(value);
    return `📏 **Conversion:** ${value} ${from} = ${result.toFixed(4)} ${to}`;
  }
  const result = value * factor;
  return `📏 **Conversion:** ${value} ${from} = ${result.toFixed(4)} ${to}`;
}

// ── 21. Timezone Converter ─────────────────────────────────────────

async function fetchTimezoneConverter(query: string): Promise<string | null> {
  const lower = query.toLowerCase();
  const match = lower.match(/(?:heure|time)\s+(?:à|in|at|de|of)\s+(.+)/);
  if (!match) return null;
  const city = match[1].replace(/[?]/g, "").trim();
  if (!city || city.length < 2) return null;

  const timezones: Record<string, string> = {
    paris: "Europe/Paris",
    france: "Europe/Paris",
    london: "Europe/London",
    uk: "Europe/London",
    "new york": "America/New_York",
    usa: "America/New_York",
    "los angeles": "America/Los_Angeles",
    tokyo: "Asia/Tokyo",
    japan: "Asia/Tokyo",
    japon: "Asia/Tokyo",
    sydney: "Australia/Sydney",
    australia: "Australia/Sydney",
    berlin: "Europe/Berlin",
    germany: "Europe/Berlin",
    allemagne: "Europe/Berlin",
    moscow: "Europe/Moscow",
    russia: "Europe/Moscow",
    dubai: "Asia/Dubai",
    singapore: "Asia/Singapore",
    "hong kong": "Asia/Hong_Kong",
    seoul: "Asia/Seoul",
    coree: "Asia/Seoul",
    mumbai: "Asia/Kolkata",
    india: "Asia/Kolkata",
    inde: "Asia/Kolkata",
    beijing: "Asia/Shanghai",
    china: "Asia/Shanghai",
    chine: "Asia/Shanghai",
    toronto: "America/Toronto",
    canada: "America/Toronto",
    mexico: "America/Mexico_City",
    "sao paulo": "America/Sao_Paulo",
    brazil: "America/Sao_Paulo",
    cairo: "Africa/Cairo",
    egypt: "Africa/Cairo",
    egypte: "Africa/Cairo",
    "cape town": "Africa/Johannesburg",
    "south africa": "Africa/Johannesburg",
  };

  const tz = timezones[city.toLowerCase()];
  if (!tz) return null;

  try {
    const now = new Date();
    const timeStr = now.toLocaleTimeString("fr-FR", {
      timeZone: tz,
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
    });
    const dateStr = now.toLocaleDateString("fr-FR", {
      timeZone: tz,
      weekday: "long",
      day: "numeric",
      month: "long",
      year: "numeric",
    });
    return `🕐 **Heure à ${city}** (${tz})\n📅 ${dateStr}\n⏰ ${timeStr}`;
  } catch {
    return null;
  }
}

// ── 22. AbuseIPDB Check ────────────────────────────────────────────

async function fetchAbuseIpDb(query: string): Promise<string | null> {
  const lower = query.toLowerCase();
  const match = lower.match(/(?:abuse|abus)\s+(?:de\s+|of\s+)?([\d.]+)/);
  if (!match) return null;
  const ip = match[1];
  const apiKey = process.env.ABUSEIPDB_API_KEY;
  if (!apiKey) return null;

  try {
    const url = `https://api.abuseipdb.com/api/v2/check?ipAddress=${ip}&maxAgeInDays=90`;
    const res = await fetch(url, {
      headers: { Key: apiKey, Accept: "application/json" },
      signal: AbortSignal.timeout(8_000),
    });
    if (!res.ok) return null;
    const data = (await res.json()) as {
      data?: {
        abuseConfidenceScore?: number;
        totalReports?: number;
        country?: string;
        usageType?: string;
        isp?: string;
        domain?: string;
      };
    };
    const d = data.data;
    if (!d) return null;
    const score = d.abuseConfidenceScore ?? 0;
    const risk =
      score > 75 ? "🔴 Critique" : score > 50 ? "🟠 Élevé" : score > 25 ? "🟡 Modéré" : "🟢 Fiable";
    return `🛡️ **AbuseIPDB — ${ip}**\nScore de confiance: ${score}/100 ${risk}\nSignalements: ${d.totalReports ?? 0}\nPays: ${d.country || "N/A"}\nFAI: ${d.isp || "N/A"}\nType: ${d.usageType || "N/A"}`;
  } catch {
    return null;
  }
}

// ── 23. VPN/Proxy Detector ─────────────────────────────────────────

async function fetchVpnDetect(query: string): Promise<string | null> {
  const lower = query.toLowerCase();
  const match = lower.match(/(?:vpn|proxy)\s+(?:de\s+|of\s+|check\s+)?([\d.]+)/);
  if (!match) return null;
  const ip = match[1];

  try {
    const url = `http://ip-api.com/json/${ip}?fields=status,country,isp,org,as,proxy,hosting`;
    const res = await fetch(url, { signal: AbortSignal.timeout(8_000) });
    if (!res.ok) return null;
    const data = (await res.json()) as {
      status: string;
      country?: string;
      isp?: string;
      org?: string;
      as?: string;
      proxy?: boolean;
      hosting?: boolean;
    };
    if (data.status !== "success") return null;
    const vpnStatus = data.proxy ? "🔴 VPN/Proxy détecté" : "🟢 Pas de VPN/Proxy";
    const hosting = data.hosting ? " (Hébergement/Datacenter)" : "";
    return `🕵️ **Détection VPN/Proxy — ${ip}**\n${vpnStatus}${hosting}\nPays: ${data.country || "N/A"}\nFAI: ${data.isp || "N/A"}\nOrganisation: ${data.org || "N/A"}\nAS: ${data.as || "N/A"}`;
  } catch {
    return null;
  }
}

// ── 24. This Day in History ────────────────────────────────────────

async function fetchThisDayInHistory(query: string): Promise<string | null> {
  const lower = query.toLowerCase();
  if (
    !lower.includes("ce jour") &&
    !lower.includes("this day") &&
    !lower.includes("aujourd'hui dans l'histoire") &&
    !lower.includes("today in history") &&
    !lower.includes("événement du jour")
  )
    return null;

  try {
    const now = new Date();
    const month = now.getMonth() + 1;
    const day = now.getDate();
    const url = `https://byabbe.se/on-this-day/${month}/${day}/events.json`;
    const res = await fetch(url, { signal: AbortSignal.timeout(8_000) });
    if (!res.ok) return null;
    const data = (await res.json()) as { events?: Array<{ year?: string; description?: string }> };
    if (!data.events || data.events.length === 0) return null;
    const top = data.events.slice(-5).reverse();
    const lines = top.map((e) => `**${e.year}** — ${e.description?.slice(0, 200) || ""}`);
    return `📅 **Ce jour dans l'histoire — ${day}/${month}**\n\n${lines.join("\n\n")}`;
  } catch {
    return null;
  }
}

// ── 25. Holidays API ───────────────────────────────────────────────

async function fetchHolidays(query: string): Promise<string | null> {
  const lower = query.toLowerCase();
  const match = lower.match(
    /(?:jour férié|ferie|holiday|holidays)\s+(?:de\s+|of\s+|en\s+|in\s+)?(\w+)/,
  );
  if (!match) return null;
  const country = match[1].toUpperCase();
  const validCountries = [
    "FR",
    "US",
    "GB",
    "DE",
    "ES",
    "IT",
    "PT",
    "NL",
    "BE",
    "CH",
    "CA",
    "AU",
    "JP",
    "CN",
    "BR",
    "MX",
    "IN",
    "RU",
  ];
  if (!validCountries.includes(country)) return null;

  try {
    const year = new Date().getFullYear();
    const url = `https://date.nager.at/api/v3/PublicHolidays/${year}/${country}`;
    const res = await fetch(url, { signal: AbortSignal.timeout(8_000) });
    if (!res.ok) return null;
    const data = (await res.json()) as Array<{
      date: string;
      localName: string;
      name: string;
      types: string[];
    }>;
    if (!data || data.length === 0) return null;
    const upcoming = data.filter((h) => new Date(h.date) >= new Date()).slice(0, 5);
    if (upcoming.length === 0) return null;
    const lines = upcoming.map((h) => `📅 **${h.date}** — ${h.localName} (${h.name})`);
    return `🎉 **Jours fériés à venir — ${country} (${year})**\n\n${lines.join("\n")}`;
  } catch {
    return null;
  }
}

// ── 26. Sunrise/Sunset ─────────────────────────────────────────────

async function fetchSunriseSunset(query: string): Promise<string | null> {
  const lower = query.toLowerCase();
  if (
    !lower.includes("lever du soleil") &&
    !lower.includes("coucher du soleil") &&
    !lower.includes("sunrise") &&
    !lower.includes("sunset") &&
    !lower.includes("lever soleil") &&
    !lower.includes("coucher soleil")
  )
    return null;

  const cityMatch = lower.match(/(?:à|at|de|of|for)\s+([\w\s]+)/);
  const city = cityMatch ? cityMatch[1].trim() : "Paris";

  const cityCoords: Record<string, { lat: number; lng: number }> = {
    paris: { lat: 48.8566, lng: 2.3522 },
    london: { lat: 51.5074, lng: -0.1278 },
    "new york": { lat: 40.7128, lng: -74.006 },
    tokyo: { lat: 35.6762, lng: 139.6503 },
    sydney: { lat: -33.8688, lng: 151.2093 },
    berlin: { lat: 52.52, lng: 13.405 },
    moscow: { lat: 55.7558, lng: 37.6173 },
    dubai: { lat: 25.2048, lng: 55.2708 },
  };
  const coords = cityCoords[city.toLowerCase()] || cityCoords["paris"];

  try {
    const url = `https://api.sunrise-sunset.org/json?lat=${coords.lat}&lng=${coords.lng}&formatted=0`;
    const res = await fetch(url, { signal: AbortSignal.timeout(8_000) });
    if (!res.ok) return null;
    const data = (await res.json()) as {
      results?: { sunrise?: string; sunset?: string; solar_noon?: string; day_length?: string };
    };
    const r = data.results;
    if (!r) return null;
    const fmt = (iso: string) =>
      new Date(iso).toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit" });
    return `🌅 **Lever/Coucher du soleil — ${city}**\n\n🌅 Lever: ${r.sunrise ? fmt(r.sunrise) : "N/A"}\n🌇 Coucher: ${r.sunset ? fmt(r.sunset) : "N/A"}\n☀️ Midi solaire: ${r.solar_noon ? fmt(r.solar_noon) : "N/A"}\n⏱️ Durée du jour: ${r.day_length || "N/A"}`;
  } catch {
    return null;
  }
}

// ── 27. Air Quality ────────────────────────────────────────────────

async function fetchAirQuality(query: string): Promise<string | null> {
  const lower = query.toLowerCase();
  if (
    !lower.includes("qualité de l'air") &&
    !lower.includes("qualite de l'air") &&
    !lower.includes("air quality") &&
    !lower.includes("pollution")
  )
    return null;

  const cityMatch = lower.match(/(?:à|at|de|of|for|en|in)\s+([\w\s]+)/);
  const city = cityMatch ? cityMatch[1].trim() : "Paris";

  const cityCoords: Record<string, { lat: number; lng: number }> = {
    paris: { lat: 48.8566, lng: 2.3522 },
    london: { lat: 51.5074, lng: -0.1278 },
    "new york": { lat: 40.7128, lng: -74.006 },
    tokyo: { lat: 35.6762, lng: 139.6503 },
    berlin: { lat: 52.52, lng: 13.405 },
    moscow: { lat: 55.7558, lng: 37.6173 },
  };
  const coords = cityCoords[city.toLowerCase()] || cityCoords["paris"];

  try {
    const url = `https://api.openaq.org/v2/latest?coordinates=${coords.lat},${coords.lng}&radius=25000&limit=3`;
    const res = await fetch(url, { signal: AbortSignal.timeout(8_000) });
    if (!res.ok) return null;
    const data = (await res.json()) as {
      results?: Array<{
        location?: string;
        measurements?: Array<{ parameter?: string; value?: number; unit?: string }>;
      }>;
    };
    if (!data.results || data.results.length === 0) return null;
    const loc = data.results[0];
    const measurements =
      loc.measurements
        ?.map((m) => `**${m.parameter?.toUpperCase()}**: ${m.value} ${m.unit}`)
        .join("\n") || "N/A";
    return `🌫️ **Qualité de l'air — ${city}** (${loc.location || "N/A"})\n\n${measurements}`;
  } catch {
    return null;
  }
}

// ── 28. Placeholder Image ──────────────────────────────────────────

async function fetchPlaceholderImage(query: string): Promise<string | null> {
  const lower = query.toLowerCase();
  const match = lower.match(/(?:placeholder|image test)\s+(\d+)x?(\d+)?/);
  if (!match) return null;
  const w = match[1] || "300";
  const h = match[2] || w;
  return `🖼️ **Image placeholder:**\nhttps://via.placeholder.com/${w}x${h}\n\nUtilise cette URL pour tester des affichages.`;
}

// ── 29. Lorem Ipsum ────────────────────────────────────────────────

async function fetchLoremIpsum(query: string): Promise<string | null> {
  const lower = query.toLowerCase();
  if (
    !lower.includes("lorem ipsum") &&
    !lower.includes("texte de remplissage") &&
    !lower.includes("filler text")
  )
    return null;
  const countMatch = lower.match(/(\d+)/);
  const count = countMatch ? parseInt(countMatch[1]) : 3;

  try {
    const url = `https://baconipsum.com/api/?type=all-meat&paras=${Math.min(count, 10)}`;
    const res = await fetch(url, { signal: AbortSignal.timeout(5_000) });
    if (!res.ok) return null;
    const data = (await res.json()) as string[];
    if (!data || data.length === 0) return null;
    return `📝 **Lorem Ipsum (${data.length} paragraphes):**\n\n${data.join("\n\n")}`;
  } catch {
    return null;
  }
}

// ── 30. Random User Generator ──────────────────────────────────────

async function fetchRandomUser(query: string): Promise<string | null> {
  const lower = query.toLowerCase();
  if (
    !lower.includes("utilisateur aléatoire") &&
    !lower.includes("random user") &&
    !lower.includes("faux profil") &&
    !lower.includes("fake user") &&
    !lower.includes("profil fictif")
  )
    return null;

  try {
    const url = "https://randomuser.me/api/?nat=fr";
    const res = await fetch(url, { signal: AbortSignal.timeout(5_000) });
    if (!res.ok) return null;
    const data = (await res.json()) as {
      results?: Array<{
        name?: { first?: string; last?: string };
        email?: string;
        phone?: string;
        location?: { city?: string; country?: string };
        picture?: { large?: string };
      }>;
    };
    const u = data.results?.[0];
    if (!u) return null;
    return `👤 **Profil aléatoire généré:**\n\n**Nom:** ${u.name?.first} ${u.name?.last}\n**Email:** ${u.email}\n**Téléphone:** ${u.phone}\n**Ville:** ${u.location?.city}, ${u.location?.country}\n**Avatar:** ${u.picture?.large}`;
  } catch {
    return null;
  }
}

// ── 31. Cron Expression Explainer ──────────────────────────────────

async function fetchCronExplain(query: string): Promise<string | null> {
  const lower = query.toLowerCase();
  const match = lower.match(
    /(?:cron|explique cron)\s+([\d*/,-]+\s+[\d*/,-]+\s+[\d*/,-]+\s+[\d*/,-]+\s+[\d*/,-]+)/,
  );
  if (!match) return null;
  const expr = match[1].trim();
  const parts = expr.split(/\s+/);
  if (parts.length !== 5) return null;

  const fieldNames = ["Minute", "Heure", "Jour du mois", "Mois", "Jour de la semaine"];
  const desc = parts.map((p, i) => {
    if (p === "*") return `${fieldNames[i]}: chaque`;
    if (p.startsWith("*/")) return `${fieldNames[i]}: toutes les ${p.slice(2)}`;
    if (p.includes(",")) return `${fieldNames[i]}: ${p.split(",").join(", ")}`;
    if (p.includes("-")) return `${fieldNames[i]}: de ${p.replace("-", " à ")}`;
    return `${fieldNames[i]}: ${p}`;
  });
  return `⏰ **Expression cron: \`${expr}\`**\n\n${desc.join("\n")}`;
}

// ── 32. Regex Tester ───────────────────────────────────────────────

async function fetchRegexTester(query: string): Promise<string | null> {
  const lower = query.toLowerCase();
  const match = lower.match(/(?:regex|test regex)\s+\/(.+)\/\s+(?:sur|on|against)\s+(.+)/);
  if (!match) return null;
  const pattern = match[1];
  const text = match[2];

  try {
    const regex = new RegExp(pattern, "gi");
    const matches = text.match(regex);
    if (!matches || matches.length === 0)
      return `🔍 **Test regex:** \`${pattern}\`\n\nTexte: \`${text}\`\n❌ Aucun match trouvé.`;
    return `🔍 **Test regex:** \`${pattern}\`\n\nTexte: \`${text}\`\n✅ ${matches.length} match(s) trouvé(s):\n${matches
      .slice(0, 10)
      .map((m) => `• \`${m}\``)
      .join("\n")}`;
  } catch (err) {
    return `🔍 **Regex invalide:** ${err instanceof Error ? err.message : String(err)}`;
  }
}

// ── 33. Color Palette Generator ────────────────────────────────────

async function fetchColorPalette(query: string): Promise<string | null> {
  const lower = query.toLowerCase();
  if (!lower.includes("palette") && !lower.includes("color palette") && !lower.includes("couleurs"))
    return null;
  const hexMatch = lower.match(/#([0-9a-f]{6})/);
  const baseColor = hexMatch ? `#${hexMatch[1]}` : "#5865f2";

  const hexToRgb = (hex: string) => {
    const r = parseInt(hex.slice(1, 3), 16);
    const g = parseInt(hex.slice(3, 5), 16);
    const b = parseInt(hex.slice(5, 7), 16);
    return { r, g, b };
  };
  const rgbToHex = (r: number, g: number, b: number) =>
    `#${[r, g, b]
      .map((x) =>
        Math.max(0, Math.min(255, Math.round(x)))
          .toString(16)
          .padStart(2, "0"),
      )
      .join("")}`;

  const { r, g, b } = hexToRgb(baseColor);
  const complementary = rgbToHex(255 - r, 255 - g, 255 - b);
  const lighter = rgbToHex(r + 40, g + 40, b + 40);
  const darker = rgbToHex(r - 40, g - 40, b - 40);
  const analogous1 = rgbToHex(r + 20, g - 20, b);
  const analogous2 = rgbToHex(r - 20, g + 20, b);

  return `🎨 **Palette de couleurs — base ${baseColor}**\n\nBase: ${baseColor}\nComplémentaire: ${complementary}\nPlus clair: ${lighter}\nPlus foncé: ${darker}\nAnalogue 1: ${analogous1}\nAnalogue 2: ${analogous2}`;
}

// ── 34. Robots.txt Parser ──────────────────────────────────────────

async function fetchRobotsTxt(query: string): Promise<string | null> {
  const lower = query.toLowerCase();
  if (!lower.includes("robots.txt") && !lower.includes("robots txt")) return null;
  const urlMatch = lower.match(/https?:\/\/[^\s]+/);
  if (!urlMatch) return null;
  const domain = urlMatch[0].replace(/\/$/, "");

  try {
    const res = await fetch(`${domain}/robots.txt`, { signal: AbortSignal.timeout(8_000) });
    if (!res.ok)
      return `🤖 **robots.txt — ${domain}**\n\n❌ Pas de robots.txt trouvé (${res.status}).`;
    const text = await res.text();
    const lines = text
      .split("\n")
      .filter((l) => l.trim() && !l.startsWith("#"))
      .slice(0, 20);
    return `🤖 **robots.txt — ${domain}**\n\n\`\`\`\n${lines.join("\n")}\n\`\`\``;
  } catch {
    return null;
  }
}

// ── 35. Sitemap Parser ─────────────────────────────────────────────

async function fetchSitemap(query: string): Promise<string | null> {
  const lower = query.toLowerCase();
  if (!lower.includes("sitemap") && !lower.includes("plan du site")) return null;
  const urlMatch = lower.match(/https?:\/\/[^\s]+/);
  if (!urlMatch) return null;
  const domain = urlMatch[0].replace(/\/$/, "");

  try {
    const res = await fetch(`${domain}/sitemap.xml`, { signal: AbortSignal.timeout(8_000) });
    if (!res.ok)
      return `🗺️ **Sitemap — ${domain}**\n\n❌ Pas de sitemap.xml trouvé (${res.status}).`;
    const text = await res.text();
    const urls = text.match(/<loc>([^<]+)<\/loc>/g)?.slice(0, 15) || [];
    if (urls.length === 0)
      return `🗺️ **Sitemap — ${domain}**\n\nAucune URL trouvée dans le sitemap.`;
    const cleanUrls = urls.map((u) => u.replace(/<\/?loc>/g, ""));
    return `🗺️ **Sitemap — ${domain}** (${cleanUrls.length} URLs trouvées)\n\n${cleanUrls.map((u) => `• ${u}`).join("\n")}`;
  } catch {
    return null;
  }
}

// ── ORCHESTRATEUR ──────────────────────────────────────────────────

export async function gatherFreeKnowledge(userMessage: string): Promise<string | null> {
  const sources = [
    fetchEarthquakes,
    fetchCurrencyConversion,
    fetchDictionary,
    fetchScientificArticles,
    fetchFactCheck,
    fetchQrCode,
    fetchCalculator,
    fetchEncodeDecode,
    fetchHash,
    fetchUuid,
    fetchIpGeo,
    fetchWayback,
    fetchTrivia,
    fetchJoke,
    fetchAdvice,
    fetchTmdb,
    fetchNasaApod,
    fetchSslCheck,
    fetchOpenGraph,
    fetchUnitConverter,
    fetchTimezoneConverter,
    fetchAbuseIpDb,
    fetchVpnDetect,
    fetchThisDayInHistory,
    fetchHolidays,
    fetchSunriseSunset,
    fetchAirQuality,
    fetchPlaceholderImage,
    fetchLoremIpsum,
    fetchRandomUser,
    fetchCronExplain,
    fetchRegexTester,
    fetchColorPalette,
    fetchRobotsTxt,
    fetchSitemap,
  ];

  for (const source of sources) {
    try {
      const result = await source(userMessage);
      if (result) {
        logger.info(`[KnowledgeSources] Source ${source.name} a répondu`);
        return result;
      }
    } catch (err) {
      logger.debug(`[KnowledgeSources] ${source.name} erreur: ${err}`);
    }
  }

  return null;
}
