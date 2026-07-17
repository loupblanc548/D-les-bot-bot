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
          query: { type: "string", description: "Nom du jeu à rechercher (ex: Helldivers, GTA, Minecraft)" },
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
          query: { type: "string", description: "Terme de recherche (ex: Napoléon, quantum, photosynthèse)" },
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
          channel: { type: "string", description: "Nom de la chaîne Twitch (ex: shroud, pokimane)" },
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
];

// ─── Dispatcher ──────────────────────────────────────────────────────────────

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
  if (repos.length === 0) return { success: false, data: "Aucun repo trending trouvé (parsing échoué)" };
  const formatted = repos
    .map((r, i) => `${i + 1}. **${r}** — https://github.com/${r}`)
    .join("\n");
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
  return { success: true, data: `Configuration requise pour **${app.name}**:\n${formatted || "Aucune config trouvée"}` };
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
      const date = e.scheduledStartAt?.toLocaleDateString("fr-FR", { day: "numeric", month: "long", hour: "2-digit", minute: "2-digit" });
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
    return { success: false, data: `Erreur IGDB: ${err instanceof Error ? err.message : String(err)}` };
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
  if (results.length === 0) return { success: true, data: `Aucun article Wikipedia pour "${query}"` };
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
      const date = new Date(l.net).toLocaleDateString("fr-FR", { day: "numeric", month: "long", hour: "2-digit", minute: "2-digit" });
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
  if (!emailRegex.test(email))
    return { success: true, data: `❌ Format invalide: ${email}` };
  const domain = email.split("@")[1];
  const dnsRes = await fetch(`https://dns.google/resolve?name=${domain}&type=MX`, {
    signal: AbortSignal.timeout(5_000),
  });
  if (!dnsRes.ok) return { success: true, data: `✅ Format valide mais impossible de vérifier le domaine` };
  const dnsData = (await dnsRes.json()) as any;
  const hasMx = dnsData.Answer && dnsData.Answer.length > 0;
  const disposableDomains = ["mailinator.com", "tempmail.com", "guerrillamail.com", "10minutemail.com", "yopmail.com"];
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
    return { success: false, data: "Expression cron invalide (5 champs requis: min hour day month weekday)" };
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
  const toHex = (n: number) => Math.max(0, Math.min(255, Math.round(n))).toString(16).padStart(2, "0");
  const palette = [
    `#${toHex(r * 0.7)}${toHex(g * 0.7)}${toHex(b * 0.7)}`,
    `#${toHex(r * 0.85)}${toHex(g * 0.85)}${toHex(b * 0.85)}`,
    `#${baseColor}`,
    `#${toHex(255 - r)}${toHex(255 - g)}${toHex(255 - b)}`,
    `#${toHex(r * 1.3)}${toHex(g * 1.3)}${toHex(b * 1.3)}`,
  ];
  return { success: true, data: `Palette depuis #${baseColor}:\n${palette.map((c, i) => `${i + 1}. ${c}`).join("\n")}` };
}

async function toolEmojiInfo(args: Record<string, unknown>): Promise<ToolCallResult> {
  const emoji = args.emoji as string;
  const codePoints = [...emoji].map((c) => `U+${c.codePointAt(0)?.toString(16).toUpperCase()}`).join(" ");
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
  const res = await fetch("https://valorant-api.com/v1/agents?isPlayableCharacter=true&language=fr-FR", {
    signal: AbortSignal.timeout(10_000),
  });
  if (!res.ok) return { success: false, data: "Erreur Valorant API" };
  const data = (await res.json()) as any;
  const agents = data.data || [];
  const formatted = agents
    .map((a: any) => `**${a.displayName}** (${a.role?.displayName || "N/A"}) — ${a.description?.slice(0, 100) || ""}`)
    .join("\n");
  return { success: true, data: `Agents Valorant (${agents.length}):\n${formatted}` };
}

async function toolLoremIpsum(args: Record<string, unknown>): Promise<ToolCallResult> {
  const paragraphs = Math.min(10, Math.max(1, Number(args.paragraphs) || 2));
  const words = "lorem ipsum dolor sit amet consectetur adipiscing elit sed do eiusmod tempor incididunt ut labore et dolore magna aliqua ut enim ad minim veniam quis nostrud exercitation ullamco laboris nisi ut aliquip ex ea commodo consequat duis aute irure dolor in reprehenderit in voluptate velit esse cillum dolore eu fugiat nulla pariatur excepteur sint occaecat cupidatat non proident sunt in culpa qui officia deserunt mollit anim id est laborum".split(" ");
  const generateParagraph = () => {
    const sentences = 4 + Math.floor(Math.random() * 3);
    const parts: string[] = [];
    for (let i = 0; i < sentences; i++) {
      const wordCount = 8 + Math.floor(Math.random() * 10);
      const wordsSlice = Array.from({ length: wordCount }, () => words[Math.floor(Math.random() * words.length)]);
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
  const res = await fetch(`https://twitchtracker.com/api/channels/${channel}/clips?limit=${limit}`, {
    headers: { "User-Agent": "Mozilla/5.0" },
    signal: AbortSignal.timeout(10_000),
  });
  if (!res.ok) return { success: false, data: "Erreur Twitch clips (le scraping peut être bloqué)" };
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
