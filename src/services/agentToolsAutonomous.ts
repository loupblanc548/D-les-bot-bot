/**
 * agentToolsAutonomous.ts — 20 Tools autonomes pour l'agent IA
 *
 * REASON → ACT → OBSERVE → REPLY
 *
 * Catégories:
 *  1. MODERATION & SENTIMENT (5 tools)
 *  2. OSINT & THREAT INTELLIGENCE (6 tools)
 *  3. GAMING & PROACTIVITY (5 tools)
 *  4. AUTOMAINTENANCE & COGNITION (4 tools)
 *
 * Memory-efficient: native fetch, regex, direct Prisma/Discord calls.
 * Zero heavy third-party packages.
 */

import { ChannelType } from "discord.js";
import { createHash } from "crypto";
import { readFile } from "fs/promises";
import { existsSync } from "fs";
import logger from "../utils/logger.js";
import prisma from "../prisma.js";
import { fetchRetry } from "../utils/fetchRetry.js";
import type { AgentToolDef, ToolCallResult, ToolContext } from "./agentTools.js";
import { stripHtml } from "../utils/stripHtml.js";
import { runOsintScan, quickShodanSearch } from "./osintToolkit.js";
import { getUser as getTwitterUser, searchTweets, isTwitterConfigured } from "./twitter.js";
import { getSubredditPosts, searchReddit, getTrendingSubreddits } from "./reddit.js";
import {
  readUrlViaJina,
  getYouTubeTranscript,
  exaSearch,
  searchBilibili,
  readRedditViaJina,
  readTwitterViaJina,
} from "./agentReach.js";
import {
  getGuildAnalytics,
  getBotHealthMetrics,
  getMessageTrend,
  getTopCommands,
  getModerationStats,
} from "./analytics.js";
import { buildRichEmbed } from "./embedBuilder.js";
import {
  sendTelegramMessage,
  sendSlackMessage,
  broadcastNotification,
  isTelegramConfigured,
  isSlackConfigured,
} from "./notifications.js";
import { translateAny, detectLanguageAuto } from "./libreTranslate.js";
import { checkEmail as hibpCheckEmail } from "../utils/hibp.js";
import { detectAnomalies } from "./anomalyDetector.js";
import {
  buildComparisonEmbed,
  buildProgressEmbed,
  buildLeaderboardEmbed,
  buildTimelineEmbed,
  buildStatCardsEmbed,
} from "./embedBuilder.js";

// ─── 1. TOOL DEFINITIONS (JSON Schema for LLM) ───────────────────────────────

export const AUTONOMOUS_TOOLS: AgentToolDef[] = [
  // ═══ 1. MODERATION & SENTIMENT PROFILING ═══
  {
    type: "function",
    function: {
      name: "get_user_moderation_history",
      description:
        "Récupère l'historique de modération d'un utilisateur : warns, timeouts, kicks, bans. Via Prisma.",
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
      name: "scrape_urban_slang",
      description:
        "Scrape Urban Dictionary via fetch + regex pour définir un terme d'argot. Aucune clé API.",
      parameters: {
        type: "object",
        properties: {
          word: { type: "string", description: "Terme à définir" },
        },
        required: ["word"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "evaluate_channel_velocity",
      description:
        "Analyse le taux de messages dans un salon sur les dernières 60 secondes. Détecte les pics d'activité (raid potentiel).",
      parameters: {
        type: "object",
        properties: {
          channelId: { type: "string", description: "ID du salon à analyser" },
        },
        required: ["channelId"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "calculate_server_panic_index",
      description:
        "Calcule un indice de panique serveur combinant vélocité des messages + sentiment récent. Évalue le risque de raid.",
      parameters: { type: "object", properties: {}, required: [] },
    },
  },
  {
    type: "function",
    function: {
      name: "emergency_channel_freeze",
      description:
        "Verrouille instantanément un salon : retire la permission d'envoyer des messages à @everyone. Action d'urgence anti-raid.",
      parameters: {
        type: "object",
        properties: {
          channelId: { type: "string", description: "ID du salon à verrouiller" },
        },
        required: ["channelId"],
      },
    },
  },
  // ═══ 2. OSINT & THREAT INTELLIGENCE ═══
  {
    type: "function",
    function: {
      name: "verify_link_safety",
      description:
        "Vérifie la sécurité d'une URL via scraping de URLVoid. Détecte phishing, malware, réputation.",
      parameters: {
        type: "object",
        properties: {
          url: { type: "string", description: "URL à vérifier" },
        },
        required: ["url"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "detect_disposable_email",
      description:
        "Détecte si un email est jetable/temporaire en matchant contre une liste publique GitHub. Aucune API.",
      parameters: {
        type: "object",
        properties: {
          email: { type: "string", description: "Email à vérifier" },
        },
        required: ["email"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "scrape_steamrep_status",
      description:
        "Scrape steamrep.com pour vérifier si un Steam ID a des bans communautaires (SR, CA, T). Aucune clé API.",
      parameters: {
        type: "object",
        properties: {
          steamId: { type: "string", description: "Steam ID 64 (ex: 765611980...)" },
        },
        required: ["steamId"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "detect_typosquatting",
      description:
        "Détecte le typosquatting : domaines qui imitent des sites connus (discord→d1scord, steam→stearn). Logique heuristique.",
      parameters: {
        type: "object",
        properties: {
          url: { type: "string", description: "URL à analyser" },
        },
        required: ["url"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "track_avatar_hash",
      description:
        "Calcule le hash SHA-256 de l'avatar d'un utilisateur et le sauvegarde en base. Détecte les évadés de ban qui changent de pseudo mais gardent le même avatar.",
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
      name: "expose_ghost_pinger",
      description:
        "Détecte les ghost pings : messages contenant des mentions qui ont été supprimés récemment. Utilise le cache local des messages.",
      parameters: {
        type: "object",
        properties: {
          channelId: { type: "string", description: "ID du salon à inspecter" },
        },
        required: ["channelId"],
      },
    },
  },
  // ═══ 3. GAMING & PROACTIVITY ═══
  {
    type: "function",
    function: {
      name: "match_fortnite_shop_wishlist",
      description:
        "Compare les wishlists Fortnite en base avec le shop actuel. Retourne les items wishlistés disponibles aujourd'hui.",
      parameters: { type: "object", properties: {}, required: [] },
    },
  },
  {
    type: "function",
    function: {
      name: "scrape_epic_free_countdown",
      description:
        "Scrape le feed Epic Games Store pour les jeux gratuits actuels et à venir. Aucune clé API.",
      parameters: { type: "object", properties: {}, required: [] },
    },
  },
  {
    type: "function",
    function: {
      name: "check_community_streams",
      description:
        "Vérifie si un streamer Twitch est en live en scrapant le HTML de sa page (isLive flag). Aucune clé API Twitch.",
      parameters: {
        type: "object",
        properties: {
          channelName: { type: "string", description: "Nom de la chaîne Twitch" },
        },
        required: ["channelName"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "fetch_game_patchnotes",
      description:
        "Récupère les derniers patch notes d'un jeu via les flux RSS/Steam officiels. Aucune clé API.",
      parameters: {
        type: "object",
        properties: {
          game: { type: "string", description: "Nom du jeu (ex: helldivers, valorant, cs2)" },
        },
        required: ["game"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "get_galactic_war_status",
      description:
        "Récupère le statut de la guerre galactique Helldivers 2 : planètes, libération, défense. Pour l'immersion RP.",
      parameters: { type: "object", properties: {}, required: [] },
    },
  },
  // ═══ 4. AUTOMAINTENANCE & COGNITION ═══
  {
    type: "function",
    function: {
      name: "monitor_ram_health",
      description:
        "Retourne l'état de la RAM du bot : RSS, heap used/total, external. Lecture seule, aucun effet de bord.",
      parameters: { type: "object", properties: {}, required: [] },
    },
  },
  {
    type: "function",
    function: {
      name: "enforce_garbage_collection",
      description:
        "Déclenche un garbage collection manuel (global.gc) si disponible. Nettoyage proactif de la RAM.",
      parameters: { type: "object", properties: {}, required: [] },
    },
  },
  {
    type: "function",
    function: {
      name: "self_inspect_logs",
      description:
        "Lit les 20 dernières lignes du fichier de logs d'erreurs. Utile pour diagnostiquer un problème interne.",
      parameters: { type: "object", properties: {}, required: [] },
    },
  },
  {
    type: "function",
    function: {
      name: "upsert_user_memory",
      description:
        "Sauvegarde ou met à jour un fait sur un utilisateur en mémoire long-terme (Prisma). Pour la cohérence des futures interactions.",
      parameters: {
        type: "object",
        properties: {
          userId: { type: "string", description: "ID Discord de l'utilisateur" },
          fact: {
            type: "string",
            description:
              "Fait à sauvegarder (ex: 'préfère les jeux FPS', 'a déjà été warn pour spam')",
          },
        },
        required: ["userId", "fact"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "retrieve_user_memory",
      description:
        "Récupère les faits stockés en mémoire long-terme sur un utilisateur. Retourne l'historique des interactions notables.",
      parameters: {
        type: "object",
        properties: {
          userId: { type: "string", description: "ID Discord de l'utilisateur" },
        },
        required: ["userId"],
      },
    },
  },
  // ═══ 5. OSINT TOOLKIT (auto-use) ═══
  {
    type: "function",
    function: {
      name: "osint_scan",
      description:
        "Lance un scan OSINT complet sur une cible (IP, domaine, ou email). Combine Shodan, DNS, WHOIS, sécurité email, scoring de risque. Utilise cet outil quand un utilisateur demande des infos sur une IP, un domaine, ou un email suspect.",
      parameters: {
        type: "object",
        properties: {
          target: { type: "string", description: "IP, domaine, ou email à analyser" },
        },
        required: ["target"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "shodan_search",
      description:
        "Recherche Shodan d'appareils/services exposés sur Internet. Nécessite SHODAN_API_KEY. Retourne top 5 résultats.",
      parameters: {
        type: "object",
        properties: {
          query: {
            type: "string",
            description: "Requête Shodan (ex: 'apache country:FR', 'port:22 has_ssh')",
          },
        },
        required: ["query"],
      },
    },
  },
  // ═══ 6. TWITTER API (auto-use) ═══
  {
    type: "function",
    function: {
      name: "twitter_get_user",
      description:
        "Récupère le profil Twitter/X d'un utilisateur : bio, followers, tweets count, vérification. Nécessite TWITTER_BEARER_TOKEN.",
      parameters: {
        type: "object",
        properties: {
          username: { type: "string", description: "Nom d'utilisateur Twitter sans @" },
        },
        required: ["username"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "twitter_search",
      description:
        "Recherche des tweets récents par mot-clé. Retourne texte, likes, retweets. Nécessite TWITTER_BEARER_TOKEN.",
      parameters: {
        type: "object",
        properties: {
          query: { type: "string", description: "Requête de recherche" },
          maxResults: { type: "number", description: "Nombre max (défaut 5, max 20)" },
        },
        required: ["query"],
      },
    },
  },
  // ═══ 7. REDDIT API (auto-use) ═══
  {
    type: "function",
    function: {
      name: "reddit_get_posts",
      description: "Récupère les posts d'un subreddit (hot, new, top). Gratuit, pas de clé API.",
      parameters: {
        type: "object",
        properties: {
          subreddit: { type: "string", description: "Nom du subreddit sans r/" },
          sort: { type: "string", description: "Tri: hot, new, top, rising (défaut: hot)" },
          limit: { type: "number", description: "Nombre de posts (défaut 5, max 10)" },
        },
        required: ["subreddit"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "reddit_search",
      description:
        "Recherche sur Reddit par mot-clé. Retourne posts pertinents avec score et commentaires. Gratuit.",
      parameters: {
        type: "object",
        properties: {
          query: { type: "string", description: "Requête de recherche" },
          limit: { type: "number", description: "Nombre de résultats (défaut 5, max 10)" },
        },
        required: ["query"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "reddit_trending",
      description: "Récupère les subreddits populaires/tendance du moment. Gratuit, pas de clé.",
      parameters: { type: "object", properties: {}, required: [] },
    },
  },
  // ═══ 8. AGENT REACH — Zero-API web access (auto-use) ═══
  {
    type: "function",
    function: {
      name: "jina_read_url",
      description:
        "Lit le contenu de n'importe quelle page web via Jina Reader. Gratuit, pas de clé API. Retourne titre + contenu markdown. Utilise cet outil pour lire un article, un post, une page web.",
      parameters: {
        type: "object",
        properties: {
          url: {
            type: "string",
            description: "URL complète de la page à lire (ex: https://example.com/article)",
          },
        },
        required: ["url"],
      },
    },
  },
  // ═══ 8b. EXPANDED OSINT TOOLKIT (free, no API key) ═══
  {
    type: "function",
    function: {
      name: "username_search",
      description:
        "Recherche un pseudo sur 30+ plateformes (GitHub, Instagram, TikTok, Twitter, YouTube, Twitch, Reddit, Steam, etc.). Gratuit, via scraping de pages publiques. Détecte si le pseudo existe sur chaque plateforme.",
      parameters: {
        type: "object",
        properties: {
          username: { type: "string", description: "Pseudo à rechercher (sans @)" },
        },
        required: ["username"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "email_reputation",
      description:
        "Vérifie la réputation d'un email : breaches connues, disposable, spam, malware. Utilise l'API publique EmailRep. Gratuit.",
      parameters: {
        type: "object",
        properties: {
          email: { type: "string", description: "Adresse email à vérifier" },
        },
        required: ["email"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "phone_lookup",
      description:
        "Identifie un numéro de téléphone : pays, opérateur, type (mobile/fixe), validité. Gratuit via libphonenumber logic + numverify fallback.",
      parameters: {
        type: "object",
        properties: {
          phone: {
            type: "string",
            description: "Numéro au format international (ex: +33612345678)",
          },
        },
        required: ["phone"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "ip_geolocation",
      description:
        "Géolocalise une adresse IP : pays, ville, ISP, ASN, coordonnées GPS. Gratuit via ip-api.com.",
      parameters: {
        type: "object",
        properties: {
          ip: { type: "string", description: "Adresse IP (ex: 8.8.8.8)" },
        },
        required: ["ip"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "domain_age",
      description:
        "Récupère l'âge d'un domaine, registrar, date de création et d'expiration via RDAP. Gratuit, pas de clé API.",
      parameters: {
        type: "object",
        properties: {
          domain: { type: "string", description: "Nom de domaine (ex: example.com)" },
        },
        required: ["domain"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "github_profile",
      description:
        "Récupère le profil GitHub public d'un utilisateur : bio, repos, followers, following, date de création, localisation. Gratuit via API GitHub publique.",
      parameters: {
        type: "object",
        properties: {
          username: { type: "string", description: "Nom d'utilisateur GitHub" },
        },
        required: ["username"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "youtube_transcript",
      description:
        "Récupère le transcript/sous-titres d'une vidéo YouTube. Gratuit via Jina Reader. Retourne le texte complet de la vidéo.",
      parameters: {
        type: "object",
        properties: {
          videoId: {
            type: "string",
            description:
              "ID YouTube ou URL complète (ex: dQw4w9WgXcQ ou https://youtube.com/watch?v=...)",
          },
        },
        required: ["videoId"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "exa_web_search",
      description:
        "Recherche sémantique sur tout le web via Exa. Gratuit, pas de clé API. Retourne titres, URLs et extraits. Utilise cet outil pour des recherches web globales.",
      parameters: {
        type: "object",
        properties: {
          query: {
            type: "string",
            description: "Requête de recherche (ex: 'best LLM frameworks 2024')",
          },
          numResults: { type: "number", description: "Nombre de résultats (défaut 5, max 10)" },
        },
        required: ["query"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "bilibili_search",
      description:
        "Recherche des vidéos sur Bilibili (B站). Gratuit, pas de login. Retourne titre, BVID, auteur, vues.",
      parameters: {
        type: "object",
        properties: {
          keyword: { type: "string", description: "Mot-clé de recherche" },
          limit: { type: "number", description: "Nombre de résultats (défaut 5, max 10)" },
        },
        required: ["keyword"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "jina_read_reddit",
      description:
        "Lit le contenu d'un subreddit via Jina Reader (sans clé API Reddit). Retourne les posts visibles en markdown.",
      parameters: {
        type: "object",
        properties: {
          subreddit: { type: "string", description: "Nom du subreddit sans r/" },
          sort: { type: "string", description: "Tri: hot, new, top (défaut: hot)" },
        },
        required: ["subreddit"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "jina_read_twitter",
      description:
        "Lit le profil/tweets récents d'un utilisateur Twitter/X via Jina Reader. Gratuit, pas de clé API Twitter. Retourne le contenu de la page en markdown.",
      parameters: {
        type: "object",
        properties: {
          username: { type: "string", description: "Nom d'utilisateur Twitter sans @" },
        },
        required: ["username"],
      },
    },
  },
  // ═══ 9. ANALYTICS & BI (auto-use) ═══
  {
    type: "function",
    function: {
      name: "guild_analytics",
      description:
        "Récupère les analytics d'un serveur Discord : membres actifs, messages 7j, commandes utilisées, actions de modération, tendances. Utilise cet outil quand on te demande des stats sur le serveur.",
      parameters: {
        type: "object",
        properties: {
          guildId: { type: "string", description: "ID du serveur Discord" },
        },
        required: ["guildId"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "bot_health",
      description:
        "Récupère les métriques de santé du bot : uptime, mémoire RAM, guilds, users, commandes, erreurs. Utilise cet outil pour le monitoring.",
      parameters: { type: "object", properties: {}, required: [] },
    },
  },
  {
    type: "function",
    function: {
      name: "message_trend",
      description:
        "Analyse la tendance d'activité d'un serveur (messages sur N jours). Retourne si l'activité monte, descend, ou est stable.",
      parameters: {
        type: "object",
        properties: {
          guildId: { type: "string", description: "ID du serveur" },
          days: { type: "number", description: "Période en jours (défaut 7)" },
        },
        required: ["guildId"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "top_commands",
      description:
        "Top 10 des commandes les plus utilisées sur un serveur. Utilise cet outil pour l'analytique business.",
      parameters: {
        type: "object",
        properties: {
          guildId: { type: "string", description: "ID du serveur" },
          days: { type: "number", description: "Période en jours (défaut 7)" },
        },
        required: ["guildId"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "moderation_stats",
      description:
        "Statistiques de modération d'un serveur : nombre d'actions par type (ban, kick, timeout, warn). Utilise cet outil pour le reporting modération.",
      parameters: {
        type: "object",
        properties: {
          guildId: { type: "string", description: "ID du serveur" },
          days: { type: "number", description: "Période en jours (défaut 30)" },
        },
        required: ["guildId"],
      },
    },
  },
  // ═══ 10. RICH EMBEDS (auto-use) ═══
  {
    type: "function",
    function: {
      name: "build_rich_embed",
      description:
        "Crée un embed Discord riche et personnalisé avec titre, description, couleur, fields, thumbnail, image, footer, author. Utilise cet outil pour faire des embeds beaux et professionnels.",
      parameters: {
        type: "object",
        properties: {
          title: { type: "string", description: "Titre de l'embed (max 256)" },
          description: { type: "string", description: "Description (max 4096)" },
          color: { type: "string", description: "Couleur hex (ex: #FF5733)" },
          thumbnail: { type: "string", description: "URL du thumbnail" },
          image: { type: "string", description: "URL de l'image" },
          url: { type: "string", description: "URL cliquable du titre" },
          fields: {
            type: "array",
            items: {
              type: "object",
              properties: {
                name: { type: "string" },
                value: { type: "string" },
                inline: { type: "boolean" },
              },
            },
          },
          footerText: { type: "string", description: "Texte du footer" },
          authorName: { type: "string", description: "Nom de l'auteur" },
          timestamp: { type: "boolean", description: "Ajouter timestamp actuel" },
        },
        required: ["title"],
      },
    },
  },
  // ═══ 11. MULTI-PLATFORM NOTIFICATIONS (auto-use) ═══
  {
    type: "function",
    function: {
      name: "send_telegram",
      description:
        "Envoie un message Telegram. Nécessite TELEGRAM_BOT_TOKEN et TELEGRAM_CHAT_ID. Utilise cet outil pour notifier sur Telegram.",
      parameters: {
        type: "object",
        properties: {
          text: { type: "string", description: "Texte du message (Markdown supporté, max 4096)" },
        },
        required: ["text"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "send_slack",
      description:
        "Envoie un message Slack via webhook. Nécessite SLACK_WEBHOOK_URL. Utilise cet outil pour notifier sur Slack.",
      parameters: {
        type: "object",
        properties: {
          text: { type: "string", description: "Texte du message" },
        },
        required: ["text"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "broadcast_notification",
      description:
        "Envoie une notification sur toutes les plateformes configurées (Telegram, Slack, Discord webhook). Utilise cet outil pour les alertes importantes multi-plateformes.",
      parameters: {
        type: "object",
        properties: {
          text: { type: "string", description: "Texte de la notification" },
        },
        required: ["text"],
      },
    },
  },
  // ═══ 12. AUTO-TRANSLATION (auto-use) ═══
  {
    type: "function",
    function: {
      name: "auto_translate",
      description:
        "Traduit automatiquement un texte vers une langue cible. Détecte la langue source automatiquement. Utilise Google Translate en priorité, LibreTranslate en fallback (gratuit). Utilise cet outil quand un utilisateur parle une autre langue ou demande une traduction.",
      parameters: {
        type: "object",
        properties: {
          text: { type: "string", description: "Texte à traduire" },
          targetLang: {
            type: "string",
            description: "Langue cible (ex: fr, en, es, de, ja, zh, ar). Défaut: fr",
          },
          sourceLang: { type: "string", description: "Langue source (auto-détection si omis)" },
        },
        required: ["text"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "detect_language",
      description:
        "Détecte la langue d'un texte. Utilise Google Cloud puis LibreTranslate en fallback.",
      parameters: {
        type: "object",
        properties: {
          text: { type: "string", description: "Texte à analyser" },
        },
        required: ["text"],
      },
    },
  },
  // ═══ 13. ANOMALY DETECTION (auto-use) ═══
  {
    type: "function",
    function: {
      name: "detect_anomalies",
      description:
        "Détecte les anomalies sur un serveur Discord : pics de messages, pics d'erreurs, pics de modération, flood de nouveaux membres (raid). Utilise cet outil quand tu suspectes une activité anormale ou pour le monitoring proactif.",
      parameters: {
        type: "object",
        properties: {
          guildId: { type: "string", description: "ID du serveur Discord" },
        },
        required: ["guildId"],
      },
    },
  },
  // ═══ 14. ADVANCED EMBEDS (auto-use) ═══
  {
    type: "function",
    function: {
      name: "build_comparison_embed",
      description:
        "Crée un embed tableau de comparaison avec colonnes et lignes. Utilise cet outil pour comparer des éléments côte à côte.",
      parameters: {
        type: "object",
        properties: {
          title: { type: "string", description: "Titre" },
          columns: { type: "array", items: { type: "string" }, description: "Noms des colonnes" },
          rows: {
            type: "array",
            items: { type: "array", items: { type: "string" } },
            description: "Lignes de données",
          },
          color: { type: "string", description: "Couleur hex" },
        },
        required: ["title", "columns", "rows"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "build_leaderboard_embed",
      description:
        "Crée un embed classement (leaderboard) avec médailles. Utilise cet outil pour afficher un top des utilisateurs.",
      parameters: {
        type: "object",
        properties: {
          title: { type: "string", description: "Titre du classement" },
          entries: {
            type: "array",
            items: {
              type: "object",
              properties: {
                rank: { type: "number" },
                name: { type: "string" },
                score: { type: "number" },
                extra: { type: "string" },
              },
            },
            description: "Entrées du classement",
          },
          unit: { type: "string", description: "Unité du score (ex: pts, messages)" },
        },
        required: ["title", "entries"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "build_progress_embed",
      description:
        "Crée un embed avec barres de progression visuelles (█░). Utilise cet outil pour afficher des progrès, objectifs, quotas.",
      parameters: {
        type: "object",
        properties: {
          title: { type: "string", description: "Titre" },
          items: {
            type: "array",
            items: {
              type: "object",
              properties: {
                label: { type: "string" },
                current: { type: "number" },
                max: { type: "number" },
                unit: { type: "string" },
              },
            },
            description: "Items avec progression",
          },
        },
        required: ["title", "items"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "build_timeline_embed",
      description:
        "Crée un embed timeline chronologique avec horodatage. Utilise cet outil pour afficher une séquence d'événements.",
      parameters: {
        type: "object",
        properties: {
          title: { type: "string", description: "Titre" },
          events: {
            type: "array",
            items: {
              type: "object",
              properties: {
                time: { type: "string" },
                title: { type: "string" },
                description: { type: "string" },
              },
            },
            description: "Événements chronologiques",
          },
        },
        required: ["title", "events"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "build_stat_cards_embed",
      description:
        "Crée un embed avec cartes de statistiques (icône + label + valeur + tendance). Utilise cet outil pour des dashboards visuels.",
      parameters: {
        type: "object",
        properties: {
          title: { type: "string", description: "Titre" },
          cards: {
            type: "array",
            items: {
              type: "object",
              properties: {
                icon: { type: "string" },
                label: { type: "string" },
                value: { type: "string" },
                trend: { type: "string" },
              },
            },
            description: "Cartes de stats",
          },
        },
        required: ["title", "cards"],
      },
    },
  },
  // ── OSINT Network Investigation ──
  {
    type: "function",
    function: {
      name: "network_investigate",
      description:
        "Investigation OSINT réseau complète : géolocalisation IP, reverse DNS, scan de ports, WHOIS domaine. Utilise cet outil quand il y a un problème réseau, une IP suspecte, ou pour investiguer une alerte de sécurité.",
      parameters: {
        type: "object",
        properties: {
          target: {
            type: "string",
            description: "IP ou domaine à investiguer (ex: 8.8.8.8 ou example.com)",
          },
          modules: {
            type: "array",
            items: {
              type: "string",
              enum: ["geo", "reverse_dns", "port_scan", "whois", "dns_records"],
            },
            description: "Modules à exécuter (défaut: tous)",
          },
        },
        required: ["target"],
      },
    },
  },
  // ── Live Network Status ──
  {
    type: "function",
    function: {
      name: "network_status",
      description:
        "Affiche l'état du réseau en temps réel : connexions actives (IP source/dest, ports, états), ports en écoute, interfaces réseau, bande passante, routes. Utilise cet outil quand l'utilisateur demande d'ouvrir Internet, voir ce qu'il se passe sur le réseau, ou monitorer le trafic live.",
      parameters: {
        type: "object",
        properties: {
          scope: {
            type: "string",
            enum: [
              "all",
              "listening",
              "established",
              "interfaces",
              "routes",
              "bandwidth",
              "top_connections",
            ],
            description: "Portée du diagnostic (défaut: all)",
          },
          filterIp: {
            type: "string",
            description: "Filtrer par IP spécifique (optionnel)",
          },
        },
        required: [],
      },
    },
  },
  // ── Open Web Page (Internet) ──
  {
    type: "function",
    function: {
      name: "open_web_page",
      description:
        "Ouvre une page web sur Internet et affiche son contenu. Permet de consulter des dashboards de monitoring (Wazuh, Grafana, etc.), des outils réseau en ligne (ping, traceroute web), des pages de statut de services, ou n'importe quelle URL. Retourne le titre, le texte principal et les liens trouvés.",
      parameters: {
        type: "object",
        properties: {
          url: {
            type: "string",
            description:
              "URL complète à ouvrir (ex: https://monitoring.example.com, https://status.discord.com, https://www.he.net/network/tools/)",
          },
          extractLinks: {
            type: "boolean",
            description: "Extraire les liens de la page (défaut: true)",
          },
          maxLength: {
            type: "number",
            description: "Longueur max du contenu retourné (défaut: 4000 caractères)",
          },
        },
        required: ["url"],
      },
    },
  },
  // ── Full Threat Intel Sweep (Virus/Malware) ──
  {
    type: "function",
    function: {
      name: "threat_intel_sweep",
      description:
        "Lance un scan complet de threat intelligence sur une IP, URL, ou hash de fichier. Utilise TOUS les outils disponibles: VirusTotal, AbuseIPDB, PhishTank, Google Safe Browsing, IPVoid (géoloc + proxy/VPN detection), GitHub dorking. ⚠️ UTILISE CECI quand l'utilisateur parle de virus, malware, trojan, ransomware, phishing, IP suspecte, ou toute menace de sécurité.",
      parameters: {
        type: "object",
        properties: {
          target: {
            type: "string",
            description: "IP, URL, ou hash de fichier (MD5/SHA1/SHA256) à scanner",
          },
          targetType: {
            type: "string",
            enum: ["auto", "ip", "url", "hash"],
            description: "Type de cible (défaut: auto-détection)",
          },
        },
        required: ["target"],
      },
    },
  },
  // ═══ 15. Data Breach & URL Safety ═══
  {
    type: "function",
    function: {
      name: "checkDataBreach",
      description:
        "Vérifie si un email a été compromis dans des fuites de données connues (Have I Been Pwned). Affiche le nom, la date et la description de chaque breach. Medium risk — données personnelles.",
      parameters: {
        type: "object",
        properties: {
          email: {
            type: "string",
            description: "Adresse email à vérifier (ex: user@example.com)",
          },
        },
        required: ["email"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "scanUrlSafety",
      description:
        "Scanne une URL via urlscan.io pour détecter des menaces (malware, phishing, redirects suspects, JS malveillant). Complète verify_link_safety avec un rapport plus détaillé. Low risk.",
      parameters: {
        type: "object",
        properties: {
          url: {
            type: "string",
            description: "URL à scanner (ex: https://example.com)",
          },
        },
        required: ["url"],
      },
    },
  },
];

// ─── 2. TOOL IMPLEMENTATIONS ─────────────────────────────────────────────────

const MB = 1024 * 1024;

// ── Cache for disposable email list (loaded once) ──
let disposableEmailList: Set<string> | null = null;

// ── Short-lived ghost ping cache (in-memory, 60s TTL) ──
const ghostPingCache = new Map<string, { content: string; authorTag: string; ts: number }[]>();
const GHOST_PING_TTL_MS = 60_000;

// Track messages with mentions for ghost ping detection
export function trackMessageForGhostPings(
  channelId: string,
  content: string,
  authorTag: string,
): void {
  if (!content.includes("<@")) return;
  const entries = ghostPingCache.get(channelId) ?? [];
  entries.push({ content, authorTag, ts: Date.now() });
  // Keep only last 50 entries
  if (entries.length > 50) entries.shift();
  ghostPingCache.set(channelId, entries);
}

// ═══ 1. MODERATION & SENTIMENT ═══

async function tGetUserModerationHistory(args: Record<string, unknown>): Promise<ToolCallResult> {
  const userId = String(args.userId);
  try {
    const sanctions = await prisma.sanction.findMany({
      where: { userId },
      orderBy: { createdAt: "desc" },
      take: 20,
      select: { type: true, reason: true, createdAt: true, moderatorId: true },
    });

    const profile = await prisma.riskProfile.findFirst({
      where: { userId },
      select: {
        riskScore: true,
        riskLevel: true,
        totalSanctions: true,
        warnCount: true,
        timeoutCount: true,
        kickCount: true,
        banCount: true,
      },
    });

    return {
      success: true,
      data: JSON.stringify({
        userId,
        profile: profile || {
          riskScore: 0,
          riskLevel: "NONE",
          totalSanctions: 0,
          warnCount: 0,
          timeoutCount: 0,
          kickCount: 0,
          banCount: 0,
        },
        recentSanctions: sanctions,
        totalFound: sanctions.length,
      }),
    };
  } catch (e) {
    return { success: false, data: `Erreur: ${e instanceof Error ? e.message : String(e)}` };
  }
}

async function tScrapeUrbanSlang(args: Record<string, unknown>): Promise<ToolCallResult> {
  const word = String(args.word)
    .slice(0, 50)
    .replace(/[^a-zA-Z0-9\s-]/g, "");
  try {
    const res = await fetchRetry(
      `https://www.urbandictionary.com/define.php?term=${encodeURIComponent(word)}`,
      {
        headers: { "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64)" },
        signal: AbortSignal.timeout(8000),
      },
    );
    if (!res.ok) return { success: false, data: `HTTP ${res.status}` };
    const html = await res.text();
    const defMatch = html.match(/<div class="meaning"[^>]*>([\s\S]*?)<\/div>/i);
    const exampleMatch = html.match(/<div class="example"[^>]*>([\s\S]*?)<\/div>/i);
    if (!defMatch) return { success: false, data: "Terme non trouvé" };

    const stripTags = (s: string) => stripHtml(s);

    return {
      success: true,
      data: JSON.stringify({
        word,
        definition: stripTags(defMatch[1]).slice(0, 500),
        example: exampleMatch ? stripTags(exampleMatch[1]).slice(0, 300) : null,
      }),
    };
  } catch (e) {
    return { success: false, data: `Erreur scrape: ${e instanceof Error ? e.message : String(e)}` };
  }
}

async function tEvaluateChannelVelocity(
  args: Record<string, unknown>,
  ctx: ToolContext,
): Promise<ToolCallResult> {
  const channelId = String(args.channelId);
  try {
    const channel = ctx.client.channels.cache.get(channelId);
    if (!channel?.isTextBased()) return { success: false, data: "Salon non textuel" };

    const messages = await (channel as any).messages.fetch({ limit: 50 });
    const now = Date.now();
    const recent = [...messages.values()].filter((m) => now - m.createdTimestamp < 60_000);
    const uniqueAuthors = new Set(recent.map((m) => m.author.id));
    const botCount = recent.filter((m) => m.author.bot).length;

    const velocity = recent.length;
    const isRaid = velocity > 20 && uniqueAuthors.size > 5;

    return {
      success: true,
      data: JSON.stringify({
        channelId,
        messagesLast60s: velocity,
        uniqueAuthors: uniqueAuthors.size,
        botMessages: botCount,
        humanMessages: velocity - botCount,
        raidRisk: isRaid ? "HIGH" : velocity > 10 ? "MEDIUM" : "LOW",
      }),
    };
  } catch (e) {
    return { success: false, data: `Erreur: ${e instanceof Error ? e.message : String(e)}` };
  }
}

async function tCalculateServerPanicIndex(ctx: ToolContext): Promise<ToolCallResult> {
  try {
    const guild = ctx.client.guilds.cache.get(ctx.guildId);
    if (!guild) return { success: false, data: "Serveur introuvable" };

    // Check recent sanctions in last 10 min
    const since = new Date(Date.now() - 10 * 60 * 1000);
    const recentSanctions = await prisma.sanction.count({
      where: { guildId: ctx.guildId, createdAt: { gte: since } },
    });

    // Check recent security events
    const recentLogs = await prisma.log.count({
      where: {
        type: { in: ["antiphishing", "ANTI_SPAM", "ANTI_PHISHING"] },
        createdAt: { gte: since },
      },
    });

    // Check member join velocity
    const recentJoins = await prisma.log.count({
      where: { type: "member_join", createdAt: { gte: since } },
    });

    // Panic index formula: weighted combination
    const panicScore = Math.min(100, recentSanctions * 10 + recentLogs * 15 + recentJoins * 5);
    const level =
      panicScore >= 70
        ? "CRITICAL"
        : panicScore >= 40
          ? "HIGH"
          : panicScore >= 20
            ? "MEDIUM"
            : panicScore >= 5
              ? "LOW"
              : "CALM";

    return {
      success: true,
      data: JSON.stringify({
        guildId: ctx.guildId,
        panicScore,
        level,
        factors: { recentSanctions, recentSecurityEvents: recentLogs, recentJoins },
        recommendation:
          level === "CRITICAL"
            ? "Verrouiller les salons et alerter les modérateurs"
            : level === "HIGH"
              ? "Surveiller activement"
              : "RAS",
      }),
    };
  } catch (e) {
    return { success: false, data: `Erreur: ${e instanceof Error ? e.message : String(e)}` };
  }
}

async function tEmergencyChannelFreeze(
  args: Record<string, unknown>,
  ctx: ToolContext,
): Promise<ToolCallResult> {
  const channelId = String(args.channelId);
  try {
    const guild = ctx.client.guilds.cache.get(ctx.guildId);
    if (!guild) return { success: false, data: "Serveur introuvable" };

    const channel = guild.channels.cache.get(channelId);
    if (!channel) return { success: false, data: "Salon introuvable" };
    if (channel.type !== ChannelType.GuildText)
      return { success: false, data: "Salon non textuel" };

    const everyoneRole = guild.roles.everyone;
    await channel.permissionOverwrites.edit(everyoneRole, {
      SendMessages: false,
      AddReactions: false,
      SendMessagesInThreads: false,
    });

    logger.warn(
      `[AgentTools] 🚨 Channel freeze: #${(channel as { name?: string }).name} by AI agent`,
    );

    return {
      success: true,
      data: JSON.stringify({
        channelId,
        channelName: (channel as { name?: string }).name,
        frozen: true,
        action: "SEND_MESSAGES + ADD_REACTIONS revoked for @everyone",
      }),
    };
  } catch (e) {
    return { success: false, data: `Erreur freeze: ${e instanceof Error ? e.message : String(e)}` };
  }
}

// ═══ 2. OSINT & THREAT INTELLIGENCE ═══

async function tVerifyLinkSafety(args: Record<string, unknown>): Promise<ToolCallResult> {
  const url = String(args.url).slice(0, 500);
  try {
    const domain = new URL(url).hostname;
    const res = await fetchRetry(`https://www.urlvoid.com/scan/${domain}/`, {
      headers: { "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64)" },
      signal: AbortSignal.timeout(10000),
    });
    if (!res.ok) return { success: false, data: `HTTP ${res.status}` };
    const html = await res.text();

    const isClean = /class="label label-success"/i.test(html);
    const isFlagged = /class="label label-danger"/i.test(html);
    const detections = [...html.matchAll(/<td>(.*?)<\/td>/g)]
      .map((m) => stripHtml(m[1]))
      .filter((s) => s.length > 3 && s.length < 100)
      .slice(0, 10);

    return {
      success: true,
      data: JSON.stringify({
        domain,
        safe: isClean && !isFlagged,
        flagged: isFlagged,
        detections: isFlagged ? detections.slice(0, 5) : [],
      }),
    };
  } catch (e) {
    return { success: false, data: `Erreur: ${e instanceof Error ? e.message : String(e)}` };
  }
}

async function tDetectDisposableEmail(args: Record<string, unknown>): Promise<ToolCallResult> {
  const email = String(args.email).toLowerCase().trim();
  const domain = email.split("@")[1];
  if (!domain) return { success: false, data: "Email invalide" };

  try {
    // Load list once and cache
    if (!disposableEmailList) {
      const res = await fetchRetry(
        "https://raw.githubusercontent.com/disposable-email-domains/disposable-email-domains/main/disposable_email_blocklist.conf",
        {
          signal: AbortSignal.timeout(10000),
        },
      );
      if (res.ok) {
        const text = await res.text();
        disposableEmailList = new Set(
          text
            .split("\n")
            .map((s) => s.trim())
            .filter(Boolean),
        );
      } else {
        return { success: false, data: "Impossible de charger la liste" };
      }
    }

    const isDisposable = disposableEmailList.has(domain);
    return {
      success: true,
      data: JSON.stringify({
        email,
        domain,
        isDisposable,
        listSize: disposableEmailList?.size ?? 0,
      }),
    };
  } catch (e) {
    return { success: false, data: `Erreur: ${e instanceof Error ? e.message : String(e)}` };
  }
}

async function tScrapeSteamrepStatus(args: Record<string, unknown>): Promise<ToolCallResult> {
  const steamId = String(args.steamId)
    .replace(/[^0-9]/g, "")
    .slice(0, 20);
  if (steamId.length < 17)
    return { success: false, data: "Steam ID invalide (doit faire 17 chiffres)" };

  try {
    const res = await fetchRetry(`https://steamrep.com/profiles/${steamId}`, {
      headers: { "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64)" },
      signal: AbortSignal.timeout(10000),
    });
    if (!res.ok) return { success: false, data: `HTTP ${res.status}` };
    const html = await res.text();

    const hasSRBan = /SteamRep.*BANNED/i.test(html);
    const hasCABan = /CA.*BANNED/i.test(html);
    const hasTradeBan = /TRADE.*BANNED/i.test(html);
    const nameMatch = html.match(/<title>(.*?)<\/title>/i);

    return {
      success: true,
      data: JSON.stringify({
        steamId,
        profileName: nameMatch ? nameMatch[1].replace(/SteamRep - /i, "").trim() : "unknown",
        steamRepBanned: hasSRBan,
        communityBanned: hasCABan,
        tradeBanned: hasTradeBan,
        clean: !hasSRBan && !hasCABan && !hasTradeBan,
      }),
    };
  } catch (e) {
    return { success: false, data: `Erreur: ${e instanceof Error ? e.message : String(e)}` };
  }
}

async function tDetectTyposquatting(args: Record<string, unknown>): Promise<ToolCallResult> {
  const url = String(args.url).slice(0, 500);
  try {
    const domain = new URL(url).hostname.toLowerCase().replace(/^www\./, "");

    // Known legit domains
    const legitDomains = [
      "discord.com",
      "discord.gg",
      "discordapp.com",
      "steamcommunity.com",
      "steampowered.com",
      "store.steampowered.com",
      "epicgames.com",
      "store.epicgames.com",
      "twitch.tv",
      "youtube.com",
      "github.com",
      "paypal.com",
      "amazon.com",
      "google.com",
      "twitter.com",
      "x.com",
      "instagram.com",
      "facebook.com",
      "riotgames.com",
      "playstation.com",
      "xbox.com",
    ];

    // Typosquatting patterns
    const typosquatPatterns: { legit: string; pattern: RegExp }[] = [
      { legit: "discord", pattern: /d[1i]scord|disc0rd|d[i1]scor[dt]/i },
      { legit: "steam", pattern: /st[e3]am|st[e3]rn|st[e3]m/i },
      { legit: "epicgames", pattern: /ep[1i]c|epicgam[e3]s/i },
      { legit: "twitch", pattern: /tw[1i]tch|tw[i1]tch|twich/i },
      { legit: "paypal", pattern: /p[a4]yp[a4]l|paypa[1l]/i },
      { legit: "amazon", pattern: /am[a4]z[o0]n|amaz[o0]n/i },
      { legit: "google", pattern: /g[o0][o0]gle|g00gle/i },
      { legit: "github", pattern: /g[1i]thub|g[i1]th[uü]b/i },
    ];

    const matches: string[] = [];
    for (const { legit, pattern } of typosquatPatterns) {
      if (
        pattern.test(domain) &&
        !legitDomains.some((l) => domain === l || domain.endsWith(`.${l}`))
      ) {
        matches.push(legit);
      }
    }

    // Check for suspicious TLDs
    const suspiciousTLDs = [
      ".tk",
      ".ml",
      ".ga",
      ".cf",
      ".gq",
      ".xyz",
      ".top",
      ".click",
      ".country",
    ];
    const hasSuspiciousTLD = suspiciousTLDs.some((tld) => domain.endsWith(tld));

    // Check for IDN homograph (non-ASCII chars in domain)
    const hasIDN = domain.split("").some((c) => c.charCodeAt(0) > 127);

    const isTyposquat = matches.length > 0 || (hasSuspiciousTLD && domain.length < 15);

    return {
      success: true,
      data: JSON.stringify({
        domain,
        isTyposquat,
        impersonating: matches,
        hasSuspiciousTLD,
        hasIDNHomograph: hasIDN,
        riskLevel: isTyposquat ? "HIGH" : hasSuspiciousTLD ? "MEDIUM" : "LOW",
      }),
    };
  } catch (e) {
    return { success: false, data: `Erreur: ${e instanceof Error ? e.message : String(e)}` };
  }
}

async function tTrackAvatarHash(
  args: Record<string, unknown>,
  ctx: ToolContext,
): Promise<ToolCallResult> {
  const userId = String(args.userId);
  try {
    const user = await ctx.client.users.fetch(userId).catch(() => null);
    if (!user) return { success: false, data: "Utilisateur introuvable" };

    const avatarURL = user.displayAvatarURL({ size: 256, extension: "png" });
    const res = await fetchRetry(avatarURL, { signal: AbortSignal.timeout(8000) });
    if (!res.ok) return { success: false, data: "Impossible de télécharger l'avatar" };
    const buffer = Buffer.from(await res.arrayBuffer());
    const hash = createHash("sha256").update(buffer).digest("hex");

    // Check previous hashes
    const previous = await prisma.avatarHistory.findFirst({
      where: { userId, guildId: ctx.guildId },
      orderBy: { changedAt: "desc" },
    });

    let isNewAvatar = true;
    let previousHash = null;
    if (previous) {
      previousHash = previous.newHash;
      isNewAvatar = previous.newHash !== hash;
    }

    if (isNewAvatar) {
      await prisma.avatarHistory.create({
        data: {
          userId,
          guildId: ctx.guildId,
          oldHash: previousHash || "",
          newHash: hash,
        },
      });
    }

    // Check if this hash matches any other user (ban evader detection)
    const matchingUsers = await prisma.avatarHistory.findMany({
      where: { newHash: hash, userId: { not: userId } },
      select: { userId: true, guildId: true },
      distinct: ["userId"],
      take: 5,
    });

    return {
      success: true,
      data: JSON.stringify({
        userId,
        avatarHash: hash,
        isNewAvatar,
        previousHash,
        possibleBanEvaders: matchingUsers.map((m) => m.userId),
        matchCount: matchingUsers.length,
      }),
    };
  } catch (e) {
    return { success: false, data: `Erreur: ${e instanceof Error ? e.message : String(e)}` };
  }
}

async function tExposeGhostPinger(args: Record<string, unknown>): Promise<ToolCallResult> {
  const channelId = String(args.channelId);
  try {
    const entries = ghostPingCache.get(channelId) ?? [];
    const now = Date.now();
    const recent = entries.filter((e) => now - e.ts < GHOST_PING_TTL_MS);

    // Clean expired entries
    if (entries.length !== recent.length) {
      ghostPingCache.set(channelId, recent.length > 0 ? recent : []);
    }

    if (recent.length === 0) {
      return {
        success: true,
        data: JSON.stringify({
          channelId,
          ghostPings: [],
          message: "Aucun ghost ping détecté dans les 60 dernières secondes",
        }),
      };
    }

    return {
      success: true,
      data: JSON.stringify({
        channelId,
        ghostPings: recent.map((e) => ({
          author: e.authorTag,
          contentPreview: e.content.slice(0, 100),
          ageSeconds: Math.round((now - e.ts) / 1000),
        })),
        count: recent.length,
      }),
    };
  } catch (e) {
    return { success: false, data: `Erreur: ${e instanceof Error ? e.message : String(e)}` };
  }
}

// ═══ 3. GAMING & PROACTIVITY ═══

async function tMatchFortniteShopWishlist(): Promise<ToolCallResult> {
  try {
    const wishlists = await prisma.wishlist.findMany({
      where: { platform: "fortnite" },
      select: { userId: true, itemName: true, guildId: true },
      take: 100,
    });

    if (wishlists.length === 0) {
      return {
        success: true,
        data: JSON.stringify({
          matched: [],
          totalWishlists: 0,
          message: "Aucune wishlist Fortnite en base",
        }),
      };
    }

    // Try to get current shop items from the fortnite API
    try {
      const { fetchShop } = await import("./fortnite-api.js");
      const shopData = await fetchShop();
      const shopItems = [...(shopData?.featured ?? []), ...(shopData?.daily ?? [])];
      const shopNames = new Set(shopItems.map((item) => item.displayName.toLowerCase()));

      const matched = wishlists.filter((w) => shopNames.has(w.itemName.toLowerCase()));

      return {
        success: true,
        data: JSON.stringify({
          totalWishlists: wishlists.length,
          shopItemsCount: shopItems.length,
          matched: matched.map((m) => ({
            userId: m.userId,
            itemName: m.itemName,
            guildId: m.guildId,
          })),
          matchedCount: matched.length,
        }),
      };
    } catch {
      return {
        success: true,
        data: JSON.stringify({
          totalWishlists: wishlists.length,
          matched: [],
          matchedCount: 0,
          message: "Shop API indisponible",
        }),
      };
    }
  } catch (e) {
    return { success: false, data: `Erreur: ${e instanceof Error ? e.message : String(e)}` };
  }
}

async function tScrapeEpicFreeCountdown(): Promise<ToolCallResult> {
  try {
    const res = await fetchRetry(
      "https://store-site-backend-static.ak.epicgames.com/freeGamesPromotions?locale=fr&country=FR&allowCountries=FR",
      {
        headers: { "User-Agent": "Mozilla/5.0" },
        signal: AbortSignal.timeout(10000),
      },
    );
    if (!res.ok) return { success: false, data: `HTTP ${res.status}` };
    const data = (await res.json()) as { data?: { Catalog?: { searchStore?: unknown[] } } };

    const games = data?.data?.Catalog?.searchStore ?? [];
    const now = new Date();
    const freeNow: string[] = [];
    const freeSoon: string[] = [];

    for (const game of games) {
      const g = game as {
        title?: string;
        promotions?: { promotionalOffers?: { startDate?: string; endDate?: string }[] };
      };
      const promos = g.promotions?.promotionalOffers ?? [];
      for (const promo of promos) {
        const start = promo.startDate ? new Date(promo.startDate) : null;
        const end = promo.endDate ? new Date(promo.endDate) : null;
        if (start && end) {
          if (now >= start && now <= end) {
            freeNow.push(g.title || "Unknown");
          } else if (start > now) {
            freeSoon.push(`${g.title} (${start.toISOString().slice(0, 10)})`);
          }
        }
      }
    }

    return {
      success: true,
      data: JSON.stringify({ freeNow, freeSoon, checkedAt: now.toISOString() }),
    };
  } catch (e) {
    return { success: false, data: `Erreur: ${e instanceof Error ? e.message : String(e)}` };
  }
}

async function tCheckCommunityStreams(args: Record<string, unknown>): Promise<ToolCallResult> {
  const channelName = String(args.channelName)
    .replace(/[^a-zA-Z0-9_]/g, "")
    .slice(0, 50);
  try {
    const res = await fetchRetry(`https://www.twitch.tv/${channelName}`, {
      headers: {
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64)",
        "Accept-Language": "en-US",
      },
      signal: AbortSignal.timeout(10000),
    });
    if (!res.ok) return { success: false, data: `HTTP ${res.status}` };
    const html = await res.text();

    const isLive = /"isLive":true/i.test(html) || /isLiveBroadcast/i.test(html);
    const titleMatch = html.match(/"streamTitle":"(.*?)"/i);
    const viewersMatch = html.match(/"viewersCount":(\d+)/i);
    const gameMatch = html.match(/"gameName":"(.*?)"/i);

    return {
      success: true,
      data: JSON.stringify({
        channel: channelName,
        isLive,
        title: titleMatch ? titleMatch[1] : null,
        viewers: viewersMatch ? parseInt(viewersMatch[1], 10) : null,
        game: gameMatch ? gameMatch[1] : null,
      }),
    };
  } catch (e) {
    return { success: false, data: `Erreur: ${e instanceof Error ? e.message : String(e)}` };
  }
}

async function tFetchGamePatchnotes(args: Record<string, unknown>): Promise<ToolCallResult> {
  const game = String(args.game).toLowerCase().slice(0, 30);
  try {
    // Steam news RSS for games
    const steamAppIds: Record<string, number> = {
      helldivers: 553850,
      cs2: 730,
      valorant: 0, // Not on Steam, skip
      dota2: 570,
      pubg: 578080,
      rust: 252490,
    };

    const appId = steamAppIds[game];
    if (!appId) {
      // Try generic Steam search
      const searchRes = await fetchRetry(
        `https://store.steampowered.com/api/storesearch?term=${encodeURIComponent(game)}&l=fr&cc=FR`,
        {
          signal: AbortSignal.timeout(8000),
        },
      );
      if (searchRes.ok) {
        const searchData = (await searchRes.json()) as { items?: { id: number; name: string }[] };
        const found = searchData.items?.[0];
        if (found) {
          return await fetchSteamNews(found.id, game);
        }
      }
      return {
        success: false,
        data: `Jeu "${game}" non trouvé. Essayez: helldivers, cs2, dota2, pubg, rust`,
      };
    }

    return await fetchSteamNews(appId, game);
  } catch (e) {
    return { success: false, data: `Erreur: ${e instanceof Error ? e.message : String(e)}` };
  }
}

async function fetchSteamNews(appId: number, gameName: string): Promise<ToolCallResult> {
  const res = await fetchRetry(
    `https://api.steampowered.com/ISteamNews/GetNewsForApp/v0002/?appid=${appId}&count=3&maxlength=500&format=json`,
    {
      signal: AbortSignal.timeout(8000),
    },
  );
  if (!res.ok) return { success: false, data: `HTTP ${res.status}` };
  const data = (await res.json()) as {
    appnews?: { newsitems?: { title: string; url: string; date: number; contents: string }[] };
  };
  const items = data.appnews?.newsitems ?? [];

  return {
    success: true,
    data: JSON.stringify({
      game: gameName,
      appId,
      patchNotes: items.slice(0, 3).map((item) => ({
        title: item.title,
        url: item.url,
        date: new Date(item.date * 1000).toISOString().slice(0, 10),
        preview: item.contents.slice(0, 200).replace(/\\n/g, " "),
      })),
    }),
  };
}

async function tGetGalacticWarStatus(): Promise<ToolCallResult> {
  try {
    const res = await fetchRetry("https://api.helldivers2.dev/api/v1/war", {
      headers: { "User-Agent": "HelldiversBot/1.0" },
      signal: AbortSignal.timeout(10000),
    });
    if (!res.ok) return { success: false, data: `HTTP ${res.status}` };
    const data = (await res.json()) as {
      warId?: string;
      time?: number;
      impactMultiplier?: number;
      campaignSum?: number;
      defenseSum?: number;
    };

    // Also fetch current campaigns
    let campaigns: unknown[] = [];
    try {
      const campRes = await fetchRetry("https://api.helldivers2.dev/api/v1/campaigns", {
        headers: { "User-Agent": "HelldiversBot/1.0" },
        signal: AbortSignal.timeout(8000),
      });
      if (campRes.ok) campaigns = (await campRes.json()) as unknown[];
    } catch {
      /* non-critical */
    }

    return {
      success: true,
      data: JSON.stringify({
        warId: data.warId,
        impactMultiplier: data.impactMultiplier,
        activeCampaigns: campaigns.length,
        campaigns: campaigns.slice(0, 5),
        timestamp: new Date().toISOString(),
      }),
    };
  } catch (e) {
    return { success: false, data: `Erreur: ${e instanceof Error ? e.message : String(e)}` };
  }
}

// ═══ 4. AUTOMAINTENANCE & COGNITION ═══

async function tMonitorRamHealth(): Promise<ToolCallResult> {
  const mem = process.memoryUsage();
  return {
    success: true,
    data: JSON.stringify({
      rssMB: Math.round(mem.rss / MB),
      heapUsedMB: Math.round(mem.heapUsed / MB),
      heapTotalMB: Math.round(mem.heapTotal / MB),
      externalMB: Math.round(mem.external / MB),
      arrayBuffersMB: Math.round(mem.arrayBuffers / MB),
      uptimeSeconds: Math.round(process.uptime()),
      gcAvailable: typeof global.gc === "function",
    }),
  };
}

async function tEnforceGarbageCollection(): Promise<ToolCallResult> {
  const before = process.memoryUsage();
  const beforeHeap = Math.round(before.heapUsed / MB);

  if (typeof global.gc === "function") {
    global.gc();
    const after = process.memoryUsage();
    const afterHeap = Math.round(after.heapUsed / MB);
    const saved = beforeHeap - afterHeap;
    logger.info(
      `[AgentTools] 🧹 GC enforced by agent: ${beforeHeap}MB → ${afterHeap}MB (-${saved}MB)`,
    );
    return {
      success: true,
      data: JSON.stringify({
        triggered: true,
        heapBeforeMB: beforeHeap,
        heapAfterMB: afterHeap,
        savedMB: saved,
      }),
    };
  }
  return {
    success: true,
    data: JSON.stringify({
      triggered: false,
      reason: "GC non disponible (lancer avec --expose-gc)",
      heapUsedMB: beforeHeap,
    }),
  };
}

async function tSelfInspectLogs(): Promise<ToolCallResult> {
  try {
    // Try common log file locations
    const logPaths = ["logs/error.log", "logs/combined.log", "./error.log"];
    for (const path of logPaths) {
      if (existsSync(path)) {
        const content = await readFile(path, "utf-8");
        const lines = content.split("\n").filter((l) => l.trim().length > 0);
        const last20 = lines.slice(-20);
        return {
          success: true,
          data: JSON.stringify({ logFile: path, totalLines: lines.length, lastLines: last20 }),
        };
      }
    }
    return {
      success: true,
      data: JSON.stringify({
        message: "Aucun fichier de log trouvé. Les logs vont vers stdout/stderr.",
      }),
    };
  } catch (e) {
    return {
      success: false,
      data: `Erreur lecture logs: ${e instanceof Error ? e.message : String(e)}`,
    };
  }
}

async function tUpsertUserMemory(args: Record<string, unknown>): Promise<ToolCallResult> {
  const userId = String(args.userId);
  const fact = String(args.fact).slice(0, 500);
  try {
    // Ensure UserMemory exists
    await prisma.userMemory.upsert({
      where: { userId },
      create: { userId },
      update: {},
    });

    // Save the fact — use key/value model
    const key = `agent_${Date.now()}`;
    await prisma.memoryFact.create({
      data: {
        userId,
        key,
        value: fact,
        category: "agent_observation",
        weight: 0.9,
      },
    });

    return {
      success: true,
      data: JSON.stringify({ userId, saved: true, fact: fact.slice(0, 100) }),
    };
  } catch (e) {
    return { success: false, data: `Erreur: ${e instanceof Error ? e.message : String(e)}` };
  }
}

async function tRetrieveUserMemory(args: Record<string, unknown>): Promise<ToolCallResult> {
  const userId = String(args.userId);
  try {
    const facts = await prisma.memoryFact.findMany({
      where: { userId },
      orderBy: { createdAt: "desc" },
      take: 10,
      select: { value: true, category: true, createdAt: true, key: true, weight: true },
    });

    return {
      success: true,
      data: JSON.stringify({
        userId,
        facts: facts.map((f) => ({
          fact: f.value,
          category: f.category,
          key: f.key,
          date: f.createdAt.toISOString().slice(0, 10),
        })),
        count: facts.length,
      }),
    };
  } catch (e) {
    return { success: false, data: `Erreur: ${e instanceof Error ? e.message : String(e)}` };
  }
}

// ─── 3. DISPATCHER ───────────────────────────────────────────────────────────

export async function executeAutonomousTool(
  toolName: string,
  args: Record<string, unknown>,
  ctx: ToolContext,
): Promise<ToolCallResult | null> {
  logger.info(`[AgentToolsAuto] 🔧 ${toolName} args=${JSON.stringify(args).slice(0, 150)}`);

  try {
    switch (toolName) {
      // 1. Moderation & Sentiment
      case "get_user_moderation_history":
        return await tGetUserModerationHistory(args);
      case "scrape_urban_slang":
        return await tScrapeUrbanSlang(args);
      case "evaluate_channel_velocity":
        return await tEvaluateChannelVelocity(args, ctx);
      case "calculate_server_panic_index":
        return await tCalculateServerPanicIndex(ctx);
      case "emergency_channel_freeze":
        return await tEmergencyChannelFreeze(args, ctx);
      // 2. OSINT & Threat Intelligence
      case "verify_link_safety":
        return await tVerifyLinkSafety(args);
      case "detect_disposable_email":
        return await tDetectDisposableEmail(args);
      case "scrape_steamrep_status":
        return await tScrapeSteamrepStatus(args);
      case "detect_typosquatting":
        return await tDetectTyposquatting(args);
      case "track_avatar_hash":
        return await tTrackAvatarHash(args, ctx);
      case "expose_ghost_pinger":
        return await tExposeGhostPinger(args);
      // 3. Gaming & Proactivity
      case "match_fortnite_shop_wishlist":
        return await tMatchFortniteShopWishlist();
      case "scrape_epic_free_countdown":
        return await tScrapeEpicFreeCountdown();
      case "check_community_streams":
        return await tCheckCommunityStreams(args);
      case "fetch_game_patchnotes":
        return await tFetchGamePatchnotes(args);
      case "get_galactic_war_status":
        return await tGetGalacticWarStatus();
      // 4. Automaintenance & Cognition
      case "monitor_ram_health":
        return await tMonitorRamHealth();
      case "enforce_garbage_collection":
        return await tEnforceGarbageCollection();
      case "self_inspect_logs":
        return await tSelfInspectLogs();
      case "upsert_user_memory":
        return await tUpsertUserMemory(args);
      case "retrieve_user_memory":
        return await tRetrieveUserMemory(args);
      // 5. OSINT Toolkit
      case "osint_scan":
        return await tOsintScan(args);
      case "shodan_search":
        return await tShodanSearch(args);
      // 6. Twitter
      case "twitter_get_user":
        return await tTwitterGetUser(args);
      case "twitter_search":
        return await tTwitterSearch(args);
      // 7. Reddit
      case "reddit_get_posts":
        return await tRedditGetPosts(args);
      case "reddit_search":
        return await tRedditSearch(args);
      case "reddit_trending":
        return await tRedditTrending();
      // 8. Agent Reach — Zero-API web access
      case "jina_read_url":
        return await tJinaReadUrl(args);
      case "youtube_transcript":
        return await tYouTubeTranscript(args);
      case "exa_web_search":
        return await tExaSearch(args);
      case "bilibili_search":
        return await tBilibiliSearch(args);
      case "jina_read_reddit":
        return await tJinaReadReddit(args);
      case "jina_read_twitter":
        return await tJinaReadTwitter(args);
      // 8b. Expanded OSINT
      case "username_search":
        return await tUsernameSearch(args);
      case "email_reputation":
        return await tEmailReputation(args);
      case "phone_lookup":
        return await tPhoneLookup(args);
      case "ip_geolocation":
        return await tIpGeolocation(args);
      case "domain_age":
        return await tDomainAge(args);
      case "github_profile":
        return await tGithubProfile(args);
      case "network_investigate":
        return await tNetworkInvestigate(args);
      case "network_status":
        return await tNetworkStatus(args);
      case "open_web_page":
        return await tOpenWebPage(args);
      case "threat_intel_sweep":
        return await tThreatIntelSweep(args);
      // 9. Analytics & BI
      case "guild_analytics":
        return await tGuildAnalytics(args);
      case "bot_health":
        return await tBotHealth();
      case "message_trend":
        return await tMessageTrend(args);
      case "top_commands":
        return await tTopCommands(args);
      case "moderation_stats":
        return await tModerationStats(args);
      // 10. Rich Embeds
      case "build_rich_embed":
        return await tBuildRichEmbed(args);
      // 11. Multi-platform notifications
      case "send_telegram":
        return await tSendTelegram(args);
      case "send_slack":
        return await tSendSlack(args);
      case "broadcast_notification":
        return await tBroadcastNotification(args);
      // 12. Auto-translation
      case "auto_translate":
        return await tAutoTranslate(args);
      case "detect_language":
        return await tDetectLanguage(args);
      // 13. Anomaly detection
      case "detect_anomalies":
        return await tDetectAnomalies(args);
      // 14. Advanced embeds
      case "build_comparison_embed":
        return await tBuildComparisonEmbed(args);
      case "build_leaderboard_embed":
        return await tBuildLeaderboardEmbed(args);
      case "build_progress_embed":
        return await tBuildProgressEmbed(args);
      case "build_timeline_embed":
        return await tBuildTimelineEmbed(args);
      case "build_stat_cards_embed":
        return await tBuildStatCardsEmbed(args);
      // 15. Data Breach & URL Safety
      case "checkDataBreach":
        return await tCheckDataBreach(args);
      case "scanUrlSafety":
        return await tScanUrlSafety(args);
      default:
        return null;
    }
  } catch (error) {
    logger.error(
      `[AgentToolsAuto] Erreur ${toolName}: ${error instanceof Error ? error.message : String(error)}`,
    );
    return {
      success: false,
      data: `Erreur: ${error instanceof Error ? error.message : String(error)}`,
    };
  }
}

// ═══ 5. OSINT TOOLKIT ═══

async function tOsintScan(args: Record<string, unknown>): Promise<ToolCallResult> {
  const target = String(args.target).slice(0, 200);
  try {
    const report = await runOsintScan(target);
    return {
      success: true,
      data: JSON.stringify({
        target: report.target,
        type: report.type,
        shodan: report.shodan,
        dns: report.dns,
        whois: report.whois,
        emailSecurity: report.emailSecurity,
        riskScore: report.riskScore,
        riskReasons: report.riskReasons,
      }),
    };
  } catch (e) {
    return { success: false, data: `Erreur OSINT: ${e instanceof Error ? e.message : String(e)}` };
  }
}

async function tShodanSearch(args: Record<string, unknown>): Promise<ToolCallResult> {
  const query = String(args.query).slice(0, 200);
  try {
    const result = await quickShodanSearch(query);
    return { success: true, data: JSON.stringify(result) };
  } catch (e) {
    return { success: false, data: `Erreur Shodan: ${e instanceof Error ? e.message : String(e)}` };
  }
}

// ═══ 6. TWITTER API ═══

async function tTwitterGetUser(args: Record<string, unknown>): Promise<ToolCallResult> {
  const username = String(args.username)
    .replace(/[^a-zA-Z0-9_]/g, "")
    .slice(0, 50);
  if (!isTwitterConfigured())
    return { success: false, data: "Twitter API non configuré (TWITTER_BEARER_TOKEN manquant)" };
  try {
    const user = await getTwitterUser(username);
    if (!user) return { success: false, data: `Utilisateur @${username} introuvable` };
    return { success: true, data: JSON.stringify(user) };
  } catch (e) {
    return {
      success: false,
      data: `Erreur Twitter: ${e instanceof Error ? e.message : String(e)}`,
    };
  }
}

async function tTwitterSearch(args: Record<string, unknown>): Promise<ToolCallResult> {
  const query = String(args.query).slice(0, 200);
  const max = Math.min(Number(args.maxResults) || 5, 20);
  if (!isTwitterConfigured()) return { success: false, data: "Twitter API non configuré" };
  try {
    const tweets = await searchTweets(query, max);
    return { success: true, data: JSON.stringify({ query, count: tweets.length, tweets }) };
  } catch (e) {
    return {
      success: false,
      data: `Erreur Twitter search: ${e instanceof Error ? e.message : String(e)}`,
    };
  }
}

// ═══ 7. REDDIT API ═══

async function tRedditGetPosts(args: Record<string, unknown>): Promise<ToolCallResult> {
  const subreddit = String(args.subreddit)
    .replace(/[^a-zA-Z0-9_]/g, "")
    .slice(0, 50);
  const sort = String(args.sort || "hot") as "hot" | "new" | "top" | "rising";
  const limit = Math.min(Number(args.limit) || 5, 10);
  try {
    const posts = await getSubredditPosts(subreddit, sort, limit);
    return { success: true, data: JSON.stringify({ subreddit, sort, count: posts.length, posts }) };
  } catch (e) {
    return { success: false, data: `Erreur Reddit: ${e instanceof Error ? e.message : String(e)}` };
  }
}

async function tRedditSearch(args: Record<string, unknown>): Promise<ToolCallResult> {
  const query = String(args.query).slice(0, 200);
  const limit = Math.min(Number(args.limit) || 5, 10);
  try {
    const posts = await searchReddit(query, limit);
    return { success: true, data: JSON.stringify({ query, count: posts.length, posts }) };
  } catch (e) {
    return {
      success: false,
      data: `Erreur Reddit search: ${e instanceof Error ? e.message : String(e)}`,
    };
  }
}

async function tRedditTrending(): Promise<ToolCallResult> {
  try {
    const trending = await getTrendingSubreddits();
    return { success: true, data: JSON.stringify({ count: trending.length, trending }) };
  } catch (e) {
    return {
      success: false,
      data: `Erreur Reddit trending: ${e instanceof Error ? e.message : String(e)}`,
    };
  }
}

// ═══ 8. AGENT REACH — Zero-API web access ═══

async function tJinaReadUrl(args: Record<string, unknown>): Promise<ToolCallResult> {
  const url = String(args.url).slice(0, 500);
  if (!url.startsWith("http"))
    return { success: false, data: "URL invalide (doit commencer par http)" };
  try {
    const result = await readUrlViaJina(url);
    if (!result) return { success: false, data: "Lecture échouée" };
    return {
      success: true,
      data: JSON.stringify({
        url: result.url,
        title: result.title,
        content: result.content.slice(0, 6000),
        links: result.links.slice(0, 10),
      }),
    };
  } catch (e) {
    return {
      success: false,
      data: `Erreur Jina Reader: ${e instanceof Error ? e.message : String(e)}`,
    };
  }
}

async function tYouTubeTranscript(args: Record<string, unknown>): Promise<ToolCallResult> {
  const videoId = String(args.videoId).slice(0, 200);
  try {
    const result = await getYouTubeTranscript(videoId);
    if (!result) return { success: false, data: "Transcript indisponible pour cette vidéo" };
    return {
      success: true,
      data: JSON.stringify({
        videoId: result.videoId,
        title: result.title,
        channel: result.channel,
        transcript: result.transcript.slice(0, 6000),
      }),
    };
  } catch (e) {
    return {
      success: false,
      data: `Erreur YouTube transcript: ${e instanceof Error ? e.message : String(e)}`,
    };
  }
}

async function tExaSearch(args: Record<string, unknown>): Promise<ToolCallResult> {
  const query = String(args.query).slice(0, 200);
  const num = Math.min(Number(args.numResults) || 5, 10);
  try {
    const results = await exaSearch(query, num);
    return { success: true, data: JSON.stringify({ query, count: results.length, results }) };
  } catch (e) {
    return {
      success: false,
      data: `Erreur Exa search: ${e instanceof Error ? e.message : String(e)}`,
    };
  }
}

async function tBilibiliSearch(args: Record<string, unknown>): Promise<ToolCallResult> {
  const keyword = String(args.keyword).slice(0, 100);
  const limit = Math.min(Number(args.limit) || 5, 10);
  try {
    const results = await searchBilibili(keyword, limit);
    return { success: true, data: JSON.stringify({ keyword, count: results.length, results }) };
  } catch (e) {
    return {
      success: false,
      data: `Erreur Bilibili: ${e instanceof Error ? e.message : String(e)}`,
    };
  }
}

async function tJinaReadReddit(args: Record<string, unknown>): Promise<ToolCallResult> {
  const subreddit = String(args.subreddit)
    .replace(/[^a-zA-Z0-9_]/g, "")
    .slice(0, 50);
  const sort = String(args.sort || "hot");
  try {
    const result = await readRedditViaJina(subreddit, sort);
    if (!result) return { success: false, data: "Lecture du subreddit échouée" };
    return {
      success: true,
      data: JSON.stringify({
        subreddit,
        sort,
        title: result.title,
        content: result.content.slice(0, 5000),
      }),
    };
  } catch (e) {
    return {
      success: false,
      data: `Erreur Jina Reddit: ${e instanceof Error ? e.message : String(e)}`,
    };
  }
}

async function tJinaReadTwitter(args: Record<string, unknown>): Promise<ToolCallResult> {
  const username = String(args.username)
    .replace(/[^a-zA-Z0-9_]/g, "")
    .slice(0, 50);
  try {
    const result = await readTwitterViaJina(username);
    if (!result) return { success: false, data: "Lecture du profil Twitter échouée" };
    return {
      success: true,
      data: JSON.stringify({
        username,
        title: result.title,
        content: result.content.slice(0, 5000),
      }),
    };
  } catch (e) {
    return {
      success: false,
      data: `Erreur Jina Twitter: ${e instanceof Error ? e.message : String(e)}`,
    };
  }
}

// ═══ 9. ANALYTICS & BI ═══

async function tGuildAnalytics(args: Record<string, unknown>): Promise<ToolCallResult> {
  const guildId = String(args.guildId).slice(0, 50);
  try {
    const data = await getGuildAnalytics(guildId);
    return { success: true, data: JSON.stringify(data) };
  } catch (e) {
    return {
      success: false,
      data: `Erreur analytics: ${e instanceof Error ? e.message : String(e)}`,
    };
  }
}

async function tBotHealth(): Promise<ToolCallResult> {
  try {
    const data = await getBotHealthMetrics();
    return { success: true, data: JSON.stringify(data) };
  } catch (e) {
    return { success: false, data: `Erreur health: ${e instanceof Error ? e.message : String(e)}` };
  }
}

async function tMessageTrend(args: Record<string, unknown>): Promise<ToolCallResult> {
  const guildId = String(args.guildId).slice(0, 50);
  const days = Math.min(Number(args.days) || 7, 90);
  try {
    const trend = await getMessageTrend(guildId, days);
    return { success: true, data: JSON.stringify(trend) };
  } catch (e) {
    return { success: false, data: `Erreur trend: ${e instanceof Error ? e.message : String(e)}` };
  }
}

async function tTopCommands(args: Record<string, unknown>): Promise<ToolCallResult> {
  const guildId = String(args.guildId).slice(0, 50);
  const days = Math.min(Number(args.days) || 7, 90);
  try {
    const cmds = await getTopCommands(guildId, days);
    return { success: true, data: JSON.stringify({ guildId, days, commands: cmds }) };
  } catch (e) {
    return {
      success: false,
      data: `Erreur top commands: ${e instanceof Error ? e.message : String(e)}`,
    };
  }
}

async function tModerationStats(args: Record<string, unknown>): Promise<ToolCallResult> {
  const guildId = String(args.guildId).slice(0, 50);
  const days = Math.min(Number(args.days) || 30, 365);
  try {
    const stats = await getModerationStats(guildId, days);
    return { success: true, data: JSON.stringify({ guildId, days, stats }) };
  } catch (e) {
    return {
      success: false,
      data: `Erreur mod stats: ${e instanceof Error ? e.message : String(e)}`,
    };
  }
}

// ═══ 10. RICH EMBEDS ═══

async function tBuildRichEmbed(args: Record<string, unknown>): Promise<ToolCallResult> {
  const title = String(args.title || "").slice(0, 256);
  if (!title) return { success: false, data: "Titre requis" };
  try {
    const embed = buildRichEmbed({
      title,
      description: args.description ? String(args.description) : undefined,
      color: args.color ? String(args.color) : undefined,
      thumbnail: args.thumbnail ? String(args.thumbnail) : undefined,
      image: args.image ? String(args.image) : undefined,
      url: args.url ? String(args.url) : undefined,
      fields: Array.isArray(args.fields)
        ? (args.fields as Record<string, unknown>[]).map((f) => ({
            name: String(f.name || ""),
            value: String(f.value || ""),
            inline: Boolean(f.inline),
          }))
        : undefined,
      footer: args.footerText ? { text: String(args.footerText) } : undefined,
      author: args.authorName ? { name: String(args.authorName) } : undefined,
      timestamp: Boolean(args.timestamp),
    });
    return { success: true, data: JSON.stringify({ embed: embed.toJSON() }) };
  } catch (e) {
    return { success: false, data: `Erreur embed: ${e instanceof Error ? e.message : String(e)}` };
  }
}

// ═══ 11. MULTI-PLATFORM NOTIFICATIONS ═══

async function tSendTelegram(args: Record<string, unknown>): Promise<ToolCallResult> {
  const text = String(args.text).slice(0, 4096);
  if (!isTelegramConfigured())
    return {
      success: false,
      data: "Telegram non configuré (TELEGRAM_BOT_TOKEN/TELEGRAM_CHAT_ID manquant)",
    };
  try {
    const ok = await sendTelegramMessage(text);
    return { success: ok, data: ok ? "Message envoyé sur Telegram" : "Échec d'envoi" };
  } catch (e) {
    return {
      success: false,
      data: `Erreur Telegram: ${e instanceof Error ? e.message : String(e)}`,
    };
  }
}

async function tSendSlack(args: Record<string, unknown>): Promise<ToolCallResult> {
  const text = String(args.text).slice(0, 3000);
  if (!isSlackConfigured())
    return { success: false, data: "Slack non configuré (SLACK_WEBHOOK_URL manquant)" };
  try {
    const ok = await sendSlackMessage(text);
    return { success: ok, data: ok ? "Message envoyé sur Slack" : "Échec d'envoi" };
  } catch (e) {
    return { success: false, data: `Erreur Slack: ${e instanceof Error ? e.message : String(e)}` };
  }
}

async function tBroadcastNotification(args: Record<string, unknown>): Promise<ToolCallResult> {
  const text = String(args.text).slice(0, 2000);
  try {
    const result = await broadcastNotification(text);
    return { success: true, data: JSON.stringify(result) };
  } catch (e) {
    return {
      success: false,
      data: `Erreur broadcast: ${e instanceof Error ? e.message : String(e)}`,
    };
  }
}

// ═══ 12. AUTO-TRANSLATION ═══

async function tAutoTranslate(args: Record<string, unknown>): Promise<ToolCallResult> {
  const text = String(args.text).slice(0, 5000);
  const targetLang = String(args.targetLang || "fr").slice(0, 5);
  const sourceLang = args.sourceLang ? String(args.sourceLang).slice(0, 5) : undefined;
  try {
    const result = await translateAny(text, targetLang, sourceLang);
    return { success: true, data: JSON.stringify(result) };
  } catch (e) {
    return {
      success: false,
      data: `Erreur traduction: ${e instanceof Error ? e.message : String(e)}`,
    };
  }
}

async function tDetectLanguage(args: Record<string, unknown>): Promise<ToolCallResult> {
  const text = String(args.text).slice(0, 1000);
  try {
    const result = await detectLanguageAuto(text);
    return { success: true, data: JSON.stringify(result) };
  } catch (e) {
    return {
      success: false,
      data: `Erreur détection langue: ${e instanceof Error ? e.message : String(e)}`,
    };
  }
}

// ═══ 13. ANOMALY DETECTION ═══

async function tDetectAnomalies(args: Record<string, unknown>): Promise<ToolCallResult> {
  const guildId = String(args.guildId).slice(0, 50);
  try {
    const report = await detectAnomalies(guildId);
    return { success: true, data: JSON.stringify(report) };
  } catch (e) {
    return {
      success: false,
      data: `Erreur anomaly detection: ${e instanceof Error ? e.message : String(e)}`,
    };
  }
}

// ═══ 14. ADVANCED EMBEDS ═══

async function tBuildComparisonEmbed(args: Record<string, unknown>): Promise<ToolCallResult> {
  const title = String(args.title || "").slice(0, 256);
  const columns = Array.isArray(args.columns)
    ? (args.columns as unknown[]).map((c) => String(c))
    : [];
  const rows = Array.isArray(args.rows)
    ? (args.rows as unknown[]).map((r) =>
        Array.isArray(r) ? r.map((c: unknown) => String(c)) : [],
      )
    : [];
  if (!title || columns.length === 0) return { success: false, data: "Titre et colonnes requis" };
  try {
    const embed = buildComparisonEmbed({
      title,
      columns,
      rows,
      color: args.color ? String(args.color) : undefined,
    });
    return { success: true, data: JSON.stringify({ embed: embed.toJSON() }) };
  } catch (e) {
    return {
      success: false,
      data: `Erreur comparison embed: ${e instanceof Error ? e.message : String(e)}`,
    };
  }
}

async function tBuildLeaderboardEmbed(args: Record<string, unknown>): Promise<ToolCallResult> {
  const title = String(args.title || "").slice(0, 256);
  const entries = Array.isArray(args.entries)
    ? (args.entries as Record<string, unknown>[]).map((e) => ({
        rank: Number(e.rank) || 0,
        name: String(e.name || ""),
        score: Number(e.score) || 0,
        extra: e.extra ? String(e.extra) : undefined,
      }))
    : [];
  if (!title || entries.length === 0) return { success: false, data: "Titre et entrées requis" };
  try {
    const embed = buildLeaderboardEmbed({
      title,
      entries,
      unit: args.unit ? String(args.unit) : undefined,
    });
    return { success: true, data: JSON.stringify({ embed: embed.toJSON() }) };
  } catch (e) {
    return {
      success: false,
      data: `Erreur leaderboard embed: ${e instanceof Error ? e.message : String(e)}`,
    };
  }
}

async function tBuildProgressEmbed(args: Record<string, unknown>): Promise<ToolCallResult> {
  const title = String(args.title || "").slice(0, 256);
  const items = Array.isArray(args.items)
    ? (args.items as Record<string, unknown>[]).map((i) => ({
        label: String(i.label || ""),
        current: Number(i.current) || 0,
        max: Number(i.max) || 0,
        unit: i.unit ? String(i.unit) : undefined,
      }))
    : [];
  if (!title || items.length === 0) return { success: false, data: "Titre et items requis" };
  try {
    const embed = buildProgressEmbed({ title, items });
    return { success: true, data: JSON.stringify({ embed: embed.toJSON() }) };
  } catch (e) {
    return {
      success: false,
      data: `Erreur progress embed: ${e instanceof Error ? e.message : String(e)}`,
    };
  }
}

async function tBuildTimelineEmbed(args: Record<string, unknown>): Promise<ToolCallResult> {
  const title = String(args.title || "").slice(0, 256);
  const events = Array.isArray(args.events)
    ? (args.events as Record<string, unknown>[]).map((e) => ({
        time: String(e.time || ""),
        title: String(e.title || ""),
        description: e.description ? String(e.description) : undefined,
      }))
    : [];
  if (!title || events.length === 0) return { success: false, data: "Titre et événements requis" };
  try {
    const embed = buildTimelineEmbed({ title, events });
    return { success: true, data: JSON.stringify({ embed: embed.toJSON() }) };
  } catch (e) {
    return {
      success: false,
      data: `Erreur timeline embed: ${e instanceof Error ? e.message : String(e)}`,
    };
  }
}

async function tBuildStatCardsEmbed(args: Record<string, unknown>): Promise<ToolCallResult> {
  const title = String(args.title || "").slice(0, 256);
  const cards = Array.isArray(args.cards)
    ? (args.cards as Record<string, unknown>[]).map((c) => ({
        icon: String(c.icon || "📊"),
        label: String(c.label || ""),
        value: String(c.value || ""),
        trend: c.trend ? String(c.trend) : undefined,
      }))
    : [];
  if (!title || cards.length === 0) return { success: false, data: "Titre et cartes requis" };
  try {
    const embed = buildStatCardsEmbed({ title, cards });
    return { success: true, data: JSON.stringify({ embed: embed.toJSON() }) };
  } catch (e) {
    return {
      success: false,
      data: `Erreur stat cards embed: ${e instanceof Error ? e.message : String(e)}`,
    };
  }
}

// ═══ 8b. EXPANDED OSINT TOOLKIT — HANDLERS ═══

const USERNAME_PLATFORMS: Record<string, string> = {
  GitHub: "https://github.com/{u}",
  Instagram: "https://instagram.com/{u}",
  TikTok: "https://tiktok.com/@{u}",
  Twitter: "https://x.com/{u}",
  YouTube: "https://youtube.com/@{u}",
  Twitch: "https://twitch.tv/{u}",
  Reddit: "https://reddit.com/user/{u}",
  Steam: "https://steamcommunity.com/id/{u}",
  Facebook: "https://facebook.com/{u}",
  Pinterest: "https://pinterest.com/{u}",
  Spotify: "https://open.spotify.com/user/{u}",
  SoundCloud: "https://soundcloud.com/{u}",
  Medium: "https://medium.com/@{u}",
  DeviantArt: "https://deviantart.com/{u}",
  Behance: "https://behance.net/{u}",
  Dribbble: "https://dribbble.com/{u}",
  GitLab: "https://gitlab.com/{u}",
  Bitbucket: "https://bitbucket.org/{u}",
  HackerNews: "https://news.ycombinator.com/user?id={u}",
  ProductHunt: "https://producthunt.com/@{u}",
  Vimeo: "https://vimeo.com/{u}",
  Flickr: "https://flickr.com/people/{u}",
  Tumblr: "https://{u}.tumblr.com",
  Keybase: "https://keybase.io/{u}",
  Roblox: "https://roblox.com/user.aspx?username={u}",
  Fortnite: "https://fortnitetracker.com/profile/all/{u}",
  Chess: "https://chess.com/member/{u}",
  KoFi: "https://ko-fi.com/{u}",
  Patreon: "https://patreon.com/{u}",
  Etsy: "https://etsy.com/shop/{u}",
};

async function tUsernameSearch(args: Record<string, unknown>): Promise<ToolCallResult> {
  const username = String(args.username || "")
    .trim()
    .slice(0, 50);
  if (!username) return { success: false, data: "Pseudo requis" };
  if (!/^[a-zA-Z0-9_.-]{1,50}$/.test(username))
    return { success: false, data: "Pseudo invalide (caractères autorisés: a-z, 0-9, _, ., -)" };

  const platforms = Object.entries(USERNAME_PLATFORMS);

  // Limite de concurrence pour éviter le flood et les rate-limits
  const CONCURRENCY = 5;
  const results: { platform: string; url: string; found: boolean }[] = [];

  for (let i = 0; i < platforms.length; i += CONCURRENCY) {
    const batch = platforms.slice(i, i + CONCURRENCY).map(async ([platform, urlTemplate]) => {
      const url = urlTemplate.replace("{u}", encodeURIComponent(username));
      try {
        const res = await fetchRetry(url, {
          method: "GET",
          redirect: "manual",
          signal: AbortSignal.timeout(5_000),
          headers: { "User-Agent": "Mozilla/5.0 (compatible; BotOSINT/1.0)" },
        });
        let found = false;
        if (res.status >= 200 && res.status < 400) found = true;
        if (res.status === 0 || res.status === 403 || res.status === 429) found = true;
        if (res.status === 404) found = false;
        return { platform, url, found };
      } catch {
        return { platform, url, found: false };
      }
    });
    results.push(...(await Promise.all(batch)));
  }

  const found = results.filter((r) => r.found);
  const notFound = results.filter((r) => !r.found);

  return {
    success: true,
    data: JSON.stringify({
      username,
      totalPlatforms: results.length,
      foundCount: found.length,
      found: found.map((r) => ({ platform: r.platform, url: r.url })),
      notFound: notFound.map((r) => r.platform),
    }),
  };
}

async function tEmailReputation(args: Record<string, unknown>): Promise<ToolCallResult> {
  const email = String(args.email || "")
    .trim()
    .slice(0, 200)
    .toLowerCase();
  if (!email || !/^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$/.test(email)) {
    return { success: false, data: "Email invalide" };
  }

  try {
    const res = await fetchRetry(`https://emailrep.io/${email}`, {
      headers: { "User-Agent": "Mozilla/5.0 (compatible; BotOSINT/1.0)" },
      signal: AbortSignal.timeout(8_000),
    });

    if (res.status === 429) {
      return { success: false, data: "Rate limit sur EmailRep. Réessaie plus tard." };
    }

    if (!res.ok) {
      return { success: false, data: `EmailRep erreur ${res.status}` };
    }

    const data = (await res.json()) as Record<string, unknown>;
    return {
      success: true,
      data: JSON.stringify({
        email,
        reputation: data.reputation,
        suspicious: data.suspicious,
        references: data.references,
        blacklisted: data.blacklisted,
        credentials_leaked: data.credentials_leaked,
        credentials_last_leaked: data.credentials_last_leaked,
        data_breach: data.data_breach,
        last_breach: data.last_breach,
        disposable: data.disposable,
        deliverable: data.deliverable,
        spam: data.spam,
        malware: data.malware,
      }),
    };
  } catch (err) {
    return {
      success: false,
      data: `EmailRep indisponible: ${err instanceof Error ? err.message : String(err)}`,
    };
  }
}

async function tPhoneLookup(args: Record<string, unknown>): Promise<ToolCallResult> {
  const phone = String(args.phone || "")
    .trim()
    .slice(0, 20);
  if (!phone) return { success: false, data: "Numéro requis" };

  try {
    const res = await fetchRetry(
      `https://numverify.com/php_helper_scripts/numverify_api.php?number=${encodeURIComponent(phone)}&format=1`,
      {
        signal: AbortSignal.timeout(8_000),
        headers: { "User-Agent": "Mozilla/5.0 (compatible; BotOSINT/1.0)" },
      },
    );

    if (!res.ok) {
      const cleaned = phone.replace(/[^0-9+]/g, "");
      const countryCode = cleaned.match(/^\+(\d{1,3})/);
      return {
        success: true,
        data: JSON.stringify({
          phone,
          valid: countryCode !== null,
          countryCode: countryCode?.[1] ?? null,
          note: "Lookup détaillé indisponible, info basique uniquement",
        }),
      };
    }

    const data = (await res.json()) as Record<string, unknown>;
    return {
      success: true,
      data: JSON.stringify({
        phone,
        valid: data.valid,
        number: data.number,
        countryPrefix: data.country_prefix,
        countryCode: data.country_code,
        countryName: data.country_name,
        location: data.location,
        carrier: data.carrier,
        lineType: data.line_type,
      }),
    };
  } catch (err) {
    return {
      success: false,
      data: `Phone lookup indisponible: ${err instanceof Error ? err.message : String(err)}`,
    };
  }
}

async function tIpGeolocation(args: Record<string, unknown>): Promise<ToolCallResult> {
  const ip = String(args.ip || "")
    .trim()
    .slice(0, 45);
  if (!ip || (!/^(\d{1,3}\.){3}\d{1,3}$/.test(ip) && !/^[0-9a-f:]+$/i.test(ip))) {
    return { success: false, data: "IP invalide" };
  }

  try {
    const res = await fetchRetry(
      `http://ip-api.com/json/${ip}?fields=status,message,country,countryCode,region,city,zip,lat,lon,timezone,isp,org,as,query`,
      {
        signal: AbortSignal.timeout(8_000),
      },
    );

    if (!res.ok) {
      return { success: false, data: `ip-api erreur ${res.status}` };
    }

    const data = (await res.json()) as Record<string, unknown>;
    if (data.status === "fail") {
      return { success: false, data: `ip-api: ${data.message || "échec"}` };
    }

    return {
      success: true,
      data: JSON.stringify({
        ip,
        country: data.country,
        countryCode: data.countryCode,
        region: data.region,
        city: data.city,
        zip: data.zip,
        lat: data.lat,
        lon: data.lon,
        timezone: data.timezone,
        isp: data.isp,
        org: data.org,
        as: data.as,
      }),
    };
  } catch (err) {
    return {
      success: false,
      data: `IP geolocation indisponible: ${err instanceof Error ? err.message : String(err)}`,
    };
  }
}

async function tDomainAge(args: Record<string, unknown>): Promise<ToolCallResult> {
  const domain = String(args.domain || "")
    .trim()
    .slice(0, 200)
    .toLowerCase();
  if (!domain || !/\.[a-z]{2,}$/.test(domain)) {
    return { success: false, data: "Domaine invalide" };
  }

  try {
    const res = await fetchRetry(`https://rdap.org/domain/${domain}`, {
      signal: AbortSignal.timeout(10_000),
      headers: { Accept: "application/rdap+json" },
    });

    if (!res.ok) {
      return { success: false, data: `RDAP erreur ${res.status} pour ${domain}` };
    }

    const data = (await res.json()) as Record<string, unknown>;
    const events = (data.events || []) as Array<{ eventAction: string; eventDate: string }>;
    const registration = events.find((e) => e.eventAction === "registration");
    const expiration = events.find((e) => e.eventAction === "expiration");

    const entities = (data.entities || []) as Array<{ roles: string[]; vcardArray: unknown[] }>;
    const registrarEntity = entities.find((e) => e.roles?.includes("registrar"));
    let registrarName = "Inconnu";
    if (registrarEntity?.vcardArray) {
      const vcard = registrarEntity.vcardArray[1] as Array<[string, string, string, string]>;
      const fnEntry = vcard?.find((v) => v[0] === "fn");
      if (fnEntry) registrarName = fnEntry[3];
    }

    const createdDate = registration?.eventDate;
    const expiryDate = expiration?.eventDate;
    let ageYears: number | null = null;
    if (createdDate) {
      const created = new Date(createdDate);
      const now = new Date();
      ageYears = (now.getTime() - created.getTime()) / (365.25 * 24 * 60 * 60 * 1000);
    }

    return {
      success: true,
      data: JSON.stringify({
        domain,
        registrar: registrarName,
        createdDate: createdDate || "Inconnu",
        expiryDate: expiryDate || "Inconnu",
        ageYears: ageYears !== null ? Math.round(ageYears * 10) / 10 : null,
        status: (data.status || []) as string[],
        nameservers: ((data.nameservers || []) as Array<{ ldhName: string }>).map((n) => n.ldhName),
      }),
    };
  } catch (err) {
    return {
      success: false,
      data: `RDAP indisponible: ${err instanceof Error ? err.message : String(err)}`,
    };
  }
}

async function tGithubProfile(args: Record<string, unknown>): Promise<ToolCallResult> {
  const username = String(args.username || "")
    .trim()
    .slice(0, 50);
  if (!username) return { success: false, data: "Username GitHub requis" };

  try {
    const res = await fetchRetry(`https://api.github.com/users/${username}`, {
      signal: AbortSignal.timeout(8_000),
      headers: {
        Accept: "application/vnd.github.v3+json",
        "User-Agent": "Mozilla/5.0 (compatible; BotOSINT/1.0)",
      },
    });

    if (res.status === 404) {
      return { success: false, data: `Utilisateur GitHub '${username}' introuvable` };
    }

    if (!res.ok) {
      return { success: false, data: `GitHub API erreur ${res.status}` };
    }

    const data = (await res.json()) as Record<string, unknown>;
    return {
      success: true,
      data: JSON.stringify({
        username,
        name: data.name,
        bio: data.bio,
        company: data.company,
        location: data.location,
        blog: data.blog,
        publicRepos: data.public_repos,
        publicGists: data.public_gists,
        followers: data.followers,
        following: data.following,
        createdAt: data.created_at,
        updatedAt: data.updated_at,
        twitterUsername: data.twitter_username,
        avatarUrl: data.avatar_url,
        htmlUrl: data.html_url,
        type: data.type,
      }),
    };
  } catch (err) {
    return {
      success: false,
      data: `GitHub API indisponible: ${err instanceof Error ? err.message : String(err)}`,
    };
  }
}

// ─── OSINT Network Investigation ─────────────────────────────────────────────

async function tNetworkInvestigate(args: Record<string, unknown>): Promise<ToolCallResult> {
  const target = String(args.target || "")
    .trim()
    .slice(0, 200);
  if (!target) return { success: false, data: "target requis (IP ou domaine)" };

  const modules = (args.modules as string[] | undefined) ?? [
    "geo",
    "reverse_dns",
    "port_scan",
    "whois",
    "dns_records",
  ];
  const isIP = /^(\d{1,3}\.){3}\d{1,3}$/.test(target) || /^[0-9a-f:]+$/i.test(target);
  const isDomain = !isIP && /\.[a-z]{2,}$/i.test(target);

  if (!isIP && !isDomain) {
    return { success: false, data: "Target invalide — doit être une IP ou un domaine" };
  }

  const results: Record<string, unknown> = { target, type: isIP ? "ip" : "domain" };

  // 1. IP Geolocation
  if (modules.includes("geo") && isIP) {
    try {
      const res = await fetchRetry(
        `http://ip-api.com/json/${target}?fields=status,message,country,countryCode,region,city,zip,lat,lon,timezone,isp,org,as,query`,
        { signal: AbortSignal.timeout(8_000) },
      );
      if (res.ok) {
        const data = (await res.json()) as Record<string, unknown>;
        if (data.status !== "fail") {
          results.geo = {
            country: data.country,
            city: data.city,
            region: data.region,
            isp: data.isp,
            org: data.org,
            as: data.as,
            lat: data.lat,
            lon: data.lon,
            timezone: data.timezone,
          };
        }
      }
    } catch {
      /* non-fatal */
    }
  }

  // 2. Reverse DNS
  if (modules.includes("reverse_dns") && isIP) {
    try {
      const dns = await import("dns");
      const reverseDns = dns.promises.reverse;
      const hostnames = await reverseDns(target);
      results.reverseDns = hostnames.length > 0 ? hostnames : ["No PTR record"];
    } catch {
      results.reverseDns = ["No PTR record"];
    }
  }

  // 3. Port scan (common ports)
  if (modules.includes("port_scan")) {
    try {
      const net = await import("net");
      const commonPorts = [
        21, 22, 23, 25, 53, 80, 110, 143, 443, 445, 993, 995, 1433, 3306, 3389, 5432, 6379, 8080,
        8443, 27017,
      ];
      const openPorts: number[] = [];

      await Promise.all(
        commonPorts.map(
          (port) =>
            new Promise<void>((resolve) => {
              const socket = new net.Socket();
              socket.setTimeout(2000);
              socket.once("connect", () => {
                openPorts.push(port);
                socket.destroy();
                resolve();
              });
              socket.once("timeout", () => {
                socket.destroy();
                resolve();
              });
              socket.once("error", () => {
                socket.destroy();
                resolve();
              });
              socket.connect(port, target);
            }),
        ),
      );

      openPorts.sort((a, b) => a - b);
      results.portScan = { openPorts, scanned: commonPorts.length };
    } catch {
      results.portScan = { error: "Port scan failed" };
    }
  }

  // 4. WHOIS (for domains)
  if (modules.includes("whois") && isDomain) {
    try {
      const res = await fetchRetry(`https://rdap.org/domain/${target}`, {
        signal: AbortSignal.timeout(10_000),
        headers: { Accept: "application/rdap+json" },
      });
      if (res.ok) {
        const data = (await res.json()) as Record<string, unknown>;
        const events = (data.events || []) as Array<{ eventAction: string; eventDate: string }>;
        results.whois = {
          registrar: (
            (data.entities || []) as Array<{ roles: string[]; vcardArray: unknown[] }>
          ).find((e) => e.roles?.includes("registrar"))?.vcardArray?.[1]
            ? "available"
            : "unknown",
          registration: events.find((e) => e.eventAction === "registration")?.eventDate ?? "N/A",
          expiration: events.find((e) => e.eventAction === "expiration")?.eventDate ?? "N/A",
          status: data.status || [],
        };
      }
    } catch {
      /* non-fatal */
    }
  }

  // 5. DNS records (for domains)
  if (modules.includes("dns_records") && isDomain) {
    try {
      const dns = await import("dns");
      const resolveA = dns.promises.resolve4;
      const resolveMx = dns.promises.resolveMx;
      const resolveNs = dns.promises.resolveNs;
      const resolveTxt = dns.promises.resolveTxt;

      const [a, mx, ns, txt] = await Promise.all([
        resolveA(target).catch(() => []),
        resolveMx(target).catch(() => []),
        resolveNs(target).catch(() => []),
        resolveTxt(target).catch(() => []),
      ]);

      results.dnsRecords = {
        a: a as string[],
        mx: (mx as Array<{ priority: number; exchange: string }>).map(
          (m) => `${m.priority} ${m.exchange}`,
        ),
        ns: ns as string[],
        txt: (txt as string[][]).map((t) => t.join("")),
      };
    } catch {
      /* non-fatal */
    }
  }

  logger.info(`[AgentTools] 🔍 Network investigation completed for ${target}`);

  return {
    success: true,
    data: JSON.stringify(results),
  };
}

// ─── Live Network Status ─────────────────────────────────────────────────────

async function tNetworkStatus(args: Record<string, unknown>): Promise<ToolCallResult> {
  const scope = String(args.scope || "all").trim();
  const filterIp = String(args.filterIp || "").trim();

  const { execFile } = await import("child_process");
  const { promisify } = await import("util");
  const execFileAsync = promisify(execFile);

  const results: Record<string, string> = {};

  async function run(cmd: string, key: string, timeout = 5000): Promise<void> {
    try {
      const { stdout } = await execFileAsync("bash", ["-c", cmd], {
        timeout,
        maxBuffer: 512 * 1024,
      });
      results[key] = stdout.trim().slice(0, 3000);
    } catch (err) {
      results[key] = `Error: ${err instanceof Error ? err.message : String(err)}`;
    }
  }

  // Filter helper
  const grepFilter = filterIp ? ` | grep -i "${filterIp}"` : "";

  if (scope === "all" || scope === "listening") {
    await run(`ss -tlnp 2>/dev/null || netstat -tlnp 2>/dev/null`, "listening_ports");
  }

  if (scope === "all" || scope === "established") {
    await run(
      `ss -tunap state established${grepFilter} 2>/dev/null || netstat -tunap 2>/dev/null | grep ESTABLISHED${grepFilter}`,
      "established_connections",
    );
  }

  if (scope === "all" || scope === "top_connections") {
    await run(
      `ss -tunap 2>/dev/null | head -30 || netstat -tunap 2>/dev/null | head -30`,
      "top_connections",
    );
  }

  if (scope === "all" || scope === "interfaces") {
    await run(`ip addr show 2>/dev/null || ifconfig 2>/dev/null`, "interfaces");
  }

  if (scope === "all" || scope === "routes") {
    await run(`ip route 2>/dev/null || route -n 2>/dev/null`, "routes");
  }

  if (scope === "all" || scope === "bandwidth") {
    await run(
      `cat /proc/net/dev 2>/dev/null | awk 'NR>2{printf "%s: RX=%.1fMB TX=%.1fMB\\n", $1, $2/1048576, $10/1048576}'`,
      "bandwidth_by_interface",
    );
    await run(`vnstat 2>/dev/null || echo "vnstat not installed"`, "bandwidth_summary");
  }

  logger.info(`[AgentTools] 📡 Network status retrieved (scope: ${scope})`);

  return {
    success: true,
    data: JSON.stringify({ scope, filterIp: filterIp || null, ...results }),
  };
}

// ─── Open Web Page (Internet) ────────────────────────────────────────────────

async function tOpenWebPage(args: Record<string, unknown>): Promise<ToolCallResult> {
  const url = String(args.url || "").trim();
  if (!url || !url.startsWith("http")) {
    return { success: false, data: "URL invalide — doit commencer par http:// ou https://" };
  }

  const extractLinks = args.extractLinks !== false;
  const maxLength = Number(args.maxLength) || 4000;

  try {
    // Use Jina Reader for clean content extraction
    const jinaUrl = `https://r.jina.ai/${url}`;
    const res = await fetchRetry(jinaUrl, {
      signal: AbortSignal.timeout(15_000),
      headers: { Accept: "application/json", "X-Return-Format": "markdown" },
    });

    if (!res.ok) {
      // Fallback: direct fetch with basic HTML stripping
      const directRes = await fetchRetry(url, {
        signal: AbortSignal.timeout(10_000),
        headers: { "User-Agent": "Mozilla/5.0 (compatible; BotNetworkMonitor/1.0)" },
      });

      if (!directRes.ok) {
        return { success: false, data: `Impossible d'ouvrir ${url} — HTTP ${directRes.status}` };
      }

      const html = await directRes.text();
      const text = html
        .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, "")
        .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, "")
        .replace(/<[^>]+>/g, " ")
        .replace(/\s+/g, " ")
        .trim()
        .slice(0, maxLength);

      const titleMatch = html.match(/<title[^>]*>([^<]+)<\/title>/i);
      const title = titleMatch?.[1]?.trim() ?? url;

      return {
        success: true,
        data: JSON.stringify({ url, title, content: text, links: [], method: "direct-fetch" }),
      };
    }

    const data = (await res.json()) as Record<string, unknown>;
    const title = String(data.title ?? url);
    const content = String(data.content ?? "").slice(0, maxLength);

    let links: string[] = [];
    if (extractLinks && data.links) {
      links = (data.links as Array<{ url: string }>).map((l) => l.url).slice(0, 20);
    }

    logger.info(`[AgentTools] 🌐 Opened web page: ${url} (${content.length} chars)`);

    return {
      success: true,
      data: JSON.stringify({ url, title, content, links, method: "jina-reader" }),
    };
  } catch (err) {
    return {
      success: false,
      data: `Erreur lors de l'ouverture de ${url}: ${err instanceof Error ? err.message : String(err)}`,
    };
  }
}

// ─── Threat Intel Sweep — Full virus/malware scan ────────────────────────────

async function tThreatIntelSweep(args: Record<string, unknown>): Promise<ToolCallResult> {
  const target = String(args.target || "").trim();
  if (!target) return { success: false, data: "target requis (IP, URL, ou hash)" };

  const targetType = String(args.targetType || "auto").trim();
  const isIP = /^(\d{1,3}\.){3}\d{1,3}$/.test(target) || /^[0-9a-f:]+$/i.test(target);
  const isURL = target.startsWith("http://") || target.startsWith("https://");
  const isHash = /^[0-9a-f]{32,64}$/i.test(target);

  let detectedType: "ip" | "url" | "hash";
  if (targetType === "ip" || (targetType === "auto" && isIP)) detectedType = "ip";
  else if (targetType === "url" || (targetType === "auto" && isURL)) detectedType = "url";
  else if (targetType === "hash" || (targetType === "auto" && isHash)) detectedType = "hash";
  else
    return {
      success: false,
      data: "Type de cible non reconnu (doit être IP, URL, ou hash MD5/SHA1/SHA256)",
    };

  const results: Record<string, unknown> = { target, type: detectedType, tools: [] as string[] };
  const toolsUsed: string[] = [];

  try {
    const threatIntel = await import("./threatIntel.js");

    if (detectedType === "ip") {
      toolsUsed.push("AbuseIPDB", "IPVoid", "ip-api");
      const ipRep = await threatIntel.checkIPReputation(target);
      results.ipReputation = {
        isMalicious: ipRep.isMalicious,
        abuseScore: ipRep.abuseScore,
        country: ipRep.country,
        isp: ipRep.isp,
        isProxy: ipRep.isProxy,
        isHosting: ipRep.isHosting,
        isMobile: ipRep.isMobile,
        city: ipRep.city,
        region: ipRep.region,
        sources: ipRep.results.map((r: any) => ({
          source: r.source,
          malicious: r.malicious,
          confidence: r.confidence,
          details: r.details,
        })),
      };

      toolsUsed.push("ip-api-geo");
      try {
        const geoRes = await fetchRetry(
          `http://ip-api.com/json/${target}?fields=status,country,city,isp,as,reverse&lang=fr`,
          { signal: AbortSignal.timeout(5000) },
        );
        if (geoRes.ok) {
          const geoData = (await geoRes.json()) as Record<string, unknown>;
          results.geolocation = geoData;
        }
      } catch {
        /* non-fatal */
      }
    }

    if (detectedType === "url") {
      toolsUsed.push("VirusTotal", "PhishTank", "GoogleSafeBrowsing");
      const urlScan = await threatIntel.scanURL(target);
      results.urlScan = {
        overallMalicious: urlScan.overallMalicious,
        overallConfidence: urlScan.overallConfidence,
        sources: urlScan.results.map((r: any) => ({
          source: r.source,
          malicious: r.malicious,
          confidence: r.confidence,
          details: r.details,
        })),
      };
    }

    if (detectedType === "hash") {
      toolsUsed.push("VirusTotal-FileHash");
      const hashResult = await threatIntel.scanFileHashVirusTotal(target);
      results.fileHashScan = {
        malicious: hashResult.malicious,
        confidence: hashResult.confidence,
        details: hashResult.details,
        categories: hashResult.categories,
      };
    }

    if (threatIntel.isConfigured("GITHUB_DORKING" as any)) {
      toolsUsed.push("GitHubDorking");
      try {
        const leakResult = await threatIntel.githubDorkSearch(target, 5);
        if (leakResult.found) {
          results.githubLeaks = { found: true, repositories: leakResult.repositories };
        }
      } catch {
        /* non-fatal */
      }
    }

    const toolStatus: Record<string, boolean> = {};
    for (const src of [
      "VIRUSTOTAL",
      "ABUSEIPDB",
      "PHISHTANK",
      "SAFE_BROWSING",
      "GITHUB_DORKING",
      "IPVOID",
    ]) {
      toolStatus[src] = threatIntel.isConfigured(src as any);
    }
    results.toolStatus = toolStatus;
    results.tools = toolsUsed;

    let isMalicious = false;
    if (detectedType === "ip" && (results.ipReputation as any)?.isMalicious) isMalicious = true;
    if (detectedType === "url" && (results.urlScan as any)?.overallMalicious) isMalicious = true;
    if (detectedType === "hash" && (results.fileHashScan as any)?.malicious) isMalicious = true;
    results.verdict = isMalicious
      ? "MALICIOUS — Threat confirmed by threat intelligence sources"
      : "No malicious indicators found";

    logger.info(
      `[AgentTools] Threat intel sweep for ${target} (${detectedType}) — verdict: ${isMalicious ? "MALICIOUS" : "clean"}`,
    );

    return { success: true, data: JSON.stringify(results) };
  } catch (err) {
    return {
      success: false,
      data: `Erreur lors du threat intel sweep: ${err instanceof Error ? err.message : String(err)}`,
    };
  }
}

// ─── 15. Data Breach & URL Safety ────────────────────────────────────────────

async function tCheckDataBreach(args: Record<string, unknown>): Promise<ToolCallResult> {
  const email = String(args.email || "")
    .trim()
    .toLowerCase();
  if (!email || !email.includes("@")) {
    return { success: false, data: "Email invalide. Format attendu: user@example.com" };
  }

  const breaches = await hibpCheckEmail(email);
  if (breaches === null) {
    return {
      success: false,
      data: "API Have I Been Pwned non configurée (HIBP_API_KEY manquant) ou erreur. Impossible de vérifier.",
    };
  }

  if (breaches.length === 0) {
    return {
      success: true,
      data: `✅ Aucune fuite de données trouvée pour **${email}**. Cet email n'apparaît dans aucune breach connue.`,
    };
  }

  const lines = breaches.map(
    (b) => `- **${b.name}** (${b.breachDate}): ${b.description.slice(0, 200)}`,
  );
  return {
    success: true,
    data: `🚨 **${breaches.length} fuite(s)** trouvée(s) pour ${email}:\n\n${lines.join("\n")}`,
  };
}

async function tScanUrlSafety(args: Record<string, unknown>): Promise<ToolCallResult> {
  const url = String(args.url || "").trim();
  if (!url || !url.startsWith("http")) {
    return { success: false, data: "URL invalide. Doit commencer par http:// ou https://" };
  }

  const apiKey = process.env.URLSCAN_API_KEY || "";
  const baseUrl = "https://urlscan.io/api/v1";

  try {
    // Submit scan
    const submitRes = await fetch(`${baseUrl}/scan/`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        ...(apiKey ? { "API-Key": apiKey } : {}),
      },
      body: JSON.stringify({ url, visibility: "public" }),
      signal: AbortSignal.timeout(15_000),
    });

    if (!submitRes.ok) {
      const errBody = await submitRes.text().catch(() => "");
      return {
        success: false,
        data: `urlscan.io erreur HTTP ${submitRes.status}: ${errBody.slice(0, 200)}`,
      };
    }

    const submitData = (await submitRes.json()) as { uuid?: string; message?: string };
    if (!submitData.uuid) {
      return { success: false, data: `urlscan.io: ${submitData.message || "pas d'UUID retourné"}` };
    }

    // Poll for result (max 3 attempts, 5s apart)
    let result: Record<string, unknown> | null = null;
    for (let i = 0; i < 3; i++) {
      await new Promise((r) => setTimeout(r, 5000));
      const pollRes = await fetch(`${baseUrl}/result/${submitData.uuid}/`, {
        signal: AbortSignal.timeout(10_000),
      });
      if (pollRes.ok) {
        result = (await pollRes.json()) as Record<string, unknown>;
        break;
      }
    }

    if (!result) {
      return {
        success: true,
        data: `⏳ Scan urlscan.io en cours pour ${url} (UUID: ${submitData.uuid}). Résultat disponible sur https://urlscan.io/result/${submitData.uuid}/`,
      };
    }

    const verdicts = result.verdicts as Record<string, unknown> | undefined;
    const overall = verdicts?.overall as Record<string, unknown> | undefined;
    const stats = result.stats as Record<string, unknown> | undefined;
    const page = result.page as Record<string, unknown> | undefined;

    const malicious = (overall?.malicious as number) ?? 0;
    const suspicious = (overall?.suspicious as number) ?? 0;
    const redirects = (stats?.redirected as number) ?? 0;
    const pageTitle = (page?.title as string) ?? "(inconnu)";
    const pageIp = (page?.ip as string) ?? "(inconnu)";
    const pageServer = (page?.server as string) ?? "(inconnu)";

    let report = `**Scan urlscan.io pour ${url}**\n`;
    report += `- Verdict: ${malicious > 0 ? "🚨 MALICIOUS" : suspicious > 0 ? "⚠️ SUSPICIOUS" : "✅ CLEAN"}\n`;
    report += `- Malicious: ${malicious}, Suspicious: ${suspicious}\n`;
    report += `- Page title: ${pageTitle}\n`;
    report += `- Serveur: ${pageServer}, IP: ${pageIp}\n`;
    report += `- Redirects: ${redirects}\n`;
    report += `- Rapport complet: https://urlscan.io/result/${submitData.uuid}/`;

    return { success: true, data: report };
  } catch (err) {
    return {
      success: false,
      data: `Erreur scan urlscan.io: ${err instanceof Error ? err.message : String(err)}`,
    };
  }
}
