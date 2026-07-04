/**
 * agentToolsExtended.ts — Tools supplémentaires pour l'agent IA
 *
 * Regroupe tous les tools gratuits (APIs sans clé) + tools Discord natifs
 * + tools exploitant les features existantes du bot.
 *
 * Importé et fusionné avec AGENT_TOOLS dans agentTools.ts
 */

import { ChannelType, PermissionFlagsBits } from "discord.js";
import logger from "../utils/logger.js";
import { stripAllHtml } from "../utils/sanitizeHtml.js";
import type { AgentToolDef, ToolCallResult, ToolContext } from "./agentTools.js";
import prisma from "../prisma.js";

// ─── Cache partagé ────────────────────────────────────────────────────────────

const extCache = new Map<string, { data: string; ts: number }>();
const CACHE_TTL = 5 * 60 * 1000;

function getCache(key: string): string | null {
  const e = extCache.get(key);
  if (e && Date.now() - e.ts < CACHE_TTL) return e.data;
  return null;
}

function setCache(key: string, data: string): void {
  extCache.set(key, { data, ts: Date.now() });
  if (extCache.size > 80) {
    const oldest = extCache.keys().next().value;
    if (oldest) extCache.delete(oldest);
  }
}

// ─── Définitions des tools supplémentaires ────────────────────────────────────

export const EXTENDED_TOOLS: AgentToolDef[] = [
  // ── Fun & Entertainment ──
  {
    type: "function",
    function: {
      name: "getJoke",
      description: "Récupère une blague aléatoire en anglais. Gratuit, pas de clé API.",
      parameters: { type: "object", properties: {}, required: [] },
    },
  },
  {
    type: "function",
    function: {
      name: "getDadJoke",
      description: "Récupère un 'dad joke' aléatoire. Gratuit, pas de clé API.",
      parameters: { type: "object", properties: {}, required: [] },
    },
  },
  {
    type: "function",
    function: {
      name: "getAdvice",
      description: "Récupère un conseil aléatoire. Gratuit, pas de clé API.",
      parameters: { type: "object", properties: {}, required: [] },
    },
  },
  {
    type: "function",
    function: {
      name: "getQuote",
      description: "Récupère une citation inspirante aléatoire. Gratuit via ZenQuotes.",
      parameters: { type: "object", properties: {}, required: [] },
    },
  },
  {
    type: "function",
    function: {
      name: "getTrivia",
      description: "Récupère une question trivia (culture générale). Gratuit via Open Trivia DB.",
      parameters: { type: "object", properties: {}, required: [] },
    },
  },
  {
    type: "function",
    function: {
      name: "getMeme",
      description: "Récupère un meme aléatoire (image + texte). Gratuit via Imgflip.",
      parameters: { type: "object", properties: {}, required: [] },
    },
  },
  {
    type: "function",
    function: {
      name: "getDogImage",
      description: "Récupère une photo aléatoire de chien. Gratuit via Dog API.",
      parameters: { type: "object", properties: {}, required: [] },
    },
  },
  {
    type: "function",
    function: {
      name: "getCatImage",
      description: "Récupère une photo aléatoire de chat. Gratuit via Cataas.",
      parameters: { type: "object", properties: {}, required: [] },
    },
  },
  // ── Info & Reference ──
  {
    type: "function",
    function: {
      name: "getCountryInfo",
      description: "Récupère infos sur un pays : capitale, population, drapeau, monnaie, langues. Gratuit via REST Countries.",
      parameters: {
        type: "object",
        properties: {
          country: { type: "string", description: "Nom du pays (ex: France, Japan, Brazil)" },
        },
        required: ["country"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "getCurrencyRate",
      description: "Convertit un montant entre deux devises. Gratuit via exchangerate.host.",
      parameters: {
        type: "object",
        properties: {
          amount: { type: "number", description: "Montant à convertir" },
          from: { type: "string", description: "Devise source (ex: EUR, USD, JPY)" },
          to: { type: "string", description: "Devise cible (ex: USD, EUR, GBP)" },
        },
        required: ["amount", "from", "to"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "getDateTime",
      description: "Récupère l'heure actuelle dans un timezone. Gratuit via WorldTimeAPI.",
      parameters: {
        type: "object",
        properties: {
          timezone: { type: "string", description: "Timezone IANA (ex: Europe/Paris, America/New_York, Asia/Tokyo)" },
        },
        required: ["timezone"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "getIpInfo",
      description: "Géolocalise une adresse IP (pays, ville, FAI). Gratuit via ipapi.co.",
      parameters: {
        type: "object",
        properties: {
          ip: { type: "string", description: "Adresse IP à géolocaliser (ex: 8.8.8.8)" },
        },
        required: ["ip"],
      },
    },
  },
  // ── Finance ──
  {
    type: "function",
    function: {
      name: "getStockPrice",
      description: "Récupère le prix d'une action boursière. Gratuit via Stooq (pas de clé). Ex: AAPL, TSLA, MSFT.",
      parameters: {
        type: "object",
        properties: {
          symbol: { type: "string", description: "Symbole boursier (ex: AAPL, TSLA, MSFT, GOOGL)" },
        },
        required: ["symbol"],
      },
    },
  },
  // ── Social & Content ──
  {
    type: "function",
    function: {
      name: "getRedditPosts",
      description: "Récupère les top posts d'un subreddit. Gratuit (Reddit JSON API, pas de clé).",
      parameters: {
        type: "object",
        properties: {
          subreddit: { type: "string", description: "Nom du subreddit sans r/ (ex: gaming, programming)" },
          limit: { type: "number", description: "Nombre de posts (défaut 5, max 10)" },
        },
        required: ["subreddit"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "getUrbanDict",
      description: "Définit un terme d'argot via Urban Dictionary. Gratuit, pas de clé.",
      parameters: {
        type: "object",
        properties: {
          term: { type: "string", description: "Terme à définir" },
        },
        required: ["term"],
      },
    },
  },
  // ── Books & Science ──
  {
    type: "function",
    function: {
      name: "getBookInfo",
      description: "Recherche un livre par titre. Retourne auteur, description, couverture. Gratuit via Open Library.",
      parameters: {
        type: "object",
        properties: {
          query: { type: "string", description: "Titre ou mots-clés du livre" },
        },
        required: ["query"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "getNasaApod",
      description: "Récupère la NASA Astronomy Picture of the Day (photo + explication). Gratuit (clé demo NASA).",
      parameters: { type: "object", properties: {}, required: [] },
    },
  },
  // ── Gaming ──
  {
    type: "function",
    function: {
      name: "getPokemon",
      description: "Récupère infos sur un Pokémon : types, stats, capacités. Gratuit via PokéAPI.",
      parameters: {
        type: "object",
        properties: {
          name: { type: "string", description: "Nom ou ID du Pokémon (ex: pikachu, charizard, 25)" },
        },
        required: ["name"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "getSteamGame",
      description: "Récupère infos sur un jeu Steam : prix, description, note. Gratuit via Steam Store API.",
      parameters: {
        type: "object",
        properties: {
          appid: { type: "number", description: "App ID Steam du jeu (ex: 1086940 pour Baldur's Gate 3)" },
        },
        required: ["appid"],
      },
    },
  },
  // ── Dev Tools ──
  {
    type: "function",
    function: {
      name: "getNpmPackage",
      description: "Récupère infos sur un paquet npm : version, description, téléchargements. Gratuit.",
      parameters: {
        type: "object",
        properties: {
          name: { type: "string", description: "Nom du paquet npm (ex: discord.js, express)" },
        },
        required: ["name"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "getPypiPackage",
      description: "Récupère infos sur un paquet Python PyPI : version, résumé, auteur. Gratuit.",
      parameters: {
        type: "object",
        properties: {
          name: { type: "string", description: "Nom du paquet (ex: flask, requests, discord.py)" },
        },
        required: ["name"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "getGithubUser",
      description: "Récupère le profil d'un utilisateur GitHub : repos, followers, bio. Gratuit.",
      parameters: {
        type: "object",
        properties: {
          username: { type: "string", description: "Nom d'utilisateur GitHub" },
        },
        required: ["username"],
      },
    },
  },
  // ── Utilities ──
  {
    type: "function",
    function: {
      name: "shortenUrl",
      description: "Raccourcit une URL. Gratuit via is.gd (pas de clé).",
      parameters: {
        type: "object",
        properties: {
          url: { type: "string", description: "L'URL à raccourcir" },
        },
        required: ["url"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "getQrCode",
      description: "Génère un QR code pour un texte ou URL. Gratuit via QuickChart. Retourne une URL d'image.",
      parameters: {
        type: "object",
        properties: {
          text: { type: "string", description: "Texte ou URL à encoder dans le QR code" },
        },
        required: ["text"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "getRandomUser",
      description: "Génère un profil utilisateur fictif (nom, email, avatar). Gratuit via RandomUser API.",
      parameters: { type: "object", properties: {}, required: [] },
    },
  },
  // ── Discord Native Tools ──
  {
    type: "function",
    function: {
      name: "kickUser",
      description: "Expulse un utilisateur du serveur. Action de modération sérieuse.",
      parameters: {
        type: "object",
        properties: {
          userId: { type: "string", description: "ID Discord de l'utilisateur" },
          reason: { type: "string", description: "Raison de l'expulsion" },
        },
        required: ["userId"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "banUser",
      description: "Bannit un utilisateur du serveur. Action de modération maximale.",
      parameters: {
        type: "object",
        properties: {
          userId: { type: "string", description: "ID Discord de l'utilisateur" },
          reason: { type: "string", description: "Raison du bannissement" },
          deleteMessageDays: { type: "number", description: "Supprimer messages des N derniers jours (défaut 7)" },
        },
        required: ["userId"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "addRole",
      description: "Ajoute un rôle à un utilisateur sur ce serveur.",
      parameters: {
        type: "object",
        properties: {
          userId: { type: "string", description: "ID Discord de l'utilisateur" },
          roleId: { type: "string", description: "ID du rôle à ajouter" },
        },
        required: ["userId", "roleId"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "removeRole",
      description: "Retire un rôle à un utilisateur sur ce serveur.",
      parameters: {
        type: "object",
        properties: {
          userId: { type: "string", description: "ID Discord de l'utilisateur" },
          roleId: { type: "string", description: "ID du rôle à retirer" },
        },
        required: ["userId", "roleId"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "createChannel",
      description: "Crée un nouveau salon textuel sur ce serveur.",
      parameters: {
        type: "object",
        properties: {
          name: { type: "string", description: "Nom du salon (ex: general-chat)" },
          topic: { type: "string", description: "Topic/description du salon (optionnel)" },
        },
        required: ["name"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "deleteChannel",
      description: "Supprime un salon du serveur par son ID.",
      parameters: {
        type: "object",
        properties: {
          channelId: { type: "string", description: "ID du salon à supprimer" },
        },
        required: ["channelId"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "setChannelTopic",
      description: "Modifie le topic/description d'un salon.",
      parameters: {
        type: "object",
        properties: {
          channelId: { type: "string", description: "ID du salon" },
          topic: { type: "string", description: "Nouveau topic" },
        },
        required: ["channelId", "topic"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "createInvite",
      description: "Crée une invitation au serveur (ou à un salon spécifique). Retourne l'URL d'invitation.",
      parameters: {
        type: "object",
        properties: {
          channelId: { type: "string", description: "ID du salon pour l'invitation (défaut: salon actuel)" },
          maxAge: { type: "number", description: "Durée en secondes (défaut 86400 = 24h, 0 = permanent)" },
          maxUses: { type: "number", description: "Max utilisations (défaut 0 = illimité)" },
        },
        required: [],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "getMemberInfo",
      description: "Récupère infos détaillées sur un membre : rôles, date de join, statut, permissions.",
      parameters: {
        type: "object",
        properties: {
          userId: { type: "string", description: "ID Discord de l'utilisateur" },
        },
        required: ["userId"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "getServerRoles",
      description: "Liste tous les rôles du serveur avec leur ID et couleur.",
      parameters: { type: "object", properties: {}, required: [] },
    },
  },
  {
    type: "function",
    function: {
      name: "setNickname",
      description: "Change le surnom d'un utilisateur sur ce serveur.",
      parameters: {
        type: "object",
        properties: {
          userId: { type: "string", description: "ID Discord de l'utilisateur" },
          nickname: { type: "string", description: "Nouveau surnom (vide pour reset)" },
        },
        required: ["userId", "nickname"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "sendDM",
      description: "Envoie un message privé à un utilisateur.",
      parameters: {
        type: "object",
        properties: {
          userId: { type: "string", description: "ID Discord de l'utilisateur" },
          message: { type: "string", description: "Message à envoyer" },
        },
        required: ["userId", "message"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "createEmbed",
      description: "Envoie un embed riche dans le salon actuel (titre, description, couleur, fields).",
      parameters: {
        type: "object",
        properties: {
          title: { type: "string", description: "Titre de l'embed" },
          description: { type: "string", description: "Description principale" },
          color: { type: "number", description: "Couleur en decimal (ex: 0x4285f4 = 4359936)" },
          fields: {
            type: "string",
            description: "JSON array de fields: [{\"name\":\"...\",\"value\":\"...\",\"inline\":true}]",
          },
        },
        required: ["title", "description"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "getVoiceChannels",
      description: "Liste les salons vocaux du serveur avec le nombre d'utilisateurs connectés.",
      parameters: { type: "object", properties: {}, required: [] },
    },
  },
  {
    type: "function",
    function: {
      name: "lockChannel",
      description: "Verrouille un salon (empêche @everyone de parler).",
      parameters: {
        type: "object",
        properties: {
          channelId: { type: "string", description: "ID du salon à verrouiller" },
        },
        required: ["channelId"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "unlockChannel",
      description: "Déverrouille un salon (remet la permission @everyone pour parler).",
      parameters: {
        type: "object",
        properties: {
          channelId: { type: "string", description: "ID du salon à déverrouiller" },
        },
        required: ["channelId"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "getEmojis",
      description: "Liste les emojis personnalisés du serveur.",
      parameters: { type: "object", properties: {}, required: [] },
    },
  },
  {
    type: "function",
    function: {
      name: "getAuditLog",
      description: "Récupère les derniers logs d'audit du serveur (actions de modération).",
      parameters: {
        type: "object",
        properties: {
          limit: { type: "number", description: "Nombre d'entrées (défaut 5, max 25)" },
        },
        required: [],
      },
    },
  },
  // ── Bot Feature Tools ──
  {
    type: "function",
    function: {
      name: "searchGifs",
      description: "Recherche des GIFs via Tenor. Retourne URLs de GIFs. Gratuit, pas de clé.",
      parameters: {
        type: "object",
        properties: {
          query: { type: "string", description: "Recherche de GIF (ex: dance, happy, gaming)" },
        },
        required: ["query"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "checkToxicity",
      description: "Analyse la toxicité d'un texte (insultes, harcèlement, spam). Retourne un score.",
      parameters: {
        type: "object",
        properties: {
          text: { type: "string", description: "Le texte à analyser" },
        },
        required: ["text"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "getRiskProfile",
      description: "Récupère le profil de risque d'un utilisateur (score, niveau, sanctions). Via le risk-engine du bot.",
      parameters: {
        type: "object",
        properties: {
          userId: { type: "string", description: "ID Discord de l'utilisateur" },
        },
        required: ["userId"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "checkPhishing",
      description: "Vérifie si une URL est un lien de phishing connu. Via le système de sécurité du bot.",
      parameters: {
        type: "object",
        properties: {
          url: { type: "string", description: "L'URL à vérifier" },
        },
        required: ["url"],
      },
    },
  },
  // ── Agent Autonome Tools ──
  {
    type: "function",
    function: {
      name: "analyze_image",
      description: "Analyse une image via vision IA. Détecte le contenu, le texte, les objets. Utile quand un utilisateur envoie une image.",
      parameters: {
        type: "object",
        properties: {
          image_url: { type: "string", description: "URL de l'image à analyser" },
          question: { type: "string", description: "Question spécifique sur l'image (optionnel)" },
        },
        required: ["image_url"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "analyze_sentiment",
      description: "Analyse le sentiment et la toxicité d'un texte. Retourne un score de toxicité, l'humeur détectée et le niveau de risque.",
      parameters: {
        type: "object",
        properties: {
          text: { type: "string", description: "Le texte à analyser" },
        },
        required: ["text"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "triggerGarbageCollection",
      description: "Déclenche un nettoyage de la RAM du bot (garbage collection). Tool de maintenance automatique. Aucun paramètre requis.",
      parameters: { type: "object", properties: {}, required: [] },
    },
  },
  // ── Agent Proactive Tools ──
  {
    type: "function",
    function: {
      name: "summarize_conversation",
      description: "Résume les N derniers messages d'un salon Discord. Utile pour rattraper une conversation longue ou générer un compte-rendu.",
      parameters: {
        type: "object",
        properties: {
          channel_id: { type: "string", description: "ID du salon à résumer" },
          message_count: { type: "number", description: "Nombre de messages à analyser (défaut: 50, max: 100)" },
        },
        required: ["channel_id"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "detect_language",
      description: "Détecte la langue d'un texte. Retourne le code langue (fr, en, es, de...) et le niveau de confiance. Aucune API requise.",
      parameters: {
        type: "object",
        properties: {
          text: { type: "string", description: "Le texte à analyser" },
        },
        required: ["text"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "get_server_insights",
      description: "Génère des statistiques avancées sur un serveur : activité, ratio en ligne, croissance, top channels, distribution des rôles.",
      parameters: { type: "object", properties: {}, required: [] },
    },
  },
];

// ─── Dispatcher ──────────────────────────────────────────────────────────────

export async function executeExtendedTool(
  toolName: string,
  args: Record<string, unknown>,
  ctx: ToolContext,
): Promise<ToolCallResult | null> {
  logger.info(`[AgentToolsExt] 🔧 ${toolName} args=${JSON.stringify(args).slice(0, 150)}`);

  try {
    switch (toolName) {
      // Fun
      case "getJoke": return await tGetJoke();
      case "getDadJoke": return await tGetDadJoke();
      case "getAdvice": return await tGetAdvice();
      case "getQuote": return await tGetQuote();
      case "getTrivia": return await tGetTrivia();
      case "getMeme": return await tGetMeme();
      case "getDogImage": return await tGetDogImage();
      case "getCatImage": return await tGetCatImage();
      // Info
      case "getCountryInfo": return await tGetCountryInfo(args);
      case "getCurrencyRate": return await tGetCurrencyRate(args);
      case "getDateTime": return await tGetDateTime(args);
      case "getIpInfo": return await tGetIpInfo(args);
      // Finance
      case "getStockPrice": return await tGetStockPrice(args);
      // Social
      case "getRedditPosts": return await tGetRedditPosts(args);
      case "getUrbanDict": return await tGetUrbanDict(args);
      // Books & Science
      case "getBookInfo": return await tGetBookInfo(args);
      case "getNasaApod": return await tGetNasaApod();
      // Gaming
      case "getPokemon": return await tGetPokemon(args);
      case "getSteamGame": return await tGetSteamGame(args);
      // Dev
      case "getNpmPackage": return await tGetNpmPackage(args);
      case "getPypiPackage": return await tGetPypiPackage(args);
      case "getGithubUser": return await tGetGithubUser(args);
      // Utilities
      case "shortenUrl": return await tShortenUrl(args);
      case "getQrCode": return await tGetQrCode(args);
      case "getRandomUser": return await tGetRandomUser();
      // Discord
      case "kickUser": return await tKickUser(args, ctx);
      case "banUser": return await tBanUser(args, ctx);
      case "addRole": return await tAddRole(args, ctx);
      case "removeRole": return await tRemoveRole(args, ctx);
      case "createChannel": return await tCreateChannel(args, ctx);
      case "deleteChannel": return await tDeleteChannel(args, ctx);
      case "setChannelTopic": return await tSetChannelTopic(args, ctx);
      case "createInvite": return await tCreateInvite(args, ctx);
      case "getMemberInfo": return await tGetMemberInfo(args, ctx);
      case "getServerRoles": return await tGetServerRoles(ctx);
      case "setNickname": return await tSetNickname(args, ctx);
      case "sendDM": return await tSendDM(args, ctx);
      case "createEmbed": return await tCreateEmbed(args, ctx);
      case "getVoiceChannels": return await tGetVoiceChannels(ctx);
      case "lockChannel": return await tLockChannel(args, ctx);
      case "unlockChannel": return await tUnlockChannel(args, ctx);
      case "getEmojis": return await tGetEmojis(ctx);
      case "getAuditLog": return await tGetAuditLog(args, ctx);
      // Bot features
      case "searchGifs": return await tSearchGifs(args);
      case "checkToxicity": return await tCheckToxicity(args);
      case "getRiskProfile": return await tGetRiskProfile(args, ctx);
      case "checkPhishing": return await tCheckPhishing(args);
      case "analyze_image": return await tAnalyzeImage(args);
      case "analyze_sentiment": return await tAnalyzeSentiment(args);
      case "triggerGarbageCollection": return await tTriggerGC();
      case "summarize_conversation": return await tSummarizeConversation(args, ctx);
      case "detect_language": return await tDetectLanguage(args);
      case "get_server_insights": return await tGetServerInsights(ctx);
      default: return null;
    }
  } catch (error) {
    logger.error(`[AgentToolsExt] Erreur ${toolName}: ${error instanceof Error ? error.message : String(error)}`);
    return {
      success: false,
      data: `Erreur: ${error instanceof Error ? error.message : String(error)}`,
    };
  }
}

// ─── Fun & Entertainment ─────────────────────────────────────────────────────

async function tGetJoke(): Promise<ToolCallResult> {
  try {
    const res = await fetch("https://official-joke-api.appspot.com/random_joke", { signal: AbortSignal.timeout(8000) });
    if (!res.ok) return { success: false, data: "Blague indisponible" };
    const d = (await res.json()) as { setup: string; punchline: string };
    return { success: true, data: JSON.stringify({ setup: d.setup, punchline: d.punchline }) };
  } catch (e) { return { success: false, data: `Erreur: ${e instanceof Error ? e.message : String(e)}` }; }
}

async function tGetDadJoke(): Promise<ToolCallResult> {
  try {
    const res = await fetch("https://icanhazdadjoke.com/", { headers: { Accept: "text/plain" }, signal: AbortSignal.timeout(8000) });
    if (!res.ok) return { success: false, data: "Dad joke indisponible" };
    const text = await res.text();
    return { success: true, data: text };
  } catch (e) { return { success: false, data: `Erreur: ${e instanceof Error ? e.message : String(e)}` }; }
}

async function tGetAdvice(): Promise<ToolCallResult> {
  try {
    const res = await fetch("https://api.adviceslip.com/advice", { signal: AbortSignal.timeout(8000) });
    if (!res.ok) return { success: false, data: "Conseil indisponible" };
    const d = (await res.json()) as { slip: { advice: string } };
    return { success: true, data: d.slip.advice };
  } catch (e) { return { success: false, data: `Erreur: ${e instanceof Error ? e.message : String(e)}` }; }
}

async function tGetQuote(): Promise<ToolCallResult> {
  try {
    const res = await fetch("https://zenquotes.io/api/random", { signal: AbortSignal.timeout(8000) });
    if (!res.ok) return { success: false, data: "Citation indisponible" };
    const d = (await res.json()) as Array<{ q: string; a: string }>;
    if (!d[0]) return { success: false, data: "Pas de citation" };
    return { success: true, data: JSON.stringify({ quote: d[0].q, author: d[0].a }) };
  } catch (e) { return { success: false, data: `Erreur: ${e instanceof Error ? e.message : String(e)}` }; }
}

async function tGetTrivia(): Promise<ToolCallResult> {
  try {
    const res = await fetch("https://opentdb.com/api.php?amount=1&type=multiple", { signal: AbortSignal.timeout(8000) });
    if (!res.ok) return { success: false, data: "Trivia indisponible" };
    const d = (await res.json()) as { results: Array<{ question: string; correct_answer: string; incorrect_answers: string[]; category: string; difficulty: string }> };
    if (!d.results[0]) return { success: false, data: "Pas de question" };
    const q = d.results[0];
    return {
      success: true,
      data: JSON.stringify({
        category: q.category,
        difficulty: q.difficulty,
        question: stripAllHtml(q.question),
        correctAnswer: stripAllHtml(q.correct_answer),
        options: [q.correct_answer, ...q.incorrect_answers].map(stripAllHtml).sort(),
      }),
    };
  } catch (e) { return { success: false, data: `Erreur: ${e instanceof Error ? e.message : String(e)}` }; }
}

async function tGetMeme(): Promise<ToolCallResult> {
  try {
    const res = await fetch("https://api.imgflip.com/get_memes", { signal: AbortSignal.timeout(8000) });
    if (!res.ok) return { success: false, data: "Meme indisponible" };
    const d = (await res.json()) as { data: { memes: Array<{ id: string; name: string; url: string; width: number; height: number }> } };
    const memes = d.data.memes;
    if (!memes?.length) return { success: false, data: "Pas de meme" };
    const random = memes[Math.floor(Math.random() * Math.min(10, memes.length))];
    return { success: true, data: JSON.stringify({ name: random.name, url: random.url }) };
  } catch (e) { return { success: false, data: `Erreur: ${e instanceof Error ? e.message : String(e)}` }; }
}

async function tGetDogImage(): Promise<ToolCallResult> {
  try {
    const res = await fetch("https://dog.ceo/api/breeds/image/random", { signal: AbortSignal.timeout(8000) });
    if (!res.ok) return { success: false, data: "Photo indisponible" };
    const d = (await res.json()) as { message: string };
    return { success: true, data: d.message };
  } catch (e) { return { success: false, data: `Erreur: ${e instanceof Error ? e.message : String(e)}` }; }
}

async function tGetCatImage(): Promise<ToolCallResult> {
  try {
    const res = await fetch("https://cataas.com/cat?json=true", { signal: AbortSignal.timeout(8000) });
    if (!res.ok) return { success: false, data: "Photo indisponible" };
    const d = (await res.json()) as { url: string };
    return { success: true, data: `https://cataas.com${d.url}` };
  } catch (e) { return { success: false, data: `Erreur: ${e instanceof Error ? e.message : String(e)}` }; }
}

// ─── Info & Reference ────────────────────────────────────────────────────────

async function tGetCountryInfo(args: Record<string, unknown>): Promise<ToolCallResult> {
  const country = String(args.country);
  const ck = `country:${country.toLowerCase()}`;
  const cached = getCache(ck);
  if (cached) return { success: true, data: cached };
  try {
    const res = await fetch(`https://restcountries.com/v3.1/name/${encodeURIComponent(country)}?fields=name,capital,population,flag,currencies,languages,region,subregion,maps`, { signal: AbortSignal.timeout(8000) });
    if (!res.ok) return { success: false, data: `Pays "${country}" introuvable` };
    const data = (await res.json()) as Array<{
      name: { common: string }; capital: string[]; population: number; flag: string;
      currencies: Record<string, { name: string; symbol: string }>;
      languages: Record<string, string>; region: string; subregion: string;
    }>;
    const c = data[0];
    if (!c) return { success: false, data: "Pays introuvable" };
    const output = JSON.stringify({
      name: c.name.common,
      capital: c.capital?.[0] || "N/A",
      population: c.population.toLocaleString(),
      region: c.region,
      subregion: c.subregion,
      flag: c.flag,
      currencies: Object.values(c.currencies || {}).map((cur) => `${cur.name} (${cur.symbol})`).join(", "),
      languages: Object.values(c.languages || {}).join(", "),
    });
    setCache(ck, output);
    return { success: true, data: output };
  } catch (e) { return { success: false, data: `Erreur: ${e instanceof Error ? e.message : String(e)}` }; }
}

async function tGetCurrencyRate(args: Record<string, unknown>): Promise<ToolCallResult> {
  const amount = Number(args.amount);
  const from = String(args.from).toUpperCase();
  const to = String(args.to).toUpperCase();
  try {
    const res = await fetch(`https://api.exchangerate.host/convert?from=${from}&to=${to}&amount=${amount}`, { signal: AbortSignal.timeout(8000) });
    if (!res.ok) return { success: false, data: "Conversion indisponible" };
    const d = (await res.json()) as { result: number; date: string };
    return { success: true, data: JSON.stringify({ amount, from, to, result: d.result, rate: d.result / amount, date: d.date }) };
  } catch (e) { return { success: false, data: `Erreur: ${e instanceof Error ? e.message : String(e)}` }; }
}

async function tGetDateTime(args: Record<string, unknown>): Promise<ToolCallResult> {
  const tz = String(args.timezone);
  try {
    const res = await fetch(`https://worldtimeapi.org/api/timezone/${encodeURIComponent(tz)}`, { signal: AbortSignal.timeout(8000) });
    if (!res.ok) return { success: false, data: `Timezone "${tz}" introuvable` };
    const d = (await res.json()) as { datetime: string; timezone: string; utc_datetime: string };
    return { success: true, data: JSON.stringify({ timezone: d.timezone, datetime: d.datetime, utc: d.utc_datetime }) };
  } catch (e) { return { success: false, data: `Erreur: ${e instanceof Error ? e.message : String(e)}` }; }
}

async function tGetIpInfo(args: Record<string, unknown>): Promise<ToolCallResult> {
  const ip = String(args.ip);
  try {
    const res = await fetch(`https://ipapi.co/${encodeURIComponent(ip)}/json/`, { signal: AbortSignal.timeout(8000) });
    if (!res.ok) return { success: false, data: "IP indisponible" };
    const d = (await res.json()) as { city: string; region: string; country_name: string; org: string; timezone: string; latitude: number; longitude: number };
    return { success: true, data: JSON.stringify({ ip, city: d.city, region: d.region, country: d.country_name, isp: d.org, timezone: d.timezone, lat: d.latitude, lon: d.longitude }) };
  } catch (e) { return { success: false, data: `Erreur: ${e instanceof Error ? e.message : String(e)}` }; }
}

// ─── Finance ─────────────────────────────────────────────────────────────────

async function tGetStockPrice(args: Record<string, unknown>): Promise<ToolCallResult> {
  const symbol = String(args.symbol).toUpperCase();
  const ck = `stock:${symbol}`;
  const cached = getCache(ck);
  if (cached) return { success: true, data: cached };
  try {
    const res = await fetch(`https://stooq.com/q/l/?s=${encodeURIComponent(symbol.toLowerCase())}&f=sd2t2ohlcv&h&e=csv`, { signal: AbortSignal.timeout(8000) });
    if (!res.ok) return { success: false, data: "Bourse indisponible" };
    const text = await res.text();
    const lines = text.trim().split("\n");
    if (lines.length < 2) return { success: false, data: `Action "${symbol}" introuvable` };
    const cols = lines[1].split(",");
    const output = JSON.stringify({ symbol, open: cols[2], high: cols[3], low: cols[4], close: cols[5], volume: cols[6], date: cols[1] });
    setCache(ck, output);
    return { success: true, data: output };
  } catch (e) { return { success: false, data: `Erreur: ${e instanceof Error ? e.message : String(e)}` }; }
}

// ─── Social & Content ────────────────────────────────────────────────────────

async function tGetRedditPosts(args: Record<string, unknown>): Promise<ToolCallResult> {
  const subreddit = String(args.subreddit).replace(/^r\//, "");
  const limit = Math.min(10, Math.max(1, Number(args.limit) || 5));
  const ck = `reddit:${subreddit}:${limit}`;
  const cached = getCache(ck);
  if (cached) return { success: true, data: cached };
  try {
    const res = await fetch(`https://www.reddit.com/r/${encodeURIComponent(subreddit)}/top.json?limit=${limit}&t=day`, {
      headers: { "User-Agent": "DiscordBot/1.0" },
      signal: AbortSignal.timeout(8000),
    });
    if (!res.ok) return { success: false, data: `Subreddit r/${subreddit} introuvable` };
    const d = (await res.json()) as { data: { children: Array<{ data: { title: string; url: string; score: number; author: string; num_comments: number; permalink: string } }> } };
    const posts = d.data.children.map((c) => ({
      title: c.data.title,
      url: c.data.url,
      score: c.data.score,
      author: c.data.author,
      comments: c.data.num_comments,
      permalink: `https://reddit.com${c.data.permalink}`,
    }));
    const output = JSON.stringify(posts);
    setCache(ck, output);
    return { success: true, data: output };
  } catch (e) { return { success: false, data: `Erreur: ${e instanceof Error ? e.message : String(e)}` }; }
}

async function tGetUrbanDict(args: Record<string, unknown>): Promise<ToolCallResult> {
  const term = String(args.term);
  try {
    const res = await fetch(`https://api.urbandictionary.com/v0/define?term=${encodeURIComponent(term)}`, { signal: AbortSignal.timeout(8000) });
    if (!res.ok) return { success: false, data: "Urban Dictionary indisponible" };
    const d = (await res.json()) as { list: Array<{ definition: string; example: string; author: string; thumbs_up: number }> };
    if (!d.list[0]) return { success: false, data: `Terme "${term}" introuvable` };
    const def = d.list[0];
    return { success: true, data: JSON.stringify({ term, definition: stripAllHtml(def.definition).slice(0, 1000), example: stripAllHtml(def.example).slice(0, 500), author: def.author, likes: def.thumbs_up }) };
  } catch (e) { return { success: false, data: `Erreur: ${e instanceof Error ? e.message : String(e)}` }; }
}

// ─── Books & Science ─────────────────────────────────────────────────────────

async function tGetBookInfo(args: Record<string, unknown>): Promise<ToolCallResult> {
  const query = String(args.query);
  try {
    const res = await fetch(`https://openlibrary.org/search.json?q=${encodeURIComponent(query)}&limit=1`, { signal: AbortSignal.timeout(8000) });
    if (!res.ok) return { success: false, data: "Open Library indisponible" };
    const d = (await res.json()) as { docs: Array<{ title: string; author_name: string[]; first_publish_year: number; cover_i: number; subject: string[] }> };
    if (!d.docs[0]) return { success: false, data: `Livre "${query}" introuvable` };
    const b = d.docs[0];
    return {
      success: true,
      data: JSON.stringify({
        title: b.title,
        authors: b.author_name?.join(", ") || "Inconnu",
        firstPublished: b.first_publish_year || "N/A",
        cover: b.cover_i ? `https://covers.openlibrary.org/b/id/${b.cover_i}-M.jpg` : null,
        subjects: b.subject?.slice(0, 5).join(", ") || [],
        url: `https://openlibrary.org/search?q=${encodeURIComponent(query)}`,
      }),
    };
  } catch (e) { return { success: false, data: `Erreur: ${e instanceof Error ? e.message : String(e)}` }; }
}

async function tGetNasaApod(): Promise<ToolCallResult> {
  const ck = "nasa:apod";
  const cached = getCache(ck);
  if (cached) return { success: true, data: cached };
  try {
    const res = await fetch("https://api.nasa.gov/planetary/apod?api_key=DEMO_KEY", { signal: AbortSignal.timeout(8000) });
    if (!res.ok) return { success: false, data: "NASA APOD indisponible" };
    const d = (await res.json()) as { title: string; explanation: string; url: string; hdurl: string; date: string; media_type: string };
    const output = JSON.stringify({ title: d.title, explanation: d.explanation.slice(0, 1000), url: d.url, hdUrl: d.hdurl, date: d.date, type: d.media_type });
    setCache(ck, output);
    return { success: true, data: output };
  } catch (e) { return { success: false, data: `Erreur: ${e instanceof Error ? e.message : String(e)}` }; }
}

// ─── Gaming ──────────────────────────────────────────────────────────────────

async function tGetPokemon(args: Record<string, unknown>): Promise<ToolCallResult> {
  const name = String(args.name).toLowerCase();
  const ck = `pokemon:${name}`;
  const cached = getCache(ck);
  if (cached) return { success: true, data: cached };
  try {
    const res = await fetch(`https://pokeapi.co/api/v2/pokemon/${encodeURIComponent(name)}`, { signal: AbortSignal.timeout(8000) });
    if (!res.ok) return { success: false, data: `Pokémon "${name}" introuvable` };
    const d = (await res.json()) as {
      name: string; id: number; height: number; weight: number;
      types: Array<{ type: { name: string } }>;
      stats: Array<{ base_stat: number; stat: { name: string } }>;
      abilities: Array<{ ability: { name: string } }>;
      sprites: { front_default: string };
    };
    const output = JSON.stringify({
      name: d.name, id: d.id,
      height: `${d.height / 10}m`, weight: `${d.weight / 10}kg`,
      types: d.types.map((t) => t.type.name),
      stats: d.stats.map((s) => `${s.stat.name}: ${s.base_stat}`),
      abilities: d.abilities.map((a) => a.ability.name),
      sprite: d.sprites.front_default,
    });
    setCache(ck, output);
    return { success: true, data: output };
  } catch (e) { return { success: false, data: `Erreur: ${e instanceof Error ? e.message : String(e)}` }; }
}

async function tGetSteamGame(args: Record<string, unknown>): Promise<ToolCallResult> {
  const appid = Number(args.appid);
  const ck = `steam:${appid}`;
  const cached = getCache(ck);
  if (cached) return { success: true, data: cached };
  try {
    const res = await fetch(`https://store.steampowered.com/api/appdetails?appids=${appid}&l=fr`, { signal: AbortSignal.timeout(8000) });
    if (!res.ok) return { success: false, data: "Steam Store indisponible" };
    const d = (await res.json()) as Record<string, { success: boolean; data: { name: string; short_description: string; header_image: string; price_overview?: { final_formatted: string }; metacritic?: { score: number }; developers: string[]; publishers: string[]; genres: Array<{ description: string }> } }>;
    const info = d[appid];
    if (!info?.success) return { success: false, data: `Jeu Steam ${appid} introuvable` };
    const g = info.data;
    const output = JSON.stringify({
      name: g.name,
      description: g.short_description?.slice(0, 800),
      price: g.price_overview?.final_formatted || "Gratuit",
      metacritic: g.metacritic?.score || null,
      developers: g.developers?.join(", "),
      publishers: g.publishers?.join(", "),
      genres: g.genres?.map((x) => x.description).join(", "),
      image: g.header_image,
      url: `https://store.steampowered.com/app/${appid}`,
    });
    setCache(ck, output);
    return { success: true, data: output };
  } catch (e) { return { success: false, data: `Erreur: ${e instanceof Error ? e.message : String(e)}` }; }
}

// ─── Dev Tools ───────────────────────────────────────────────────────────────

async function tGetNpmPackage(args: Record<string, unknown>): Promise<ToolCallResult> {
  const name = String(args.name);
  try {
    const res = await fetch(`https://registry.npmjs.org/${encodeURIComponent(name)}/latest`, { signal: AbortSignal.timeout(8000) });
    if (!res.ok) return { success: false, data: `Paquet npm "${name}" introuvable` };
    const d = (await res.json()) as { name: string; version: string; description: string; license: string; homepage: string; dependencies: Record<string, string> };
    return { success: true, data: JSON.stringify({ name: d.name, version: d.version, description: d.description || "N/A", license: d.license || "N/A", homepage: d.homepage || `https://npmjs.com/package/${name}`, dependencies: Object.keys(d.dependencies || {}).length }) };
  } catch (e) { return { success: false, data: `Erreur: ${e instanceof Error ? e.message : String(e)}` }; }
}

async function tGetPypiPackage(args: Record<string, unknown>): Promise<ToolCallResult> {
  const name = String(args.name);
  try {
    const res = await fetch(`https://pypi.org/pypi/${encodeURIComponent(name)}/json`, { signal: AbortSignal.timeout(8000) });
    if (!res.ok) return { success: false, data: `Paquet PyPI "${name}" introuvable` };
    const d = (await res.json()) as { info: { name: string; version: string; summary: string; author: string; license: string; home_page: string; requires_python: string } };
    const i = d.info;
    return { success: true, data: JSON.stringify({ name: i.name, version: i.version, summary: i.summary || "N/A", author: i.author || "N/A", license: i.license || "N/A", homepage: i.home_page || `https://pypi.org/project/${name}/`, python: i.requires_python || "N/A" }) };
  } catch (e) { return { success: false, data: `Erreur: ${e instanceof Error ? e.message : String(e)}` }; }
}

async function tGetGithubUser(args: Record<string, unknown>): Promise<ToolCallResult> {
  const username = String(args.username);
  const ck = `ghuser:${username}`;
  const cached = getCache(ck);
  if (cached) return { success: true, data: cached };
  try {
    const res = await fetch(`https://api.github.com/users/${encodeURIComponent(username)}`, { headers: { "User-Agent": "DiscordBot/1.0" }, signal: AbortSignal.timeout(8000) });
    if (!res.ok) return { success: false, data: `Utilisateur GitHub "${username}" introuvable` };
    const d = (await res.json()) as { login: string; name: string; bio: string; public_repos: number; followers: number; following: number; html_url: string; avatar_url: string; company: string; location: string; created_at: string };
    const output = JSON.stringify({ username: d.login, name: d.name || d.login, bio: d.bio || "Pas de bio", repos: d.public_repos, followers: d.followers, following: d.following, url: d.html_url, avatar: d.avatar_url, company: d.company || "N/A", location: d.location || "N/A", joined: d.created_at });
    setCache(ck, output);
    return { success: true, data: output };
  } catch (e) { return { success: false, data: `Erreur: ${e instanceof Error ? e.message : String(e)}` }; }
}

// ─── Utilities ───────────────────────────────────────────────────────────────

async function tShortenUrl(args: Record<string, unknown>): Promise<ToolCallResult> {
  const url = String(args.url);
  if (!url.startsWith("http")) return { success: false, data: "URL invalide" };
  try {
    const res = await fetch(`https://is.gd/create.php?format=json&url=${encodeURIComponent(url)}`, { signal: AbortSignal.timeout(8000) });
    if (!res.ok) return { success: false, data: "Raccourcissement indisponible" };
    const d = (await res.json()) as { shorturl?: string; errormessage?: string };
    if (d.errormessage) return { success: false, data: d.errormessage };
    return { success: true, data: d.shorturl || "Échec" };
  } catch (e) { return { success: false, data: `Erreur: ${e instanceof Error ? e.message : String(e)}` }; }
}

async function tGetQrCode(args: Record<string, unknown>): Promise<ToolCallResult> {
  const text = String(args.text);
  const qrUrl = `https://quickchart.io/qr?text=${encodeURIComponent(text)}&size=300`;
  return { success: true, data: JSON.stringify({ qrUrl, content: text }) };
}

async function tGetRandomUser(): Promise<ToolCallResult> {
  try {
    const res = await fetch("https://randomuser.me/api/?nat=fr", { signal: AbortSignal.timeout(8000) });
    if (!res.ok) return { success: false, data: "RandomUser indisponible" };
    const d = (await res.json()) as { results: Array<{ name: { first: string; last: string }; email: string; phone: string; gender: string; picture: { large: string }; location: { city: string; country: string } }> };
    if (!d.results[0]) return { success: false, data: "Pas de profil" };
    const u = d.results[0];
    return { success: true, data: JSON.stringify({ name: `${u.name.first} ${u.name.last}`, email: u.email, phone: u.phone, gender: u.gender, city: u.location.city, country: u.location.country, avatar: u.picture.large }) };
  } catch (e) { return { success: false, data: `Erreur: ${e instanceof Error ? e.message : String(e)}` }; }
}

// ─── Discord Native Tools ────────────────────────────────────────────────────

async function tKickUser(args: Record<string, unknown>, ctx: ToolContext): Promise<ToolCallResult> {
  const userId = String(args.userId);
  const reason = String(args.reason || "Expulsion par agent IA");
  const guild = ctx.client.guilds.cache.get(ctx.guildId);
  if (!guild) return { success: false, data: "Serveur introuvable" };
  const member = await guild.members.fetch(userId).catch(() => null);
  if (!member) return { success: false, data: "Utilisateur introuvable" };
  await member.kick(`[Agent IA] ${reason}`.slice(0, 512));
  await prisma.sanction.create({ data: { guildId: ctx.guildId, userId, moderatorId: "AI_AGENT", type: "KICK", reason } }).catch(() => {});
  return { success: true, data: `Utilisateur <@${userId}> expulsé. Raison: ${reason}` };
}

async function tBanUser(args: Record<string, unknown>, ctx: ToolContext): Promise<ToolCallResult> {
  const userId = String(args.userId);
  const reason = String(args.reason || "Bannissement par agent IA");
  const deleteDays = Math.min(7, Number(args.deleteMessageDays) || 7);
  const guild = ctx.client.guilds.cache.get(ctx.guildId);
  if (!guild) return { success: false, data: "Serveur introuvable" };
  await guild.members.ban(userId, { reason: `[Agent IA] ${reason}`.slice(0, 512), deleteMessageSeconds: deleteDays * 86400 });
  await prisma.sanction.create({ data: { guildId: ctx.guildId, userId, moderatorId: "AI_AGENT", type: "BAN", reason } }).catch(() => {});
  return { success: true, data: `Utilisateur <@${userId}> banni. Raison: ${reason}` };
}

async function tAddRole(args: Record<string, unknown>, ctx: ToolContext): Promise<ToolCallResult> {
  const userId = String(args.userId);
  const roleId = String(args.roleId);
  const guild = ctx.client.guilds.cache.get(ctx.guildId);
  if (!guild) return { success: false, data: "Serveur introuvable" };
  const member = await guild.members.fetch(userId).catch(() => null);
  if (!member) return { success: false, data: "Utilisateur introuvable" };
  await member.roles.add(roleId).catch(() => { throw new Error("Impossible d'ajouter le rôle (permissions?)"); });
  return { success: true, data: `Rôle ${roleId} ajouté à <@${userId}>` };
}

async function tRemoveRole(args: Record<string, unknown>, ctx: ToolContext): Promise<ToolCallResult> {
  const userId = String(args.userId);
  const roleId = String(args.roleId);
  const guild = ctx.client.guilds.cache.get(ctx.guildId);
  if (!guild) return { success: false, data: "Serveur introuvable" };
  const member = await guild.members.fetch(userId).catch(() => null);
  if (!member) return { success: false, data: "Utilisateur introuvable" };
  await member.roles.remove(roleId).catch(() => { throw new Error("Impossible de retirer le rôle (permissions?)"); });
  return { success: true, data: `Rôle ${roleId} retiré de <@${userId}>` };
}

async function tCreateChannel(args: Record<string, unknown>, ctx: ToolContext): Promise<ToolCallResult> {
  const name = String(args.name).toLowerCase().replace(/\s+/g, "-").slice(0, 100);
  const topic = args.topic ? String(args.topic) : undefined;
  const guild = ctx.client.guilds.cache.get(ctx.guildId);
  if (!guild) return { success: false, data: "Serveur introuvable" };
  const channel = await guild.channels.create({ name, type: ChannelType.GuildText, topic });
  return { success: true, data: JSON.stringify({ name: channel.name, id: channel.id, topic: topic || null }) };
}

async function tDeleteChannel(args: Record<string, unknown>, ctx: ToolContext): Promise<ToolCallResult> {
  const channelId = String(args.channelId);
  const guild = ctx.client.guilds.cache.get(ctx.guildId);
  if (!guild) return { success: false, data: "Serveur introuvable" };
  const channel = guild.channels.cache.get(channelId);
  if (!channel) return { success: false, data: "Salon introuvable" };
  await channel.delete("[Agent IA] Suppression demandée").catch(() => { throw new Error("Permissions insuffisantes"); });
  return { success: true, data: `Salon ${channelId} supprimé` };
}

async function tSetChannelTopic(args: Record<string, unknown>, ctx: ToolContext): Promise<ToolCallResult> {
  const channelId = String(args.channelId);
  const topic = String(args.topic);
  const guild = ctx.client.guilds.cache.get(ctx.guildId);
  if (!guild) return { success: false, data: "Serveur introuvable" };
  const channel = guild.channels.cache.get(channelId);
  if (!channel || channel.type !== ChannelType.GuildText) return { success: false, data: "Salon textuel introuvable" };
  await (channel as import("discord.js").TextChannel).setTopic(topic);
  return { success: true, data: `Topic du salon ${channelId} mis à jour` };
}

async function tCreateInvite(args: Record<string, unknown>, ctx: ToolContext): Promise<ToolCallResult> {
  const guild = ctx.client.guilds.cache.get(ctx.guildId);
  if (!guild) return { success: false, data: "Serveur introuvable" };
  const channelId = args.channelId ? String(args.channelId) : ctx.channelId;
  const channel = guild.channels.cache.get(channelId);
  if (!channel || !channel.isTextBased()) return { success: false, data: "Salon introuvable" };
  if (!("createInvite" in channel)) return { success: false, data: "Ce salon ne supporte pas les invitations" };
  const maxAge = Number(args.maxAge) ?? 86400;
  const maxUses = Number(args.maxUses) ?? 0;
  const invite = await (channel as import("discord.js").TextChannel).createInvite({ maxAge, maxUses, unique: true });
  return { success: true, data: JSON.stringify({ url: `https://discord.gg/${invite.code}`, code: invite.code, maxAge, maxUses }) };
}

async function tGetMemberInfo(args: Record<string, unknown>, ctx: ToolContext): Promise<ToolCallResult> {
  const userId = String(args.userId);
  const guild = ctx.client.guilds.cache.get(ctx.guildId);
  if (!guild) return { success: false, data: "Serveur introuvable" };
  const member = await guild.members.fetch(userId).catch(() => null);
  if (!member) return { success: false, data: "Membre introuvable" };
  return {
    success: true,
    data: JSON.stringify({
      username: member.user.username,
      displayName: member.displayName,
      id: member.id,
      joinedAt: member.joinedAt?.toISOString(),
      createdAt: member.user.createdAt.toISOString(),
      roles: member.roles.cache.map((r) => ({ id: r.id, name: r.name, color: r.color })).filter((r) => r.name !== "@everyone"),
      nickname: member.nickname || null,
      isBot: member.user.bot,
      premiumSince: member.premiumSince?.toISOString() || null,
    }),
  };
}

async function tGetServerRoles(ctx: ToolContext): Promise<ToolCallResult> {
  const guild = ctx.client.guilds.cache.get(ctx.guildId);
  if (!guild) return { success: false, data: "Serveur introuvable" };
  const roles = guild.roles.cache
    .sorted((a, b) => b.position - a.position)
    .map((r) => ({ id: r.id, name: r.name, color: r.color, members: r.members.size, hoist: r.hoist, mentionable: r.mentionable }))
    .filter((r) => r.name !== "@everyone");
  return { success: true, data: JSON.stringify(roles.slice(0, 30)) };
}

async function tSetNickname(args: Record<string, unknown>, ctx: ToolContext): Promise<ToolCallResult> {
  const userId = String(args.userId);
  const nickname = String(args.nickname);
  const guild = ctx.client.guilds.cache.get(ctx.guildId);
  if (!guild) return { success: false, data: "Serveur introuvable" };
  const member = await guild.members.fetch(userId).catch(() => null);
  if (!member) return { success: false, data: "Membre introuvable" };
  await member.setNickname(nickname || null, "[Agent IA]").catch(() => { throw new Error("Permissions insuffisantes"); });
  return { success: true, data: `Surnom de <@${userId}> changé en "${nickname}"` };
}

async function tSendDM(args: Record<string, unknown>, ctx: ToolContext): Promise<ToolCallResult> {
  const userId = String(args.userId);
  const message = String(args.message).slice(0, 2000);
  const user = await ctx.client.users.fetch(userId).catch(() => null);
  if (!user) return { success: false, data: "Utilisateur introuvable" };
  await user.send(message).catch(() => { throw new Error("MP bloqués par l'utilisateur"); });
  return { success: true, data: `Message privé envoyé à <@${userId}>` };
}

async function tCreateEmbed(args: Record<string, unknown>, ctx: ToolContext): Promise<ToolCallResult> {
  const { EmbedBuilder, TextChannel } = await import("discord.js");
  const title = String(args.title);
  const description = String(args.description);
  const color = Number(args.color) || 0x4285f4;
  const embed = new EmbedBuilder().setTitle(title.slice(0, 256)).setDescription(description.slice(0, 4096)).setColor(color);
  if (args.fields) {
    try {
      const fields = JSON.parse(String(args.fields)) as Array<{ name: string; value: string; inline?: boolean }>;
      for (const f of fields.slice(0, 25)) embed.addFields({ name: f.name.slice(0, 256), value: f.value.slice(0, 1024), inline: f.inline || false });
    } catch { /* ignore bad fields */ }
  }
  const channel = ctx.client.channels.cache.get(ctx.channelId);
  if (!channel || !channel.isTextBased()) return { success: false, data: "Salon introuvable" };
  await (channel as import("discord.js").TextChannel).send({ embeds: [embed] });
  return { success: true, data: "Embed envoyé" };
}

async function tGetVoiceChannels(ctx: ToolContext): Promise<ToolCallResult> {
  const guild = ctx.client.guilds.cache.get(ctx.guildId);
  if (!guild) return { success: false, data: "Serveur introuvable" };
  const voiceChannels = guild.channels.cache
    .filter((c) => c.type === ChannelType.GuildVoice || c.type === ChannelType.GuildStageVoice)
    .map((c) => {
      const vc = c as import("discord.js").VoiceBasedChannel;
      return { id: vc.id, name: vc.name, members: vc.members.size, memberNames: vc.members.map((m) => m.displayName) };
    });
  return { success: true, data: JSON.stringify(voiceChannels) };
}

async function tLockChannel(args: Record<string, unknown>, ctx: ToolContext): Promise<ToolCallResult> {
  const channelId = String(args.channelId);
  const guild = ctx.client.guilds.cache.get(ctx.guildId);
  if (!guild) return { success: false, data: "Serveur introuvable" };
  const channel = guild.channels.cache.get(channelId) as import("discord.js").TextChannel | undefined;
  if (!channel) return { success: false, data: "Salon introuvable" };
  await channel.permissionOverwrites.edit(guild.roles.everyone, { SendMessages: false });
  return { success: true, data: `Salon ${channel.name} verrouillé` };
}

async function tUnlockChannel(args: Record<string, unknown>, ctx: ToolContext): Promise<ToolCallResult> {
  const channelId = String(args.channelId);
  const guild = ctx.client.guilds.cache.get(ctx.guildId);
  if (!guild) return { success: false, data: "Serveur introuvable" };
  const channel = guild.channels.cache.get(channelId) as import("discord.js").TextChannel | undefined;
  if (!channel) return { success: false, data: "Salon introuvable" };
  await channel.permissionOverwrites.edit(guild.roles.everyone, { SendMessages: true });
  return { success: true, data: `Salon ${channel.name} déverrouillé` };
}

async function tGetEmojis(ctx: ToolContext): Promise<ToolCallResult> {
  const guild = ctx.client.guilds.cache.get(ctx.guildId);
  if (!guild) return { success: false, data: "Serveur introuvable" };
  const emojis = guild.emojis.cache.map((e) => ({ name: e.name, id: e.id, animated: e.animated, url: e.imageURL() }));
  return { success: true, data: JSON.stringify(emojis.slice(0, 50)) };
}

async function tGetAuditLog(args: Record<string, unknown>, ctx: ToolContext): Promise<ToolCallResult> {
  const limit = Math.min(25, Math.max(1, Number(args.limit) || 5));
  const guild = ctx.client.guilds.cache.get(ctx.guildId);
  if (!guild) return { success: false, data: "Serveur introuvable" };
  const logs = await guild.fetchAuditLogs({ limit }).catch(() => null);
  if (!logs) return { success: false, data: "Logs d'audit indisponibles (permissions?)" };
  const { User } = await import("discord.js");
  const entries = logs.entries.map((e) => ({ action: e.action, executor: e.executor?.tag, target: e.target instanceof User ? e.target.tag : String(e.targetId ?? "unknown"), reason: e.reason, createdAt: e.createdAt.toISOString() }));
  return { success: true, data: JSON.stringify(entries) };
}

// ─── Bot Feature Tools ───────────────────────────────────────────────────────

async function tSearchGifs(args: Record<string, unknown>): Promise<ToolCallResult> {
  const query = String(args.query);
  try {
    const { searchGifs } = await import("./externalApis.js");
    const gifs = await searchGifs(query, 5);
    if (gifs.length === 0) return { success: false, data: "Aucun GIF trouvé" };
    return { success: true, data: JSON.stringify(gifs.map((g) => ({ url: g.url, title: g.title }))) };
  } catch (e) { return { success: false, data: `Erreur: ${e instanceof Error ? e.message : String(e)}` }; }
}

async function tCheckToxicity(args: Record<string, unknown>): Promise<ToolCallResult> {
  const text = String(args.text);
  try {
    const { analyzeToxicity } = await import("./ai-moderation.js");
    const result = await analyzeToxicity(text);
    return { success: true, data: JSON.stringify(result) };
  } catch (e) { return { success: false, data: `Erreur: ${e instanceof Error ? e.message : String(e)}` }; }
}

async function tGetRiskProfile(args: Record<string, unknown>, ctx: ToolContext): Promise<ToolCallResult> {
  const userId = String(args.userId);
  try {
    const profile = await prisma.riskProfile.findUnique({ where: { userId_guildId: { userId, guildId: ctx.guildId } } });
    if (!profile) return { success: true, data: JSON.stringify({ userId, riskScore: 0, riskLevel: "INCONNU", underWatch: false }) };
    return { success: true, data: JSON.stringify({ userId, riskScore: profile.riskScore, riskLevel: profile.riskLevel, underWatch: profile.underWatch, lastUpdated: profile.updatedAt.toISOString() }) };
  } catch (e) { return { success: false, data: `Erreur: ${e instanceof Error ? e.message : String(e)}` }; }
}

async function tCheckPhishing(args: Record<string, unknown>): Promise<ToolCallResult> {
  const url = String(args.url);
  try {
    const { checkSuspiciousLinksDetailed } = await import("../commands/security.js");
    const result = await checkSuspiciousLinksDetailed(url);
    return { success: true, data: JSON.stringify(result) };
  } catch (e) { return { success: false, data: `Erreur: ${e instanceof Error ? e.message : String(e)}` }; }
}

// ─── Agent Autonome Tools ────────────────────────────────────────────────────

async function tAnalyzeImage(args: Record<string, unknown>): Promise<ToolCallResult> {
  const imageUrl = String(args.image_url);
  const question = args.question ? String(args.question) : "Décris cette image en détail.";

  try {
    const { getOpenAIClient } = await import("./ai.js");
    const { config } = await import("../config.js");
    const client = getOpenAIClient();

    const response = await client.chat.completions.create({
      model: config.openRouterModel,
      messages: [
        {
          role: "user",
          content: [
            { type: "text", text: question },
            { type: "image_url", image_url: { url: imageUrl } },
          ],
        },
      ],
      max_tokens: 500,
      temperature: 0.3,
    });

    const description = response.choices[0]?.message?.content || "Analyse impossible";
    return {
      success: true,
      data: JSON.stringify({ imageUrl, question, analysis: description.slice(0, 1500) }),
    };
  } catch (e) {
    return { success: false, data: `Erreur analyse image: ${e instanceof Error ? e.message : String(e)}` };
  }
}

async function tAnalyzeSentiment(args: Record<string, unknown>): Promise<ToolCallResult> {
  const text = String(args.text).slice(0, 1000);

  try {
    const { analyzeToxicity } = await import("./ai-moderation.js");
    const toxicityResult = await analyzeToxicity(text);

    const score = toxicityResult?.confidence ?? 0;
    let mood = "neutre";
    let riskLevel = "faible";

    if (score > 0.8) { mood = "très agressif"; riskLevel = "critique"; }
    else if (score > 0.6) { mood = "agressif"; riskLevel = "élevé"; }
    else if (score > 0.4) { mood = "négatif"; riskLevel = "moyen"; }
    else if (score > 0.2) { mood = "légèrement négatif"; riskLevel = "faible"; }
    else { mood = "positif/neutre"; riskLevel = "aucun"; }

    return {
      success: true,
      data: JSON.stringify({ text: text.slice(0, 200), toxicityScore: score, mood, riskLevel, details: toxicityResult }),
    };
  } catch (e) {
    const lower = text.toLowerCase();
    const negativeWords = ["merde", "putain", "connard", "salope", "nul", "déteste", "haine", "stupide"];
    const positiveWords = ["bien", "super", "génial", "merci", "j'aime", "excellent", "parfait"];
    const negCount = negativeWords.filter((w) => lower.includes(w)).length;
    const posCount = positiveWords.filter((w) => lower.includes(w)).length;
    const score = negCount / Math.max(1, negCount + posCount);
    const mood = score > 0.5 ? "négatif" : score < 0.3 ? "positif" : "neutre";

    return {
      success: true,
      data: JSON.stringify({ text: text.slice(0, 200), toxicityScore: score, mood, riskLevel: score > 0.5 ? "élevé" : "faible", method: "fallback" }),
    };
  }
}

async function tTriggerGC(): Promise<ToolCallResult> {
  try {
    const memBefore = process.memoryUsage();
    if (global.gc) {
      global.gc();
      const memAfter = process.memoryUsage();
      const savedMB = Math.round((memBefore.heapUsed - memAfter.heapUsed) / 1024 / 1024);
      return {
        success: true,
        data: JSON.stringify({ triggered: true, heapBeforeMB: Math.round(memBefore.heapUsed / 1024 / 1024), heapAfterMB: Math.round(memAfter.heapUsed / 1024 / 1024), savedMB }),
      };
    } else {
      return {
        success: true,
        data: JSON.stringify({ triggered: false, reason: "GC non forcé (lancer avec --expose-gc)", heapUsedMB: Math.round(memBefore.heapUsed / 1024 / 1024), heapTotalMB: Math.round(memBefore.heapTotal / 1024 / 1024), rssMB: Math.round(memBefore.rss / 1024 / 1024) }),
      };
    }
  } catch (e) {
    return { success: false, data: `Erreur GC: ${e instanceof Error ? e.message : String(e)}` };
  }
}

// ─── Agent Proactive Tools ───────────────────────────────────────────────────

async function tSummarizeConversation(args: Record<string, unknown>, ctx: ToolContext): Promise<ToolCallResult> {
  const channelId = String(args.channel_id);
  const messageCount = Math.min(Number(args.message_count) || 50, 100);

  try {
    const channel = await ctx.client.channels.fetch(channelId);
    if (!channel?.isTextBased()) {
      return { success: false, data: "Salon introuvable ou non textuel" };
    }

    const messages = await (channel as any).messages.fetch({ limit: messageCount });
    if (messages.size === 0) {
      return { success: true, data: JSON.stringify({ summary: "Aucun message à résumer.", messageCount: 0 }) };
    }

    const sorted = [...messages.values()].sort((a, b) => a.createdTimestamp - b.createdTimestamp);
    const conversationText = sorted
      .map((m) => `[${m.author.username}]: ${m.content.slice(0, 200)}`)
      .join("\n")
      .slice(0, 3000);

    const { getOpenAIClient } = await import("./ai.js");
    const { config } = await import("../config.js");
    const client = getOpenAIClient();

    const response = await client.chat.completions.create({
      model: config.openRouterModel,
      messages: [
        {
          role: "system",
          content: "Tu es un assistant qui résume des conversations Discord. Fais un résumé concis en français avec: 1) Les sujets principaux discutés 2) Les décisions prises 3) Les points en suspens. Format: bullet points.",
        },
        { role: "user", content: `Résume cette conversation:\n\n${conversationText}` },
      ],
      max_tokens: 500,
      temperature: 0.3,
    });

    const summary = response.choices[0]?.message?.content || "Résumé impossible";
    return {
      success: true,
      data: JSON.stringify({ summary: summary.slice(0, 1500), messageCount: sorted.length, channelId }),
    };
  } catch (e) {
    return { success: false, data: `Erreur résumé: ${e instanceof Error ? e.message : String(e)}` };
  }
}

async function tDetectLanguage(args: Record<string, unknown>): Promise<ToolCallResult> {
  const text = String(args.text).slice(0, 500);

  const languagePatterns: Record<string, RegExp[]> = {
    fr: [/\b(le|la|les|du|de|des|et|ou|ne|pas|que|qui|dans|pour|avec|sans|sur|une|un|ce|cette|mon|ton|son|nous|vous|ils|elles|sont|avoir|être|fait|fois|toujours|jamais|encore)\b/gi],
    en: [/\b(the|and|or|not|that|who|in|for|with|without|on|a|an|this|my|your|his|we|you|they|are|have|be|do|does|did|always|never|still|again)\b/gi],
    es: [/\b(el|la|los|las|de|del|y|o|no|que|quien|en|para|con|sin|sobre|un|una|este|esta|mi|tu|su|nosotros|vosotros|ellos|son|tener|ser|hace|vez|siempre|nunca)\b/gi],
    de: [/\b(der|die|das|und|oder|nicht|dass|wer|in|für|mit|ohne|auf|ein|eine|dieser|diese|mein|dein|sein|wir|ihr|sie|sind|haben|sein|macht|mal|immer|nie)\b/gi],
    it: [/\b(il|la|i|le|di|del|e|o|non|che|chi|in|per|con|senza|su|un|una|questo|questa|mio|tuo|suo|noi|voi|loro|sono|avere|essere|fa|volta|sempre|mai)\b/gi],
    pt: [/\b(o|a|os|as|de|do|da|e|ou|não|que|quem|em|para|com|sem|sobre|um|uma|este|esta|meu|teu|seu|nós|vós|eles|são|ter|ser|faz|vez|sempre|nunca)\b/gi],
    ru: [/[\u0400-\u04FF]/g],
    ja: [/[\u3040-\u309F\u30A0-\u30FF]/g],
    ko: [/[\uAC00-\uD7AF]/g],
    zh: [/[\u4E00-\u9FFF]/g],
    ar: [/[\u0600-\u06FF]/g],
  };

  const scores: Record<string, number> = {};
  for (const [lang, patterns] of Object.entries(languagePatterns)) {
    let count = 0;
    for (const pattern of patterns) {
      const matches = text.match(pattern);
      if (matches) count += matches.length;
    }
    if (count > 0) scores[lang] = count;
  }

  const sorted = Object.entries(scores).sort((a, b) => b[1] - a[1]);
  const detected = sorted[0]?.[0] || "unknown";
  const confidence = sorted[0] ? Math.round((sorted[0][1] / Math.max(1, text.split(/\s+/).length)) * 100) : 0;

  return {
    success: true,
    data: JSON.stringify({ detectedLanguage: detected, confidence: Math.min(confidence, 100), textPreview: text.slice(0, 100), allScores: scores }),
  };
}

async function tGetServerInsights(ctx: ToolContext): Promise<ToolCallResult> {
  try {
    const guild = ctx.client.guilds.cache.get(ctx.guildId);
    if (!guild) {
      return { success: false, data: "Aucun serveur disponible" };
    }

    const members = guild.members.cache;
    const channels = guild.channels.cache;
    const roles = guild.roles.cache;

    const botCount = members.filter((m: { user: { bot: boolean } }) => m.user.bot).size;
    const humanCount = members.size - botCount;

    const textChannels = channels.filter((c: { type: number }) => c.type === 0).size;
    const voiceChannels = channels.filter((c: { type: number }) => c.type === 2).size;
    const categories = channels.filter((c: { type: number }) => c.type === 4).size;

    const roleDistribution = roles
      .filter((r: { name: string; members: { size: number } }) => r.name !== "@everyone" && r.members.size > 0)
      .sort((a: { members: { size: number } }, b: { members: { size: number } }) => b.members.size - a.members.size)
      .first(10)
      .map((r: { name: string; members: { size: number }; hexColor: string }) => ({ name: r.name, memberCount: r.members.size, color: r.hexColor }));

    const createdAt = guild.createdAt.toISOString();
    const ageDays = Math.floor((Date.now() - guild.createdAt.getTime()) / (1000 * 60 * 60 * 24));

    return {
      success: true,
      data: JSON.stringify({
        guildName: guild.name,
        guildId: guild.id,
        totalMembers: members.size,
        humanMembers: humanCount,
        botMembers: botCount,
        textChannels,
        voiceChannels,
        categories,
        totalRoles: roles.size,
        topRoles: roleDistribution,
        createdAt,
        ageDays,
        memberGrowthPerDay: Math.round((members.size / Math.max(1, ageDays)) * 100) / 100,
        verificationLevel: guild.verificationLevel,
        premiumTier: guild.premiumTier,
      }),
    };
  } catch (e) {
    return { success: false, data: `Erreur server insights: ${e instanceof Error ? e.message : String(e)}` };
  }
}
