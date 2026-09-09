import logger from "../utils/logger.js";
import prisma from "../prisma.js";
import { getOpenAIClient } from "./ai.js";
import { config } from "../config.js";
import { buildPersonalitySystemPrompt } from "../infrastructure/middleware/personalityMiddleware.js";
import { braveWebSearch, formatSearchResults, isBraveSearchAvailable } from "./braveSearch.js";
import { gatherFreeKnowledge } from "./knowledgeSources.js";

// ── Configuration ────────────────────────────────────────────────
const MAX_HISTORY = 20; // Max messages chargés depuis la DB
const MAX_PERSIST_MS = 7 * 24 * 60 * 60 * 1000; // Rétention 7 jours

/** Récupère le prompt système spécifique à une guilde, ou le défaut global */
async function _getSystemPrompt(guildId?: string): Promise<string> {
  if (!guildId) return config.aiSystemPrompt;
  try {
    const gc = await prisma.guildConfig.findUnique({ where: { guildId } });
    return gc?.aiSystemPrompt || config.aiSystemPrompt;
  } catch {
    return config.aiSystemPrompt;
  }
}

// Map tampon pour éviter de relire la DB à chaque message (optimisation)
const channelBuffers = new Map<string, Array<{ role: "user" | "assistant"; content: string }>>();

// Salons avec aichat activé
const aichatChannels = new Set<string>();

// ── Persistance ──────────────────────────────────────────────────

/** Charge l'historique d'un salon depuis la DB */
async function loadHistory(
  channelId: string,
): Promise<Array<{ role: "user" | "assistant"; content: string }>> {
  try {
    const rows = await prisma.chatHistory.findMany({
      where: { channelId },
      orderBy: { createdAt: "asc" },
      take: MAX_HISTORY,
    });
    return rows.map((r) => ({
      role: r.role as "user" | "assistant",
      content: r.content,
    }));
  } catch (err) {
    logger.error("[AIChat] Erreur chargement historique:", err);
    return [];
  }
}

/** Sauvegarde deux messages (user + assistant) dans la DB */
async function persistMessages(
  channelId: string,
  userMsg: string,
  assistantMsg: string,
): Promise<void> {
  try {
    await prisma.chatHistory.createMany({
      data: [
        { channelId, role: "user", content: userMsg },
        { channelId, role: "assistant", content: assistantMsg },
      ],
    });
  } catch (err) {
    logger.error("[AIChat] Erreur sauvegarde historique:", err);
  }
}

/** Purge les messages vieux de +7 jours */
async function pruneOldMessages(channelId: string): Promise<void> {
  try {
    const cutoff = new Date(Date.now() - MAX_PERSIST_MS);
    await prisma.chatHistory.deleteMany({
      where: {
        channelId,
        createdAt: { lt: cutoff },
      },
    });
  } catch (err) {
    logger.error("[AIChat] Erreur purge historique:", err);
  }
}

// ── API publique ─────────────────────────────────────────────────

export function enableAiChat(channelId: string): void {
  aichatChannels.add(channelId);
  if (!channelBuffers.has(channelId)) {
    channelBuffers.set(channelId, []);
  }
}

export function disableAiChat(channelId: string): void {
  aichatChannels.delete(channelId);
  channelBuffers.delete(channelId);
}

export function isAiChatEnabled(channelId: string): boolean {
  return aichatChannels.has(channelId);
}

export function getConversationSize(channelId: string): number {
  return channelBuffers.get(channelId)?.length || 0;
}

/** Efface l'historique d'un salon (RAM + DB) */
export async function clearHistory(channelId: string): Promise<number> {
  channelBuffers.delete(channelId);
  try {
    const result = await prisma.chatHistory.deleteMany({
      where: { channelId },
    });
    return result.count;
  } catch (err) {
    logger.error("[AIChat] Erreur suppression historique:", err);
    return 0;
  }
}

// ── Chat avec historique persistant ──────────────────────────────

// ── Détection automatique des questions nécessitant une recherche ─────────────

const SEARCH_TRIGGERS = [
  "combien",
  "quelle est la",
  "quel est le",
  "qui est",
  "quand est",
  "où est",
  "comment faire",
  "pourquoi",
  "qu'est-ce que",
  "que se passe",
  "actualité",
  "news",
  "prix de",
  "prix du",
  "cours de",
  "cours du",
  "météo",
  "température",
  "score",
  "résultat",
  "date de sortie",
  "release date",
  "patch notes",
  "définition",
  "définition de",
  "qu'est-ce qu'un",
  "qu'est-ce qu'une",
  "explique",
  "explique-moi",
  "raconte-moi",
  "parle-moi de",
  "what is",
  "who is",
  "when is",
  "where is",
  "how to",
  "how much",
  "tell me about",
  "explain",
  "latest",
  "recent",
  "today",
  "aujourd'hui",
  "hier",
  "yesterday",
  "cette semaine",
  "this week",
  "crypto",
  "bitcoin",
  "ethereum",
  "action",
  "bourse",
  "stock",
  "météo",
  "weather",
  "température",
  "temperature",
  "wikipedia",
  "définition",
  "definition",
  "qui a gagné",
  "who won",
  "résultat",
  "result",
  "nouveautés",
  "nouvelle",
  "new ",
  "latest ",
  "recent ",
  "histoire de",
  "history of",
  "biographie",
  "biography",
  "comparatif",
  "compare",
  "différence entre",
  "difference between",
  "meilleur",
  "best",
  "top",
  "classement",
  "ranking",
];

const CASUAL_TRIGGERS = [
  "merci",
  "thanks",
  "thank you",
  "ok",
  "okay",
  "d'accord",
  "cool",
  "lol",
  "mdr",
  "ptdr",
  "haha",
  "xd",
  "👍",
  "❤️",
  "ah",
  "oui",
  "no",
  "non",
  "yeah",
  "yep",
  "nope",
  "bien",
  "bonjour",
  "salut",
  "hello",
  "hi",
  "hey",
  "coucou",
  "bonne nuit",
  "good night",
  "à plus",
  "bye",
  "ciao",
];

function needsWebSearch(message: string): boolean {
  const lower = message.toLowerCase().trim();
  if (lower.length < 10) return false;
  if (CASUAL_TRIGGERS.some((t) => lower === t || lower === t + "!" || lower === t + "."))
    return false;
  return SEARCH_TRIGGERS.some((t) => lower.includes(t));
}

async function fetchWikipediaSummary(query: string): Promise<string | null> {
  try {
    const url = `https://fr.wikipedia.org/api/rest_v1/page/summary/${encodeURIComponent(query.replace(/\s+/g, "_"))}`;
    const res = await fetch(url, { signal: AbortSignal.timeout(5_000) });
    if (!res.ok) return null;
    const data = (await res.json()) as {
      extract?: string;
      title?: string;
      content_urls?: { desktop?: { page?: string } };
    };
    if (data.extract && data.extract.length > 20) {
      const link = data.content_urls?.desktop?.page || "";
      return `**${data.title}** (Wikipedia): ${data.extract}${link ? `\nSource: ${link}` : ""}`;
    }
    return null;
  } catch {
    return null;
  }
}

async function fetchCryptoPrice(query: string): Promise<string | null> {
  const lower = query.toLowerCase();
  const cryptoMap: Record<string, string> = {
    bitcoin: "bitcoin",
    btc: "bitcoin",
    ethereum: "ethereum",
    eth: "ethereum",
    solana: "solana",
    sol: "solana",
    cardano: "cardano",
    ada: "cardano",
    dogecoin: "dogecoin",
    doge: "dogecoin",
    ripple: "ripple",
    xrp: "ripple",
    polygon: "matic-network",
    matic: "matic-network",
    litecoin: "litecoin",
    ltc: "litecoin",
  };
  for (const [key, id] of Object.entries(cryptoMap)) {
    if (lower.includes(key)) {
      try {
        const res = await fetch(
          `https://api.coingecko.com/api/v3/simple/price?ids=${id}&vs_currencies=usd,eur&include_24hr_change=true`,
          { signal: AbortSignal.timeout(5_000) },
        );
        if (!res.ok) return null;
        const data = (await res.json()) as Record<
          string,
          { usd: number; eur: number; usd_24h_change: number }
        >;
        const coin = data[id];
        if (coin) {
          const change = coin.usd_24h_change?.toFixed(2) || "0";
          const arrow = parseFloat(change) >= 0 ? "📈" : "📉";
          return `💰 **${key.toUpperCase()}** — ${coin.usd}$ / ${coin.eur}€ ${arrow} ${change}% (24h)`;
        }
      } catch {
        return null;
      }
    }
  }
  return null;
}

async function fetchWeather(query: string): Promise<string | null> {
  const lower = query.toLowerCase();
  const weatherMatch =
    lower.match(/m[éè]t[éè]o\s+(?:[àa]\s+)?(.+)/) ||
    lower.match(/weather\s+(?:in\s+)?(.+)/) ||
    lower.match(/temp[éè]rature\s+(?:[àa]\s+)?(.+)/);
  if (!weatherMatch) return null;
  const city = weatherMatch[1].trim();
  try {
    const geoRes = await fetch(
      `https://geocoding-api.open-meteo.com/v1/search?name=${encodeURIComponent(city)}&count=1&language=fr`,
      { signal: AbortSignal.timeout(5_000) },
    );
    if (!geoRes.ok) return null;
    const geoData = (await geoRes.json()) as {
      results?: Array<{ latitude: number; longitude: number; name: string; country?: string }>;
    };
    if (!geoData.results?.[0]) return null;
    const loc = geoData.results[0];
    const weatherRes = await fetch(
      `https://api.open-meteo.com/v1/forecast?latitude=${loc.latitude}&longitude=${loc.longitude}&current=temperature_2m,relative_humidity_2m,wind_speed_10m,weather_code&timezone=auto`,
      { signal: AbortSignal.timeout(5_000) },
    );
    if (!weatherRes.ok) return null;
    const w = (await weatherRes.json()) as {
      current: {
        temperature_2m: number;
        relative_humidity_2m: number;
        wind_speed_10m: number;
        weather_code: number;
      };
    };
    const temp = w.current.temperature_2m;
    const humidity = w.current.relative_humidity_2m;
    const wind = w.current.wind_speed_10m;
    const codeMap: Record<number, string> = {
      0: "☀️ Ciel dégagé",
      1: "🌤️ Peu nuageux",
      2: "⛅ Nuageux",
      3: "☁️ Couvert",
      45: "🌫️ Brouillard",
      51: "🌦️ Bruine légère",
      61: "🌧️ Pluie",
      71: "❄️ Neige",
      80: "🌧️ Averses",
      95: "⛈️ Orage",
    };
    const desc = codeMap[w.current.weather_code] || "🌡️";
    return `🌍 **${loc.name}${loc.country ? ", " + loc.country : ""}**\n${desc} — ${temp}°C\n💧 Humidité: ${humidity}% | 💨 Vent: ${wind} km/h`;
  } catch {
    return null;
  }
}

async function gatherExternalKnowledge(userMessage: string): Promise<string | null> {
  // 1. Crypto prices
  const crypto = await fetchCryptoPrice(userMessage);
  if (crypto) return crypto;

  // 2. Weather
  const weather = await fetchWeather(userMessage);
  if (weather) return weather;

  // 3. Wikipedia
  const wikiQuery = userMessage
    .replace(
      /^(qu'est-ce que|qu'est-ce qu'un|qu'est-ce qu'une|définition de|qui est|parle-moi de|raconte-moi|explique-moi|what is|who is|tell me about)\s+/i,
      "",
    )
    .replace(/[?.!]/g, "")
    .trim();
  if (wikiQuery.length > 3) {
    const wiki = await fetchWikipediaSummary(wikiQuery);
    if (wiki) return wiki;
  }

  // 4. Sources gratuites (séismes, devises, dictionnaire, science, fact-check, QR, calcul, hash, IP, trivia, etc.)
  const freeKnowledge = await gatherFreeKnowledge(userMessage);
  if (freeKnowledge) return freeKnowledge;

  // 5. Brave Search (fallback général)
  if (isBraveSearchAvailable()) {
    const results = await braveWebSearch(userMessage, 5);
    if (results.length > 0) {
      return `🔍 Résultats de recherche web:\n${formatSearchResults(results)}`;
    }
  }

  return null;
}

export async function chatWithHistory(
  channelId: string,
  userMessage: string,
  username?: string,
  _guildId?: string,
): Promise<string> {
  let buffer = channelBuffers.get(channelId);
  if (!buffer || buffer.length === 0) {
    buffer = await loadHistory(channelId);
    channelBuffers.set(channelId, buffer);
  }

  const displayName = username || "Utilisateur";

  // ── Détection automatique: faut-il chercher sur le web ? ──
  let externalContext = "";
  if (needsWebSearch(userMessage)) {
    logger.info(`[AIChat] Recherche auto déclenchée pour: "${userMessage.slice(0, 60)}..."`);
    const knowledge = await gatherExternalKnowledge(userMessage);
    if (knowledge) {
      externalContext = `\n\n[CONTEXTE EXTERNE — utilise ces informations pour répondre]:\n${knowledge}\n[FIN CONTEXTE EXTERNE]`;
    }
  }

  const systemPrompt =
    buildPersonalitySystemPrompt(config.aiSystemPrompt) +
    "\n\nIMPORTANT: Tu réponds dans la langue du message que tu reçois. " +
    "Adapte-toi à n'importe quelle langue du monde. " +
    "\n\nTu es une IA sur Discord, pas un humain. Si quelqu'un te demande de l'ajouter, " +
    "de jouer ensemble, ou ton pseudo, dis-le naturellement. " +
    "Si quelqu'un demande le lien du serveur Discord, tu peux donner https://discord.gg/hAVqWmpGV. " +
    "Sois utile et conversationnel. Développe quand la question le mérite. " +
    "Tu te souviens des messages précédents dans ce salon. " +
    "Si tu reçois du CONTEXTE EXTERNE, utilise-le et cite tes sources.";

  const history = buffer.slice(-MAX_HISTORY).map((m) => ({
    role: m.role as "user" | "assistant",
    content: m.content,
  }));

  // Gateway unifié: fallback multi-providers, pas de message d'erreur technique
  const { respondChat } = await import("./chatResponder.js");
  const result = await respondChat(`${displayName}: ${userMessage}${externalContext}`, history, {
    systemPrompt,
    maxTokens: 600,
    temperature: 0.8,
    deadlineMs: 20_000,
    guildId: _guildId,
  });

  const reply = result.content;

  buffer.push({ role: "user", content: userMessage });
  buffer.push({ role: "assistant", content: reply });

  while (buffer.length > MAX_HISTORY) buffer.shift();

  persistMessages(channelId, userMessage, reply);
  pruneOldMessages(channelId);

  return reply;
}

// ── Génération de sondages ───────────────────────────────────────

export async function generatePollOptions(question: string): Promise<string[]> {
  const client = getOpenAIClient();
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 20_000);

  try {
    const completion = await client.chat.completions.create(
      {
        model: config.openRouterModel,
        messages: [
          {
            role: "system",
            content:
              "Tu es un generateur de sondages. Recris la question de maniere neutre et claire, puis propose 3 a 5 options pertinentes. " +
              'Reponds UNIQUEMENT au format JSON : {"question":"...","options":["Option 1","Option 2","Option 3"]}. ' +
              "Les options doivent etre courtes (max 55 caracteres). Sois creatif et varie les perspectives.",
          },
          { role: "user", content: question },
        ],
        max_tokens: 400,
        temperature: 0.9,
        response_format: { type: "json_object" },
      },
      { signal: controller.signal },
    );

    const raw = completion.choices[0]?.message?.content || "{}";
    const parsed = JSON.parse(raw);

    const options: string[] = parsed.options || [];
    if (parsed.question) {
      return [parsed.question, ...options.slice(0, 5)];
    }
    return [question, ...options.slice(0, 5)];
  } catch (err: any) {
    if ((err as Error)?.name === "AbortError") return [];
    logger.error("[SmartPoll] Erreur generation:", err);
    return [];
  } finally {
    clearTimeout(timeout);
  }
}
