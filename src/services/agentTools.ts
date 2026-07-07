/**
 * agentTools.ts — Outils disponibles pour l'agent IA autonome
 *
 * Définit les functions que l'IA peut décider d'appeler via function calling.
 * Chaque tool a :
 *  - Une définition JSON Schema (envoyée à l'API LLM)
 *  - Un handler TypeScript qui exécute l'action sur Discord
 *
 * L'agent reçoit la liste des tools, réfléchit, et demande l'exécution
 * de ceux qu'il juge nécessaires.
 */

import { Client, Message, TextChannel, ChannelType } from "discord.js";
import prisma from "../prisma.js";
import logger from "../utils/logger.js";
import { config } from "../config.js";
import { stripAllHtml } from "../utils/sanitizeHtml.js";
import { EXTENDED_TOOLS, executeExtendedTool } from "./agentToolsExtended.js";
import { AUTONOMOUS_TOOLS, executeAutonomousTool } from "./agentToolsAutonomous.js";
import { braveWebSearch, isBraveSearchAvailable, formatSearchResults } from "./braveSearch.js";
import { rerankDocuments, isCohereAvailable } from "./cohere.js";
import { transcribeAudio, isAssemblyAiAvailable } from "./assemblyAi.js";
import { analyzeImageWithGemini, isGeminiAvailable } from "./gemini.js";

// ─── Cache web (évite les requêtes répétées) ────────────────────────────────
const webCache = new Map<string, { data: string; ts: number }>();
const WEB_CACHE_TTL_MS = 5 * 60 * 1000; // 5 min

// ─── Types ───────────────────────────────────────────────────────────────────

export interface AgentToolDef {
  type: "function";
  function: {
    name: string;
    description: string;
    parameters: {
      type: "object";
      properties: Record<string, unknown>;
      required: string[];
    };
  };
}

export interface ToolCallResult {
  success: boolean;
  data: string;
}

export interface ToolContext {
  client: Client;
  message: Message;
  userId: string;
  guildId: string;
  channelId: string;
}

// ─── Définitions des outils (JSON Schema pour l'API LLM) ─────────────────────

export const AGENT_TOOLS: AgentToolDef[] = [
  {
    type: "function",
    function: {
      name: "deleteMessages",
      description:
        "Supprime un nombre précis de messages récents dans le salon actuel. Utilisé en cas de spam ou flood.",
      parameters: {
        type: "object",
        properties: {
          amount: {
            type: "number",
            description: "Le nombre de messages à supprimer (max 100).",
          },
        },
        required: ["amount"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "getBotStatus",
      description:
        "Récupère le statut du bot : mémoire, latence, nombre de serveurs, uptime. Aucun paramètre.",
      parameters: {
        type: "object",
        properties: {},
        required: [],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "timeoutUser",
      description:
        "Met un utilisateur en timeout (mute temporaire) sur ce serveur. Nécessite l'ID utilisateur et une durée.",
      parameters: {
        type: "object",
        properties: {
          userId: { type: "string", description: "L'ID Discord de l'utilisateur à timeout" },
          durationMinutes: {
            type: "number",
            description: "Durée du timeout en minutes (max 1440 = 24h)",
          },
          reason: { type: "string", description: "Raison du timeout" },
        },
        required: ["userId", "durationMinutes"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "warnUser",
      description:
        "Enregistre un avertissement officiel pour un utilisateur dans la base de données.",
      parameters: {
        type: "object",
        properties: {
          userId: { type: "string", description: "L'ID Discord de l'utilisateur" },
          reason: { type: "string", description: "Raison de l'avertissement" },
        },
        required: ["userId", "reason"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "getUserInfo",
      description:
        "Récupère les informations sur un utilisateur : sanctions, score de risque, historique de modération.",
      parameters: {
        type: "object",
        properties: {
          userId: { type: "string", description: "L'ID Discord de l'utilisateur" },
        },
        required: ["userId"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "searchUserMemory",
      description:
        "Recherche dans la mémoire long-terme de l'agent : faits stockés sur un utilisateur, préférences, historique.",
      parameters: {
        type: "object",
        properties: {
          userId: { type: "string", description: "L'ID Discord de l'utilisateur" },
          query: {
            type: "string",
            description: "Terme de recherche optionnel pour filtrer les faits",
          },
        },
        required: ["userId"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "saveMemoryFact",
      description:
        "Sauvegarde un fait important en mémoire long-terme sur un utilisateur. Ex: préférences, avertissements notables, contexte.",
      parameters: {
        type: "object",
        properties: {
          userId: { type: "string", description: "L'ID Discord de l'utilisateur" },
          key: { type: "string", description: "Clé du fait (ex: 'prefere_jeu', 'avertissement')" },
          value: { type: "string", description: "Valeur du fait" },
          category: {
            type: "string",
            description: "Catégorie optionnelle (ex: 'preference', 'moderation', 'info')",
          },
        },
        required: ["userId", "key", "value"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "getChannelInfo",
      description:
        "Récupère les informations sur le salon actuel : nom, nombre de messages récents, topic.",
      parameters: {
        type: "object",
        properties: {},
        required: [],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "pinMessage",
      description: "Épingle le message actuel ou un message par ID dans ce salon.",
      parameters: {
        type: "object",
        properties: {
          messageId: {
            type: "string",
            description: "ID du message à épingler (ou 'last' pour le dernier message)",
          },
        },
        required: ["messageId"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "searchWeb",
      description:
        "Recherche sur Internet via DuckDuckGo. Retourne des titres, URLs et extraits. Utilise cet outil quand tu as besoin d'informations actuelles, d'actualités, ou de connaissances que tu n'as pas.",
      parameters: {
        type: "object",
        properties: {
          query: {
            type: "string",
            description: "La requête de recherche",
          },
          lang: {
            type: "string",
            description: "Code langue (fr, en, es, de, it). Défaut: fr",
          },
        },
        required: ["query"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "readUrl",
      description:
        "Lit le contenu d'une page web (URL). Récupère le texte principal, utile pour approfondir un résultat de recherche. Retourne jusqu'à 3000 caractères de contenu.",
      parameters: {
        type: "object",
        properties: {
          url: { type: "string", description: "L'URL complète à lire (doit commencer par http)" },
        },
        required: ["url"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "searchYouTube",
      description:
        "Recherche des vidéos YouTube. Retourne titre, chaîne, URL et miniature. Utile pour trouver des tutoriels, gameplay, ou contenu vidéo.",
      parameters: {
        type: "object",
        properties: {
          query: { type: "string", description: "La requête de recherche" },
          maxResults: {
            type: "number",
            description: "Nombre max de résultats (défaut 5, max 10)",
          },
        },
        required: ["query"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "getServerStats",
      description:
        "Récupère les statistiques du serveur Discord : nombre de membres, salons, rôles, boost level, date de création.",
      parameters: {
        type: "object",
        properties: {},
        required: [],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "getWeather",
      description:
        "Récupère la météo actuelle pour une ville. Température, vent, humidité, conditions. Gratuit via Open-Meteo (pas de clé API).",
      parameters: {
        type: "object",
        properties: {
          city: { type: "string", description: "Nom de la ville (ex: Paris, Tokyo, New York)" },
        },
        required: ["city"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "getCryptoPrice",
      description:
        "Récupère le prix actuel d'une cryptomonnaie en EUR et USD. Gratuit via CoinGecko (pas de clé API). Ex: bitcoin, ethereum, solana.",
      parameters: {
        type: "object",
        properties: {
          coin: {
            type: "string",
            description: "ID de la crypto (ex: bitcoin, ethereum, solana, dogecoin)",
          },
        },
        required: ["coin"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "getWikipediaSummary",
      description:
        "Récupère un résumé encyclopédique sur un sujet depuis Wikipedia. Gratuit, pas de clé API. Préfère à searchWeb pour les sujets encyclopédiques.",
      parameters: {
        type: "object",
        properties: {
          query: { type: "string", description: "Le sujet à rechercher sur Wikipedia" },
          lang: { type: "string", description: "Code langue (fr, en). Défaut: fr" },
        },
        required: ["query"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "getGitHubRepo",
      description:
        "Récupère les infos d'un dépôt GitHub : étoiles, forks, langage, description, dernière mise à jour. Gratuit (pas de clé API).",
      parameters: {
        type: "object",
        properties: {
          owner: { type: "string", description: "Nom d'utilisateur ou organisation GitHub (ex: facebook)" },
          repo: { type: "string", description: "Nom du dépôt (ex: react)" },
        },
        required: ["owner", "repo"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "translateText",
      description:
        "Traduit un texte d'une langue vers une autre. Gratuit via MyMemory API (pas de clé). Utile pour comprendre des messages étrangers.",
      parameters: {
        type: "object",
        properties: {
          text: { type: "string", description: "Le texte à traduire" },
          from: { type: "string", description: "Langue source (ex: en, es, de). 'auto' pour détection." },
          to: { type: "string", description: "Langue cible (ex: fr, en)" },
        },
        required: ["text", "to"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "getTechNews",
      description:
        "Récupère les top stories de Hacker News (actualités tech/science). Gratuit, pas de clé API. Retourne titres et liens.",
      parameters: {
        type: "object",
        properties: {
          maxResults: {
            type: "number",
            description: "Nombre max de stories (défaut 5, max 10)",
          },
        },
        required: [],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "transcribeAudio",
      description:
        "Transcrit un fichier audio (message vocal Discord, MP3, WAV, etc.) en texte via AssemblyAI. Utilise cet outil quand un utilisateur envoie un message vocal ou un fichier audio.",
      parameters: {
        type: "object",
        properties: {
          audioUrl: {
            type: "string",
            description: "URL du fichier audio à transcrire",
          },
        },
        required: ["audioUrl"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "analyzeImageGemini",
      description:
        "Analyse une image avec Google Gemini Vision (multimodal). Plus précis que analyze_image pour les détails complexes, textes dans l'image, schémas, etc. Retourne une description détaillée en français.",
      parameters: {
        type: "object",
        properties: {
          imageUrl: {
            type: "string",
            description: "URL de l'image à analyser",
          },
          question: {
            type: "string",
            description: "Question ou instruction sur l'image (défaut: 'Décris cette image en détail')",
          },
        },
        required: ["imageUrl"],
      },
    },
  },
];

// Fusionner avec les tools étendus (APIs gratuites + Discord + bot features)
export const ALL_AGENT_TOOLS: AgentToolDef[] = [...AGENT_TOOLS, ...EXTENDED_TOOLS, ...AUTONOMOUS_TOOLS];

// ─── Handlers — Exécution réelle des outils ──────────────────────────────────

export async function executeTool(
  toolName: string,
  args: Record<string, unknown>,
  ctx: ToolContext,
): Promise<ToolCallResult> {
  logger.info(`[AgentTools] 🔧 Exécution tool: ${toolName} args=${JSON.stringify(args).slice(0, 200)}`);

  try {
    switch (toolName) {
      case "deleteMessages":
        return await toolDeleteMessages(args, ctx);
      case "getBotStatus":
        return await toolGetBotStatus(ctx);
      case "timeoutUser":
        return await toolTimeoutUser(args, ctx);
      case "warnUser":
        return await toolWarnUser(args, ctx);
      case "getUserInfo":
        return await toolGetUserInfo(args, ctx);
      case "searchUserMemory":
        return await toolSearchUserMemory(args);
      case "saveMemoryFact":
        return await toolSaveMemoryFact(args);
      case "getChannelInfo":
        return await toolGetChannelInfo(ctx);
      case "pinMessage":
        return await toolPinMessage(args, ctx);
      case "searchWeb":
        return await toolSearchWeb(args);
      case "readUrl":
        return await toolReadUrl(args);
      case "searchYouTube":
        return await toolSearchYouTube(args);
      case "getServerStats":
        return await toolGetServerStats(ctx);
      case "getWeather":
        return await toolGetWeather(args);
      case "getCryptoPrice":
        return await toolGetCryptoPrice(args);
      case "getWikipediaSummary":
        return await toolGetWikipediaSummary(args);
      case "getGitHubRepo":
        return await toolGetGitHubRepo(args);
      case "translateText":
        return await toolTranslateText(args);
      case "getTechNews":
        return await toolGetTechNews(args);
      case "transcribeAudio":
        return await toolTranscribeAudio(args);
      case "analyzeImageGemini":
        return await toolAnalyzeImageGemini(args);
      default: {
        // Essayer les tools étendus
        const extResult = await executeExtendedTool(toolName, args, ctx);
        if (extResult) return extResult;
        // Essayer les tools autonomes
        const autoResult = await executeAutonomousTool(toolName, args, ctx);
        if (autoResult) return autoResult;
        return { success: false, data: `Outil inconnu: ${toolName}` };
      }
    }
  } catch (error) {
    logger.error(`[AgentTools] Erreur tool ${toolName}: ${error instanceof Error ? error.message : String(error)}`);
    return {
      success: false,
      data: `Erreur lors de l'exécution: ${error instanceof Error ? error.message : String(error)}`,
    };
  }
}

// ─── Implémentation des tools ────────────────────────────────────────────────

async function toolDeleteMessages(
  args: Record<string, unknown>,
  ctx: ToolContext,
): Promise<ToolCallResult> {
  const amount = Math.min(100, Math.max(1, Number(args.amount) || 5));
  const channel = ctx.client.channels.cache.get(ctx.channelId) as TextChannel | undefined;
  if (!channel || !channel.isTextBased()) {
    return { success: false, data: "Salon introuvable ou non textuel" };
  }

  const messages = await channel.messages.fetch({ limit: amount });
  const deleted = await channel.bulkDelete(messages, true).catch(() => null);

  const count = deleted?.size ?? 0;
  return {
    success: true,
    data: `${count} messages supprimés dans #${channel.name}.`,
  };
}

async function toolGetBotStatus(ctx: ToolContext): Promise<ToolCallResult> {
  const mem = process.memoryUsage();
  const rssMB = Math.round(mem.rss / 1024 / 1024);
  const heapMB = Math.round(mem.heapUsed / 1024 / 1024);
  const ping = ctx.client.ws.ping;
  const uptime = Math.round(process.uptime() / 60);
  const guildCount = ctx.client.guilds.cache.size;

  return {
    success: true,
    data: JSON.stringify({
      memoryRSS: `${rssMB}MB`,
      memoryHeap: `${heapMB}MB`,
      ping: `${ping}ms`,
      uptime: `${uptime}min`,
      guilds: guildCount,
      status: rssMB >= 300 ? "WARNING" : "OK",
    }),
  };
}

async function toolTimeoutUser(
  args: Record<string, unknown>,
  ctx: ToolContext,
): Promise<ToolCallResult> {
  const userId = String(args.userId);
  const durationMin = Math.min(1440, Math.max(1, Number(args.durationMinutes) || 10));
  const reason = String(args.reason || "Timeout par agent IA");
  const guild = ctx.client.guilds.cache.get(ctx.guildId);
  if (!guild) return { success: false, data: "Serveur introuvable" };

  const member = await guild.members.fetch(userId).catch(() => null);
  if (!member) return { success: false, data: "Utilisateur introuvable" };

  await member.timeout(durationMin * 60 * 1000, `[Agent IA] ${reason}`.slice(0, 512));

  // Logger la sanction
  await prisma.sanction.create({
    data: {
      guildId: ctx.guildId,
      userId,
      moderatorId: "AI_AGENT",
      type: "TIMEOUT",
      reason: `[Agent IA] ${reason}`,
    },
  }).catch(() => {});

  return {
    success: true,
    data: `Utilisateur <@${userId}> mis en timeout pour ${durationMin}min. Raison: ${reason}`,
  };
}

async function toolWarnUser(
  args: Record<string, unknown>,
  ctx: ToolContext,
): Promise<ToolCallResult> {
  const userId = String(args.userId);
  const reason = String(args.reason || "Avertissement par agent IA");

  await prisma.sanction.create({
    data: {
      guildId: ctx.guildId,
      userId,
      moderatorId: "AI_AGENT",
      type: "WARN",
      reason,
    },
  }).catch(() => {});

  return {
    success: true,
    data: `Avertissement enregistré pour <@${userId}>. Raison: ${reason}`,
  };
}

async function toolGetUserInfo(
  args: Record<string, unknown>,
  ctx: ToolContext,
): Promise<ToolCallResult> {
  const userId = String(args.userId);

  const sanctions = await prisma.sanction.findMany({
    where: { userId, guildId: ctx.guildId },
    orderBy: { createdAt: "desc" },
    take: 10,
  });

  const riskProfile = await prisma.riskProfile.findUnique({
    where: { userId_guildId: { userId, guildId: ctx.guildId } },
  });

  return {
    success: true,
    data: JSON.stringify({
      userId,
      sanctions: sanctions.map((s) => ({ type: s.type, reason: s.reason, date: s.createdAt.toISOString() })),
      sanctionCount: sanctions.length,
      riskScore: riskProfile?.riskScore ?? 0,
      riskLevel: riskProfile?.riskLevel ?? "INCONNU",
      underWatch: riskProfile?.underWatch ?? false,
    }),
  };
}

async function toolSearchUserMemory(
  args: Record<string, unknown>,
): Promise<ToolCallResult> {
  const userId = String(args.userId);
  const query = args.query ? String(args.query) : undefined;

  let where: Record<string, unknown> = { userId };
  if (query) {
    where = {
      userId,
      OR: [
        { key: { contains: query, mode: "insensitive" } },
        { value: { contains: query, mode: "insensitive" } },
      ],
    };
  }

  const facts = await prisma.memoryFact.findMany({
    where,
    orderBy: { weight: "desc" },
    take: 10,
  });

  if (facts.length === 0) {
    return { success: true, data: "Aucun fait en mémoire pour cet utilisateur." };
  }

  return {
    success: true,
    data: JSON.stringify(
      facts.map((f) => ({ key: f.key, value: f.value, category: f.category, weight: f.weight })),
    ),
  };
}

async function toolSaveMemoryFact(
  args: Record<string, unknown>,
): Promise<ToolCallResult> {
  const userId = String(args.userId);
  const key = String(args.key);
  const value = String(args.value);
  const category = args.category ? String(args.category) : "info";

  // S'assurer que UserMemory existe
  await prisma.userMemory.upsert({
    where: { userId },
    create: { userId },
    update: { lastActiveAt: new Date() },
  });

  await prisma.memoryFact.upsert({
    where: { userId_key: { userId, key } },
    create: { userId, key, value, category },
    update: { value, category, updatedAt: new Date() },
  });

  return {
    success: true,
    data: `Fait sauvegardé: ${key} = ${value} (catégorie: ${category})`,
  };
}

async function toolGetChannelInfo(ctx: ToolContext): Promise<ToolCallResult> {
  const channel = ctx.client.channels.cache.get(ctx.channelId) as TextChannel | undefined;
  if (!channel) return { success: false, data: "Salon introuvable" };

  const recentMessages = await channel.messages.fetch({ limit: 1 }).catch(() => null);

  return {
    success: true,
    data: JSON.stringify({
      name: channel.name,
      id: channel.id,
      type: channel.type === ChannelType.GuildText ? "text" : "other",
      topic: channel.topic || null,
      lastMessageId: recentMessages?.first()?.id ?? null,
    }),
  };
}

async function toolPinMessage(
  args: Record<string, unknown>,
  ctx: ToolContext,
): Promise<ToolCallResult> {
  const messageId = String(args.messageId);
  const channel = ctx.client.channels.cache.get(ctx.channelId) as TextChannel | undefined;
  if (!channel) return { success: false, data: "Salon introuvable" };

  let msgId = messageId;
  if (messageId === "last") {
    const msgs = await channel.messages.fetch({ limit: 2 });
    // Skip the bot's own message, pin the one before
    const last = msgs.last();
    if (!last) return { success: false, data: "Aucun message à épingler" };
    msgId = last.id;
  }

  const msg = await channel.messages.fetch(msgId).catch(() => null);
  if (!msg) return { success: false, data: "Message introuvable" };

  await msg.pin().catch(() => {
    // Maybe already pinned
  });

  return { success: true, data: `Message ${msgId} épinglé dans #${channel.name}` };
}

// ─── Web Tools ───────────────────────────────────────────────────────────────

function getCached(key: string): string | null {
  const entry = webCache.get(key);
  if (entry && Date.now() - entry.ts < WEB_CACHE_TTL_MS) return entry.data;
  return null;
}

function setCached(key: string, data: string): void {
  webCache.set(key, { data, ts: Date.now() });
  if (webCache.size > 50) {
    const oldest = webCache.keys().next().value;
    if (oldest) webCache.delete(oldest);
  }
}

async function toolSearchWeb(args: Record<string, unknown>): Promise<ToolCallResult> {
  const query = String(args.query);
  const lang = String(args.lang || "fr");
  const cacheKey = `web:${query}:${lang}`;

  const cached = getCached(cacheKey);
  if (cached) return { success: true, data: cached };

  try {
    // 1. Brave Search API (if configured) — proper search API with rich results
    if (isBraveSearchAvailable()) {
      const braveResults = await braveWebSearch(query, 8);
      if (braveResults.length > 0) {
        // Optional: rerank results with Cohere for better relevance
        if (isCohereAvailable()) {
          const docs = braveResults.map((r) => `${r.title}. ${r.description}`);
          const reranked = await rerankDocuments(query, docs, 5);
          if (reranked.length > 0) {
            const rerankedResults = reranked.map((r) => braveResults[r.index]).filter(Boolean);
            const output = JSON.stringify({ provider: "brave+cohere", results: rerankedResults });
            setCached(cacheKey, output);
            return { success: true, data: output };
          }
        }
        const output = JSON.stringify({ provider: "brave", results: braveResults });
        setCached(cacheKey, output);
        return { success: true, data: output };
      }
    }

    // 2. DuckDuckGo Instant Answer (fallback)
    const iaUrl = `https://api.duckduckgo.com/?q=${encodeURIComponent(query)}&format=json&no_html=1&skip_disambig=1&kl=${lang}-${lang}`;
    const iaRes = await fetch(iaUrl, {
      headers: { "User-Agent": "DiscordBot/1.0" },
      signal: AbortSignal.timeout(8000),
    }).catch(() => null);

    let abstract = "";
    if (iaRes?.ok) {
      const iaData = (await iaRes.json()) as { Abstract?: string; Heading?: string; AbstractURL?: string };
      if (iaData.Abstract) abstract = iaData.Abstract;
    }

    // 3. DuckDuckGo HTML scraping
    const htmlUrl = `https://html.duckduckgo.com/html/?q=${encodeURIComponent(query)}&kl=${lang}-${lang}`;
    const htmlRes = await fetch(htmlUrl, {
      headers: {
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36",
        Accept: "text/html",
        "Accept-Language": lang,
      },
      signal: AbortSignal.timeout(10000),
    }).catch(() => null);

    const results: Array<{ title: string; url: string; snippet: string }> = [];
    if (htmlRes?.ok) {
      const html = await htmlRes.text();
      const regex = /<a[^>]*class="[^"]*result__a[^"]*"[^>]*href="([^"]*)"[^>]*>(.*?)<\/a>[\s\S]*?<a[^>]*class="[^"]*result__snippet[^"]*"[^>]*>(.*?)<\/a>/gi;
      let match: RegExpExecArray | null;
      while ((match = regex.exec(html)) !== null && results.length < 8) {
        const rawUrl = match[1];
        const title = stripAllHtml(match[2]).trim();
        const snippet = stripAllHtml(match[3]).trim();
        let url = rawUrl;
        if (rawUrl.includes("uddg=")) {
          const m = rawUrl.match(/uddg=([^&]+)/);
          if (m) url = decodeURIComponent(m[1]);
        }
        if (title && url.startsWith("http")) {
          results.push({ title: title.slice(0, 200), url, snippet: snippet.slice(0, 300) });
        }
      }
    }

    const output = JSON.stringify({ abstract, results, provider: "duckduckgo" });
    setCached(cacheKey, output);
    return { success: true, data: output };
  } catch (error) {
    return { success: false, data: `Erreur recherche web: ${error instanceof Error ? error.message : String(error)}` };
  }
}

/**
 * Fetches HTML from a Response, extracts text, then releases the raw buffer.
 * The html variable goes out of scope when the function returns, allowing
 * V8 GC to reclaim the underlying ArrayBuffer immediately.
 */
async function extractTextFromHtml(res: Response): Promise<string> {
  const html = await res.text();
  const text = stripAllHtml(html).replace(/\s+/g, " ").trim().slice(0, 3000);
  // html goes out of scope here — buffer eligible for GC
  return text || "(page vide ou contenu non-texte)";
}

async function toolReadUrl(args: Record<string, unknown>): Promise<ToolCallResult> {
  const url = String(args.url);
  if (!url.startsWith("http")) return { success: false, data: "URL invalide" };

  const cacheKey = `url:${url}`;
  const cached = getCached(cacheKey);
  if (cached) return { success: true, data: cached };

  try {
    const res = await fetch(url, {
      headers: {
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36",
        Accept: "text/html,application/xhtml+xml",
      },
      signal: AbortSignal.timeout(12000),
    });

    if (!res.ok) return { success: false, data: `HTTP ${res.status}` };

    // Extract text from HTML then release the raw buffer immediately.
    // The raw HTML string can be several MB for large pages — by extracting
    // in a separate async function, the html variable goes out of scope
    // before we continue, allowing V8 GC to reclaim the buffer.
    const output = await extractTextFromHtml(res);
    setCached(cacheKey, output);
    return { success: true, data: output };
  } catch (error) {
    return { success: false, data: `Erreur lecture URL: ${error instanceof Error ? error.message : String(error)}` };
  }
}

async function toolSearchYouTube(args: Record<string, unknown>): Promise<ToolCallResult> {
  const query = String(args.query);
  const maxResults = Math.min(10, Math.max(1, Number(args.maxResults) || 5));
  const cacheKey = `yt:${query}:${maxResults}`;
  const cached = getCached(cacheKey);
  if (cached) return { success: true, data: cached };

  const instances = ["https://yewtu.be", "https://inv.nadeko.net", "https://invidious.snopyta.org"];

  for (const instance of instances) {
    try {
      const url = `${instance}/api/v1/search?q=${encodeURIComponent(query)}&type=video&sort_by=relevance&limit=${maxResults}`;
      const res = await fetch(url, { signal: AbortSignal.timeout(5000) });
      if (!res.ok) continue;
      const data = (await res.json()) as Array<{
        videoId: string; title: string; author: string;
      }>;
      const results = (data ?? []).slice(0, maxResults).map((v) => ({
        title: v.title,
        channel: v.author,
        url: `https://www.youtube.com/watch?v=${v.videoId}`,
      }));
      const output = JSON.stringify(results);
      setCached(cacheKey, output);
      return { success: true, data: output };
    } catch { continue; }
  }

  return { success: false, data: "Aucun résultat YouTube" };
}

async function toolGetServerStats(ctx: ToolContext): Promise<ToolCallResult> {
  const guild = ctx.client.guilds.cache.get(ctx.guildId);
  if (!guild) return { success: false, data: "Serveur introuvable" };

  return {
    success: true,
    data: JSON.stringify({
      name: guild.name,
      memberCount: guild.memberCount,
      channelCount: guild.channels.cache.size,
      roleCount: guild.roles.cache.size,
      boostLevel: guild.premiumTier,
      boostCount: guild.premiumSubscriptionCount ?? 0,
      createdAt: guild.createdAt.toISOString(),
      iconURL: guild.iconURL(),
    }),
  };
}

// ─── Free API Tools (no API key required) ────────────────────────────────────

// Open-Meteo: free weather API, no key needed
async function toolGetWeather(args: Record<string, unknown>): Promise<ToolCallResult> {
  const city = String(args.city);
  const cacheKey = `weather:${city.toLowerCase()}`;
  const cached = getCached(cacheKey);
  if (cached) return { success: true, data: cached };

  try {
    // 1. Geocode the city name
    const geoUrl = `https://geocoding-api.open-meteo.com/v1/search?name=${encodeURIComponent(city)}&count=1&language=fr&format=json`;
    const geoRes = await fetch(geoUrl, { signal: AbortSignal.timeout(8000) });
    if (!geoRes.ok) return { success: false, data: "Géocodage échoué" };
    const geoData = (await geoRes.json()) as { results?: Array<{ latitude: number; longitude: number; name: string; country: string }> };
    if (!geoData.results?.[0]) return { success: false, data: `Ville "${city}" introuvable` };
    const loc = geoData.results[0];

    // 2. Get weather
    const weatherUrl = `https://api.open-meteo.com/v1/forecast?latitude=${loc.latitude}&longitude=${loc.longitude}&current=temperature_2m,relative_humidity_2m,apparent_temperature,weather_code,wind_speed_10m&timezone=auto`;
    const weatherRes = await fetch(weatherUrl, { signal: AbortSignal.timeout(8000) });
    if (!weatherRes.ok) return { success: false, data: "Météo indisponible" };
    const wData = (await weatherRes.json()) as {
      current: { temperature_2m: number; relative_humidity_2m: number; apparent_temperature: number; weather_code: number; wind_speed_10m: number };
    };

    const codeMap: Record<number, string> = {
      0: "Ciel dégagé", 1: "Principalement dégagé", 2: "Partiellement nuageux", 3: "Couvert",
      45: "Brouillard", 48: "Brouillard givrant", 51: "Bruine légère", 53: "Bruine modérée",
      55: "Bruine dense", 61: "Pluie légère", 63: "Pluie modérée", 65: "Pluie forte",
      71: "Neige légère", 73: "Neige modérée", 75: "Neige forte", 80: "Averses légères",
      81: "Averses modérées", 82: "Averses violentes", 95: "Orage", 96: "Orage + grêle légère",
      99: "Orage + grêle forte",
    };
    const condition = codeMap[wData.current.weather_code] || "Conditions inconnues";

    const output = JSON.stringify({
      city: `${loc.name}, ${loc.country}`,
      temperature: `${wData.current.temperature_2m}°C`,
      feelsLike: `${wData.current.apparent_temperature}°C`,
      humidity: `${wData.current.relative_humidity_2m}%`,
      wind: `${wData.current.wind_speed_10m} km/h`,
      condition,
    });
    setCached(cacheKey, output);
    return { success: true, data: output };
  } catch (error) {
    return { success: false, data: `Erreur météo: ${error instanceof Error ? error.message : String(error)}` };
  }
}

// CoinGecko: free crypto prices, no key needed
async function toolGetCryptoPrice(args: Record<string, unknown>): Promise<ToolCallResult> {
  const coin = String(args.coin).toLowerCase().trim();
  const cacheKey = `crypto:${coin}`;
  const cached = getCached(cacheKey);
  if (cached) return { success: true, data: cached };

  try {
    const url = `https://api.coingecko.com/api/v3/simple/price?ids=${encodeURIComponent(coin)}&vs_currencies=eur,usd&include_24hr_change=true`;
    const res = await fetch(url, {
      headers: { "Accept": "application/json" },
      signal: AbortSignal.timeout(8000),
    });
    if (!res.ok) return { success: false, data: `Crypto "${coin}" introuvable` };
    const data = (await res.json()) as Record<string, { eur: number; usd: number; eur_24h_change: number }>;
    const info = data[coin];
    if (!info) return { success: false, data: `Crypto "${coin}" introuvable. Essayez: bitcoin, ethereum, solana, dogecoin` };

    const output = JSON.stringify({
      coin,
      priceEUR: `${info.eur}€`,
      priceUSD: `$${info.usd}`,
      change24h: `${info.eur_24h_change?.toFixed(2)}%`,
    });
    setCached(cacheKey, output);
    return { success: true, data: output };
  } catch (error) {
    return { success: false, data: `Erreur crypto: ${error instanceof Error ? error.message : String(error)}` };
  }
}

// Wikipedia: free, no key needed
async function toolGetWikipediaSummary(args: Record<string, unknown>): Promise<ToolCallResult> {
  const query = String(args.query);
  const lang = String(args.lang || "fr");
  const cacheKey = `wiki:${lang}:${query.toLowerCase()}`;
  const cached = getCached(cacheKey);
  if (cached) return { success: true, data: cached };

  try {
    // Search for the best matching article
    const searchUrl = `https://${lang}.wikipedia.org/w/api.php?action=query&list=search&srsearch=${encodeURIComponent(query)}&format=json&srlimit=1`;
    const searchRes = await fetch(searchUrl, { signal: AbortSignal.timeout(8000) });
    if (!searchRes.ok) return { success: false, data: "Wikipedia indisponible" };
    const searchData = (await searchRes.json()) as { query?: { search?: Array<{ title: string }> } };
    const title = searchData.query?.search?.[0]?.title;
    if (!title) return { success: false, data: `Aucun article Wikipedia pour "${query}"` };

    // Get the summary
    const summaryUrl = `https://${lang}.wikipedia.org/api/rest_v1/page/summary/${encodeURIComponent(title)}`;
    const summaryRes = await fetch(summaryUrl, { signal: AbortSignal.timeout(8000) });
    if (!summaryRes.ok) return { success: false, data: "Résumé indisponible" };
    const summary = (await summaryRes.json()) as {
      title: string; extract: string; content_urls?: { desktop?: { page: string } }; thumbnail?: { source: string };
    };

    const output = JSON.stringify({
      title: summary.title,
      extract: summary.extract?.slice(0, 1500) || "Pas de résumé disponible",
      url: summary.content_urls?.desktop?.page || `https://${lang}.wikipedia.org/wiki/${encodeURIComponent(title)}`,
      image: summary.thumbnail?.source || null,
    });
    setCached(cacheKey, output);
    return { success: true, data: output };
  } catch (error) {
    return { success: false, data: `Erreur Wikipedia: ${error instanceof Error ? error.message : String(error)}` };
  }
}

// GitHub API: free for public repos, no key needed (60 req/hour)
async function toolGetGitHubRepo(args: Record<string, unknown>): Promise<ToolCallResult> {
  const owner = String(args.owner);
  const repo = String(args.repo);
  const cacheKey = `github:${owner}/${repo}`;
  const cached = getCached(cacheKey);
  if (cached) return { success: true, data: cached };

  try {
    const url = `https://api.github.com/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}`;
    const res = await fetch(url, {
      headers: {
        "Accept": "application/vnd.github.v3+json",
        "User-Agent": "DiscordBot/1.0",
      },
      signal: AbortSignal.timeout(8000),
    });
    if (!res.ok) return { success: false, data: `Dépôt ${owner}/${repo} introuvable` };
    const data = (await res.json()) as {
      full_name: string; description: string | null; stargazers_count: number;
      forks_count: number; language: string | null; open_issues_count: number;
      html_url: string; updated_at: string; topics?: string[];
    };

    const output = JSON.stringify({
      name: data.full_name,
      description: data.description || "Pas de description",
      stars: data.stargazers_count,
      forks: data.forks_count,
      language: data.language || "N/A",
      openIssues: data.open_issues_count,
      url: data.html_url,
      lastUpdate: data.updated_at,
      topics: data.topics || [],
    });
    setCached(cacheKey, output);
    return { success: true, data: output };
  } catch (error) {
    return { success: false, data: `Erreur GitHub: ${error instanceof Error ? error.message : String(error)}` };
  }
}

// MyMemory: free translation API, no key needed (5000 chars/day)
async function toolTranslateText(args: Record<string, unknown>): Promise<ToolCallResult> {
  const text = String(args.text).slice(0, 500);
  const to = String(args.to);
  const from = args.from ? String(args.from) : "auto";

  try {
    const langPair = from === "auto" ? to : `${from}|${to}`;
    const url = `https://api.mymemory.translated.net/get?q=${encodeURIComponent(text)}&langpair=${encodeURIComponent(langPair)}`;
    const res = await fetch(url, { signal: AbortSignal.timeout(8000) });
    if (!res.ok) return { success: false, data: "Traduction indisponible" };
    const data = (await res.json()) as {
      responseData?: { translatedText?: string; match?: number };
      responseStatus?: number;
    };

    if (data.responseStatus !== 200 || !data.responseData?.translatedText) {
      return { success: false, data: "Traduction échouée" };
    }

    return {
      success: true,
      data: JSON.stringify({
        original: text,
        translated: data.responseData.translatedText,
        from: from === "auto" ? "auto-détecté" : from,
        to,
        confidence: data.responseData.match ? `${Math.round(data.responseData.match * 100)}%` : "N/A",
      }),
    };
  } catch (error) {
    return { success: false, data: `Erreur traduction: ${error instanceof Error ? error.message : String(error)}` };
  }
}

async function toolTranscribeAudio(args: Record<string, unknown>): Promise<ToolCallResult> {
  const audioUrl = String(args.audioUrl);
  if (!audioUrl.startsWith("http")) {
    return { success: false, data: "URL audio invalide" };
  }
  if (!isAssemblyAiAvailable()) {
    return { success: false, data: "AssemblyAI non configuré. Set ASSEMBLYAI_API_KEY dans .env" };
  }

  try {
    const transcript = await transcribeAudio(audioUrl);
    if (transcript) {
      return {
        success: true,
        data: JSON.stringify({ audioUrl, transcript, length: transcript.length }),
      };
    }
    return { success: false, data: "Transcription échouée ou audio silencieux" };
  } catch (error) {
    return { success: false, data: `Erreur transcription: ${error instanceof Error ? error.message : String(error)}` };
  }
}

async function toolAnalyzeImageGemini(args: Record<string, unknown>): Promise<ToolCallResult> {
  const imageUrl = String(args.imageUrl);
  const question = String(args.question || "Décris cette image en détail");
  if (!imageUrl.startsWith("http")) {
    return { success: false, data: "URL image invalide" };
  }
  if (!isGeminiAvailable()) {
    return { success: false, data: "Gemini non configuré. Set GEMINI_API_KEY dans .env" };
  }

  try {
    const analysis = await analyzeImageWithGemini(imageUrl, question);
    if (analysis) {
      return {
        success: true,
        data: JSON.stringify({ imageUrl, question, analysis }),
      };
    }
    return { success: false, data: "Analyse d'image échouée" };
  } catch (error) {
    return { success: false, data: `Erreur analyse image: ${error instanceof Error ? error.message : String(error)}` };
  }
}

// Hacker News: free, no key needed
async function toolGetTechNews(args: Record<string, unknown>): Promise<ToolCallResult> {
  const maxResults = Math.min(10, Math.max(1, Number(args.maxResults) || 5));
  const cacheKey = `hn:${maxResults}`;
  const cached = getCached(cacheKey);
  if (cached) return { success: true, data: cached };

  try {
    // Get top story IDs
    const idsRes = await fetch("https://hacker-news.firebaseio.com/v0/topstories.json", {
      signal: AbortSignal.timeout(8000),
    });
    if (!idsRes.ok) return { success: false, data: "Hacker News indisponible" };
    const ids = (await idsRes.json()) as number[];

    // Fetch top N stories in parallel
    const topIds = ids.slice(0, maxResults);
    const stories = await Promise.all(
      topIds.map(async (id) => {
        const res = await fetch(`https://hacker-news.firebaseio.com/v0/item/${id}.json`, {
          signal: AbortSignal.timeout(8000),
        });
        if (!res.ok) return null;
        const data = (await res.json()) as { title: string; url?: string; score: number; by: string };
        return {
          title: data.title,
          url: data.url || `https://news.ycombinator.com/item?id=${id}`,
          score: data.score,
          author: data.by,
        };
      }),
    );

    const valid = stories.filter((s): s is NonNullable<typeof s> => s !== null);
    const output = JSON.stringify(valid);
    setCached(cacheKey, output);
    return { success: true, data: output };
  } catch (error) {
    return { success: false, data: `Erreur Hacker News: ${error instanceof Error ? error.message : String(error)}` };
  }
}
