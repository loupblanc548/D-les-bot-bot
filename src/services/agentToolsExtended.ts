/**
 * agentToolsExtended.ts — Tools supplémentaires pour l'agent IA
 *
 * Regroupe tous les tools gratuits (APIs sans clé) + tools Discord natifs
 * + tools exploitant les features existantes du bot.
 *
 * Importé et fusionné avec AGENT_TOOLS dans agentTools.ts
 */

import { ChannelType } from "discord.js";
import logger from "../utils/logger.js";
import { stripAllHtml } from "../utils/sanitizeHtml.js";
import type { AgentToolDef, ToolCallResult, ToolContext } from "./agentTools.js";
import prisma from "../prisma.js";
import { SCREENSHOT_TOOL_DEF, handleScreenshotTool } from "./screenshotTool.js";
import {
  listModels as mcpListModels,
  getModel as mcpGetModel,
  getBenchmarks as mcpGetBenchmarks,
  getRankings as mcpGetRankings,
  chatSend as mcpChatSend,
  searchDocs as mcpSearchDocs,
  getCredits as mcpGetCredits,
} from "./openrouterMcp.js";

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
      description:
        "Récupère infos sur un pays : capitale, population, drapeau, monnaie, langues. Gratuit via REST Countries.",
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
          timezone: {
            type: "string",
            description: "Timezone IANA (ex: Europe/Paris, America/New_York, Asia/Tokyo)",
          },
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
      description:
        "Récupère le prix d'une action boursière. Gratuit via Stooq (pas de clé). Ex: AAPL, TSLA, MSFT.",
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
          subreddit: {
            type: "string",
            description: "Nom du subreddit sans r/ (ex: gaming, programming)",
          },
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
      description:
        "Recherche un livre par titre. Retourne auteur, description, couverture. Gratuit via Open Library.",
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
      description:
        "Récupère la NASA Astronomy Picture of the Day (photo + explication). Gratuit (clé demo NASA).",
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
          name: {
            type: "string",
            description: "Nom ou ID du Pokémon (ex: pikachu, charizard, 25)",
          },
        },
        required: ["name"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "getSteamGame",
      description:
        "Récupère infos sur un jeu Steam : prix, description, note. Gratuit via Steam Store API.",
      parameters: {
        type: "object",
        properties: {
          appid: {
            type: "number",
            description: "App ID Steam du jeu (ex: 1086940 pour Baldur's Gate 3)",
          },
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
      description:
        "Récupère infos sur un paquet npm : version, description, téléchargements. Gratuit.",
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
      description:
        "Génère un QR code pour un texte ou URL. Gratuit via QuickChart. Retourne une URL d'image.",
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
      description:
        "Génère un profil utilisateur fictif (nom, email, avatar). Gratuit via RandomUser API.",
      parameters: { type: "object", properties: {}, required: [] },
    },
  },
  // ── Gaming Advanced ──
  {
    type: "function",
    function: {
      name: "getSteamDeals",
      description:
        "Récupère les jeux en promo sur Steam (≥50% de réduction). Gratuit via Steam API.",
      parameters: { type: "object", properties: {}, required: [] },
    },
  },
  {
    type: "function",
    function: {
      name: "getGameNews",
      description: "Récupère les dernières news d'un jeu Steam via son App ID. Gratuit.",
      parameters: {
        type: "object",
        properties: {
          appid: {
            type: "number",
            description: "Steam App ID (ex: 730 pour CS2, 1086940 pour BG3)",
          },
          count: { type: "number", description: "Nombre de news (défaut 5, max 20)" },
        },
        required: ["appid"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "getSpeedrunRecord",
      description: "Récupère le record du monde speedrun d'un jeu. Gratuit via speedrun.com API.",
      parameters: {
        type: "object",
        properties: {
          game: {
            type: "string",
            description: "Nom du jeu ou abbreviation (ex: Portal, celeste, sm64)",
          },
        },
        required: ["game"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "getGameReleases",
      description: "Récupère les sorties de jeux à venir via IGDB. Nécessite une clé API.",
      parameters: {
        type: "object",
        properties: {
          platform: {
            type: "string",
            description: "Plateforme (ex: pc, playstation, xbox, switch, all)",
          },
          count: { type: "number", description: "Nombre de résultats (défaut 10, max 20)" },
        },
        required: ["platform"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "getSteamPlayerCount",
      description: "Récupère le nombre de joueurs actuels sur un jeu Steam. Gratuit via Steam API.",
      parameters: {
        type: "object",
        properties: {
          appid: { type: "number", description: "Steam App ID" },
        },
        required: ["appid"],
      },
    },
  },
  // ── Utilities Advanced ──
  {
    type: "function",
    function: {
      name: "generatePassword",
      description:
        "Génère un mot de passe sécurisé aléatoire. Paramètres: longueur, symboles, nombres.",
      parameters: {
        type: "object",
        properties: {
          length: { type: "number", description: "Longueur du mot de passe (défaut 16, max 64)" },
          symbols: {
            type: "boolean",
            description: "Inclure des caractères spéciaux (défaut true)",
          },
          numbers: { type: "boolean", description: "Inclure des chiffres (défaut true)" },
        },
        required: [],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "solveMath",
      description:
        "Résout une expression mathématique. Supporte +, -, *, /, ^, sqrt, sin, cos, tan, log, pi, e. Gratuit.",
      parameters: {
        type: "object",
        properties: {
          expression: {
            type: "string",
            description: "Expression mathématique (ex: 2+2*3, sqrt(144), sin(pi/2))",
          },
        },
        required: ["expression"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "dnsLookup",
      description:
        "Résolution DNS d'un domaine (A, AAAA, MX, TXT, CNAME, NS). Gratuit via Cloudflare DNS.",
      parameters: {
        type: "object",
        properties: {
          domain: { type: "string", description: "Domaine à résoudre (ex: google.com)" },
          type: {
            type: "string",
            description: "Type d'enregistrement (A, AAAA, MX, TXT, CNAME, NS, ALL)",
          },
        },
        required: ["domain"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "getHttpStatus",
      description: "Vérifie le statut HTTP d'une URL (code, temps de réponse, headers). Gratuit.",
      parameters: {
        type: "object",
        properties: {
          url: { type: "string", description: "URL à vérifier (ex: https://google.com)" },
        },
        required: ["url"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "testRegex",
      description: "Teste une expression régulière contre un texte. Retourne les matches. Gratuit.",
      parameters: {
        type: "object",
        properties: {
          pattern: { type: "string", description: "Pattern regex (ex: \\d+ pour les nombres)" },
          text: { type: "string", description: "Texte à tester" },
          flags: {
            type: "string",
            description: "Flags regex (ex: gi pour global+insensible à la casse)",
          },
        },
        required: ["pattern", "text"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "convertUnits",
      description:
        "Convertit entre unités: longueur, poids, température, volume, vitesse, données. Gratuit.",
      parameters: {
        type: "object",
        properties: {
          value: { type: "number", description: "Valeur à convertir" },
          from: {
            type: "string",
            description: "Unité source (ex: km, mi, kg, lb, C, F, L, gal, MB, GB)",
          },
          to: {
            type: "string",
            description: "Unité cible (ex: mi, km, lb, kg, F, C, gal, L, GB, MB)",
          },
        },
        required: ["value", "from", "to"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "getColorInfo",
      description: "Infos sur une couleur: conversion HEX/RGB/HSL, nom, complémentaire. Gratuit.",
      parameters: {
        type: "object",
        properties: {
          color: {
            type: "string",
            description: "Couleur en HEX (ex: #FF5733) ou RGB (ex: 255,87,51)",
          },
        },
        required: ["color"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "getRandomFact",
      description:
        "Récupère un fait aléatoire intéressant (science, histoire, nature). Gratuit via Numbers API.",
      parameters: {
        type: "object",
        properties: {
          type: {
            type: "string",
            description: "Type de fait: math, trivia, date, year (défaut: trivia)",
          },
          number: { type: "number", description: "Nombre spécifique (optionnel, sinon aléatoire)" },
        },
        required: [],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "getHoroscope",
      description: "Horoscope du jour pour un signe du zodiaque. Gratuit via Horoscope API.",
      parameters: {
        type: "object",
        properties: {
          sign: {
            type: "string",
            description:
              "Signe du zodiaque (aries, taurus, gemini, cancer, leo, virgo, libra, scorpio, sagittarius, capricorn, aquarius, pisces)",
          },
        },
        required: ["sign"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "getUvIndex",
      description: "Indice UV et météo pour une ville. Gratuit via Open-Meteo (pas de clé).",
      parameters: {
        type: "object",
        properties: {
          lat: { type: "number", description: "Latitude" },
          lon: { type: "number", description: "Longitude" },
        },
        required: ["lat", "lon"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "getGithubRepoInfo",
      description:
        "Infos détaillées sur un repo GitHub: stars, forks, issues, langages, dernière release. Gratuit.",
      parameters: {
        type: "object",
        properties: {
          owner: { type: "string", description: "Propriétaire du repo (ex: facebook)" },
          repo: { type: "string", description: "Nom du repo (ex: react)" },
        },
        required: ["owner", "repo"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "getCryptoInfo",
      description:
        "Infos détaillées sur une crypto: prix, market cap, volume, changement 24h. Gratuit via CoinGecko.",
      parameters: {
        type: "object",
        properties: {
          coin: {
            type: "string",
            description: "ID CoinGecko (ex: bitcoin, ethereum, solana) ou symbole (BTC, ETH)",
          },
        },
        required: ["coin"],
      },
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
          deleteMessageDays: {
            type: "number",
            description: "Supprimer messages des N derniers jours (défaut 7)",
          },
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
      description:
        "Crée une invitation au serveur (ou à un salon spécifique). Retourne l'URL d'invitation.",
      parameters: {
        type: "object",
        properties: {
          channelId: {
            type: "string",
            description: "ID du salon pour l'invitation (défaut: salon actuel)",
          },
          maxAge: {
            type: "number",
            description: "Durée en secondes (défaut 86400 = 24h, 0 = permanent)",
          },
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
      description:
        "Récupère infos détaillées sur un membre : rôles, date de join, statut, permissions.",
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
      description:
        "Envoie un embed riche dans le salon actuel (titre, description, couleur, fields).",
      parameters: {
        type: "object",
        properties: {
          title: { type: "string", description: "Titre de l'embed" },
          description: { type: "string", description: "Description principale" },
          color: { type: "number", description: "Couleur en decimal (ex: 0x4285f4 = 4359936)" },
          fields: {
            type: "string",
            description: 'JSON array de fields: [{"name":"...","value":"...","inline":true}]',
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
      description:
        "Analyse la toxicité d'un texte (insultes, harcèlement, spam). Retourne un score.",
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
      description:
        "Récupère le profil de risque d'un utilisateur (score, niveau, sanctions). Via le risk-engine du bot.",
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
      description:
        "Vérifie si une URL est un lien de phishing connu. Via le système de sécurité du bot.",
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
      description:
        "Analyse une image via vision IA. Détecte le contenu, le texte, les objets. Utile quand un utilisateur envoie une image.",
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
      description:
        "Analyse le sentiment et la toxicité d'un texte. Retourne un score de toxicité, l'humeur détectée et le niveau de risque.",
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
      description:
        "Déclenche un nettoyage de la RAM du bot (garbage collection). Tool de maintenance automatique. Aucun paramètre requis.",
      parameters: { type: "object", properties: {}, required: [] },
    },
  },
  // ── Agent Proactive Tools ──
  {
    type: "function",
    function: {
      name: "summarize_conversation",
      description:
        "Résume les N derniers messages d'un salon Discord. Utile pour rattraper une conversation longue ou générer un compte-rendu.",
      parameters: {
        type: "object",
        properties: {
          channel_id: { type: "string", description: "ID du salon à résumer" },
          message_count: {
            type: "number",
            description: "Nombre de messages à analyser (défaut: 50, max: 100)",
          },
        },
        required: ["channel_id"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "detect_language",
      description:
        "Détecte la langue d'un texte. Retourne le code langue (fr, en, es, de...) et le niveau de confiance. Aucune API requise.",
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
      description:
        "Génère des statistiques avancées sur un serveur : activité, ratio en ligne, croissance, top channels, distribution des rôles.",
      parameters: { type: "object", properties: {}, required: [] },
    },
  },
  // ── Screenshot Tool (Playwright) ──
  SCREENSHOT_TOOL_DEF,
  // ── OpenRouter MCP Tools ──
  {
    type: "function",
    function: {
      name: "or_list_models",
      description:
        "Liste les modèles IA disponibles sur OpenRouter avec prix, contexte, et capacités. Filtres optionnels: modality, provider, min_context, max_price, free_only.",
      parameters: {
        type: "object",
        properties: {
          modality: {
            type: "string",
            description: "Filtrer par modalité: text, image, audio, embeddings",
          },
          provider: {
            type: "string",
            description: "Filtrer par provider: anthropic, openai, google, meta, etc.",
          },
          free_only: { type: "boolean", description: "Seulement les modèles gratuits" },
          min_context: { type: "number", description: "Contexte minimum (ex: 32000)" },
        },
        required: [],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "or_model_info",
      description:
        "Récupère les détails complets d'un modèle OpenRouter: prix, contexte, capacités, parameters supportés.",
      parameters: {
        type: "object",
        properties: {
          model_id: {
            type: "string",
            description:
              "L'ID du modèle (ex: anthropic/claude-3.5-sonnet, meta-llama/llama-3.2-3b-instruct:free)",
          },
        },
        required: ["model_id"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "or_benchmarks",
      description:
        "Récupère les scores de benchmark des modèles IA (Artificial Analysis, Design Arena). Compare la qualité des modèles.",
      parameters: {
        type: "object",
        properties: {
          category: {
            type: "string",
            description: "Catégorie de benchmark (ex: coding, reasoning, math, vision)",
          },
        },
        required: [],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "or_rankings",
      description:
        "Récupère le classement quotidien des modèles les plus utilisés sur OpenRouter (par volume de tokens). Aucun paramètre.",
      parameters: { type: "object", properties: {}, required: [] },
    },
  },
  {
    type: "function",
    function: {
      name: "or_chat_test",
      description:
        "Envoie un prompt de test à n'importe quel modèle OpenRouter et retourne la réponse + coût. Utile pour comparer des modèles. ATTENTION: opération payante.",
      parameters: {
        type: "object",
        properties: {
          model: {
            type: "string",
            description:
              "L'ID du modèle (ex: openai/gpt-4o, meta-llama/llama-3.2-3b-instruct:free)",
          },
          prompt: { type: "string", description: "Le prompt à envoyer" },
          max_tokens: { type: "number", description: "Max tokens (défaut: 500)" },
        },
        required: ["model", "prompt"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "or_docs_search",
      description:
        "Recherche dans la documentation OpenRouter. Utile pour comprendre le routing, le tool calling, le prompt caching, etc.",
      parameters: {
        type: "object",
        properties: {
          query: { type: "string", description: "La requête de recherche" },
        },
        required: ["query"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "or_credits",
      description: "Vérifie les crédits restants sur le compte OpenRouter. Aucun paramètre.",
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
      case "getJoke":
        return await tGetJoke();
      case "getDadJoke":
        return await tGetDadJoke();
      case "getAdvice":
        return await tGetAdvice();
      case "getQuote":
        return await tGetQuote();
      case "getTrivia":
        return await tGetTrivia();
      case "getMeme":
        return await tGetMeme();
      case "getDogImage":
        return await tGetDogImage();
      case "getCatImage":
        return await tGetCatImage();
      // Info
      case "getCountryInfo":
        return await tGetCountryInfo(args);
      case "getCurrencyRate":
        return await tGetCurrencyRate(args);
      case "getDateTime":
        return await tGetDateTime(args);
      case "getIpInfo":
        return await tGetIpInfo(args);
      // Finance
      case "getStockPrice":
        return await tGetStockPrice(args);
      // Social
      case "getRedditPosts":
        return await tGetRedditPosts(args);
      case "getUrbanDict":
        return await tGetUrbanDict(args);
      // Books & Science
      case "getBookInfo":
        return await tGetBookInfo(args);
      case "getNasaApod":
        return await tGetNasaApod();
      // Gaming
      case "getPokemon":
        return await tGetPokemon(args);
      case "getSteamGame":
        return await tGetSteamGame(args);
      case "getSteamDeals":
        return await tGetSteamDeals();
      case "getGameNews":
        return await tGetGameNews(args);
      case "getSpeedrunRecord":
        return await tGetSpeedrunRecord(args);
      case "getGameReleases":
        return await tGetGameReleases(args);
      case "getSteamPlayerCount":
        return await tGetSteamPlayerCount(args);
      // Utilities Advanced
      case "generatePassword":
        return await tGeneratePassword(args);
      case "solveMath":
        return await tSolveMath(args);
      case "dnsLookup":
        return await tDnsLookup(args);
      case "getHttpStatus":
        return await tGetHttpStatus(args);
      case "testRegex":
        return await tTestRegex(args);
      case "convertUnits":
        return await tConvertUnits(args);
      case "getColorInfo":
        return await tGetColorInfo(args);
      case "getRandomFact":
        return await tGetRandomFact(args);
      case "getHoroscope":
        return await tGetHoroscope(args);
      case "getUvIndex":
        return await tGetUvIndex(args);
      case "getGithubRepoInfo":
        return await tGetGithubRepoInfo(args);
      case "getCryptoInfo":
        return await tGetCryptoInfo(args);
      // Dev
      case "getNpmPackage":
        return await tGetNpmPackage(args);
      case "getPypiPackage":
        return await tGetPypiPackage(args);
      case "getGithubUser":
        return await tGetGithubUser(args);
      // Utilities
      case "shortenUrl":
        return await tShortenUrl(args);
      case "getQrCode":
        return await tGetQrCode(args);
      case "getRandomUser":
        return await tGetRandomUser();
      // Discord
      case "kickUser":
        return await tKickUser(args, ctx);
      case "banUser":
        return await tBanUser(args, ctx);
      case "addRole":
        return await tAddRole(args, ctx);
      case "removeRole":
        return await tRemoveRole(args, ctx);
      case "createChannel":
        return await tCreateChannel(args, ctx);
      case "deleteChannel":
        return await tDeleteChannel(args, ctx);
      case "setChannelTopic":
        return await tSetChannelTopic(args, ctx);
      case "createInvite":
        return await tCreateInvite(args, ctx);
      case "getMemberInfo":
        return await tGetMemberInfo(args, ctx);
      case "getServerRoles":
        return await tGetServerRoles(ctx);
      case "setNickname":
        return await tSetNickname(args, ctx);
      case "sendDM":
        return await tSendDM(args, ctx);
      case "createEmbed":
        return await tCreateEmbed(args, ctx);
      case "getVoiceChannels":
        return await tGetVoiceChannels(ctx);
      case "lockChannel":
        return await tLockChannel(args, ctx);
      case "unlockChannel":
        return await tUnlockChannel(args, ctx);
      case "getEmojis":
        return await tGetEmojis(ctx);
      case "getAuditLog":
        return await tGetAuditLog(args, ctx);
      // Bot features
      case "searchGifs":
        return await tSearchGifs(args);
      case "checkToxicity":
        return await tCheckToxicity(args);
      case "getRiskProfile":
        return await tGetRiskProfile(args, ctx);
      case "checkPhishing":
        return await tCheckPhishing(args);
      case "analyze_image":
        return await tAnalyzeImage(args);
      case "analyze_sentiment":
        return await tAnalyzeSentiment(args);
      case "triggerGarbageCollection":
        return await tTriggerGC();
      case "summarize_conversation":
        return await tSummarizeConversation(args, ctx);
      case "detect_language":
        return await tDetectLanguage(args);
      case "get_server_insights":
        return await tGetServerInsights(ctx);
      // Screenshot (Playwright)
      case "take_screenshot":
        return await handleScreenshotTool(args, ctx);
      // OpenRouter MCP Tools
      case "or_list_models":
        return await tOrListModels(args);
      case "or_model_info":
        return await tOrModelInfo(args);
      case "or_benchmarks":
        return await tOrBenchmarks(args);
      case "or_rankings":
        return await tOrRankings();
      case "or_chat_test":
        return await tOrChatTest(args);
      case "or_docs_search":
        return await tOrDocsSearch(args);
      case "or_credits":
        return await tOrCredits();
      default:
        return null;
    }
  } catch (error) {
    logger.error(
      `[AgentToolsExt] Erreur ${toolName}: ${error instanceof Error ? error.message : String(error)}`,
    );
    return {
      success: false,
      data: `Erreur: ${error instanceof Error ? error.message : String(error)}`,
    };
  }
}

// ─── Fun & Entertainment ─────────────────────────────────────────────────────

async function tGetJoke(): Promise<ToolCallResult> {
  try {
    const res = await fetch("https://official-joke-api.appspot.com/random_joke", {
      signal: AbortSignal.timeout(8000),
    });
    if (!res.ok) return { success: false, data: "Blague indisponible" };
    const d = (await res.json()) as { setup: string; punchline: string };
    return { success: true, data: JSON.stringify({ setup: d.setup, punchline: d.punchline }) };
  } catch (e) {
    return { success: false, data: `Erreur: ${e instanceof Error ? e.message : String(e)}` };
  }
}

async function tGetDadJoke(): Promise<ToolCallResult> {
  try {
    const res = await fetch("https://icanhazdadjoke.com/", {
      headers: { Accept: "text/plain" },
      signal: AbortSignal.timeout(8000),
    });
    if (!res.ok) return { success: false, data: "Dad joke indisponible" };
    const text = await res.text();
    return { success: true, data: text };
  } catch (e) {
    return { success: false, data: `Erreur: ${e instanceof Error ? e.message : String(e)}` };
  }
}

async function tGetAdvice(): Promise<ToolCallResult> {
  try {
    const res = await fetch("https://api.adviceslip.com/advice", {
      signal: AbortSignal.timeout(8000),
    });
    if (!res.ok) return { success: false, data: "Conseil indisponible" };
    const d = (await res.json()) as { slip: { advice: string } };
    return { success: true, data: d.slip.advice };
  } catch (e) {
    return { success: false, data: `Erreur: ${e instanceof Error ? e.message : String(e)}` };
  }
}

async function tGetQuote(): Promise<ToolCallResult> {
  try {
    const res = await fetch("https://zenquotes.io/api/random", {
      signal: AbortSignal.timeout(8000),
    });
    if (!res.ok) return { success: false, data: "Citation indisponible" };
    const d = (await res.json()) as Array<{ q: string; a: string }>;
    if (!d[0]) return { success: false, data: "Pas de citation" };
    return { success: true, data: JSON.stringify({ quote: d[0].q, author: d[0].a }) };
  } catch (e) {
    return { success: false, data: `Erreur: ${e instanceof Error ? e.message : String(e)}` };
  }
}

async function tGetTrivia(): Promise<ToolCallResult> {
  try {
    const res = await fetch("https://opentdb.com/api.php?amount=1&type=multiple", {
      signal: AbortSignal.timeout(8000),
    });
    if (!res.ok) return { success: false, data: "Trivia indisponible" };
    const d = (await res.json()) as {
      results: Array<{
        question: string;
        correct_answer: string;
        incorrect_answers: string[];
        category: string;
        difficulty: string;
      }>;
    };
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
  } catch (e) {
    return { success: false, data: `Erreur: ${e instanceof Error ? e.message : String(e)}` };
  }
}

async function tGetMeme(): Promise<ToolCallResult> {
  try {
    const res = await fetch("https://api.imgflip.com/get_memes", {
      signal: AbortSignal.timeout(8000),
    });
    if (!res.ok) return { success: false, data: "Meme indisponible" };
    const d = (await res.json()) as {
      data: {
        memes: Array<{ id: string; name: string; url: string; width: number; height: number }>;
      };
    };
    const memes = d.data.memes;
    if (!memes?.length) return { success: false, data: "Pas de meme" };
    const random = memes[Math.floor(Math.random() * Math.min(10, memes.length))];
    return { success: true, data: JSON.stringify({ name: random.name, url: random.url }) };
  } catch (e) {
    return { success: false, data: `Erreur: ${e instanceof Error ? e.message : String(e)}` };
  }
}

async function tGetDogImage(): Promise<ToolCallResult> {
  try {
    const res = await fetch("https://dog.ceo/api/breeds/image/random", {
      signal: AbortSignal.timeout(8000),
    });
    if (!res.ok) return { success: false, data: "Photo indisponible" };
    const d = (await res.json()) as { message: string };
    return { success: true, data: d.message };
  } catch (e) {
    return { success: false, data: `Erreur: ${e instanceof Error ? e.message : String(e)}` };
  }
}

async function tGetCatImage(): Promise<ToolCallResult> {
  try {
    const res = await fetch("https://cataas.com/cat?json=true", {
      signal: AbortSignal.timeout(8000),
    });
    if (!res.ok) return { success: false, data: "Photo indisponible" };
    const d = (await res.json()) as { url: string };
    return { success: true, data: `https://cataas.com${d.url}` };
  } catch (e) {
    return { success: false, data: `Erreur: ${e instanceof Error ? e.message : String(e)}` };
  }
}

// ─── Info & Reference ────────────────────────────────────────────────────────

async function tGetCountryInfo(args: Record<string, unknown>): Promise<ToolCallResult> {
  const country = String(args.country);
  const ck = `country:${country.toLowerCase()}`;
  const cached = getCache(ck);
  if (cached) return { success: true, data: cached };
  try {
    const res = await fetch(
      `https://restcountries.com/v3.1/name/${encodeURIComponent(country)}?fields=name,capital,population,flag,currencies,languages,region,subregion,maps`,
      { signal: AbortSignal.timeout(8000) },
    );
    if (!res.ok) return { success: false, data: `Pays "${country}" introuvable` };
    const data = (await res.json()) as Array<{
      name: { common: string };
      capital: string[];
      population: number;
      flag: string;
      currencies: Record<string, { name: string; symbol: string }>;
      languages: Record<string, string>;
      region: string;
      subregion: string;
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
      currencies: Object.values(c.currencies || {})
        .map((cur) => `${cur.name} (${cur.symbol})`)
        .join(", "),
      languages: Object.values(c.languages || {}).join(", "),
    });
    setCache(ck, output);
    return { success: true, data: output };
  } catch (e) {
    return { success: false, data: `Erreur: ${e instanceof Error ? e.message : String(e)}` };
  }
}

async function tGetCurrencyRate(args: Record<string, unknown>): Promise<ToolCallResult> {
  const amount = Number(args.amount);
  const from = String(args.from).toUpperCase();
  const to = String(args.to).toUpperCase();
  try {
    const res = await fetch(
      `https://api.exchangerate.host/convert?from=${from}&to=${to}&amount=${amount}`,
      { signal: AbortSignal.timeout(8000) },
    );
    if (!res.ok) return { success: false, data: "Conversion indisponible" };
    const d = (await res.json()) as { result: number; date: string };
    return {
      success: true,
      data: JSON.stringify({
        amount,
        from,
        to,
        result: d.result,
        rate: d.result / amount,
        date: d.date,
      }),
    };
  } catch (e) {
    return { success: false, data: `Erreur: ${e instanceof Error ? e.message : String(e)}` };
  }
}

async function tGetDateTime(args: Record<string, unknown>): Promise<ToolCallResult> {
  const tz = String(args.timezone);
  try {
    const res = await fetch(`https://worldtimeapi.org/api/timezone/${encodeURIComponent(tz)}`, {
      signal: AbortSignal.timeout(8000),
    });
    if (!res.ok) return { success: false, data: `Timezone "${tz}" introuvable` };
    const d = (await res.json()) as { datetime: string; timezone: string; utc_datetime: string };
    return {
      success: true,
      data: JSON.stringify({ timezone: d.timezone, datetime: d.datetime, utc: d.utc_datetime }),
    };
  } catch (e) {
    return { success: false, data: `Erreur: ${e instanceof Error ? e.message : String(e)}` };
  }
}

async function tGetIpInfo(args: Record<string, unknown>): Promise<ToolCallResult> {
  const ip = String(args.ip);
  try {
    const res = await fetch(`https://ipapi.co/${encodeURIComponent(ip)}/json/`, {
      signal: AbortSignal.timeout(8000),
    });
    if (!res.ok) return { success: false, data: "IP indisponible" };
    const d = (await res.json()) as {
      city: string;
      region: string;
      country_name: string;
      org: string;
      timezone: string;
      latitude: number;
      longitude: number;
    };
    return {
      success: true,
      data: JSON.stringify({
        ip,
        city: d.city,
        region: d.region,
        country: d.country_name,
        isp: d.org,
        timezone: d.timezone,
        lat: d.latitude,
        lon: d.longitude,
      }),
    };
  } catch (e) {
    return { success: false, data: `Erreur: ${e instanceof Error ? e.message : String(e)}` };
  }
}

// ─── Finance ─────────────────────────────────────────────────────────────────

async function tGetStockPrice(args: Record<string, unknown>): Promise<ToolCallResult> {
  const symbol = String(args.symbol).toUpperCase();
  const ck = `stock:${symbol}`;
  const cached = getCache(ck);
  if (cached) return { success: true, data: cached };
  try {
    const res = await fetch(
      `https://stooq.com/q/l/?s=${encodeURIComponent(symbol.toLowerCase())}&f=sd2t2ohlcv&h&e=csv`,
      { signal: AbortSignal.timeout(8000) },
    );
    if (!res.ok) return { success: false, data: "Bourse indisponible" };
    const text = await res.text();
    const lines = text.trim().split("\n");
    if (lines.length < 2) return { success: false, data: `Action "${symbol}" introuvable` };
    const cols = lines[1].split(",");
    const output = JSON.stringify({
      symbol,
      open: cols[2],
      high: cols[3],
      low: cols[4],
      close: cols[5],
      volume: cols[6],
      date: cols[1],
    });
    setCache(ck, output);
    return { success: true, data: output };
  } catch (e) {
    return { success: false, data: `Erreur: ${e instanceof Error ? e.message : String(e)}` };
  }
}

// ─── Social & Content ────────────────────────────────────────────────────────

async function tGetRedditPosts(args: Record<string, unknown>): Promise<ToolCallResult> {
  const subreddit = String(args.subreddit).replace(/^r\//, "");
  const limit = Math.min(10, Math.max(1, Number(args.limit) || 5));
  const ck = `reddit:${subreddit}:${limit}`;
  const cached = getCache(ck);
  if (cached) return { success: true, data: cached };
  try {
    const res = await fetch(
      `https://www.reddit.com/r/${encodeURIComponent(subreddit)}/top.json?limit=${limit}&t=day`,
      {
        headers: { "User-Agent": "DiscordBot/1.0" },
        signal: AbortSignal.timeout(8000),
      },
    );
    if (!res.ok) return { success: false, data: `Subreddit r/${subreddit} introuvable` };
    const d = (await res.json()) as {
      data: {
        children: Array<{
          data: {
            title: string;
            url: string;
            score: number;
            author: string;
            num_comments: number;
            permalink: string;
          };
        }>;
      };
    };
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
  } catch (e) {
    return { success: false, data: `Erreur: ${e instanceof Error ? e.message : String(e)}` };
  }
}

async function tGetUrbanDict(args: Record<string, unknown>): Promise<ToolCallResult> {
  const term = String(args.term);
  try {
    const res = await fetch(
      `https://api.urbandictionary.com/v0/define?term=${encodeURIComponent(term)}`,
      { signal: AbortSignal.timeout(8000) },
    );
    if (!res.ok) return { success: false, data: "Urban Dictionary indisponible" };
    const d = (await res.json()) as {
      list: Array<{ definition: string; example: string; author: string; thumbs_up: number }>;
    };
    if (!d.list[0]) return { success: false, data: `Terme "${term}" introuvable` };
    const def = d.list[0];
    return {
      success: true,
      data: JSON.stringify({
        term,
        definition: stripAllHtml(def.definition).slice(0, 1000),
        example: stripAllHtml(def.example).slice(0, 500),
        author: def.author,
        likes: def.thumbs_up,
      }),
    };
  } catch (e) {
    return { success: false, data: `Erreur: ${e instanceof Error ? e.message : String(e)}` };
  }
}

// ─── Books & Science ─────────────────────────────────────────────────────────

async function tGetBookInfo(args: Record<string, unknown>): Promise<ToolCallResult> {
  const query = String(args.query);
  try {
    const res = await fetch(
      `https://openlibrary.org/search.json?q=${encodeURIComponent(query)}&limit=1`,
      { signal: AbortSignal.timeout(8000) },
    );
    if (!res.ok) return { success: false, data: "Open Library indisponible" };
    const d = (await res.json()) as {
      docs: Array<{
        title: string;
        author_name: string[];
        first_publish_year: number;
        cover_i: number;
        subject: string[];
      }>;
    };
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
  } catch (e) {
    return { success: false, data: `Erreur: ${e instanceof Error ? e.message : String(e)}` };
  }
}

async function tGetNasaApod(): Promise<ToolCallResult> {
  const ck = "nasa:apod";
  const cached = getCache(ck);
  if (cached) return { success: true, data: cached };
  try {
    const res = await fetch("https://api.nasa.gov/planetary/apod?api_key=DEMO_KEY", {
      signal: AbortSignal.timeout(8000),
    });
    if (!res.ok) return { success: false, data: "NASA APOD indisponible" };
    const d = (await res.json()) as {
      title: string;
      explanation: string;
      url: string;
      hdurl: string;
      date: string;
      media_type: string;
    };
    const output = JSON.stringify({
      title: d.title,
      explanation: d.explanation.slice(0, 1000),
      url: d.url,
      hdUrl: d.hdurl,
      date: d.date,
      type: d.media_type,
    });
    setCache(ck, output);
    return { success: true, data: output };
  } catch (e) {
    return { success: false, data: `Erreur: ${e instanceof Error ? e.message : String(e)}` };
  }
}

// ─── Gaming ──────────────────────────────────────────────────────────────────

async function tGetPokemon(args: Record<string, unknown>): Promise<ToolCallResult> {
  const name = String(args.name).toLowerCase();
  const ck = `pokemon:${name}`;
  const cached = getCache(ck);
  if (cached) return { success: true, data: cached };
  try {
    const res = await fetch(`https://pokeapi.co/api/v2/pokemon/${encodeURIComponent(name)}`, {
      signal: AbortSignal.timeout(8000),
    });
    if (!res.ok) return { success: false, data: `Pokémon "${name}" introuvable` };
    const d = (await res.json()) as {
      name: string;
      id: number;
      height: number;
      weight: number;
      types: Array<{ type: { name: string } }>;
      stats: Array<{ base_stat: number; stat: { name: string } }>;
      abilities: Array<{ ability: { name: string } }>;
      sprites: { front_default: string };
    };
    const output = JSON.stringify({
      name: d.name,
      id: d.id,
      height: `${d.height / 10}m`,
      weight: `${d.weight / 10}kg`,
      types: d.types.map((t) => t.type.name),
      stats: d.stats.map((s) => `${s.stat.name}: ${s.base_stat}`),
      abilities: d.abilities.map((a) => a.ability.name),
      sprite: d.sprites.front_default,
    });
    setCache(ck, output);
    return { success: true, data: output };
  } catch (e) {
    return { success: false, data: `Erreur: ${e instanceof Error ? e.message : String(e)}` };
  }
}

async function tGetSteamGame(args: Record<string, unknown>): Promise<ToolCallResult> {
  const appid = Number(args.appid);
  const ck = `steam:${appid}`;
  const cached = getCache(ck);
  if (cached) return { success: true, data: cached };
  try {
    const res = await fetch(`https://store.steampowered.com/api/appdetails?appids=${appid}&l=fr`, {
      signal: AbortSignal.timeout(8000),
    });
    if (!res.ok) return { success: false, data: "Steam Store indisponible" };
    const d = (await res.json()) as Record<
      string,
      {
        success: boolean;
        data: {
          name: string;
          short_description: string;
          header_image: string;
          price_overview?: { final_formatted: string };
          metacritic?: { score: number };
          developers: string[];
          publishers: string[];
          genres: Array<{ description: string }>;
        };
      }
    >;
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
  } catch (e) {
    return { success: false, data: `Erreur: ${e instanceof Error ? e.message : String(e)}` };
  }
}

async function tGetSteamDeals(): Promise<ToolCallResult> {
  try {
    const res = await fetch("https://store.steampowered.com/api/featuredcategories", {
      signal: AbortSignal.timeout(10000),
      headers: { "User-Agent": "Mozilla/5.0" },
    });
    if (!res.ok) return { success: false, data: "Steam API indisponible" };
    const data = (await res.json()) as Record<string, unknown>;
    const specials = data.specials as
      | {
          items: Array<{
            id: number;
            name: string;
            discount_block?: string;
            discount_original_price?: number;
            discount_final_price?: number;
          }>;
        }
      | undefined;
    if (!specials?.items) return { success: false, data: "Aucune promo trouvée" };
    const deals = specials.items.slice(0, 10).map((item) => {
      const discountMatch = item.discount_block?.match(/(\d+)%/);
      return {
        name: item.name,
        originalPrice: item.discount_original_price
          ? (item.discount_original_price / 100).toFixed(2) + "€"
          : "N/A",
        finalPrice: item.discount_final_price
          ? (item.discount_final_price / 100).toFixed(2) + "€"
          : "GRATUIT",
        discount: discountMatch ? discountMatch[1] + "%" : "N/A",
        url: `https://store.steampowered.com/app/${item.id}`,
      };
    });
    return { success: true, data: JSON.stringify(deals) };
  } catch (e) {
    return { success: false, data: `Erreur: ${e instanceof Error ? e.message : String(e)}` };
  }
}

async function tGetGameNews(args: Record<string, unknown>): Promise<ToolCallResult> {
  const appid = Number(args.appid);
  const count = Math.min(Number(args.count) || 5, 20);
  try {
    const res = await fetch(
      `https://api.steampowered.com/ISteamNews/GetNewsForApp/v0002/?appid=${appid}&count=${count}&maxlength=500&format=json`,
      {
        signal: AbortSignal.timeout(10000),
      },
    );
    if (!res.ok) return { success: false, data: "Steam News API indisponible" };
    const data = (await res.json()) as {
      appnews: {
        newsitems: Array<{
          title: string;
          url: string;
          contents: string;
          date: number;
          author: string;
        }>;
      };
    };
    const news = data.appnews.newsitems.map((n) => ({
      title: n.title,
      url: n.url,
      author: n.author,
      date: new Date(n.date * 1000).toISOString(),
      excerpt: n.contents?.slice(0, 300),
    }));
    return { success: true, data: JSON.stringify(news) };
  } catch (e) {
    return { success: false, data: `Erreur: ${e instanceof Error ? e.message : String(e)}` };
  }
}

async function tGetSpeedrunRecord(args: Record<string, unknown>): Promise<ToolCallResult> {
  const game = String(args.game).toLowerCase().trim();
  try {
    const res = await fetch(
      `https://www.speedrun.com/api/v1/games?name=${encodeURIComponent(game)}&max=1`,
      {
        signal: AbortSignal.timeout(10000),
      },
    );
    if (!res.ok) return { success: false, data: "speedrun.com API indisponible" };
    const data = (await res.json()) as {
      data: Array<{ id: string; names: { international: string }; abbreviation: string }>;
    };
    if (!data.data?.length)
      return { success: false, data: `Jeu "${game}" introuvable sur speedrun.com` };
    const g = data.data[0];
    const recordsRes = await fetch(
      `https://www.speedrun.com/api/v1/games/${g.abbreviation}/records?top=1&max=1`,
      {
        signal: AbortSignal.timeout(10000),
      },
    );
    if (!recordsRes.ok)
      return {
        success: true,
        data: JSON.stringify({ game: g.names.international, message: "Aucun record trouvé" }),
      };
    const recordsData = (await recordsRes.json()) as {
      data: Array<{
        runs: Array<{
          run: { times: { primary_t: number }; weblink: string; status: { status: string } };
        }>;
      }>;
    };
    if (!recordsData.data?.length || !recordsData.data[0].runs?.length) {
      return {
        success: true,
        data: JSON.stringify({ game: g.names.international, message: "Aucun record trouvé" }),
      };
    }
    const run = recordsData.data[0].runs[0].run;
    const time = run.times.primary_t;
    const minutes = Math.floor(time / 60);
    const seconds = (time % 60).toFixed(0);
    return {
      success: true,
      data: JSON.stringify({
        game: g.names.international,
        worldRecord: `${minutes}m ${seconds}s`,
        url: run.weblink,
        status: run.status.status,
      }),
    };
  } catch (e) {
    return { success: false, data: `Erreur: ${e instanceof Error ? e.message : String(e)}` };
  }
}

async function tGetGameReleases(args: Record<string, unknown>): Promise<ToolCallResult> {
  const platform = String(args.platform || "all").toLowerCase();
  const count = Math.min(Number(args.count) || 10, 20);
  const clientId = process.env.IGDB_CLIENT_ID;
  const clientSecret = process.env.IGDB_CLIENT_SECRET;
  if (!clientId || !clientSecret)
    return { success: false, data: "IGDB non configuré (clés manquantes)" };
  try {
    const tokenRes = await fetch(
      `https://id.twitch.tv/oauth2/token?client_id=${clientId}&client_secret=${clientSecret}&grant_type=client_credentials`,
      { method: "POST", signal: AbortSignal.timeout(10000) },
    );
    if (!tokenRes.ok) return { success: false, data: "IGDB auth échouée" };
    const token = (await tokenRes.json()) as { access_token: string };
    const platformMap: Record<string, number> = {
      pc: 6,
      playstation: 48,
      xbox: 49,
      switch: 130,
      all: -1,
    };
    const platformId = platformMap[platform] ?? -1;
    const body =
      platformId >= 0
        ? `fields name,first_release_date,platforms.name,cover.url; where first_release_date > ${Math.floor(Date.now() / 1000)} & platforms = (${platformId}); sort first_release_date asc; limit ${count};`
        : `fields name,first_release_date,platforms.name,cover.url; where first_release_date > ${Math.floor(Date.now() / 1000)}; sort first_release_date asc; limit ${count};`;
    const res = await fetch("https://api.igdb.com/v4/games", {
      method: "POST",
      headers: {
        "Client-ID": clientId,
        Authorization: `Bearer ${token.access_token}`,
        "Content-Type": "text/plain",
      },
      body,
      signal: AbortSignal.timeout(10000),
    });
    if (!res.ok) return { success: false, data: "IGDB API erreur" };
    const games = (await res.json()) as Array<{
      name: string;
      first_release_date: number;
      platforms: Array<{ name: string }>;
      cover?: { url: string };
    }>;
    const releases = games.map((g) => ({
      name: g.name,
      releaseDate: g.first_release_date
        ? new Date(g.first_release_date * 1000).toLocaleDateString("fr-FR")
        : "TBA",
      platforms: g.platforms?.map((p) => p.name).join(", ") || "N/A",
      cover: g.cover?.url ? `https:${g.cover.url}` : null,
    }));
    return { success: true, data: JSON.stringify(releases) };
  } catch (e) {
    return { success: false, data: `Erreur: ${e instanceof Error ? e.message : String(e)}` };
  }
}

async function tGetSteamPlayerCount(args: Record<string, unknown>): Promise<ToolCallResult> {
  const appid = Number(args.appid);
  try {
    const res = await fetch(
      `https://api.steampowered.com/ISteamUserStats/GetNumberOfCurrentPlayers/v1/?appid=${appid}`,
      {
        signal: AbortSignal.timeout(10000),
      },
    );
    if (!res.ok) return { success: false, data: "Steam API indisponible" };
    const data = (await res.json()) as { response: { player_count: number; result: number } };
    if (data.response.result !== 1) return { success: false, data: "Jeu introuvable" };
    return {
      success: true,
      data: JSON.stringify({
        appid,
        currentPlayers: data.response.player_count.toLocaleString("fr-FR"),
      }),
    };
  } catch (e) {
    return { success: false, data: `Erreur: ${e instanceof Error ? e.message : String(e)}` };
  }
}

// ─── Utilities Advanced ──────────────────────────────────────────────────────

async function tGeneratePassword(args: Record<string, unknown>): Promise<ToolCallResult> {
  const length = Math.min(Number(args.length) || 16, 64);
  const useSymbols = args.symbols !== false;
  const useNumbers = args.numbers !== false;
  let chars = "abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ";
  if (useNumbers) chars += "0123456789";
  if (useSymbols) chars += "!@#$%^&*()_+-=[]{}|;:,.<>?";
  const crypto = await import("node:crypto");
  const password = Array.from(crypto.randomBytes(length))
    .map((b) => chars[b % chars.length])
    .join("");
  const strength = length >= 16 ? "fort" : length >= 12 ? "moyen" : "faible";
  return {
    success: true,
    data: JSON.stringify({
      password,
      length,
      strength,
      hasSymbols: useSymbols,
      hasNumbers: useNumbers,
    }),
  };
}

async function tSolveMath(args: Record<string, unknown>): Promise<ToolCallResult> {
  const expr = String(args.expression).replace(/[^0-9+\-*/().^a-z\s,]/gi, "");
  const safe = expr
    .replace(/\^/g, "**")
    .replace(/sqrt\(/g, "Math.sqrt(")
    .replace(/sin\(/g, "Math.sin(")
    .replace(/cos\(/g, "Math.cos(")
    .replace(/tan\(/g, "Math.tan(")
    .replace(/log\(/g, "Math.log(")
    .replace(/pi/gi, "Math.PI")
    .replace(/(?<![a-zA-Z])e(?![a-zA-Z])/g, "Math.E");
  try {
    const result = Function(`"use strict"; return (${safe})`)();
    if (typeof result !== "number" || !isFinite(result)) {
      return { success: false, data: "Résultat invalide" };
    }
    return {
      success: true,
      data: JSON.stringify({ expression: args.expression, result: Number(result.toFixed(10)) }),
    };
  } catch (e) {
    return {
      success: false,
      data: `Expression invalide: ${e instanceof Error ? e.message : String(e)}`,
    };
  }
}

async function tDnsLookup(args: Record<string, unknown>): Promise<ToolCallResult> {
  const domain = String(args.domain)
    .replace(/^https?:\/\//, "")
    .replace(/\/.*$/, "");
  const type = String(args.type || "A").toUpperCase();
  try {
    const res = await fetch(
      `https://cloudflare-dns.com/dns-query?name=${encodeURIComponent(domain)}&type=${type}`,
      {
        headers: { Accept: "application/dns-json" },
        signal: AbortSignal.timeout(10000),
      },
    );
    if (!res.ok) return { success: false, data: "DNS lookup échoué" };
    const data = (await res.json()) as {
      Answer: Array<{ name: string; type: number; TTL: number; data: string }>;
      Status: number;
    };
    if (data.Status !== 0 || !data.Answer)
      return { success: false, data: `Aucun enregistrement ${type} pour ${domain}` };
    const records = data.Answer.map((a) => ({
      name: a.name,
      type: a.type,
      ttl: a.TTL,
      data: a.data,
    }));
    return { success: true, data: JSON.stringify({ domain, type, records }) };
  } catch (e) {
    return { success: false, data: `Erreur: ${e instanceof Error ? e.message : String(e)}` };
  }
}

async function tGetHttpStatus(args: Record<string, unknown>): Promise<ToolCallResult> {
  const url = String(args.url);
  try {
    const start = Date.now();
    const res = await fetch(url, {
      method: "HEAD",
      signal: AbortSignal.timeout(10000),
      redirect: "follow",
    });
    const elapsed = Date.now() - start;
    const headers: Record<string, string> = {};
    res.headers.forEach((v, k) => {
      headers[k] = v;
    });
    return {
      success: true,
      data: JSON.stringify({
        url,
        status: res.status,
        statusText: res.statusText,
        responseTimeMs: elapsed,
        finalUrl: res.url,
        server: headers["server"] || "N/A",
        contentType: headers["content-type"] || "N/A",
      }),
    };
  } catch (e) {
    return { success: false, data: `Erreur: ${e instanceof Error ? e.message : String(e)}` };
  }
}

async function tTestRegex(args: Record<string, unknown>): Promise<ToolCallResult> {
  const pattern = String(args.pattern);
  const text = String(args.text);
  const flags = String(args.flags || "g");
  try {
    const regex = new RegExp(pattern, flags);
    const matches: string[] = [];
    let m: RegExpExecArray | null;
    if (flags.includes("g")) {
      while ((m = regex.exec(text)) !== null) {
        matches.push(m[0]);
        if (m.index === regex.lastIndex) regex.lastIndex++;
      }
    } else {
      m = regex.exec(text);
      if (m) matches.push(m[0]);
    }
    return {
      success: true,
      data: JSON.stringify({
        pattern,
        flags,
        matchCount: matches.length,
        matches: matches.slice(0, 20),
      }),
    };
  } catch (e) {
    return {
      success: false,
      data: `Regex invalide: ${e instanceof Error ? e.message : String(e)}`,
    };
  }
}

async function tConvertUnits(args: Record<string, unknown>): Promise<ToolCallResult> {
  const value = Number(args.value);
  const from = String(args.from).toLowerCase();
  const to = String(args.to).toLowerCase();

  const conversions: Record<string, number> = {
    // Length (to meters)
    m: 1,
    km: 1000,
    cm: 0.01,
    mm: 0.001,
    mi: 1609.344,
    ft: 0.3048,
    in: 0.0254,
    yd: 0.9144,
    // Weight (to grams)
    g: 1,
    kg: 1000,
    mg: 0.001,
    lb: 453.592,
    oz: 28.3495,
    ton: 1000000,
    // Volume (to liters)
    l: 1,
    ml: 0.001,
    gal: 3.78541,
    qt: 0.946353,
    pt: 0.473176,
    cup: 0.236588,
    floz: 0.0295735,
    // Data (to bytes)
    b: 1,
    kb: 1024,
    mb: 1048576,
    gb: 1073741824,
    tb: 1099511627776,
    // Speed (to m/s)
    mps: 1,
    kmh: 0.277778,
    mph: 0.44704,
    knot: 0.514444,
  };

  // Temperature special case
  const tempUnits = ["c", "f", "k"];
  if (tempUnits.includes(from) && tempUnits.includes(to)) {
    let celsius: number;
    if (from === "c") celsius = value;
    else if (from === "f") celsius = ((value - 32) * 5) / 9;
    else celsius = value - 273.15;
    let result: number;
    if (to === "c") result = celsius;
    else if (to === "f") result = (celsius * 9) / 5 + 32;
    else result = celsius + 273.15;
    return {
      success: true,
      data: JSON.stringify({
        value,
        from: from.toUpperCase(),
        to: to.toUpperCase(),
        result: Number(result.toFixed(4)),
      }),
    };
  }

  const fromFactor = conversions[from];
  const toFactor = conversions[to];
  if (!fromFactor || !toFactor)
    return {
      success: false,
      data: `Unités non supportées. Disponibles: ${Object.keys(conversions).join(", ")} + C, F, K`,
    };

  const result = (value * fromFactor) / toFactor;
  return {
    success: true,
    data: JSON.stringify({
      value,
      from: from.toUpperCase(),
      to: to.toUpperCase(),
      result: Number(result.toFixed(6)),
    }),
  };
}

async function tGetColorInfo(args: Record<string, unknown>): Promise<ToolCallResult> {
  const input = String(args.color).trim();
  let r: number, g: number, b: number;
  if (input.startsWith("#")) {
    const hex = input.slice(1);
    r = parseInt(hex.slice(0, 2), 16);
    g = parseInt(hex.slice(2, 4), 16);
    b = parseInt(hex.slice(4, 6), 16);
  } else {
    const parts = input.split(",").map((p) => parseInt(p.trim()));
    [r, g, b] = parts;
  }
  if (isNaN(r) || isNaN(g) || isNaN(b))
    return { success: false, data: "Format invalide. Utilisez HEX (#FF5733) ou RGB (255,87,51)" };

  const toHSL = (r: number, g: number, b: number) => {
    r /= 255;
    g /= 255;
    b /= 255;
    const max = Math.max(r, g, b),
      min = Math.min(r, g, b);
    let h = 0,
      s = 0;
    const l = (max + min) / 2;
    if (max !== min) {
      const d = max - min;
      s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
      switch (max) {
        case r:
          h = (g - b) / d + (g < b ? 6 : 0);
          break;
        case g:
          h = (b - r) / d + 2;
          break;
        case b:
          h = (r - g) / d + 4;
          break;
      }
      h /= 6;
    }
    return { h: Math.round(h * 360), s: Math.round(s * 100), l: Math.round(l * 100) };
  };

  const hsl = toHSL(r, g, b);
  const complement = `#${(((255 - r) << 16) | ((255 - g) << 8) | (255 - b)).toString(16).padStart(6, "0")}`;
  const hex = `#${r.toString(16).padStart(2, "0")}${g.toString(16).padStart(2, "0")}${b.toString(16).padStart(2, "0")}`;

  return {
    success: true,
    data: JSON.stringify({
      hex: hex.toUpperCase(),
      rgb: `${r}, ${g}, ${b}`,
      hsl: `${hsl.h}°, ${hsl.s}%, ${hsl.l}%`,
      complementary: complement.toUpperCase(),
      brightness: Math.round((r * 299 + g * 587 + b * 114) / 1000),
    }),
  };
}

async function tGetRandomFact(args: Record<string, unknown>): Promise<ToolCallResult> {
  const type = String(args.type || "trivia").toLowerCase();
  const number = args.number !== undefined ? Number(args.number) : "random";
  try {
    const url = `http://numbersapi.com/${number}/${type}`;
    const res = await fetch(url, { signal: AbortSignal.timeout(10000) });
    if (!res.ok) return { success: false, data: "Numbers API indisponible" };
    const text = await res.text();
    return {
      success: true,
      data: JSON.stringify({
        type,
        number: number === "random" ? "aléatoire" : number,
        fact: text,
      }),
    };
  } catch (e) {
    return { success: false, data: `Erreur: ${e instanceof Error ? e.message : String(e)}` };
  }
}

async function tGetHoroscope(args: Record<string, unknown>): Promise<ToolCallResult> {
  const sign = String(args.sign).toLowerCase().trim();
  try {
    const res = await fetch(
      `https://horoscope-app-api.vercel.app/api/v1/get-horoscope/daily?sign=${sign}&day=TODAY`,
      {
        signal: AbortSignal.timeout(10000),
      },
    );
    if (!res.ok) return { success: false, data: "Horoscope API indisponible" };
    const data = (await res.json()) as { data: { horoscope_data: string; date: string } };
    return {
      success: true,
      data: JSON.stringify({
        sign,
        date: data.data?.date || "aujourd'hui",
        horoscope: data.data?.horoscope_data || "N/A",
      }),
    };
  } catch (e) {
    return { success: false, data: `Erreur: ${e instanceof Error ? e.message : String(e)}` };
  }
}

async function tGetUvIndex(args: Record<string, unknown>): Promise<ToolCallResult> {
  const lat = Number(args.lat);
  const lon = Number(args.lon);
  try {
    const res = await fetch(
      `https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lon}&daily=uv_index_max,temperature_2m_max,temperature_2m_min&current=temperature_2m,relative_humidity_2m,wind_speed_10m&timezone=auto`,
      {
        signal: AbortSignal.timeout(10000),
      },
    );
    if (!res.ok) return { success: false, data: "Open-Meteo API indisponible" };
    const data = (await res.json()) as {
      current: { temperature_2m: number; relative_humidity_2m: number; wind_speed_10m: number };
      daily: { uv_index_max: number[]; temperature_2m_max: number[]; temperature_2m_min: number[] };
    };
    const uv = data.daily.uv_index_max[0];
    const uvLevel =
      uv <= 2
        ? "Faible"
        : uv <= 5
          ? "Modéré"
          : uv <= 7
            ? "Élevé"
            : uv <= 10
              ? "Très élevé"
              : "Extrême";
    return {
      success: true,
      data: JSON.stringify({
        uvIndex: uv,
        uvLevel,
        currentTemp: data.current.temperature_2m + "°C",
        humidity: data.current.relative_humidity_2m + "%",
        windSpeed: data.current.wind_speed_10m + " km/h",
        maxTemp: data.daily.temperature_2m_max[0] + "°C",
        minTemp: data.daily.temperature_2m_min[0] + "°C",
      }),
    };
  } catch (e) {
    return { success: false, data: `Erreur: ${e instanceof Error ? e.message : String(e)}` };
  }
}

async function tGetGithubRepoInfo(args: Record<string, unknown>): Promise<ToolCallResult> {
  const owner = String(args.owner);
  const repo = String(args.repo);
  const headers: Record<string, string> = {
    Accept: "application/vnd.github.v3+json",
    "User-Agent": "DiscordBot",
  };
  if (process.env.GITHUB_TOKEN) headers.Authorization = `Bearer ${process.env.GITHUB_TOKEN}`;
  try {
    const res = await fetch(`https://api.github.com/repos/${owner}/${repo}`, {
      headers,
      signal: AbortSignal.timeout(10000),
    });
    if (!res.ok) return { success: false, data: `Repo ${owner}/${repo} introuvable` };
    const data = (await res.json()) as {
      full_name: string;
      description: string;
      stargazers_count: number;
      forks_count: number;
      open_issues_count: number;
      language: string;
      license: { name: string } | null;
      created_at: string;
      updated_at: string;
      homepage: string;
      topics: string[];
      size: number;
      default_branch: string;
      archived: boolean;
    };
    return {
      success: true,
      data: JSON.stringify({
        name: data.full_name,
        description: data.description || "N/A",
        stars: data.stargazers_count,
        forks: data.forks_count,
        issues: data.open_issues_count,
        language: data.language || "N/A",
        license: data.license?.name || "N/A",
        topics: data.topics?.slice(0, 10) || [],
        homepage: data.homepage || "N/A",
        createdAt: data.created_at,
        updatedAt: data.updated_at,
        size: (data.size / 1024).toFixed(1) + " MB",
        branch: data.default_branch,
        archived: data.archived,
        url: `https://github.com/${owner}/${repo}`,
      }),
    };
  } catch (e) {
    return { success: false, data: `Erreur: ${e instanceof Error ? e.message : String(e)}` };
  }
}

async function tGetCryptoInfo(args: Record<string, unknown>): Promise<ToolCallResult> {
  let coin = String(args.coin).toLowerCase().trim();
  const symbolMap: Record<string, string> = {
    btc: "bitcoin",
    eth: "ethereum",
    sol: "solana",
    ada: "cardano",
    dot: "polkadot",
    doge: "dogecoin",
    xrp: "ripple",
    matic: "matic-network",
    link: "chainlink",
    avax: "avalanche-2",
  };
  coin = symbolMap[coin] || coin;
  try {
    const res = await fetch(
      `https://api.coingecko.com/api/v3/coins/${coin}?localization=false&tickers=false&market_data=true&community_data=false&developer_data=false`,
      {
        signal: AbortSignal.timeout(10000),
        headers: { Accept: "application/json" },
      },
    );
    if (!res.ok) return { success: false, data: `Crypto "${coin}" introuvable sur CoinGecko` };
    const data = (await res.json()) as {
      name: string;
      symbol: string;
      market_cap_rank: number;
      market_data: {
        current_price: { usd: number; eur: number };
        market_cap: { usd: number; eur: number };
        total_volume: { usd: number };
        price_change_percentage_24h: number;
        price_change_percentage_7d: number;
        high_24h: { usd: number };
        low_24h: { usd: number };
        circulating_supply: number;
        total_supply: number | null;
      };
      description: { en: string };
      image: { small: string };
    };
    const md = data.market_data;
    return {
      success: true,
      data: JSON.stringify({
        name: data.name,
        symbol: data.symbol.toUpperCase(),
        rank: data.market_cap_rank,
        priceUSD: md.current_price.usd,
        priceEUR: md.current_price.eur,
        marketCapEUR: md.market_cap.eur?.toLocaleString("fr-FR"),
        volume24h: md.total_volume.usd?.toLocaleString("fr-FR"),
        change24h: md.price_change_percentage_24h?.toFixed(2) + "%",
        change7d: md.price_change_percentage_7d?.toFixed(2) + "%",
        high24h: md.high_24h.usd,
        low24h: md.low_24h.usd,
        circulating: md.circulating_supply?.toLocaleString("fr-FR"),
        total: md.total_supply?.toLocaleString("fr-FR") || "N/A",
        description: data.description?.en?.slice(0, 500) || "N/A",
        image: data.image?.small,
      }),
    };
  } catch (e) {
    return { success: false, data: `Erreur: ${e instanceof Error ? e.message : String(e)}` };
  }
}

// ─── Dev Tools ───────────────────────────────────────────────────────────────

async function tGetNpmPackage(args: Record<string, unknown>): Promise<ToolCallResult> {
  const name = String(args.name);
  try {
    const res = await fetch(`https://registry.npmjs.org/${encodeURIComponent(name)}/latest`, {
      signal: AbortSignal.timeout(8000),
    });
    if (!res.ok) return { success: false, data: `Paquet npm "${name}" introuvable` };
    const d = (await res.json()) as {
      name: string;
      version: string;
      description: string;
      license: string;
      homepage: string;
      dependencies: Record<string, string>;
    };
    return {
      success: true,
      data: JSON.stringify({
        name: d.name,
        version: d.version,
        description: d.description || "N/A",
        license: d.license || "N/A",
        homepage: d.homepage || `https://npmjs.com/package/${name}`,
        dependencies: Object.keys(d.dependencies || {}).length,
      }),
    };
  } catch (e) {
    return { success: false, data: `Erreur: ${e instanceof Error ? e.message : String(e)}` };
  }
}

async function tGetPypiPackage(args: Record<string, unknown>): Promise<ToolCallResult> {
  const name = String(args.name);
  try {
    const res = await fetch(`https://pypi.org/pypi/${encodeURIComponent(name)}/json`, {
      signal: AbortSignal.timeout(8000),
    });
    if (!res.ok) return { success: false, data: `Paquet PyPI "${name}" introuvable` };
    const d = (await res.json()) as {
      info: {
        name: string;
        version: string;
        summary: string;
        author: string;
        license: string;
        home_page: string;
        requires_python: string;
      };
    };
    const i = d.info;
    return {
      success: true,
      data: JSON.stringify({
        name: i.name,
        version: i.version,
        summary: i.summary || "N/A",
        author: i.author || "N/A",
        license: i.license || "N/A",
        homepage: i.home_page || `https://pypi.org/project/${name}/`,
        python: i.requires_python || "N/A",
      }),
    };
  } catch (e) {
    return { success: false, data: `Erreur: ${e instanceof Error ? e.message : String(e)}` };
  }
}

async function tGetGithubUser(args: Record<string, unknown>): Promise<ToolCallResult> {
  const username = String(args.username);
  const ck = `ghuser:${username}`;
  const cached = getCache(ck);
  if (cached) return { success: true, data: cached };
  try {
    const res = await fetch(`https://api.github.com/users/${encodeURIComponent(username)}`, {
      headers: { "User-Agent": "DiscordBot/1.0" },
      signal: AbortSignal.timeout(8000),
    });
    if (!res.ok) return { success: false, data: `Utilisateur GitHub "${username}" introuvable` };
    const d = (await res.json()) as {
      login: string;
      name: string;
      bio: string;
      public_repos: number;
      followers: number;
      following: number;
      html_url: string;
      avatar_url: string;
      company: string;
      location: string;
      created_at: string;
    };
    const output = JSON.stringify({
      username: d.login,
      name: d.name || d.login,
      bio: d.bio || "Pas de bio",
      repos: d.public_repos,
      followers: d.followers,
      following: d.following,
      url: d.html_url,
      avatar: d.avatar_url,
      company: d.company || "N/A",
      location: d.location || "N/A",
      joined: d.created_at,
    });
    setCache(ck, output);
    return { success: true, data: output };
  } catch (e) {
    return { success: false, data: `Erreur: ${e instanceof Error ? e.message : String(e)}` };
  }
}

// ─── Utilities ───────────────────────────────────────────────────────────────

async function tShortenUrl(args: Record<string, unknown>): Promise<ToolCallResult> {
  const url = String(args.url);
  if (!url.startsWith("http")) return { success: false, data: "URL invalide" };
  try {
    const res = await fetch(`https://is.gd/create.php?format=json&url=${encodeURIComponent(url)}`, {
      signal: AbortSignal.timeout(8000),
    });
    if (!res.ok) return { success: false, data: "Raccourcissement indisponible" };
    const d = (await res.json()) as { shorturl?: string; errormessage?: string };
    if (d.errormessage) return { success: false, data: d.errormessage };
    return { success: true, data: d.shorturl || "Échec" };
  } catch (e) {
    return { success: false, data: `Erreur: ${e instanceof Error ? e.message : String(e)}` };
  }
}

async function tGetQrCode(args: Record<string, unknown>): Promise<ToolCallResult> {
  const text = String(args.text);
  const qrUrl = `https://quickchart.io/qr?text=${encodeURIComponent(text)}&size=300`;
  return { success: true, data: JSON.stringify({ qrUrl, content: text }) };
}

async function tGetRandomUser(): Promise<ToolCallResult> {
  try {
    const res = await fetch("https://randomuser.me/api/?nat=fr", {
      signal: AbortSignal.timeout(8000),
    });
    if (!res.ok) return { success: false, data: "RandomUser indisponible" };
    const d = (await res.json()) as {
      results: Array<{
        name: { first: string; last: string };
        email: string;
        phone: string;
        gender: string;
        picture: { large: string };
        location: { city: string; country: string };
      }>;
    };
    if (!d.results[0]) return { success: false, data: "Pas de profil" };
    const u = d.results[0];
    return {
      success: true,
      data: JSON.stringify({
        name: `${u.name.first} ${u.name.last}`,
        email: u.email,
        phone: u.phone,
        gender: u.gender,
        city: u.location.city,
        country: u.location.country,
        avatar: u.picture.large,
      }),
    };
  } catch (e) {
    return { success: false, data: `Erreur: ${e instanceof Error ? e.message : String(e)}` };
  }
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
  await prisma.sanction
    .create({
      data: { guildId: ctx.guildId, userId, moderatorId: "AI_AGENT", type: "KICK", reason },
    })
    .catch(() => {});
  return { success: true, data: `Utilisateur <@${userId}> expulsé. Raison: ${reason}` };
}

async function tBanUser(args: Record<string, unknown>, ctx: ToolContext): Promise<ToolCallResult> {
  const userId = String(args.userId);
  const reason = String(args.reason || "Bannissement par agent IA");
  const deleteDays = Math.min(7, Number(args.deleteMessageDays) || 7);
  const guild = ctx.client.guilds.cache.get(ctx.guildId);
  if (!guild) return { success: false, data: "Serveur introuvable" };
  await guild.members.ban(userId, {
    reason: `[Agent IA] ${reason}`.slice(0, 512),
    deleteMessageSeconds: deleteDays * 86400,
  });
  await prisma.sanction
    .create({
      data: { guildId: ctx.guildId, userId, moderatorId: "AI_AGENT", type: "BAN", reason },
    })
    .catch(() => {});
  return { success: true, data: `Utilisateur <@${userId}> banni. Raison: ${reason}` };
}

async function tAddRole(args: Record<string, unknown>, ctx: ToolContext): Promise<ToolCallResult> {
  const userId = String(args.userId);
  const roleId = String(args.roleId);
  const guild = ctx.client.guilds.cache.get(ctx.guildId);
  if (!guild) return { success: false, data: "Serveur introuvable" };
  const member = await guild.members.fetch(userId).catch(() => null);
  if (!member) return { success: false, data: "Utilisateur introuvable" };
  await member.roles.add(roleId).catch(() => {
    throw new Error("Impossible d'ajouter le rôle (permissions?)");
  });
  return { success: true, data: `Rôle ${roleId} ajouté à <@${userId}>` };
}

async function tRemoveRole(
  args: Record<string, unknown>,
  ctx: ToolContext,
): Promise<ToolCallResult> {
  const userId = String(args.userId);
  const roleId = String(args.roleId);
  const guild = ctx.client.guilds.cache.get(ctx.guildId);
  if (!guild) return { success: false, data: "Serveur introuvable" };
  const member = await guild.members.fetch(userId).catch(() => null);
  if (!member) return { success: false, data: "Utilisateur introuvable" };
  await member.roles.remove(roleId).catch(() => {
    throw new Error("Impossible de retirer le rôle (permissions?)");
  });
  return { success: true, data: `Rôle ${roleId} retiré de <@${userId}>` };
}

async function tCreateChannel(
  args: Record<string, unknown>,
  ctx: ToolContext,
): Promise<ToolCallResult> {
  const name = String(args.name).toLowerCase().replace(/\s+/g, "-").slice(0, 100);
  const topic = args.topic ? String(args.topic) : undefined;
  const guild = ctx.client.guilds.cache.get(ctx.guildId);
  if (!guild) return { success: false, data: "Serveur introuvable" };
  const channel = await guild.channels.create({ name, type: ChannelType.GuildText, topic });
  return {
    success: true,
    data: JSON.stringify({ name: channel.name, id: channel.id, topic: topic || null }),
  };
}

async function tDeleteChannel(
  args: Record<string, unknown>,
  ctx: ToolContext,
): Promise<ToolCallResult> {
  const channelId = String(args.channelId);
  const guild = ctx.client.guilds.cache.get(ctx.guildId);
  if (!guild) return { success: false, data: "Serveur introuvable" };
  const channel = guild.channels.cache.get(channelId);
  if (!channel) return { success: false, data: "Salon introuvable" };
  await channel.delete("[Agent IA] Suppression demandée").catch(() => {
    throw new Error("Permissions insuffisantes");
  });
  return { success: true, data: `Salon ${channelId} supprimé` };
}

async function tSetChannelTopic(
  args: Record<string, unknown>,
  ctx: ToolContext,
): Promise<ToolCallResult> {
  const channelId = String(args.channelId);
  const topic = String(args.topic);
  const guild = ctx.client.guilds.cache.get(ctx.guildId);
  if (!guild) return { success: false, data: "Serveur introuvable" };
  const channel = guild.channels.cache.get(channelId);
  if (!channel || channel.type !== ChannelType.GuildText)
    return { success: false, data: "Salon textuel introuvable" };
  await (channel as import("discord.js").TextChannel).setTopic(topic);
  return { success: true, data: `Topic du salon ${channelId} mis à jour` };
}

async function tCreateInvite(
  args: Record<string, unknown>,
  ctx: ToolContext,
): Promise<ToolCallResult> {
  const guild = ctx.client.guilds.cache.get(ctx.guildId);
  if (!guild) return { success: false, data: "Serveur introuvable" };
  const channelId = args.channelId ? String(args.channelId) : ctx.channelId;
  const channel = guild.channels.cache.get(channelId);
  if (!channel || !channel.isTextBased()) return { success: false, data: "Salon introuvable" };
  if (!("createInvite" in channel))
    return { success: false, data: "Ce salon ne supporte pas les invitations" };
  const maxAgeNum = Number(args.maxAge);
  const maxAge = Number.isNaN(maxAgeNum) ? 86400 : maxAgeNum;
  const maxUsesNum = Number(args.maxUses);
  const maxUses = Number.isNaN(maxUsesNum) ? 0 : maxUsesNum;
  const invite = await (channel as import("discord.js").TextChannel).createInvite({
    maxAge,
    maxUses,
    unique: true,
  });
  return {
    success: true,
    data: JSON.stringify({
      url: `https://discord.gg/${invite.code}`,
      code: invite.code,
      maxAge,
      maxUses,
    }),
  };
}

async function tGetMemberInfo(
  args: Record<string, unknown>,
  ctx: ToolContext,
): Promise<ToolCallResult> {
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
      roles: member.roles.cache
        .map((r) => ({ id: r.id, name: r.name, color: r.color }))
        .filter((r) => r.name !== "@everyone"),
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
    .map((r) => ({
      id: r.id,
      name: r.name,
      color: r.color,
      members: r.members.size,
      hoist: r.hoist,
      mentionable: r.mentionable,
    }))
    .filter((r) => r.name !== "@everyone");
  return { success: true, data: JSON.stringify(roles.slice(0, 30)) };
}

async function tSetNickname(
  args: Record<string, unknown>,
  ctx: ToolContext,
): Promise<ToolCallResult> {
  const userId = String(args.userId);
  const nickname = String(args.nickname);
  const guild = ctx.client.guilds.cache.get(ctx.guildId);
  if (!guild) return { success: false, data: "Serveur introuvable" };
  const member = await guild.members.fetch(userId).catch(() => null);
  if (!member) return { success: false, data: "Membre introuvable" };
  await member.setNickname(nickname || null, "[Agent IA]").catch(() => {
    throw new Error("Permissions insuffisantes");
  });
  return { success: true, data: `Surnom de <@${userId}> changé en "${nickname}"` };
}

async function tSendDM(args: Record<string, unknown>, ctx: ToolContext): Promise<ToolCallResult> {
  const userId = String(args.userId);
  const message = String(args.message).slice(0, 2000);
  const user = await ctx.client.users.fetch(userId).catch(() => null);
  if (!user) return { success: false, data: "Utilisateur introuvable" };
  await user.send(message).catch(() => {
    throw new Error("MP bloqués par l'utilisateur");
  });
  return { success: true, data: `Message privé envoyé à <@${userId}>` };
}

async function tCreateEmbed(
  args: Record<string, unknown>,
  ctx: ToolContext,
): Promise<ToolCallResult> {
  const { EmbedBuilder } = await import("discord.js");
  const title = String(args.title);
  const description = String(args.description);
  const color = Number(args.color) || 0x4285f4;
  const embed = new EmbedBuilder()
    .setTitle(title.slice(0, 256))
    .setDescription(description.slice(0, 4096))
    .setColor(color);
  if (args.fields) {
    try {
      const fields = JSON.parse(String(args.fields)) as Array<{
        name: string;
        value: string;
        inline?: boolean;
      }>;
      for (const f of fields.slice(0, 25))
        embed.addFields({
          name: f.name.slice(0, 256),
          value: f.value.slice(0, 1024),
          inline: f.inline || false,
        });
    } catch {
      /* ignore bad fields */
    }
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
      return {
        id: vc.id,
        name: vc.name,
        members: vc.members.size,
        memberNames: vc.members.map((m) => m.displayName),
      };
    });
  return { success: true, data: JSON.stringify(voiceChannels) };
}

async function tLockChannel(
  args: Record<string, unknown>,
  ctx: ToolContext,
): Promise<ToolCallResult> {
  const channelId = String(args.channelId);
  const guild = ctx.client.guilds.cache.get(ctx.guildId);
  if (!guild) return { success: false, data: "Serveur introuvable" };
  const channel = guild.channels.cache.get(channelId) as
    import("discord.js").TextChannel | undefined;
  if (!channel) return { success: false, data: "Salon introuvable" };
  await channel.permissionOverwrites.edit(guild.roles.everyone, { SendMessages: false });
  return { success: true, data: `Salon ${channel.name} verrouillé` };
}

async function tUnlockChannel(
  args: Record<string, unknown>,
  ctx: ToolContext,
): Promise<ToolCallResult> {
  const channelId = String(args.channelId);
  const guild = ctx.client.guilds.cache.get(ctx.guildId);
  if (!guild) return { success: false, data: "Serveur introuvable" };
  const channel = guild.channels.cache.get(channelId) as
    import("discord.js").TextChannel | undefined;
  if (!channel) return { success: false, data: "Salon introuvable" };
  await channel.permissionOverwrites.edit(guild.roles.everyone, { SendMessages: true });
  return { success: true, data: `Salon ${channel.name} déverrouillé` };
}

async function tGetEmojis(ctx: ToolContext): Promise<ToolCallResult> {
  const guild = ctx.client.guilds.cache.get(ctx.guildId);
  if (!guild) return { success: false, data: "Serveur introuvable" };
  const emojis = guild.emojis.cache.map((e) => ({
    name: e.name,
    id: e.id,
    animated: e.animated,
    url: e.imageURL(),
  }));
  return { success: true, data: JSON.stringify(emojis.slice(0, 50)) };
}

async function tGetAuditLog(
  args: Record<string, unknown>,
  ctx: ToolContext,
): Promise<ToolCallResult> {
  const limit = Math.min(25, Math.max(1, Number(args.limit) || 5));
  const guild = ctx.client.guilds.cache.get(ctx.guildId);
  if (!guild) return { success: false, data: "Serveur introuvable" };
  const logs = await guild.fetchAuditLogs({ limit }).catch(() => null);
  if (!logs) return { success: false, data: "Logs d'audit indisponibles (permissions?)" };
  const { User } = await import("discord.js");
  const entries = logs.entries.map((e) => ({
    action: e.action,
    executor: e.executor?.tag,
    target: e.target instanceof User ? e.target.tag : String(e.targetId ?? "unknown"),
    reason: e.reason,
    createdAt: e.createdAt.toISOString(),
  }));
  return { success: true, data: JSON.stringify(entries) };
}

// ─── Bot Feature Tools ───────────────────────────────────────────────────────

async function tSearchGifs(args: Record<string, unknown>): Promise<ToolCallResult> {
  const query = String(args.query);
  try {
    const { searchGifs } = await import("./externalApis.js");
    const gifs = await searchGifs(query, 5);
    if (gifs.length === 0) return { success: false, data: "Aucun GIF trouvé" };
    return {
      success: true,
      data: JSON.stringify(gifs.map((g) => ({ url: g.url, title: g.title }))),
    };
  } catch (e) {
    return { success: false, data: `Erreur: ${e instanceof Error ? e.message : String(e)}` };
  }
}

async function tCheckToxicity(args: Record<string, unknown>): Promise<ToolCallResult> {
  const text = String(args.text);
  try {
    const { analyzeToxicity } = await import("./ai-moderation.js");
    const result = await analyzeToxicity(text);
    return { success: true, data: JSON.stringify(result) };
  } catch (e) {
    return { success: false, data: `Erreur: ${e instanceof Error ? e.message : String(e)}` };
  }
}

async function tGetRiskProfile(
  args: Record<string, unknown>,
  ctx: ToolContext,
): Promise<ToolCallResult> {
  const userId = String(args.userId);
  try {
    const profile = await prisma.riskProfile.findUnique({
      where: { userId_guildId: { userId, guildId: ctx.guildId } },
    });
    if (!profile)
      return {
        success: true,
        data: JSON.stringify({ userId, riskScore: 0, riskLevel: "INCONNU", underWatch: false }),
      };
    return {
      success: true,
      data: JSON.stringify({
        userId,
        riskScore: profile.riskScore,
        riskLevel: profile.riskLevel,
        underWatch: profile.underWatch,
        lastUpdated: profile.updatedAt.toISOString(),
      }),
    };
  } catch (e) {
    return { success: false, data: `Erreur: ${e instanceof Error ? e.message : String(e)}` };
  }
}

async function tCheckPhishing(args: Record<string, unknown>): Promise<ToolCallResult> {
  const url = String(args.url);
  try {
    const { checkSuspiciousLinksDetailed } = await import("../commands/security.js");
    const result = await checkSuspiciousLinksDetailed(url);
    return { success: true, data: JSON.stringify(result) };
  } catch (e) {
    return { success: false, data: `Erreur: ${e instanceof Error ? e.message : String(e)}` };
  }
}

// ─── Agent Autonome Tools ────────────────────────────────────────────────────

async function tAnalyzeImage(args: Record<string, unknown>): Promise<ToolCallResult> {
  const imageUrl = String(args.image_url);
  const question = args.question ? String(args.question) : "Décris cette image en détail.";

  try {
    const { getOpenAIClient } = await import("./ai.js");
    const { config } = await import("../config.js");
    const client = getOpenAIClient();

    const response = await client.chat.completions.create(
      {
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
      },
      { timeout: 15_000 },
    );

    const description = response.choices[0]?.message?.content || "Analyse impossible";
    return {
      success: true,
      data: JSON.stringify({ imageUrl, question, analysis: description.slice(0, 1500) }),
    };
  } catch (e) {
    return {
      success: false,
      data: `Erreur analyse image: ${e instanceof Error ? e.message : String(e)}`,
    };
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

    if (score > 0.8) {
      mood = "très agressif";
      riskLevel = "critique";
    } else if (score > 0.6) {
      mood = "agressif";
      riskLevel = "élevé";
    } else if (score > 0.4) {
      mood = "négatif";
      riskLevel = "moyen";
    } else if (score > 0.2) {
      mood = "légèrement négatif";
      riskLevel = "faible";
    } else {
      mood = "positif/neutre";
      riskLevel = "aucun";
    }

    return {
      success: true,
      data: JSON.stringify({
        text: text.slice(0, 200),
        toxicityScore: score,
        mood,
        riskLevel,
        details: toxicityResult,
      }),
    };
  } catch (_e) {
    const lower = text.toLowerCase();
    const negativeWords = [
      "merde",
      "putain",
      "connard",
      "salope",
      "nul",
      "déteste",
      "haine",
      "stupide",
    ];
    const positiveWords = ["bien", "super", "génial", "merci", "j'aime", "excellent", "parfait"];
    const negCount = negativeWords.filter((w) => lower.includes(w)).length;
    const posCount = positiveWords.filter((w) => lower.includes(w)).length;
    const score = negCount / Math.max(1, negCount + posCount);
    const mood = score > 0.5 ? "négatif" : score < 0.3 ? "positif" : "neutre";

    return {
      success: true,
      data: JSON.stringify({
        text: text.slice(0, 200),
        toxicityScore: score,
        mood,
        riskLevel: score > 0.5 ? "élevé" : "faible",
        method: "fallback",
      }),
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
        data: JSON.stringify({
          triggered: true,
          heapBeforeMB: Math.round(memBefore.heapUsed / 1024 / 1024),
          heapAfterMB: Math.round(memAfter.heapUsed / 1024 / 1024),
          savedMB,
        }),
      };
    } else {
      return {
        success: true,
        data: JSON.stringify({
          triggered: false,
          reason: "GC non forcé (lancer avec --expose-gc)",
          heapUsedMB: Math.round(memBefore.heapUsed / 1024 / 1024),
          heapTotalMB: Math.round(memBefore.heapTotal / 1024 / 1024),
          rssMB: Math.round(memBefore.rss / 1024 / 1024),
        }),
      };
    }
  } catch (e) {
    return { success: false, data: `Erreur GC: ${e instanceof Error ? e.message : String(e)}` };
  }
}

// ─── Agent Proactive Tools ───────────────────────────────────────────────────

async function tSummarizeConversation(
  args: Record<string, unknown>,
  ctx: ToolContext,
): Promise<ToolCallResult> {
  const channelId = String(args.channel_id);
  const messageCount = Math.min(Number(args.message_count) || 50, 100);

  try {
    const channel = await ctx.client.channels.fetch(channelId);
    if (!channel?.isTextBased()) {
      return { success: false, data: "Salon introuvable ou non textuel" };
    }

    const messages = await (channel as any).messages.fetch({ limit: messageCount });
    if (messages.size === 0) {
      return {
        success: true,
        data: JSON.stringify({ summary: "Aucun message à résumer.", messageCount: 0 }),
      };
    }

    const sorted = [...messages.values()].sort((a, b) => a.createdTimestamp - b.createdTimestamp);
    const conversationText = sorted
      .map((m) => `[${m.author.username}]: ${m.content.slice(0, 200)}`)
      .join("\n")
      .slice(0, 3000);

    const { getOpenAIClient } = await import("./ai.js");
    const { config } = await import("../config.js");
    const client = getOpenAIClient();

    const response = await client.chat.completions.create(
      {
        model: config.openRouterModel,
        messages: [
          {
            role: "system",
            content:
              "Tu es un assistant qui résume des conversations Discord. Fais un résumé concis en français avec: 1) Les sujets principaux discutés 2) Les décisions prises 3) Les points en suspens. Format: bullet points.",
          },
          { role: "user", content: `Résume cette conversation:\n\n${conversationText}` },
        ],
        max_tokens: 500,
        temperature: 0.3,
      },
      { timeout: 15_000 },
    );

    const summary = response.choices[0]?.message?.content || "Résumé impossible";
    return {
      success: true,
      data: JSON.stringify({
        summary: summary.slice(0, 1500),
        messageCount: sorted.length,
        channelId,
      }),
    };
  } catch (e) {
    return { success: false, data: `Erreur résumé: ${e instanceof Error ? e.message : String(e)}` };
  }
}

async function tDetectLanguage(args: Record<string, unknown>): Promise<ToolCallResult> {
  const text = String(args.text).slice(0, 500);

  const languagePatterns: Record<string, RegExp[]> = {
    fr: [
      /\b(le|la|les|du|de|des|et|ou|ne|pas|que|qui|dans|pour|avec|sans|sur|une|un|ce|cette|mon|ton|son|nous|vous|ils|elles|sont|avoir|être|fait|fois|toujours|jamais|encore)\b/gi,
    ],
    en: [
      /\b(the|and|or|not|that|who|in|for|with|without|on|a|an|this|my|your|his|we|you|they|are|have|be|do|does|did|always|never|still|again)\b/gi,
    ],
    es: [
      /\b(el|la|los|las|de|del|y|o|no|que|quien|en|para|con|sin|sobre|un|una|este|esta|mi|tu|su|nosotros|vosotros|ellos|son|tener|ser|hace|vez|siempre|nunca)\b/gi,
    ],
    de: [
      /\b(der|die|das|und|oder|nicht|dass|wer|in|für|mit|ohne|auf|ein|eine|dieser|diese|mein|dein|sein|wir|ihr|sie|sind|haben|sein|macht|mal|immer|nie)\b/gi,
    ],
    it: [
      /\b(il|la|i|le|di|del|e|o|non|che|chi|in|per|con|senza|su|un|una|questo|questa|mio|tuo|suo|noi|voi|loro|sono|avere|essere|fa|volta|sempre|mai)\b/gi,
    ],
    pt: [
      /\b(o|a|os|as|de|do|da|e|ou|não|que|quem|em|para|com|sem|sobre|um|uma|este|esta|meu|teu|seu|nós|vós|eles|são|ter|ser|faz|vez|sempre|nunca)\b/gi,
    ],
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
  const confidence = sorted[0]
    ? Math.round((sorted[0][1] / Math.max(1, text.split(/\s+/).length)) * 100)
    : 0;

  return {
    success: true,
    data: JSON.stringify({
      detectedLanguage: detected,
      confidence: Math.min(confidence, 100),
      textPreview: text.slice(0, 100),
      allScores: scores,
    }),
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
      .filter(
        (r: { name: string; members: { size: number } }) =>
          r.name !== "@everyone" && r.members.size > 0,
      )
      .sort(
        (a: { members: { size: number } }, b: { members: { size: number } }) =>
          b.members.size - a.members.size,
      )
      .first(10)
      .map((r: { name: string; members: { size: number }; hexColor: string }) => ({
        name: r.name,
        memberCount: r.members.size,
        color: r.hexColor,
      }));

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
    return {
      success: false,
      data: `Erreur server insights: ${e instanceof Error ? e.message : String(e)}`,
    };
  }
}

// ─── OpenRouter MCP Tools ────────────────────────────────────────────────────

async function tOrListModels(args: Record<string, unknown>): Promise<ToolCallResult> {
  const models = await mcpListModels({
    modality: args.modality as string | undefined,
    provider: args.provider as string | undefined,
    min_context: args.min_context as number | undefined,
    free_only: args.free_only as boolean | undefined,
  });
  if (models.length === 0)
    return { success: false, data: "Aucun modèle trouvé ou MCP indisponible" };
  const summary = models
    .slice(0, 20)
    .map((m) => `${m.id} | ctx: ${m.context_length} | $${m.pricing?.prompt || "?"}/1M prompt`)
    .join("\n");
  return { success: true, data: `${models.length} modèles trouvés (top 20):\n${summary}` };
}

async function tOrModelInfo(args: Record<string, unknown>): Promise<ToolCallResult> {
  const modelId = String(args.model_id || "");
  if (!modelId) return { success: false, data: "model_id requis" };
  const model = await mcpGetModel(modelId);
  if (!model) return { success: false, data: `Modèle ${modelId} introuvable` };
  return {
    success: true,
    data: JSON.stringify({
      id: model.id,
      name: model.name,
      context_length: model.context_length,
      pricing: model.pricing,
      modality: model.architecture?.modality,
      supported_parameters: model.supported_parameters,
    }),
  };
}

async function tOrBenchmarks(args: Record<string, unknown>): Promise<ToolCallResult> {
  const benchmarks = await mcpGetBenchmarks(args.category as string | undefined);
  if (benchmarks.length === 0) return { success: false, data: "Aucun benchmark disponible" };
  const summary = benchmarks
    .slice(0, 15)
    .map((b) => `${b.model_id}: ${b.score} (${b.category}, source: ${b.source})`)
    .join("\n");
  return { success: true, data: `Benchmarks (${benchmarks.length}):\n${summary}` };
}

async function tOrRankings(): Promise<ToolCallResult> {
  const rankings = await mcpGetRankings();
  if (rankings.length === 0) return { success: false, data: "Classement indisponible" };
  const summary = rankings
    .slice(0, 10)
    .map((r) => `#${r.rank}: ${r.model_id} (${r.token_volume} tokens)`)
    .join("\n");
  return { success: true, data: `Top 10 modèles aujourd'hui:\n${summary}` };
}

async function tOrChatTest(args: Record<string, unknown>): Promise<ToolCallResult> {
  const model = String(args.model || "");
  const prompt = String(args.prompt || "");
  const maxTokens = (args.max_tokens as number) || 500;
  if (!model || !prompt) return { success: false, data: "model et prompt requis" };
  const result = await mcpChatSend(model, prompt, maxTokens);
  if (!result) return { success: false, data: `Échec du test sur ${model}` };
  return {
    success: true,
    data: JSON.stringify({
      model: result.model,
      content: result.content.slice(0, 500),
      cost: result.cost,
      tokens: result.tokens,
      provider: result.provider,
    }),
  };
}

async function tOrDocsSearch(args: Record<string, unknown>): Promise<ToolCallResult> {
  const query = String(args.query || "");
  if (!query) return { success: false, data: "query requis" };
  const results = await mcpSearchDocs(query);
  if (results.length === 0) return { success: false, data: "Aucun résultat dans la doc" };
  const summary = results
    .slice(0, 5)
    .map((r) => `${r.title}: ${r.snippet.slice(0, 150)}${r.url ? ` (${r.url})` : ""}`)
    .join("\n");
  return { success: true, data: `Résultats doc:\n${summary}` };
}

async function tOrCredits(): Promise<ToolCallResult> {
  const credits = await mcpGetCredits();
  if (credits === null) return { success: false, data: "Crédits indisponibles (MCP non connecté)" };
  return { success: true, data: `Crédits restants: $${credits.toFixed(2)}` };
}
