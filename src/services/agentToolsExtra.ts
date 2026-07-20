/**
 * agentToolsExtra.ts — Tools supplémentaires pour élargir l'éventail de réponses
 *
 * Ajoute des capacités que le bot n'avait pas encore :
 * - Hacker News top stories
 * - GitHub trending repos
 * - Weather forecast 5 jours
 * - Crypto top market cap
 * - Steam system requirements
 * - Discord server events list
 * - IGDB game search
 * - Wikipedia full search (pas juste summary)
 * - Product hunt products
 * - Space launches (Launch Library 2)
 * - Movie/TV search (TMDB)
 * - Email validation
 * - Hash generator (MD5, SHA256)
 * - UUID generator
 * - Lorem ipsum generator
 * - Base64 encode/decode
 * - Cron expression explainer
 * - Color palette generator
 * - Emoji info
 * - Minecraft server status
 * - Valorant agent info
 */

import logger from "../utils/logger.js";
import { fetchRetry } from "../utils/fetchRetry.js";
import { RawgClient } from "../rawgClient.js";
import type { AgentToolDef, ToolCallResult, ToolContext } from "./agentTools.js";

// ─── Tool Definitions ───────────────────────────────────────────────────────

export const EXTRA_TOOLS: AgentToolDef[] = [
  {
    type: "function",
    function: {
      name: "get_hackernews_top",
      description:
        "Récupère les top stories de Hacker News (tech, startups, science). Gratuit via Firebase API. Retourne titre, URL, score et commentaires.",
      parameters: {
        type: "object",
        properties: {
          count: { type: "number", description: "Nombre de stories (défaut 5, max 10)" },
        },
        required: [],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "get_github_trending",
      description:
        "Récupère les repos GitHub trending du jour ou de la semaine. Gratuit via scraping GitHub trending. Retourne nom, langage, stars, description.",
      parameters: {
        type: "object",
        properties: {
          since: {
            type: "string",
            description: "Période: daily, weekly, monthly (défaut daily)",
          },
          language: {
            type: "string",
            description: "Filtrer par langage (ex: python, javascript, rust). Optionnel.",
          },
        },
        required: [],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "get_weather_forecast",
      description:
        "Prévision météo sur 5 jours pour une ville. Gratuit via Open-Meteo (pas de clé). Retourne températures min/max, précipitations, vent.",
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
      name: "get_crypto_top",
      description:
        "Top 10 cryptomonnaies par market cap. Gratuit via CoinGecko. Retourne prix, volume, variation 24h, market cap.",
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
      name: "get_steam_requirements",
      description:
        "Récupère la configuration requise (minimum/recommended) d'un jeu Steam. Gratuit via Steam Store API.",
      parameters: {
        type: "object",
        properties: {
          appid: { type: "number", description: "Steam App ID (ex: 553850 pour Helldivers 2)" },
        },
        required: ["appid"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "get_discord_events",
      description:
        "Liste les événements Discord programmés sur le serveur (sorties de jeux, events). Retourne nom, date, description.",
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
      name: "search_igdb_games",
      description:
        "Recherche n'importe quel jeu dans la base IGDB. Retourne nom, date de sortie, plateformes, genres, notes. Nécessite IGDB_API.",
      parameters: {
        type: "object",
        properties: {
          query: {
            type: "string",
            description: "Nom du jeu à rechercher (ex: Helldivers, GTA, Minecraft)",
          },
          limit: { type: "number", description: "Nombre de résultats (défaut 5, max 10)" },
        },
        required: ["query"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "search_wikipedia",
      description:
        "Recherche complète sur Wikipedia (FR). Retourne plusieurs articles avec résumé et URL. Gratuit.",
      parameters: {
        type: "object",
        properties: {
          query: {
            type: "string",
            description: "Terme de recherche (ex: Napoléon, quantum, photosynthèse)",
          },
          limit: { type: "number", description: "Nombre de résultats (défaut 3, max 5)" },
        },
        required: ["query"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "get_space_launches",
      description:
        "Prochains lancements spatiaux dans le monde. Gratuit via Launch Library 2 API. Retourne mission, fusee, date, lieu.",
      parameters: {
        type: "object",
        properties: {
          limit: { type: "number", description: "Nombre de lancements (défaut 5, max 10)" },
        },
        required: [],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "validate_email",
      description:
        "Valide une adresse email: format, domaine MX, email jetable. Gratuit. Retourne validité + détails.",
      parameters: {
        type: "object",
        properties: {
          email: { type: "string", description: "Email à valider (ex: test@example.com)" },
        },
        required: ["email"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "generate_hash",
      description:
        "Génère un hash (MD5, SHA-1, SHA-256, SHA-512) pour un texte. Gratuit, local (crypto Node.js).",
      parameters: {
        type: "object",
        properties: {
          text: { type: "string", description: "Texte à hasher" },
          algorithm: {
            type: "string",
            description: "Algorithme: md5, sha1, sha256, sha512 (défaut sha256)",
          },
        },
        required: ["text"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "generate_uuid",
      description: "Génère un UUID v4 aléatoire. Gratuit, local (crypto Node.js).",
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
      name: "base64_encode_decode",
      description:
        "Encode ou décode en Base64. Gratuit, local. Utile pour inspecter des tokens JWT ou données encodées.",
      parameters: {
        type: "object",
        properties: {
          text: { type: "string", description: "Texte à encoder/décoder" },
          action: {
            type: "string",
            description: "encode ou decode (défaut encode)",
          },
        },
        required: ["text"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "explain_cron",
      description:
        "Explique une expression cron en français. Ex: '0 */3 * * *' = 'Toutes les 3 heures à minuit'. Gratuit, local.",
      parameters: {
        type: "object",
        properties: {
          expression: {
            type: "string",
            description: "Expression cron (ex: '0 9 * * 1-5' = chaque jour de semaine à 9h)",
          },
        },
        required: ["expression"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "generate_palette",
      description:
        "Génère une palette de couleurs harmonieuses à partir d'une couleur de base. Retourne 5 couleurs HEX complémentaires. Gratuit.",
      parameters: {
        type: "object",
        properties: {
          baseColor: {
            type: "string",
            description: "Couleur de base en HEX (ex: #3498db) ou nom (ex: blue, red)",
          },
        },
        required: ["baseColor"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "get_emoji_info",
      description:
        "Infos sur un emoji: nom Unicode, codepoints, catégorie, keywords. Gratuit via emoji-api.",
      parameters: {
        type: "object",
        properties: {
          emoji: { type: "string", description: "L'emoji à analyser (ex: 🎮, 🔥, ❤️)" },
        },
        required: ["emoji"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "get_minecraft_status",
      description:
        "Vérifie le statut d'un serveur Minecraft (Java Edition). Retourne joueurs en ligne, max, version, ping. Gratuit via mcsrvstat.us.",
      parameters: {
        type: "object",
        properties: {
          address: {
            type: "string",
            description: "Adresse du serveur (ex: play.hypixel.net ou 192.168.1.1:25565)",
          },
        },
        required: ["address"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "get_valorant_agents",
      description:
        "Liste les agents de Valorant avec leurs capacités. Gratuit via Valorant API. Retourne nom, rôle, capacités.",
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
      name: "get_lorem_ipsum",
      description:
        "Génère du texte Lorem Ipsum (placeholder). Utile pour des démos ou tests. Gratuit, local.",
      parameters: {
        type: "object",
        properties: {
          paragraphs: { type: "number", description: "Nombre de paragraphes (défaut 2, max 10)" },
        },
        required: [],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "get_twitch_clips",
      description:
        "Récupère les clips populaires d'un streamer Twitch. Gratuit via Twitch clips scraping. Retourne titre, URL, vues, durée.",
      parameters: {
        type: "object",
        properties: {
          channel: {
            type: "string",
            description: "Nom de la chaîne Twitch (ex: shroud, pokimane)",
          },
          limit: { type: "number", description: "Nombre de clips (défaut 5, max 10)" },
        },
        required: ["channel"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "get_producthunt_products",
      description:
        "Récupère les produits du jour sur Product Hunt. Gratuit via scraping. Retourne nom, tagline, URL, votes.",
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
      name: "get_github_gists",
      description:
        "Récupère les gists publics récents d'un utilisateur GitHub. Gratuit. Retourne description, URL, langage.",
      parameters: {
        type: "object",
        properties: {
          username: { type: "string", description: "Nom d'utilisateur GitHub" },
        },
        required: ["username"],
      },
    },
  },
  // ═══ New Tools (Part A) ═══
  {
    type: "function",
    function: {
      name: "getAirQuality",
      description:
        "Récupère la qualité de l'air (PM2.5, PM10, ozone, NO2, SO2, CO) pour une ville ou coordonnées via OpenAQ API v3. Gratuit, pas de clé. Complète get_weather_forecast.",
      parameters: {
        type: "object",
        properties: {
          city: { type: "string", description: "Nom de la ville (ex: Paris, Tokyo)" },
          lat: { type: "number", description: "Latitude (optionnel, alternative à city)" },
          lon: { type: "number", description: "Longitude (optionnel, alternative à city)" },
        },
        required: [],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "searchRawgGames",
      description:
        "Recherche des jeux vidéo dans la base RAWG (350k+ jeux). Retourne nom, note, plateformes, date de sortie. Complète search_igdb_games. Gratuit.",
      parameters: {
        type: "object",
        properties: {
          query: { type: "string", description: "Nom du jeu ou mot-clé (ex: 'Elden Ring')" },
          page_size: { type: "number", description: "Nombre de résultats (défaut 5, max 20)" },
        },
        required: ["query"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "follow_social",
      description:
        "Permet de suivre une chaîne ou un compte sur n'importe quelle plateforme sociale (Twitch, YouTube, Twitter/X, Instagram, TikTok, Facebook, Reddit, Bluesky, Mastodon, Kick, Telegram, Snapchat, LinkedIn, Pinterest, Dailymotion, Vimeo) pour recevoir des notifications quand le créateur poste du contenu ou passe en live. Demande à l'utilisateur s'il veut les notifications en MP ou dans un salon spécifique.",
      parameters: {
        type: "object",
        properties: {
          platform: {
            type: "string",
            enum: [
              "twitch",
              "youtube",
              "twitter",
              "instagram",
              "tiktok",
              "facebook",
              "reddit",
              "bluesky",
              "mastodon",
              "kick",
              "telegram",
              "snapchat",
              "linkedin",
              "pinterest",
              "dailymotion",
              "vimeo",
            ],
            description: "La plateforme sociale à suivre",
          },
          channel_name: {
            type: "string",
            description:
              "Le nom de la chaîne ou du compte (ex: shroud, MrBeast, elonmusk, charlidamelio, etc.)",
          },
          notify_mode: {
            type: "string",
            enum: ["channel", "dm"],
            description:
              "Mode de notification: 'channel' pour un salon Discord, 'dm' pour message privé",
          },
          channel_id: {
            type: "string",
            description:
              "ID du salon Discord pour les notifications (requis si notify_mode='channel')",
          },
        },
        required: ["platform", "channel_name", "notify_mode"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "unfollow_social",
      description:
        "Arrête de suivre une chaîne ou un compte sur n'importe quelle plateforme sociale.",
      parameters: {
        type: "object",
        properties: {
          platform: {
            type: "string",
            enum: [
              "twitch",
              "youtube",
              "twitter",
              "instagram",
              "tiktok",
              "facebook",
              "reddit",
              "bluesky",
              "mastodon",
              "kick",
              "telegram",
              "snapchat",
              "linkedin",
              "pinterest",
              "dailymotion",
              "vimeo",
            ],
            description: "La plateforme sociale",
          },
          channel_name: {
            type: "string",
            description: "Le nom de la chaîne ou du compte à ne plus suivre",
          },
        },
        required: ["platform", "channel_name"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "list_social_follows",
      description:
        "Liste toutes les chaînes Twitch, YouTube et comptes Twitter/X suivis sur ce serveur.",
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
      name: "define_word",
      description:
        "Définit n'importe quel mot dans n'importe quelle langue via le Wiktionnaire (gratuit, pas de clé). Utilise CET OUTIL automatiquement quand tu ne connais pas un mot, quand l'utilisateur demande la définition d'un mot, ou quand tu rencontres un terme inconnu dans un message. Supporte le français, anglais, espagnol, allemand, italien, et toutes les autres langues.",
      parameters: {
        type: "object",
        properties: {
          word: {
            type: "string",
            description: "Le mot à définir",
          },
          lang: {
            type: "string",
            description: "Code langue du Wiktionnaire (ex: fr, en, es, de, it). Défaut: fr",
          },
        },
        required: ["word"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "search_movies",
      description:
        "Recherche un film ou une série TV par titre. Retourne titre, date de sortie, note, synopsis, poster. Gratuit via TMDB. UTILISE-LE quand on demande un film, un acteur, une série.",
      parameters: {
        type: "object",
        properties: {
          query: { type: "string", description: "Titre du film ou série à rechercher" },
          type: {
            type: "string",
            enum: ["movie", "tv"],
            description: "movie ou tv. Défaut: movie",
          },
        },
        required: ["query"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "search_music",
      description:
        "Recherche un artiste, album, ou chanson. Retourne artiste, titre, album, date. Gratuit via MusicBrainz.",
      parameters: {
        type: "object",
        properties: {
          query: { type: "string", description: "Nom de l'artiste, album ou chanson" },
          type: {
            type: "string",
            enum: ["artist", "release", "recording"],
            description: "Type de recherche. Défaut: recording",
          },
        },
        required: ["query"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "search_stackoverflow",
      description:
        "Recherche des questions/réponses sur Stack Overflow. Retourne titre, lien, score, tags. Gratuit via StackExchange API.",
      parameters: {
        type: "object",
        properties: {
          query: { type: "string", description: "Question ou mot-clé technique" },
        },
        required: ["query"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "execute_code",
      description:
        "Exécute du code JavaScript dans un sandbox sécurisé (Node.js vm). Retourne stdout, résultat, erreurs. Comme Code Interpreter de ChatGPT. Pas d'accès au système de fichiers ni au réseau.",
      parameters: {
        type: "object",
        properties: {
          code: { type: "string", description: "Code JavaScript à exécuter" },
        },
        required: ["code"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "convert_units",
      description:
        "Convertit entre unités: longueur (m, km, cm, mm, mi, ft, in), poids (kg, g, lb, oz), température (C, F, K), volume (l, ml, gal, qt), vitesse (km/h, mph, m/s), données (B, KB, MB, GB, TB). Gratuit, local.",
      parameters: {
        type: "object",
        properties: {
          value: { type: "number", description: "Valeur à convertir" },
          from: { type: "string", description: "Unité source (ex: km, C, kg, MB)" },
          to: { type: "string", description: "Unité cible (ex: mi, F, lb, GB)" },
        },
        required: ["value", "from", "to"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "convert_timezone",
      description:
        "Convertit une heure d'un timezone à un autre. Ex: '14:00 Paris' → 'quelle heure à Tokyo?'. Gratuit, local.",
      parameters: {
        type: "object",
        properties: {
          time: { type: "string", description: "Heure au format HH:MM (24h) ou ISO datetime" },
          from_tz: { type: "string", description: "Timezone source (ex: Europe/Paris)" },
          to_tz: { type: "string", description: "Timezone cible (ex: Asia/Tokyo)" },
        },
        required: ["time", "from_tz", "to_tz"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "test_regex",
      description:
        "Teste une expression régulière contre un texte. Retourne les matches trouvés. Gratuit, local.",
      parameters: {
        type: "object",
        properties: {
          pattern: { type: "string", description: "Expression régulière à tester" },
          text: { type: "string", description: "Texte sur lequel tester la regex" },
          flags: { type: "string", description: "Flags regex (ex: gi, g, i). Défaut: g" },
        },
        required: ["pattern", "text"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "decode_jwt",
      description:
        "Décode un token JWT (header + payload) sans vérifier la signature. Gratuit, local.",
      parameters: {
        type: "object",
        properties: {
          token: { type: "string", description: "Token JWT à décoder" },
        },
        required: ["token"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "get_sports_scores",
      description: "Récupère les scores et résultats sportifs. Gratuit via TheSportsDB.",
      parameters: {
        type: "object",
        properties: {
          league: {
            type: "string",
            description: "Ligue (ex: EPL, NBA, ATP, NFL, NHL). Défaut: toutes",
          },
        },
        required: [],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "search_recipe",
      description:
        "Recherche une recette de cuisine par ingrédient ou nom. Retourne nom, instructions, ingrédients, image. Gratuit via TheMealDB.",
      parameters: {
        type: "object",
        properties: {
          query: { type: "string", description: "Nom du plat ou ingrédient" },
        },
        required: ["query"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "convert_color",
      description: "Convertit une couleur entre HEX, RGB, HSL. Gratuit, local.",
      parameters: {
        type: "object",
        properties: {
          color: {
            type: "string",
            description: "Couleur à convertir (ex: #ff5733, rgb(255,87,51), hsl(11,100%,60%))",
          },
        },
        required: ["color"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "convert_number_base",
      description:
        "Convertit un nombre entre binaire, décimal, hexadécimal, octal. Gratuit, local.",
      parameters: {
        type: "object",
        properties: {
          value: { type: "string", description: "Valeur à convertir" },
          from_base: {
            type: "string",
            enum: ["bin", "dec", "hex", "oct"],
            description: "Base source",
          },
          to_base: {
            type: "string",
            enum: ["bin", "dec", "hex", "oct"],
            description: "Base cible",
          },
        },
        required: ["value", "from_base", "to_base"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "convert_timestamp",
      description:
        "Convertit un timestamp Unix en date lisible, ou une date en timestamp. Gratuit, local.",
      parameters: {
        type: "object",
        properties: {
          value: {
            type: "string",
            description: "Timestamp Unix (ex: 1700000000) ou date ISO (ex: 2024-01-01)",
          },
          direction: {
            type: "string",
            enum: ["to_date", "to_timestamp"],
            description: "Sens de conversion",
          },
        },
        required: ["value", "direction"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "get_sun_moon_info",
      description:
        "Récupère les heures de lever/coucher du soleil pour une ville. Gratuit via Sunrise Sunset API.",
      parameters: {
        type: "object",
        properties: {
          city: { type: "string", description: "Nom de la ville" },
        },
        required: ["city"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "generate_ascii_art",
      description: "Génère un texte en ASCII art. Gratuit, local.",
      parameters: {
        type: "object",
        properties: {
          text: { type: "string", description: "Texte à convertir en ASCII art" },
          font: {
            type: "string",
            description: "Police (ex: Standard, Block, Banner, Big). Défaut: Standard",
          },
        },
        required: ["text"],
      },
    },
  },
];

export async function executeExtraTool(
  toolName: string,
  args: Record<string, unknown>,
  ctx: ToolContext,
): Promise<ToolCallResult | null> {
  try {
    switch (toolName) {
      case "get_hackernews_top":
        return await toolHackerNews(args);
      case "get_github_trending":
        return await toolGithubTrending(args);
      case "get_weather_forecast":
        return await toolWeatherForecast(args);
      case "get_crypto_top":
        return await toolCryptoTop();
      case "get_steam_requirements":
        return await toolSteamRequirements(args);
      case "get_discord_events":
        return await toolDiscordEvents(ctx);
      case "search_igdb_games":
        return await toolSearchIgdb(args);
      case "search_wikipedia":
        return await toolSearchWikipedia(args);
      case "get_space_launches":
        return await toolSpaceLaunches(args);
      case "validate_email":
        return await toolValidateEmail(args);
      case "generate_hash":
        return await toolGenerateHash(args);
      case "generate_uuid":
        return await toolGenerateUuid();
      case "base64_encode_decode":
        return await toolBase64(args);
      case "explain_cron":
        return await toolExplainCron(args);
      case "generate_palette":
        return await toolGeneratePalette(args);
      case "get_emoji_info":
        return await toolEmojiInfo(args);
      case "get_minecraft_status":
        return await toolMinecraftStatus(args);
      case "get_valorant_agents":
        return await toolValorantAgents();
      case "get_lorem_ipsum":
        return await toolLoremIpsum(args);
      case "get_twitch_clips":
        return await toolTwitchClips(args);
      case "get_producthunt_products":
        return await toolProductHunt();
      case "get_github_gists":
        return await toolGithubGists(args);
      // New Tools (Part A)
      case "getAirQuality":
        return await toolGetAirQuality(args);
      case "searchRawgGames":
        return await toolSearchRawgGames(args);
      case "follow_social":
        return await toolFollowSocial(args, ctx);
      case "unfollow_social":
        return await toolUnfollowSocial(args, ctx);
      case "list_social_follows":
        return await toolListSocialFollows(ctx);
      case "define_word":
        return await toolDefineWord(args);
      case "search_movies":
        return await toolSearchMovies(args);
      case "search_music":
        return await toolSearchMusic(args);
      case "search_stackoverflow":
        return await toolSearchStackOverflow(args);
      case "execute_code":
        return await toolExecuteCode(args);
      case "convert_units":
        return await toolConvertUnits(args);
      case "convert_timezone":
        return await toolConvertTimezone(args);
      case "test_regex":
        return await toolTestRegex(args);
      case "decode_jwt":
        return await toolDecodeJwt(args);
      case "get_sports_scores":
        return await toolGetSportsScores(args);
      case "search_recipe":
        return await toolSearchRecipe(args);
      case "convert_color":
        return await toolConvertColor(args);
      case "convert_number_base":
        return await toolConvertNumberBase(args);
      case "convert_timestamp":
        return await toolConvertTimestamp(args);
      case "get_sun_moon_info":
        return await toolGetSunMoonInfo(args);
      case "generate_ascii_art":
        return await toolGenerateAsciiArt(args);
      default:
        return null;
    }
  } catch (err) {
    logger.error(
      `[AgentToolsExtra] Erreur tool ${toolName}: ${err instanceof Error ? err.message : String(err)}`,
    );
    return {
      success: false,
      data: `Erreur: ${err instanceof Error ? err.message : String(err)}`,
    };
  }
}

// ─── Implementations ─────────────────────────────────────────────────────────

async function toolHackerNews(args: Record<string, unknown>): Promise<ToolCallResult> {
  const count = Math.min(10, Math.max(1, Number(args.count) || 5));
  const res = await fetch("https://hacker-news.firebaseio.com/v0/topstories.json", {
    signal: AbortSignal.timeout(10_000),
  });
  if (!res.ok) return { success: false, data: "Erreur Hacker News API" };
  const ids = (await res.json()) as number[];
  const topIds = ids.slice(0, count);
  const stories = await Promise.all(
    topIds.map(async (id) => {
      const r = await fetch(`https://hacker-news.firebaseio.com/v0/item/${id}.json`);
      return r.json();
    }),
  );
  const formatted = stories
    .map(
      (s: any) =>
        `**${s.title}**\n⬆️ ${s.score} | 💬 ${s.descendants || 0} | 🔗 ${s.url || "https://news.ycombinator.com/item?id=" + s.id}`,
    )
    .join("\n\n");
  return { success: true, data: formatted };
}

async function toolGithubTrending(args: Record<string, unknown>): Promise<ToolCallResult> {
  const since = (args.since as string) || "daily";
  const language = (args.language as string) || "";
  const url = `https://github.com/trending/${language}?since=${since}`;
  const res = await fetch(url, {
    headers: { "User-Agent": "Mozilla/5.0" },
    signal: AbortSignal.timeout(10_000),
  });
  if (!res.ok) return { success: false, data: "Erreur GitHub Trending" };
  const html = await res.text();
  const repos: string[] = [];
  const repoRegex = /<h2 class="h3 lh-condensed">[\s\S]*?<a href="\/([^"]+)"[\s\S]*?<\/h2>/g;
  let match;
  while (repos.length < 10 && (match = repoRegex.exec(html)) !== null) {
    repos.push(match[1]);
  }
  if (repos.length === 0)
    return { success: false, data: "Aucun repo trending trouvé (parsing échoué)" };
  const formatted = repos.map((r, i) => `${i + 1}. **${r}** — https://github.com/${r}`).join("\n");
  return { success: true, data: `Top repos GitHub (${since}):\n${formatted}` };
}

async function toolWeatherForecast(args: Record<string, unknown>): Promise<ToolCallResult> {
  const city = args.city as string;
  const geoRes = await fetch(
    `https://geocoding-api.open-meteo.com/v1/search?name=${encodeURIComponent(city)}&count=1&language=fr&format=json`,
    { signal: AbortSignal.timeout(10_000) },
  );
  if (!geoRes.ok) return { success: false, data: "Ville non trouvée" };
  const geo = (await geoRes.json()) as any;
  if (!geo.results || geo.results.length === 0)
    return { success: false, data: `Ville "${city}" non trouvée` };
  const { latitude, longitude, name, country } = geo.results[0];
  const weatherRes = await fetch(
    `https://api.open-meteo.com/v1/forecast?latitude=${latitude}&longitude=${longitude}&daily=temperature_2m_max,temperature_2m_min,precipitation_sum,windspeed_10m_max&timezone=auto&forecast_days=5`,
    { signal: AbortSignal.timeout(10_000) },
  );
  if (!weatherRes.ok) return { success: false, data: "Erreur météo API" };
  const w = (await weatherRes.json()) as any;
  const days = w.daily.time
    .map((date: string, i: number) => {
      const d = new Date(date).toLocaleDateString("fr-FR", { weekday: "short", day: "numeric" });
      return `📅 ${d}: 🌡️ ${w.daily.temperature_2m_min[i]}°C - ${w.daily.temperature_2m_max[i]}°C | 🌧️ ${w.daily.precipitation_sum[i]}mm | 💨 ${Math.round(w.daily.windspeed_10m_max[i])}km/h`;
    })
    .join("\n");
  return { success: true, data: `Prévision 5 jours pour **${name}, ${country}**:\n${days}` };
}

async function toolCryptoTop(): Promise<ToolCallResult> {
  const res = await fetch(
    "https://api.coingecko.com/api/v3/coins/markets?vs_currency=usd&order=market_cap_desc&per_page=10&page=1&sparkline=false",
    { signal: AbortSignal.timeout(10_000) },
  );
  if (!res.ok) return { success: false, data: "Erreur CoinGecko API" };
  const coins = (await res.json()) as any[];
  const formatted = coins
    .map(
      (c, i) =>
        `${i + 1}. **${c.name}** (${c.symbol.toUpperCase()}) — $${c.current_price.toLocaleString()} | 📊 ${c.price_change_percentage_24h?.toFixed(2)}% | Cap: $${(c.market_cap / 1e9).toFixed(1)}B`,
    )
    .join("\n");
  return { success: true, data: `Top 10 cryptos:\n${formatted}` };
}

async function toolSteamRequirements(args: Record<string, unknown>): Promise<ToolCallResult> {
  const appid = Number(args.appid);
  const res = await fetch(`https://store.steampowered.com/api/appdetails?appids=${appid}&l=fr`, {
    signal: AbortSignal.timeout(10_000),
  });
  if (!res.ok) return { success: false, data: "Erreur Steam API" };
  const data = (await res.json()) as any;
  const app = data[appid]?.data;
  if (!app) return { success: false, data: "Jeu non trouvé" };
  const reqs = app.pc_requirements || [];
  const formatted = reqs
    .map((r: any) => `**${r.title}**:\n${r.minimum || r.recommended || "N/A"}`)
    .join("\n\n");
  return {
    success: true,
    data: `Configuration requise pour **${app.name}**:\n${formatted || "Aucune config trouvée"}`,
  };
}

async function toolDiscordEvents(ctx: ToolContext): Promise<ToolCallResult> {
  const guildId = process.env.DISCORD_GUILD_ID || process.env.GUILD_ID || "";
  if (!guildId) return { success: false, data: "GUILD_ID non configuré" };
  const guild = ctx.client.guilds.cache.get(guildId);
  if (!guild) return { success: false, data: "Serveur introuvable" };
  const events = await guild.scheduledEvents.fetch().catch(() => null);
  if (!events || events.size === 0) return { success: true, data: "Aucun événement programmé" };
  const formatted = events
    .map((e, i) => {
      const date = e.scheduledStartAt?.toLocaleDateString("fr-FR", {
        day: "numeric",
        month: "long",
        hour: "2-digit",
        minute: "2-digit",
      });
      return `${i + 1}. **${e.name}**\n📅 ${date} | 👥 ${e.userCount || 0} intéressés\n${e.description?.slice(0, 200) || ""}`;
    })
    .join("\n\n");
  return { success: true, data: `Événements programmés (${events.size}):\n${formatted}` };
}

async function toolSearchIgdb(args: Record<string, unknown>): Promise<ToolCallResult> {
  const query = args.query as string;
  const limit = Math.min(10, Math.max(1, Number(args.limit) || 5));
  const clientId = process.env.IGDB_CLIENT_ID;
  const clientSecret = process.env.IGDB_CLIENT_SECRET;
  if (!clientId || !clientSecret)
    return { success: false, data: "IGDB non configuré (IGDB_CLIENT_ID/SECRET manquants)" };
  try {
    const tokenRes = await fetch(
      `https://id.twitch.tv/oauth2/token?client_id=${clientId}&client_secret=${clientSecret}&grant_type=client_credentials`,
      { method: "POST", signal: AbortSignal.timeout(10_000) },
    );
    if (!tokenRes.ok) return { success: false, data: "Erreur token IGDB" };
    const token = (await tokenRes.json()) as any;
    const res = await fetch("https://api.igdb.com/v4/games", {
      method: "POST",
      headers: {
        "Client-ID": clientId,
        Authorization: `Bearer ${token.access_token}`,
        "Content-Type": "text/plain",
      },
      body: `fields name,first_release_date,platforms.name,genres.name,rating,summary; search "${query}"; limit ${limit};`,
      signal: AbortSignal.timeout(10_000),
    });
    if (!res.ok) return { success: false, data: "Erreur recherche IGDB" };
    const games = (await res.json()) as any[];
    if (games.length === 0) return { success: true, data: `Aucun jeu trouvé pour "${query}"` };
    const formatted = games
      .map((g, i) => {
        const date = g.first_release_date
          ? new Date(g.first_release_date * 1000).toLocaleDateString("fr-FR")
          : "TBA";
        const platforms = g.platforms?.map((p: any) => p.name).join(", ") || "N/A";
        const genres = g.genres?.map((g2: any) => g2.name).join(", ") || "N/A";
        const rating = g.rating ? `⭐ ${Math.round(g.rating)}/100` : "";
        return `${i + 1}. **${g.name}** — 📅 ${date} | 🎮 ${platforms} | 🏷️ ${genres} ${rating}`;
      })
      .join("\n\n");
    return { success: true, data: `Résultats IGDB pour "${query}":\n${formatted}` };
  } catch (err) {
    return {
      success: false,
      data: `Erreur IGDB: ${err instanceof Error ? err.message : String(err)}`,
    };
  }
}

async function toolSearchWikipedia(args: Record<string, unknown>): Promise<ToolCallResult> {
  const query = args.query as string;
  const limit = Math.min(5, Math.max(1, Number(args.limit) || 3));
  const res = await fetch(
    `https://fr.wikipedia.org/w/api.php?action=query&format=json&list=search&srlimit=${limit}&srsearch=${encodeURIComponent(query)}&utf8=1`,
    { signal: AbortSignal.timeout(10_000) },
  );
  if (!res.ok) return { success: false, data: "Erreur Wikipedia API" };
  const data = (await res.json()) as any;
  const results = data.query?.search || [];
  if (results.length === 0)
    return { success: true, data: `Aucun article Wikipedia pour "${query}"` };
  const formatted = results
    .map((r: any, i: number) => {
      const url = `https://fr.wikipedia.org/wiki/${encodeURIComponent(r.title.replace(/ /g, "_"))}`;
      const snippet = r.snippet?.replace(/<[^>]+>/g, "").slice(0, 200) || "";
      return `${i + 1}. **[${r.title}](${url})**\n${snippet}...`;
    })
    .join("\n\n");
  return { success: true, data: `Articles Wikipedia pour "${query}":\n${formatted}` };
}

async function toolSpaceLaunches(args: Record<string, unknown>): Promise<ToolCallResult> {
  const limit = Math.min(10, Math.max(1, Number(args.limit) || 5));
  const res = await fetch(
    `https://ll.thespacedevs.com/2.2.0/launch/upcoming/?limit=${limit}&format=json`,
    { signal: AbortSignal.timeout(10_000) },
  );
  if (!res.ok) return { success: false, data: "Erreur Launch Library API" };
  const data = (await res.json()) as any;
  const launches = data.results || [];
  if (launches.length === 0) return { success: true, data: "Aucun lancement à venir" };
  const formatted = launches
    .map((l: any, i: number) => {
      const date = new Date(l.net).toLocaleDateString("fr-FR", {
        day: "numeric",
        month: "long",
        hour: "2-digit",
        minute: "2-digit",
      });
      const mission = l.mission?.name || l.name || "N/A";
      const rocket = l.rocket?.configuration?.full_name || "N/A";
      const pad = l.pad?.location?.name || "N/A";
      return `${i + 1}. **${mission}**\n🚀 ${rocket} | 📅 ${date} | 📍 ${pad}`;
    })
    .join("\n\n");
  return { success: true, data: `Prochains lancements spatiaux:\n${formatted}` };
}

async function toolValidateEmail(args: Record<string, unknown>): Promise<ToolCallResult> {
  const email = args.email as string;
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  if (!emailRegex.test(email)) return { success: true, data: `❌ Format invalide: ${email}` };
  const domain = email.split("@")[1];
  const dnsRes = await fetch(`https://dns.google/resolve?name=${domain}&type=MX`, {
    signal: AbortSignal.timeout(5_000),
  });
  if (!dnsRes.ok)
    return { success: true, data: `✅ Format valide mais impossible de vérifier le domaine` };
  const dnsData = (await dnsRes.json()) as any;
  const hasMx = dnsData.Answer && dnsData.Answer.length > 0;
  const disposableDomains = [
    "mailinator.com",
    "tempmail.com",
    "guerrillamail.com",
    "10minutemail.com",
    "yopmail.com",
  ];
  const isDisposable = disposableDomains.includes(domain.toLowerCase());
  return {
    success: true,
    data: `Email: ${email}\n✅ Format valide\n${hasMx ? "✅ Domaine MX valide" : "❌ Pas d'enregistrement MX"}\n${isDisposable ? "⚠️ Email jetable détecté" : "✅ Pas un email jetable connu"}`,
  };
}

async function toolGenerateHash(args: Record<string, unknown>): Promise<ToolCallResult> {
  const text = args.text as string;
  const algorithm = ((args.algorithm as string) || "sha256").toLowerCase();
  const crypto = await import("crypto");
  const validAlgos = ["md5", "sha1", "sha256", "sha512"];
  if (!validAlgos.includes(algorithm))
    return { success: false, data: `Algorithme invalide. Valides: ${validAlgos.join(", ")}` };
  const hash = crypto.createHash(algorithm).update(text).digest("hex");
  return { success: true, data: `${algorithm.toUpperCase()}("${text}") = ${hash}` };
}

async function toolGenerateUuid(): Promise<ToolCallResult> {
  const crypto = await import("crypto");
  const uuid = crypto.randomUUID();
  return { success: true, data: `UUID v4: ${uuid}` };
}

async function toolBase64(args: Record<string, unknown>): Promise<ToolCallResult> {
  const text = args.text as string;
  const action = ((args.action as string) || "encode").toLowerCase();
  try {
    if (action === "decode") {
      const decoded = Buffer.from(text, "base64").toString("utf-8");
      return { success: true, data: `Décodé: ${decoded}` };
    } else {
      const encoded = Buffer.from(text, "utf-8").toString("base64");
      return { success: true, data: `Encodé: ${encoded}` };
    }
  } catch {
    return { success: false, data: "Erreur d'encodage/décodage Base64" };
  }
}

async function toolExplainCron(args: Record<string, unknown>): Promise<ToolCallResult> {
  const expr = args.expression as string;
  const parts = expr.trim().split(/\s+/);
  if (parts.length !== 5)
    return {
      success: false,
      data: "Expression cron invalide (5 champs requis: min hour day month weekday)",
    };
  const [min, hour, day, month, weekday] = parts;
  const explanations: string[] = [];
  const descField = (val: string, unit: string, names?: string[]) => {
    if (val === "*") return `chaque ${unit}`;
    if (val.startsWith("*/")) return `toutes les ${val.slice(2)} ${unit}s`;
    if (val.includes(",")) return `${unit}s: ${val}`;
    if (val.includes("-")) return `${unit}s de ${val}`;
    if (names && /^\d+$/.test(val)) return `${unit} ${names[parseInt(val) - 1] || val}`;
    return `${unit} ${val}`;
  };
  const dayNames = ["lundi", "mardi", "mercredi", "jeudi", "vendredi", "samedi", "dimanche"];
  explanations.push(`Minute: ${descField(min, "minute")}`);
  explanations.push(`Heure: ${descField(hour, "heure")}`);
  explanations.push(`Jour du mois: ${descField(day, "jour")}`);
  explanations.push(`Mois: ${descField(month, "mois")}`);
  explanations.push(`Jour de la semaine: ${descField(weekday, "jour", dayNames)}`);
  return { success: true, data: `Expression cron: \`${expr}\`\n${explanations.join("\n")}` };
}

async function toolGeneratePalette(args: Record<string, unknown>): Promise<ToolCallResult> {
  const baseColor = (args.baseColor as string).replace("#", "");
  const r = parseInt(baseColor.substring(0, 2), 16) || 0;
  const g = parseInt(baseColor.substring(2, 4), 16) || 0;
  const b = parseInt(baseColor.substring(4, 6), 16) || 0;
  const toHex = (n: number) =>
    Math.max(0, Math.min(255, Math.round(n)))
      .toString(16)
      .padStart(2, "0");
  const palette = [
    `#${toHex(r * 0.7)}${toHex(g * 0.7)}${toHex(b * 0.7)}`,
    `#${toHex(r * 0.85)}${toHex(g * 0.85)}${toHex(b * 0.85)}`,
    `#${baseColor}`,
    `#${toHex(255 - r)}${toHex(255 - g)}${toHex(255 - b)}`,
    `#${toHex(r * 1.3)}${toHex(g * 1.3)}${toHex(b * 1.3)}`,
  ];
  return {
    success: true,
    data: `Palette depuis #${baseColor}:\n${palette.map((c, i) => `${i + 1}. ${c}`).join("\n")}`,
  };
}

async function toolEmojiInfo(args: Record<string, unknown>): Promise<ToolCallResult> {
  const emoji = args.emoji as string;
  const codePoints = [...emoji]
    .map((c) => `U+${c.codePointAt(0)?.toString(16).toUpperCase()}`)
    .join(" ");
  return {
    success: true,
    data: `Emoji: ${emoji}\nCodepoints: ${codePoints}\nHTML: ${[...emoji].map((c) => `&#${c.codePointAt(0)};`).join("")}`,
  };
}

async function toolMinecraftStatus(args: Record<string, unknown>): Promise<ToolCallResult> {
  const address = args.address as string;
  const res = await fetch(`https://api.mcsrvstat.us/3/${encodeURIComponent(address)}`, {
    signal: AbortSignal.timeout(10_000),
  });
  if (!res.ok) return { success: false, data: "Erreur API mcsrvstat" };
  const data = (await res.json()) as any;
  if (!data.online) return { success: true, data: `❌ Serveur ${address} hors ligne` };
  const players = `${data.players?.online || 0}/${data.players?.max || 0}`;
  const version = data.version || "Inconnue";
  const motd = data.motd?.clean?.join("\n") || "N/A";
  return {
    success: true,
    data: `✅ Serveur **${address}** en ligne\n👥 Joueurs: ${players}\n📦 Version: ${version}\n📝 MOTD: ${motd}`,
  };
}

async function toolValorantAgents(): Promise<ToolCallResult> {
  const res = await fetch(
    "https://valorant-api.com/v1/agents?isPlayableCharacter=true&language=fr-FR",
    {
      signal: AbortSignal.timeout(10_000),
    },
  );
  if (!res.ok) return { success: false, data: "Erreur Valorant API" };
  const data = (await res.json()) as any;
  const agents = data.data || [];
  const formatted = agents
    .map(
      (a: any) =>
        `**${a.displayName}** (${a.role?.displayName || "N/A"}) — ${a.description?.slice(0, 100) || ""}`,
    )
    .join("\n");
  return { success: true, data: `Agents Valorant (${agents.length}):\n${formatted}` };
}

async function toolLoremIpsum(args: Record<string, unknown>): Promise<ToolCallResult> {
  const paragraphs = Math.min(10, Math.max(1, Number(args.paragraphs) || 2));
  const words =
    "lorem ipsum dolor sit amet consectetur adipiscing elit sed do eiusmod tempor incididunt ut labore et dolore magna aliqua ut enim ad minim veniam quis nostrud exercitation ullamco laboris nisi ut aliquip ex ea commodo consequat duis aute irure dolor in reprehenderit in voluptate velit esse cillum dolore eu fugiat nulla pariatur excepteur sint occaecat cupidatat non proident sunt in culpa qui officia deserunt mollit anim id est laborum".split(
      " ",
    );
  const generateParagraph = () => {
    const sentences = 4 + Math.floor(Math.random() * 3);
    const parts: string[] = [];
    for (let i = 0; i < sentences; i++) {
      const wordCount = 8 + Math.floor(Math.random() * 10);
      const wordsSlice = Array.from(
        { length: wordCount },
        () => words[Math.floor(Math.random() * words.length)],
      );
      wordsSlice[0] = wordsSlice[0].charAt(0).toUpperCase() + wordsSlice[0].slice(1);
      parts.push(wordsSlice.join(" ") + ".");
    }
    return parts.join(" ");
  };
  const text = Array.from({ length: paragraphs }, generateParagraph).join("\n\n");
  return { success: true, data: text };
}

async function toolTwitchClips(args: Record<string, unknown>): Promise<ToolCallResult> {
  const channel = args.channel as string;
  const limit = Math.min(10, Math.max(1, Number(args.limit) || 5));
  const res = await fetch(
    `https://twitchtracker.com/api/channels/${channel}/clips?limit=${limit}`,
    {
      headers: { "User-Agent": "Mozilla/5.0" },
      signal: AbortSignal.timeout(10_000),
    },
  );
  if (!res.ok)
    return { success: false, data: "Erreur Twitch clips (le scraping peut être bloqué)" };
  const clips = (await res.json()) as any[];
  if (!clips || clips.length === 0)
    return { success: false, data: `Aucun clip trouvé pour ${channel}` };
  const formatted = clips
    .map(
      (c: any, i: number) =>
        `${i + 1}. **${c.title || c.clipTitle || "Sans titre"}**\n👀 ${c.views || c.viewCount || "?"} vues | 🔗 https://clips.twitch.tv/${c.clipId || c.id}`,
    )
    .join("\n\n");
  return { success: true, data: `Clips de ${channel}:\n${formatted}` };
}

async function toolProductHunt(): Promise<ToolCallResult> {
  const res = await fetch("https://www.producthunt.com/", {
    headers: { "User-Agent": "Mozilla/5.0" },
    signal: AbortSignal.timeout(10_000),
  });
  if (!res.ok) return { success: false, data: "Erreur Product Hunt (scraping bloqué)" };
  return {
    success: true,
    data: "Product Hunt scraping nécessite un navigateur headless. Utilise fetchAndSummarize avec https://www.producthunt.com/ à la place.",
  };
}

async function toolGithubGists(args: Record<string, unknown>): Promise<ToolCallResult> {
  const username = args.username as string;
  const res = await fetch(`https://api.github.com/users/${username}/gists?per_page=5`, {
    headers: {
      Accept: "application/vnd.github.v3+json",
      "User-Agent": "DiscordBot/1.0",
    },
    signal: AbortSignal.timeout(10_000),
  });
  if (!res.ok) return { success: false, data: "Erreur GitHub API" };
  const gists = (await res.json()) as any[];
  if (gists.length === 0) return { success: true, data: `Aucun gist public pour ${username}` };
  const formatted = gists
    .map((g: any, i: number) => {
      const files = Object.keys(g.files || {}).join(", ");
      return `${i + 1}. **${g.description || "Sans description"}**\n📁 ${files} | 🔗 ${g.html_url}`;
    })
    .join("\n\n");
  return { success: true, data: `Gists de ${username}:\n${formatted}` };
}

// ─── New Tools (Part A) ──────────────────────────────────────────────────────

async function toolGetAirQuality(args: Record<string, unknown>): Promise<ToolCallResult> {
  const city = String(args.city || "").trim();
  const lat = args.lat as number | undefined;
  const lon = args.lon as number | undefined;

  if (!city && (lat === undefined || lon === undefined)) {
    return {
      success: false,
      data: "Fournis soit 'city' (nom de ville) soit 'lat' + 'lon' (coordonnées).",
    };
  }

  try {
    // OpenAQ API v3 — free, no API key required
    let url: string;
    if (city) {
      // Geocode city name first via OpenAQ cities endpoint
      const geoUrl = `https://api.openaq.org/v3/cities?limit=1&q=${encodeURIComponent(city)}`;
      const geoRes = await fetch(geoUrl, { signal: AbortSignal.timeout(10_000) });
      if (!geoRes.ok)
        return { success: false, data: `OpenAQ geocoding erreur HTTP ${geoRes.status}` };
      const geoData = (await geoRes.json()) as {
        results?: Array<{
          id?: number;
          name?: string;
          country?: string;
          coordinates?: { latitude?: number; longitude?: number };
        }>;
      };
      const cityData = geoData.results?.[0];
      if (!cityData) return { success: false, data: `Ville "${city}" non trouvée dans OpenAQ.` };

      // Search for latest measurements near this city
      url = `https://api.openaq.org/v3/measurements?limit=10&sort=desc&order_by=datetime&city=${encodeURIComponent(city)}`;
    } else {
      url = `https://api.openaq.org/v3/measurements?limit=10&sort=desc&order_by=datetime&coordinates=${lat},${lon}&radius=25000`;
    }

    const res = await fetch(url, { signal: AbortSignal.timeout(15_000) });
    if (!res.ok) return { success: false, data: `OpenAQ erreur HTTP ${res.status}` };

    const data = (await res.json()) as {
      results?: Array<{
        parameter?: string;
        value?: number;
        unit?: string;
        location?: string;
        date?: { utc?: string };
        country?: string;
      }>;
    };
    const measurements = data.results || [];

    if (measurements.length === 0) {
      return {
        success: true,
        data: `Aucune mesure de qualité de l'air disponible pour ${city || `(${lat}, ${lon})`}.`,
      };
    }

    const lines = measurements.map((m) => {
      const date = m.date?.utc ? new Date(m.date.utc).toLocaleDateString("fr-FR") : "?";
      return `- **${m.parameter?.toUpperCase()}**: ${m.value} ${m.unit} (${m.location}, ${date})`;
    });

    return {
      success: true,
      data: `🌬️ **Qualité de l'air — ${city || `(${lat}, ${lon})`}**\n\n${lines.join("\n")}`,
    };
  } catch (err) {
    return {
      success: false,
      data: `Erreur OpenAQ: ${err instanceof Error ? err.message : String(err)}`,
    };
  }
}

async function toolSearchRawgGames(args: Record<string, unknown>): Promise<ToolCallResult> {
  const query = String(args.query || "").trim();

  if (!query) {
    return { success: false, data: "Requête vide. Ex: 'Elden Ring', 'The Witcher'" };
  }

  try {
    const client = new RawgClient();
    const game = await client.searchByTitle(query);

    if (!game) {
      return { success: true, data: `Aucun jeu trouvé pour "${query}" sur RAWG.` };
    }

    const rating = (game as unknown as Record<string, unknown>).rating ?? "N/A";
    const released = (game as unknown as Record<string, unknown>).released ?? "N/A";
    const name = (game as unknown as Record<string, unknown>).name ?? "Unknown";
    const bgImage = (game as unknown as Record<string, unknown>).background_image as string | null;

    let report = `🎮 **${name}**\n`;
    report += `⭐ Note: ${rating} | 📅 Sortie: ${released}\n`;
    if (bgImage) report += `🖼️ Image: ${bgImage}\n`;
    const nameStr = String(name);
    report += `🔗 https://rawg.io/games/${encodeURIComponent(nameStr.toLowerCase().replace(/\s+/g, "-"))}`;

    return { success: true, data: report };
  } catch (err) {
    return {
      success: false,
      data: `Erreur RAWG: ${err instanceof Error ? err.message : String(err)}`,
    };
  }
}

// ─── Social Follow Tools ─────────────────────────────────────────────────────

async function toolFollowSocial(
  args: Record<string, unknown>,
  ctx: ToolContext,
): Promise<ToolCallResult> {
  const platform = args.platform as string;
  const channelName = args.channel_name as string;
  const notifyMode = args.notify_mode as string;
  const channelId = args.channel_id as string | undefined;

  if (!platform || !channelName) {
    return { success: false, data: "Paramètres manquants: platform et channel_name requis" };
  }

  const validPlatforms = [
    "twitch",
    "youtube",
    "twitter",
    "instagram",
    "tiktok",
    "facebook",
    "reddit",
    "bluesky",
    "mastodon",
    "kick",
    "telegram",
    "snapchat",
    "linkedin",
    "pinterest",
    "dailymotion",
    "vimeo",
  ];
  if (!validPlatforms.includes(platform)) {
    return {
      success: false,
      data: `Plateforme invalide: ${platform}. Plateformes supportées: ${validPlatforms.join(", ")}`,
    };
  }

  if (notifyMode === "channel" && !channelId) {
    return {
      success: false,
      data: "channel_id requis quand notify_mode='channel'. Demande à l'utilisateur dans quel salon il veut les notifications.",
    };
  }

  const { addSocialFollow } = await import("./socialFollow.js");
  const result = await addSocialFollow({
    guildId: ctx.message.guildId!,
    platform: platform as
      | "twitch"
      | "youtube"
      | "twitter"
      | "instagram"
      | "tiktok"
      | "facebook"
      | "reddit"
      | "bluesky"
      | "mastodon"
      | "kick"
      | "telegram"
      | "snapchat"
      | "linkedin"
      | "pinterest"
      | "dailymotion"
      | "vimeo",
    channelName,
    notifyMode: notifyMode as "channel" | "dm",
    notifyChannel: notifyMode === "channel" ? channelId! : null,
    notifyUserId: notifyMode === "dm" ? ctx.message.author.id : null,
    addedBy: ctx.message.author.id,
  });

  return { success: result.success, data: result.message };
}

async function toolUnfollowSocial(
  args: Record<string, unknown>,
  ctx: ToolContext,
): Promise<ToolCallResult> {
  const platform = args.platform as string;
  const channelName = args.channel_name as string;

  if (!platform || !channelName) {
    return { success: false, data: "Paramètres manquants: platform et channel_name requis" };
  }

  const { removeSocialFollow } = await import("./socialFollow.js");
  const result = await removeSocialFollow(
    ctx.message.guildId!,
    platform as
      | "twitch"
      | "youtube"
      | "twitter"
      | "instagram"
      | "tiktok"
      | "facebook"
      | "reddit"
      | "bluesky"
      | "mastodon"
      | "kick"
      | "telegram"
      | "snapchat"
      | "linkedin"
      | "pinterest"
      | "dailymotion"
      | "vimeo",
    channelName,
  );

  return { success: result.success, data: result.message };
}

async function toolListSocialFollows(ctx: ToolContext): Promise<ToolCallResult> {
  const { listSocialFollows } = await import("./socialFollow.js");
  const follows = await listSocialFollows(ctx.message.guildId!);

  if (follows.length === 0) {
    return { success: true, data: "Aucune chaîne suivie. Utilisez follow_social pour en ajouter." };
  }

  const platformEmoji: Record<string, string> = {
    twitch: "🟣",
    youtube: "🔴",
    twitter: "🔵",
  };

  const formatted = follows
    .map((f) => {
      const emoji = platformEmoji[f.platform] || "📡";
      const status = f.isLive ? "🔴 LIVE" : "⚫ Offline";
      const dest = f.notifyMode === "dm" ? "MP" : `<#${f.notifyChannel}>`;
      return `${emoji} **${f.channelName}** (${f.platform}) — ${status} → ${dest}`;
    })
    .join("\n");

  return { success: true, data: `Chaînes suivies (${follows.length}):\n${formatted}` };
}

// ─── Dictionary Tool (Wiktionary — free, all languages) ─────────────────────

async function toolDefineWord(args: Record<string, unknown>): Promise<ToolCallResult> {
  const word = String(args.word || "").trim();
  const lang = String(args.lang || "fr")
    .trim()
    .toLowerCase();

  if (!word) {
    return { success: false, data: "Paramètre manquant: word requis" };
  }

  const results: string[] = [];

  // 1. Wiktionary API (REST) — definitions in the specified language
  try {
    const wikiUrl = `https://${lang}.wiktionary.org/api/rest_v1/page/definition/${encodeURIComponent(word)}`;
    const res = await fetch(wikiUrl, {
      signal: AbortSignal.timeout(10_000),
      headers: { "User-Agent": "DiscordBot/1.0 (educational)" },
    });
    if (res.ok) {
      const data = (await res.json()) as {
        language?: string;
        definitions?: Array<{
          partOfSpeech?: string;
          text?: string[];
        }>;
      };
      if (data.definitions && data.definitions.length > 0) {
        results.push(`📖 **${word}** (${lang}) — Wiktionnaire`);
        for (const def of data.definitions.slice(0, 4)) {
          const pos = def.partOfSpeech ? `*${def.partOfSpeech}*` : "";
          const text = (def.text || [])
            .join(" ")
            .replace(/<[^>]+>/g, "")
            .slice(0, 300);
          if (text) {
            results.push(`${pos} ${text}`.trim());
          }
        }
      }
    }
  } catch {
    // Continue to fallback
  }

  // 2. Fallback: English Wiktionary if the lang-specific one failed
  if (results.length === 0 && lang !== "en") {
    try {
      const enUrl = `https://en.wiktionary.org/api/rest_v1/page/definition/${encodeURIComponent(word)}`;
      const res = await fetch(enUrl, {
        signal: AbortSignal.timeout(10_000),
        headers: { "User-Agent": "DiscordBot/1.0 (educational)" },
      });
      if (res.ok) {
        const data = (await res.json()) as {
          definitions?: Array<{
            partOfSpeech?: string;
            text?: string[];
          }>;
        };
        if (data.definitions && data.definitions.length > 0) {
          results.push(`📖 **${word}** (en) — Wiktionary`);
          for (const def of data.definitions.slice(0, 3)) {
            const pos = def.partOfSpeech ? `*${def.partOfSpeech}*` : "";
            const text = (def.text || [])
              .join(" ")
              .replace(/<[^>]+>/g, "")
              .slice(0, 300);
            if (text) {
              results.push(`${pos} ${text}`.trim());
            }
          }
        }
      }
    } catch {
      // Continue
    }
  }

  // 3. Fallback: French Wiktionary if still nothing
  if (results.length === 0 && lang !== "fr") {
    try {
      const frUrl = `https://fr.wiktionary.org/api/rest_v1/page/definition/${encodeURIComponent(word)}`;
      const res = await fetch(frUrl, {
        signal: AbortSignal.timeout(10_000),
        headers: { "User-Agent": "DiscordBot/1.0 (educational)" },
      });
      if (res.ok) {
        const data = (await res.json()) as {
          definitions?: Array<{
            partOfSpeech?: string;
            text?: string[];
          }>;
        };
        if (data.definitions && data.definitions.length > 0) {
          results.push(`📖 **${word}** (fr) — Wiktionnaire`);
          for (const def of data.definitions.slice(0, 3)) {
            const pos = def.partOfSpeech ? `*${def.partOfSpeech}*` : "";
            const text = (def.text || [])
              .join(" ")
              .replace(/<[^>]+>/g, "")
              .slice(0, 300);
            if (text) {
              results.push(`${pos} ${text}`.trim());
            }
          }
        }
      }
    } catch {
      // Continue
    }
  }

  // 4. Final fallback: Wikipedia summary
  if (results.length === 0) {
    try {
      const wikiUrl = `https://${lang}.wikipedia.org/api/rest_v1/page/summary/${encodeURIComponent(word)}`;
      const res = await fetch(wikiUrl, {
        signal: AbortSignal.timeout(10_000),
        headers: { "User-Agent": "DiscordBot/1.0 (educational)" },
      });
      if (res.ok) {
        const data = (await res.json()) as {
          title?: string;
          extract?: string;
          content_urls?: { desktop?: { page?: string } };
        };
        if (data.extract) {
          results.push(`📖 **${data.title || word}** — Wikipedia (${lang})`);
          results.push(data.extract.slice(0, 400));
          if (data.content_urls?.desktop?.page) {
            results.push(`🔗 ${data.content_urls.desktop.page}`);
          }
        }
      }
    } catch {
      // Continue
    }
  }

  if (results.length === 0) {
    return {
      success: false,
      data: `Aucune définition trouvée pour "${word}" dans la langue "${lang}". Essayez une autre orthographe ou langue.`,
    };
  }

  return { success: true, data: results.join("\n") };
}

// ─── TMDB Movie/TV Search ────────────────────────────────────────────────────

async function toolSearchMovies(args: Record<string, unknown>): Promise<ToolCallResult> {
  const query = String(args.query || "").trim();
  const type = String(args.type || "movie").trim();
  if (!query) return { success: false, data: "Paramètre manquant: query" };

  try {
    const url = `https://api.themoviedb.org/3/search/${type}?query=${encodeURIComponent(query)}&language=fr-FR&api_key=8265bd1679663a7ea12ac168da84d2dd`;
    const res = await fetch(url, { signal: AbortSignal.timeout(10_000) });
    if (!res.ok) return { success: false, data: `TMDB error: ${res.status}` };
    const data = (await res.json()) as {
      results?: Array<{
        id: number;
        title?: string;
        name?: string;
        overview?: string;
        release_date?: string;
        first_air_date?: string;
        vote_average?: number;
        poster_path?: string;
      }>;
    };
    const results = (data.results || []).slice(0, 5);
    if (results.length === 0) return { success: false, data: `Aucun résultat pour "${query}"` };
    const formatted = results
      .map((r) => {
        const title = r.title || r.name || "N/A";
        const date = r.release_date || r.first_air_date || "N/A";
        const note = r.vote_average ? `⭐ ${r.vote_average}/10` : "";
        const poster = r.poster_path ? `https://image.tmdb.org/t/p/w200${r.poster_path}` : "";
        const overview = (r.overview || "").slice(0, 200);
        return `🎬 **${title}** (${date}) ${note}\n${overview}${poster ? `\n🖼️ ${poster}` : ""}`;
      })
      .join("\n\n");
    return { success: true, data: formatted };
  } catch (err) {
    return { success: false, data: `Erreur TMDB: ${err}` };
  }
}

// ─── MusicBrainz Search ──────────────────────────────────────────────────────

async function toolSearchMusic(args: Record<string, unknown>): Promise<ToolCallResult> {
  const query = String(args.query || "").trim();
  const type = String(args.type || "recording").trim();
  if (!query) return { success: false, data: "Paramètre manquant: query" };

  try {
    const url = `https://musicbrainz.org/ws/2/${type}?query=${encodeURIComponent(query)}&limit=5&fmt=json`;
    const res = await fetch(url, {
      signal: AbortSignal.timeout(10_000),
      headers: { "User-Agent": "DiscordBot/1.0 (educational)" },
    });
    if (!res.ok) return { success: false, data: `MusicBrainz error: ${res.status}` };
    const data = (await res.json()) as {
      recordings?: Array<{ title: string; artist?: string; release?: string; date?: string }>;
      artists?: Array<{ name: string; type?: string; country?: string; disambiguation?: string }>;
      releases?: Array<{ title: string; artist?: string; date?: string; track_count?: number }>;
    };
    if (type === "artist" && data.artists) {
      const formatted = data.artists
        .slice(0, 5)
        .map(
          (a) =>
            `🎤 **${a.name}**${a.disambiguation ? ` (${a.disambiguation})` : ""}${a.country ? ` — ${a.country}` : ""}${a.type ? ` [${a.type}]` : ""}`,
        )
        .join("\n");
      return { success: true, data: formatted || "Aucun artiste trouvé" };
    }
    if (type === "release" && data.releases) {
      const formatted = data.releases
        .slice(0, 5)
        .map(
          (r) =>
            `💿 **${r.title}**${r.artist ? ` — ${r.artist}` : ""}${r.date ? ` (${r.date})` : ""}${r.track_count ? ` ${r.track_count} pistes` : ""}`,
        )
        .join("\n");
      return { success: true, data: formatted || "Aucun album trouvé" };
    }
    if (data.recordings) {
      const formatted = data.recordings
        .slice(0, 5)
        .map(
          (r) =>
            `🎵 **${r.title}**${r.artist ? ` — ${r.artist}` : ""}${r.release ? ` (${r.release})` : ""}${r.date ? ` ${r.date}` : ""}`,
        )
        .join("\n");
      return { success: true, data: formatted || "Aucune chanson trouvée" };
    }
    return { success: false, data: "Aucun résultat" };
  } catch (err) {
    return { success: false, data: `Erreur MusicBrainz: ${err}` };
  }
}

// ─── Stack Overflow Search ───────────────────────────────────────────────────

async function toolSearchStackOverflow(args: Record<string, unknown>): Promise<ToolCallResult> {
  const query = String(args.query || "").trim();
  if (!query) return { success: false, data: "Paramètre manquant: query" };

  try {
    const url = `https://api.stackexchange.com/2.3/search/advanced?order=desc&sort=relevance&q=${encodeURIComponent(query)}&site=stackoverflow&pagesize=5&filter=withbody`;
    const res = await fetch(url, { signal: AbortSignal.timeout(10_000) });
    if (!res.ok) return { success: false, data: `StackExchange error: ${res.status}` };
    const data = (await res.json()) as {
      items?: Array<{
        title: string;
        link: string;
        score: number;
        tags?: string[];
        body_markdown?: string;
        is_answered: boolean;
      }>;
    };
    const items = (data.items || []).slice(0, 5);
    if (items.length === 0) return { success: false, data: "Aucune question trouvée" };
    const formatted = items
      .map((i) => {
        const tags = i.tags?.length ? ` [${i.tags.slice(0, 3).join(", ")}]` : "";
        const answered = i.is_answered ? "✅" : "❌";
        const body = (i.body_markdown || "").replace(/<[^>]+>/g, "").slice(0, 200);
        return `${answered} **${i.title}**${tags} (score: ${i.score})\n🔗 ${i.link}${body ? `\n${body}` : ""}`;
      })
      .join("\n\n");
    return { success: true, data: formatted };
  } catch (err) {
    return { success: false, data: `Erreur StackExchange: ${err}` };
  }
}

// ─── Code Execution Sandbox ──────────────────────────────────────────────────

async function toolExecuteCode(args: Record<string, unknown>): Promise<ToolCallResult> {
  const code = String(args.code || "");
  if (!code) return { success: false, data: "Paramètre manquant: code" };
  if (code.length > 5000) return { success: false, data: "Code trop long (max 5000 caractères)" };

  try {
    const vm = await import("node:vm");
    const logs: string[] = [];
    const sandbox = {
      console: {
        log: (...args: unknown[]) => logs.push(args.map(String).join(" ")),
        error: (...args: unknown[]) => logs.push(`[ERROR] ${args.map(String).join(" ")}`),
        warn: (...args: unknown[]) => logs.push(`[WARN] ${args.map(String).join(" ")}`),
      },
      Math,
      Date,
      JSON,
      Array,
      Object,
      String,
      Number,
      Boolean,
      RegExp,
      Map,
      Set,
      parseInt,
      parseFloat,
      isNaN,
      isFinite,
      encodeURIComponent,
      decodeURIComponent,
      setTimeout: () => {},
      setInterval: () => {},
      clearTimeout: () => {},
      clearInterval: () => {},
    };
    const context = vm.createContext(sandbox);
    const script = new vm.Script(code);
    const result = script.runInContext(context, { timeout: 5000 });
    const output: string[] = [];
    if (logs.length > 0) output.push(`stdout:\n${logs.join("\n")}`);
    if (result !== undefined)
      output.push(`result: ${JSON.stringify(result, null, 2)?.slice(0, 1000)}`);
    return { success: true, data: output.join("\n") || "Code exécuté (pas de sortie)" };
  } catch (err) {
    return {
      success: false,
      data: `Erreur d'exécution: ${err instanceof Error ? err.message : String(err)}`,
    };
  }
}

// ─── Unit Converter ──────────────────────────────────────────────────────────

async function toolConvertUnits(args: Record<string, unknown>): Promise<ToolCallResult> {
  const value = Number(args.value);
  const from = String(args.from || "").trim();
  const to = String(args.to || "").trim();
  if (isNaN(value)) return { success: false, data: "Valeur invalide" };
  if (!from || !to) return { success: false, data: "Unités manquantes" };

  const conversions: Record<string, number> = {
    m: 1,
    km: 1000,
    cm: 0.01,
    mm: 0.001,
    mi: 1609.34,
    ft: 0.3048,
    in: 0.0254,
    kg: 1,
    g: 0.001,
    lb: 0.453592,
    oz: 0.0283495,
    l: 1,
    ml: 0.001,
    gal: 3.78541,
    qt: 0.946353,
    "km/h": 1,
    mph: 1.60934,
    "m/s": 3.6,
    B: 1,
    KB: 1024,
    MB: 1048576,
    GB: 1073741824,
    TB: 1099511627776,
  };

  if (from === "C" && to === "F")
    return { success: true, data: `${value}°C = ${((value * 9) / 5 + 32).toFixed(2)}°F` };
  if (from === "F" && to === "C")
    return { success: true, data: `${value}°F = ${(((value - 32) * 5) / 9).toFixed(2)}°C` };
  if (from === "C" && to === "K")
    return { success: true, data: `${value}°C = ${(value + 273.15).toFixed(2)}K` };
  if (from === "K" && to === "C")
    return { success: true, data: `${value}K = ${(value - 273.15).toFixed(2)}°C` };
  if (from === "F" && to === "K")
    return { success: true, data: `${value}°F = ${(((value - 32) * 5) / 9 + 273.15).toFixed(2)}K` };
  if (from === "K" && to === "F")
    return { success: true, data: `${value}K = ${(((value - 273.15) * 9) / 5 + 32).toFixed(2)}°F` };

  const fromFactor = conversions[from];
  const toFactor = conversions[to];
  if (!fromFactor || !toFactor)
    return {
      success: false,
      data: `Unités non supportées. Disponibles: ${Object.keys(conversions).join(", ")}, C, F, K`,
    };

  const result = (value * fromFactor) / toFactor;
  return { success: true, data: `${value} ${from} = ${result.toFixed(4)} ${to}` };
}

// ─── Timezone Converter ──────────────────────────────────────────────────────

async function toolConvertTimezone(args: Record<string, unknown>): Promise<ToolCallResult> {
  const time = String(args.time || "").trim();
  const fromTz = String(args.from_tz || "").trim();
  const toTz = String(args.to_tz || "").trim();
  if (!time || !fromTz || !toTz)
    return { success: false, data: "Paramètres manquants: time, from_tz, to_tz" };

  try {
    let date: Date;
    if (/^\d{1,2}:\d{2}$/.test(time)) {
      const [h, m] = time.split(":").map(Number);
      const now = new Date();
      date = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate(), h, m));
      const fromOffset = getTimezoneOffsetMs(fromTz);
      date = new Date(date.getTime() - fromOffset);
    } else {
      date = new Date(time);
    }
    if (isNaN(date.getTime())) return { success: false, data: "Date/heure invalide" };

    const fromTime = new Intl.DateTimeFormat("fr-FR", {
      timeZone: fromTz,
      hour: "2-digit",
      minute: "2-digit",
      day: "2-digit",
      month: "2-digit",
    }).format(date);
    const toTime = new Intl.DateTimeFormat("fr-FR", {
      timeZone: toTz,
      hour: "2-digit",
      minute: "2-digit",
      day: "2-digit",
      month: "2-digit",
    }).format(date);
    return { success: true, data: `${fromTime} (${fromTz}) → ${toTime} (${toTz})` };
  } catch (err) {
    return { success: false, data: `Erreur timezone: ${err}` };
  }
}

function getTimezoneOffsetMs(tz: string): number {
  const now = new Date();
  const local = new Intl.DateTimeFormat("en-US", {
    timeZone: tz,
    hour12: false,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  }).formatToParts(now);
  const map: Record<string, string> = {};
  for (const p of local) map[p.type] = p.value;
  const tzDate = new Date(
    Date.UTC(
      Number(map.year),
      Number(map.month) - 1,
      Number(map.day),
      Number(map.hour),
      Number(map.minute),
      Number(map.second),
    ),
  );
  return tzDate.getTime() - now.getTime();
}

// ─── Regex Tester ────────────────────────────────────────────────────────────

async function toolTestRegex(args: Record<string, unknown>): Promise<ToolCallResult> {
  const pattern = String(args.pattern || "");
  const text = String(args.text || "");
  const flags = String(args.flags || "g");
  if (!pattern || !text)
    return { success: false, data: "Paramètres manquants: pattern et text requis" };

  try {
    const regex = new RegExp(pattern, flags);
    const matches: string[] = [];
    if (flags.includes("g")) {
      let m: RegExpExecArray | null;
      while ((m = regex.exec(text)) !== null) {
        matches.push(m[0]);
        if (m.index === regex.lastIndex) regex.lastIndex++;
      }
    } else {
      const m = regex.exec(text);
      if (m) matches.push(m[0]);
    }
    if (matches.length === 0) return { success: true, data: "Aucun match trouvé" };
    return {
      success: true,
      data: `✅ ${matches.length} match(s) trouvé(s):\n${matches
        .slice(0, 20)
        .map((m, i) => `${i + 1}. "${m}"`)
        .join("\n")}`,
    };
  } catch (err) {
    return { success: false, data: `Regex invalide: ${err}` };
  }
}

// ─── JWT Decoder ─────────────────────────────────────────────────────────────

async function toolDecodeJwt(args: Record<string, unknown>): Promise<ToolCallResult> {
  const token = String(args.token || "").trim();
  if (!token) return { success: false, data: "Paramètre manquant: token" };

  try {
    const parts = token.split(".");
    if (parts.length < 2)
      return {
        success: false,
        data: "Token JWT invalide (format attendu: header.payload.signature)",
      };
    const decode = (s: string) =>
      JSON.parse(Buffer.from(s.replace(/-/g, "+").replace(/_/g, "/"), "base64").toString());
    const header = decode(parts[0]);
    const payload = decode(parts[1]);
    return {
      success: true,
      data: `📋 **Header:**\n\`\`\`json\n${JSON.stringify(header, null, 2)}\n\`\`\`\n\n📦 **Payload:**\n\`\`\`json\n${JSON.stringify(payload, null, 2)}\n\`\`\``,
    };
  } catch (err) {
    return { success: false, data: `Erreur décodage JWT: ${err}` };
  }
}

// ─── Sports Scores ───────────────────────────────────────────────────────────

async function toolGetSportsScores(args: Record<string, unknown>): Promise<ToolCallResult> {
  const league = String(args.league || "")
    .trim()
    .toLowerCase();

  try {
    const leagueMap: Record<string, string> = {
      epl: "4328",
      nba: "4387",
      nfl: "4391",
      nhl: "4380",
      mls: "4346",
      atp: "4364",
      wta: "4363",
      seriea: "4332",
      laliga: "4335",
      bundesliga: "4331",
    };
    const leagueId = leagueMap[league] || "4328";
    const url = `https://www.thesportsdb.com/api/v1/json/3/eventsday.php?s=2024-01-01&l=${leagueId}`;
    const res = await fetch(url, { signal: AbortSignal.timeout(10_000) });
    if (!res.ok) return { success: false, data: `TheSportsDB error: ${res.status}` };
    const data = (await res.json()) as {
      events?: Array<{
        strEvent?: string;
        strHomeTeam?: string;
        strAwayTeam?: string;
        intHomeScore?: string;
        intAwayScore?: string;
        strTimestamp?: string;
        strSport?: string;
      }>;
    };
    const events = (data.events || []).slice(0, 10);
    if (events.length === 0) return { success: true, data: "Aucun événement récent trouvé" };
    const formatted = events
      .map((e) => {
        const score =
          e.intHomeScore && e.intAwayScore ? `${e.intHomeScore} - ${e.intAwayScore}` : "à venir";
        return `⚽ **${e.strHomeTeam || "?"}** vs **${e.strAwayTeam || "?"}** — ${score}${e.strTimestamp ? ` (${e.strTimestamp})` : ""}`;
      })
      .join("\n");
    return { success: true, data: formatted };
  } catch (err) {
    return { success: false, data: `Erreur sports: ${err}` };
  }
}

// ─── Recipe Search ───────────────────────────────────────────────────────────

async function toolSearchRecipe(args: Record<string, unknown>): Promise<ToolCallResult> {
  const query = String(args.query || "").trim();
  if (!query) return { success: false, data: "Paramètre manquant: query" };

  try {
    const url = `https://www.themealdb.com/api/json/v1/1/search.php?s=${encodeURIComponent(query)}`;
    const res = await fetch(url, { signal: AbortSignal.timeout(10_000) });
    if (!res.ok) return { success: false, data: `TheMealDB error: ${res.status}` };
    const data = (await res.json()) as {
      meals?: Array<{
        strMeal?: string;
        strCategory?: string;
        strArea?: string;
        strInstructions?: string;
        strMealThumb?: string;
        strYoutube?: string;
        strIngredient1?: string;
        strIngredient2?: string;
        strIngredient3?: string;
        strIngredient4?: string;
        strIngredient5?: string;
        strIngredient6?: string;
        strMeasure1?: string;
        strMeasure2?: string;
        strMeasure3?: string;
        strMeasure4?: string;
        strMeasure5?: string;
        strMeasure6?: string;
      }>;
    };
    const meals = (data.meals || []).slice(0, 3);
    if (meals.length === 0) return { success: false, data: `Aucune recette pour "${query}"` };
    const formatted = meals
      .map((m) => {
        const ingredients: string[] = [];
        for (let i = 1; i <= 6; i++) {
          const ing = (m as Record<string, string | undefined>)[`strIngredient${i}`];
          const measure = (m as Record<string, string | undefined>)[`strMeasure${i}`];
          if (ing) ingredients.push(`${measure || ""} ${ing}`.trim());
        }
        const instructions = (m.strInstructions || "").slice(0, 300);
        return `🍽️ **${m.strMeal}** (${m.strArea || ""} ${m.strCategory || ""})\nIngrédients: ${ingredients.join(", ")}\n${instructions}${m.strMealThumb ? `\n🖼️ ${m.strMealThumb}` : ""}${m.strYoutube ? `\n▶️ ${m.strYoutube}` : ""}`;
      })
      .join("\n\n");
    return { success: true, data: formatted };
  } catch (err) {
    return { success: false, data: `Erreur recette: ${err}` };
  }
}

// ─── Color Converter ─────────────────────────────────────────────────────────

async function toolConvertColor(args: Record<string, unknown>): Promise<ToolCallResult> {
  const color = String(args.color || "").trim();
  if (!color) return { success: false, data: "Paramètre manquant: color" };

  let r = 0,
    g = 0,
    b = 0;
  if (color.startsWith("#")) {
    const hex = color.slice(1);
    r = parseInt(hex.slice(0, 2), 16);
    g = parseInt(hex.slice(2, 4), 16);
    b = parseInt(hex.slice(4, 6), 16);
  } else if (color.startsWith("rgb")) {
    const m = color.match(/(\d+),\s*(\d+),\s*(\d+)/);
    if (m) {
      r = +m[1];
      g = +m[2];
      b = +m[3];
    }
  } else if (color.startsWith("hsl")) {
    const m = color.match(/(\d+),\s*(\d+)%,\s*(\d+)%/);
    if (m) {
      const h = +m[1] / 360,
        s = +m[2] / 100,
        l = +m[3] / 100;
      const hue2rgb = (p: number, q: number, t: number) => {
        if (t < 0) t += 1;
        if (t > 1) t -= 1;
        if (t < 1 / 6) return p + (q - p) * 6 * t;
        if (t < 1 / 2) return q;
        if (t < 2 / 3) return p + (q - p) * (2 / 3 - t) * 6;
        return p;
      };
      const q = l < 0.5 ? l * (1 + s) : l + s - l * s;
      const p = 2 * l - q;
      r = Math.round(hue2rgb(p, q, h + 1 / 3) * 255);
      g = Math.round(hue2rgb(p, q, h) * 255);
      b = Math.round(hue2rgb(p, q, h - 1 / 3) * 255);
    }
  } else {
    return {
      success: false,
      data: "Format non reconnu. Utilisez #hex, rgb(r,g,b) ou hsl(h,s%,l%)",
    };
  }

  const toHex = (n: number) => n.toString(16).padStart(2, "0");
  const hex = `#${toHex(r)}${toHex(g)}${toHex(b)}`;
  const rgb = `rgb(${r}, ${g}, ${b})`;
  const hslR = r / 255,
    hslG = g / 255,
    hslB = b / 255;
  const max = Math.max(hslR, hslG, hslB),
    min = Math.min(hslR, hslG, hslB);
  let h = 0,
    s = 0;
  const l = (max + min) / 2;
  if (max !== min) {
    const d = max - min;
    s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
    if (max === hslR) h = ((hslG - hslB) / d + (hslG < hslB ? 6 : 0)) / 6;
    else if (max === hslG) h = ((hslB - hslR) / d + 2) / 6;
    else h = ((hslR - hslG) / d + 4) / 6;
  }
  const hsl = `hsl(${Math.round(h * 360)}, ${Math.round(s * 100)}%, ${Math.round(l * 100)}%)`;
  return { success: true, data: `🎨 **HEX:** ${hex}\n**RGB:** ${rgb}\n**HSL:** ${hsl}` };
}

// ─── Number Base Converter ───────────────────────────────────────────────────

async function toolConvertNumberBase(args: Record<string, unknown>): Promise<ToolCallResult> {
  const value = String(args.value || "").trim();
  const fromBase = String(args.from_base || "").trim();
  const toBase = String(args.to_base || "").trim();
  if (!value || !fromBase || !toBase) return { success: false, data: "Paramètres manquants" };

  const baseMap: Record<string, number> = { bin: 2, dec: 10, hex: 16, oct: 8 };
  const fromRadix = baseMap[fromBase];
  const toRadix = baseMap[toBase];
  if (!fromRadix || !toRadix)
    return { success: false, data: "Base invalide. Utilisez: bin, dec, hex, oct" };

  try {
    const decimal = parseInt(value, fromRadix);
    if (isNaN(decimal)) return { success: false, data: `Valeur invalide en base ${fromBase}` };
    const result = decimal.toString(toRadix).toUpperCase();
    return {
      success: true,
      data: `${value} (${fromBase}) = ${result} (${toBase})\nValeur décimale: ${decimal}`,
    };
  } catch (err) {
    return { success: false, data: `Erreur conversion: ${err}` };
  }
}

// ─── Timestamp Converter ─────────────────────────────────────────────────────

async function toolConvertTimestamp(args: Record<string, unknown>): Promise<ToolCallResult> {
  const value = String(args.value || "").trim();
  const direction = String(args.direction || "").trim();
  if (!value || !direction) return { success: false, data: "Paramètres manquants" };

  try {
    if (direction === "to_date") {
      const ts = Number(value);
      if (isNaN(ts)) return { success: false, data: "Timestamp invalide" };
      const date = new Date(ts * 1000);
      return {
        success: true,
        data: `⏰ ${ts} → ${date.toUTCString()}\nLocal: ${date.toLocaleString("fr-FR")}`,
      };
    } else {
      const date = new Date(value);
      if (isNaN(date.getTime())) return { success: false, data: "Date invalide" };
      return {
        success: true,
        data: `📅 ${value} → Timestamp Unix: ${Math.floor(date.getTime() / 1000)}`,
      };
    }
  } catch (err) {
    return { success: false, data: `Erreur: ${err}` };
  }
}

// ─── Sun/Moon Info ───────────────────────────────────────────────────────────

async function toolGetSunMoonInfo(args: Record<string, unknown>): Promise<ToolCallResult> {
  const city = String(args.city || "").trim();
  if (!city) return { success: false, data: "Paramètre manquant: city" };

  try {
    const geoUrl = `https://geocoding-api.open-meteo.com/v1/search?name=${encodeURIComponent(city)}&count=1`;
    const geoRes = await fetch(geoUrl, { signal: AbortSignal.timeout(8000) });
    if (!geoRes.ok) return { success: false, data: "Ville introuvable" };
    const geoData = (await geoRes.json()) as {
      results?: Array<{ latitude: number; longitude: number; name: string; country: string }>;
    };
    if (!geoData.results?.length) return { success: false, data: `Ville "${city}" introuvable` };
    const { latitude, longitude, name, country } = geoData.results[0];

    const sunUrl = `https://api.sunrisesunset.io/json?lat=${latitude}&lng=${longitude}&date=today`;
    const sunRes = await fetch(sunUrl, { signal: AbortSignal.timeout(8000) });
    if (!sunRes.ok) return { success: false, data: "API sunrise indisponible" };
    const sunData = (await sunRes.json()) as {
      results?: {
        sunrise?: string;
        sunset?: string;
        solar_noon?: string;
        day_length?: string;
        golden_hour?: string;
      };
    };
    const s = sunData.results;
    if (!s) return { success: false, data: "Données indisponibles" };
    return {
      success: true,
      data: `🌅 **${name}, ${country}**\n☀️ Lever: ${s.sunrise || "N/A"}\n🌇 Coucher: ${s.sunset || "N/A"}\n🕛 Midi solaire: ${s.solar_noon || "N/A"}\n⏱️ Durée du jour: ${s.day_length || "N/A"}\n🌟 Golden hour: ${s.golden_hour || "N/A"}`,
    };
  } catch (err) {
    return { success: false, data: `Erreur: ${err}` };
  }
}

// ─── ASCII Art Generator ─────────────────────────────────────────────────────

async function toolGenerateAsciiArt(args: Record<string, unknown>): Promise<ToolCallResult> {
  const text = String(args.text || "").trim();
  if (!text) return { success: false, data: "Paramètre manquant: text" };
  if (text.length > 20)
    return { success: false, data: "Texte trop long (max 20 caractères pour l'ASCII art)" };

  const fonts: Record<string, Record<string, string[]>> = {
    Standard: {},
    Block: {},
  };

  const simpleFont: Record<string, string[]> = {
    A: ["  ▄▀█  ", " █▀█  "],
    B: [" ▄▀█  ", " █▀▀  "],
    C: [" █▀▀  ", " █▄▄  "],
    D: [" ▄▀█  ", " █▀▀  "],
    E: [" █▀▀  ", " ██▄  "],
    F: [" █▀▀  ", " █    "],
    G: [" █▀▀  ", " █ ▀█ "],
    H: [" █ █  ", " █▄█  "],
    I: [" ▀█▀  ", "  █   "],
    J: ["  █▀  ", " █▄▄  "],
    K: [" █ █  ", " █▄█  "],
    L: [" █    ", " █▄▄  "],
    M: [" █▀▄  ", " █ ▀█ "],
    N: [" █▀▄  ", " █▄▀  "],
    O: [" ▄▀█  ", " █▀█  "],
    P: [" ▄▀█  ", " █▀   "],
    Q: [" ▄▀█  ", " █▀█  "],
    R: [" ▄▀█  ", " █▀█  "],
    S: [" █▀▀  ", " █▄▄  "],
    T: [" ▀█▀  ", "  █   "],
    U: [" █ █  ", " █▄█  "],
    V: [" █ █  ", " ▀▄▀  "],
    W: [" █ █  ", " █▄█  "],
    X: [" █ █  ", " ▀▄▀  "],
    Y: [" █ █  ", "  █   "],
    Z: [" ▀█▀  ", " █▄▄  "],
    " ": ["      ", "      "],
    "0": [" ▄▀█  ", " █▀█  "],
    "1": ["  ▄█  ", "  █   "],
    "2": [" ▄▀█  ", " █▀▀  "],
    "3": [" ▄▀█  ", " █▀▀  "],
    "4": [" █▀█  ", "  █   "],
    "5": [" █▀▀  ", " ██▄  "],
    "6": [" █▀▀  ", " █▄▄  "],
    "7": [" ▀█▀  ", "  █   "],
    "8": [" ▄▀█  ", " █▀█  "],
    "9": [" ▄▀█  ", " █▀█  "],
  };

  const upper = text.toUpperCase();
  const lines: string[] = ["", ""];
  for (const char of upper) {
    const art = simpleFont[char];
    if (art) {
      lines[0] += art[0];
      lines[1] += art[1];
    }
  }
  return { success: true, data: "```\n" + lines.join("\n") + "\n```" };
}
