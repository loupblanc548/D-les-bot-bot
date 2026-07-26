/**
 * agentToolsFree.ts — Tools agent pour les 22 nouvelles APIs gratuites
 *
 * Tool definitions (JSON Schema) + dispatcher pour connecter
 * les nouvelles APIs de freeApis.ts à l'agent loop.
 */

import type { AgentToolDef, ToolCallResult, ToolContext } from "./agentTools.js";
import logger from "../utils/logger.js";
import prisma from "../prisma.js";
import {
  generateImage,
  generateTTSUrl,
  TTS_VOICES,
  getEarthquakes,
  getChessStats,
  getLichessStats,
  searchBooks,
  searchFood,
  searchArxiv,
  getFlights,
  getGoogleTrends,
  getRssHubFeed,
  isRssHubConfigured,
  getDevToArticles,
} from "./freeApis.js";
import { generateElevenLabsTTS, getMonthlyUsage } from "./elevenLabsTts.js";
import { removeBackground } from "./removeBg.js";
import redisCache from "./redisCache.js";

// ─── Tool Definitions ────────────────────────────────────────────────────────

export const FREE_TOOLS: AgentToolDef[] = [
  {
    type: "function",
    function: {
      name: "generate_image",
      description:
        "Génère une image à partir d'une description textuelle (gratuit, via Pollinations.ai). Retourne une URL d'image. Utilise cet outil quand l'utilisateur demande de créer/générer une image.",
      parameters: {
        type: "object",
        properties: {
          prompt: {
            type: "string",
            description:
              "Description de l'image à générer (en anglais pour de meilleurs résultats)",
          },
          width: { type: "number", description: "Largeur en pixels (défaut 1024)" },
          height: { type: "number", description: "Hauteur en pixels (défaut 1024)" },
        },
        required: ["prompt"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "generate_tts",
      description:
        "Génère un audio à partir de texte (text-to-speech gratuit via StreamElements). Retourne une URL audio. Voix disponibles: Brian, Emma, Mathieu, Chantal (FR), Hans (DE), etc.",
      parameters: {
        type: "object",
        properties: {
          text: {
            type: "string",
            description: "Le texte à convertir en audio (max 500 caractères)",
          },
          voice: {
            type: "string",
            description: "Nom de la voix (défaut: Brian). FR: Celine, Mathieu, Chantal",
          },
        },
        required: ["text"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "get_earthquakes",
      description:
        "Récupère les séismes récents dans le monde (USGS, temps réel). Gratuit. Filtre par magnitude minimum.",
      parameters: {
        type: "object",
        properties: {
          minMagnitude: { type: "number", description: "Magnitude minimum (défaut 4.5)" },
          limit: { type: "number", description: "Nombre max de résultats (défaut 10)" },
        },
        required: [],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "get_chess_stats",
      description:
        "Récupère les statistiques d'un joueur Chess.com. Gratuit. Retourne ratings par mode (Rapid, Blitz, Bullet, etc.).",
      parameters: {
        type: "object",
        properties: {
          username: { type: "string", description: "Nom d'utilisateur Chess.com" },
        },
        required: ["username"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "get_lichess_stats",
      description:
        "Récupère les statistiques d'un joueur Lichess. Gratuit. Retourne ratings par mode et temps de jeu.",
      parameters: {
        type: "object",
        properties: {
          username: { type: "string", description: "Nom d'utilisateur Lichess" },
        },
        required: ["username"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "search_books",
      description:
        "Recherche des livres dans OpenLibrary (gratuit). Retourne titre, auteur, année, couverture et lien.",
      parameters: {
        type: "object",
        properties: {
          query: { type: "string", description: "Recherche (titre, auteur, sujet)" },
        },
        required: ["query"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "search_food",
      description:
        "Recherche un produit alimentaire dans Open Food Facts (gratuit). Retourne nom, marque, calories, nutriscore.",
      parameters: {
        type: "object",
        properties: {
          query: { type: "string", description: "Nom du produit alimentaire" },
        },
        required: ["query"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "search_arxiv",
      description:
        "Recherche des papers scientifiques sur arXiv (gratuit). Retourne titre, auteurs, résumé et lien.",
      parameters: {
        type: "object",
        properties: {
          query: { type: "string", description: "Sujet de recherche scientifique" },
        },
        required: ["query"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "get_flights",
      description:
        "Récupère les vols en temps réel (OpenSky Network, gratuit). Peut tracker un vol par callsign (ex: AFR123) ou lister les vols au-dessus d'une ville/région (ex: Paris, London, France, Europe). Retourne callsign, origine, position, altitude, vitesse, cap.",
      parameters: {
        type: "object",
        properties: {
          callsign: {
            type: "string",
            description: "Callsign du vol à tracker (ex: AFR123, BA456). Optionnel.",
          },
          region: {
            type: "string",
            description: "Ville ou région pour filtrer les vols (ex: Paris, London, France, Europe). Optionnel.",
          },
        },
        required: [],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "get_google_trends",
      description:
        "Récupère les tendances de recherche Google (gratuit). Retourne les top recherches par pays.",
      parameters: {
        type: "object",
        properties: {
          country: { type: "string", description: "Code pays (défaut: FR)" },
        },
        required: [],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "get_rsshub_feed",
      description:
        "Récupère un flux RSS via RSSHub (gratuit). Permet d'accéder à Twitter, Instagram, TikTok, etc. SANS API payante. Ex: twitter/user/elonmusk, instagram/user/nasa, tiktok/user/username",
      parameters: {
        type: "object",
        properties: {
          route: {
            type: "string",
            description: "Route RSSHub (ex: twitter/user/elonmusk, instagram/user/nasa)",
          },
        },
        required: ["route"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "get_devto_articles",
      description:
        "Récupère les articles Dev.to (gratuit). Retourne titre, URL, auteur, tags et réactions.",
      parameters: {
        type: "object",
        properties: {
          tag: { type: "string", description: "Tag optionnel (ex: javascript, python, react)" },
        },
        required: [],
      },
    },
  },
  // ─── ElevenLabs TTS (premium, metered) ───
  {
    type: "function",
    function: {
      name: "elevenLabsTTS",
      description:
        "Génère un audio haute qualité à partir de texte via ElevenLabs (payant, quota mensuel limité). Voix plus naturelles que le TTS gratuit. Utilise cet outil quand l'utilisateur demande une voix de haute qualité ou quand le TTS gratuit ne suffit pas.",
      parameters: {
        type: "object",
        properties: {
          text: { type: "string", description: "Texte à convertir en audio (max 5000 caractères)" },
          voiceId: {
            type: "string",
            description: "ID de voix ElevenLabs (optionnel, défaut: Rachel)",
          },
        },
        required: ["text"],
      },
    },
  },
  // ─── Remove.bg (metered, premium) ───
  {
    type: "function",
    function: {
      name: "removeBackground",
      description:
        "Supprime le fond d'une image via Remove.bg. Retourne l'image traitée (PNG sans fond). Payant au-delà du quota gratuit. Utilise cet outil quand l'utilisateur demande de retirer le fond d'une image.",
      parameters: {
        type: "object",
        properties: {
          imageUrl: { type: "string", description: "URL de l'image à traiter" },
        },
        required: ["imageUrl"],
      },
    },
  },
  // ─── Knowledge Ingestion Tools ───
  {
    type: "function",
    function: {
      name: "search_developer_resources",
      description:
        "Recherche des ressources gratuites pour développeurs (free-for-dev). Retourne les 5 meilleurs résultats avec nom, URL, catégorie et description.",
      parameters: {
        type: "object",
        properties: {
          query: {
            type: "string",
            description: "Terme de recherche (ex: 'database', 'CI/CD', 'monitoring')",
          },
          category: { type: "string", description: "Filtrer par catégorie (optionnel)" },
        },
        required: ["query"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "lookup_typescript_skill",
      description:
        "Recherche un pattern TypeScript avancé (Matt Pocock skills). Retourne le titre, l'explication et le code solution. Utiliser pour résoudre des erreurs de typage complexes.",
      parameters: {
        type: "object",
        properties: {
          query: {
            type: "string",
            description:
              "Terme de recherche ou message d'erreur TypeScript (ex: 'conditional types', 'Type 'X' is not assignable')",
          },
        },
        required: ["query"],
      },
    },
  },
  // ─── Knowledge Base Tools (GitHub ingestion pipeline) ──────────────
  {
    type: "function",
    function: {
      name: "search_public_apis",
      description:
        "Recherche dans une base de données d'APIs gratuites (public-apis repository). " +
        "Retourne le nom, la description, le statut HTTPS, et le lien direct. " +
        "Utilise cet outil quand l'utilisateur demande une API gratuite pour un projet.",
      parameters: {
        type: "object",
        properties: {
          query: {
            type: "string",
            description: "Terme de recherche (ex: 'weather', 'payment', 'authentication')",
          },
          category: {
            type: "string",
            description: "Catégorie optionnelle (ex: 'Data', 'Finance', 'Weather', 'Games')",
          },
          requiresAuth: {
            type: "boolean",
            description: "Si true, filtre les APIs qui nécessitent une authentification",
          },
        },
        required: ["query"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "get_dev_snippet",
      description:
        "Recherche un snippet de code concis (30-seconds-of-code). " +
        "Retourne le code avec son explication. " +
        "Utilise cet outil quand l'utilisateur demande un exemple de code rapide.",
      parameters: {
        type: "object",
        properties: {
          language: {
            type: "string",
            description: "Langage de programmation (ex: 'javascript', 'typescript', 'python')",
          },
          query: {
            type: "string",
            description:
              "Sujet ou fonctionnalité recherchée (ex: 'debounce', 'array flatten', 'deep clone')",
          },
        },
        required: ["query"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "search_programming_books",
      description:
        "Recherche des livres de programmation gratuits et légaux (free-programming-books). " +
        "Retourne le titre et le lien. " +
        "Utilise cet outil quand l'utilisateur cherche un livre gratuit sur un sujet tech.",
      parameters: {
        type: "object",
        properties: {
          topic: {
            type: "string",
            description:
              "Sujet ou langage (ex: 'python', 'machine learning', 'javascript', 'security')",
          },
        },
        required: ["topic"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "search_system_design",
      description:
        "Recherche dans le system-design-primer (architecture, scalabilité, patterns). " +
        "Retourne un résumé architectural et des recommandations. " +
        "Utilise cet outil quand l'utilisateur pose une question de system design.",
      parameters: {
        type: "object",
        properties: {
          topic: {
            type: "string",
            description:
              "Sujet architectural (ex: 'load balancing', 'caching', 'sharding', 'CAP theorem')",
          },
        },
        required: ["topic"],
      },
    },
  },
];

// ─── Dispatcher ──────────────────────────────────────────────────────────────

export async function executeFreeTool(
  toolName: string,
  args: Record<string, unknown>,
  _ctx: ToolContext,
): Promise<ToolCallResult | null> {
  logger.info(`[AgentToolsFree] 🔧 ${toolName} args=${JSON.stringify(args).slice(0, 150)}`);

  try {
    switch (toolName) {
      case "generate_image": {
        const prompt = String(args.prompt ?? "");
        const width = Number(args.width) || 1024;
        const height = Number(args.height) || 1024;
        if (!prompt) return { success: false, data: "Prompt vide" };
        const url = await generateImage(prompt, width, height);
        return { success: true, data: `Image générée: ${url}` };
      }

      case "generate_tts": {
        const text = String(args.text ?? "");
        const voice = String(args.voice ?? "Brian");
        if (!text) return { success: false, data: "Texte vide" };
        const url = generateTTSUrl(text, voice);
        return { success: true, data: `Audio généré (voix: ${voice}): ${url}` };
      }

      case "get_earthquakes": {
        const minMag = Number(args.minMagnitude) || 4.5;
        const limit = Number(args.limit) || 10;
        const quakes = await getEarthquakes(minMag, limit);
        if (quakes.length === 0) return { success: true, data: "Aucun séisme récent trouvé" };
        const formatted = quakes.map((q) => `M${q.magnitude} — ${q.place} (${q.time})`).join("\n");
        return { success: true, data: `🌍 Séismes récents (M≥${minMag}):\n${formatted}` };
      }

      case "get_chess_stats": {
        const stats = await getChessStats(String(args.username ?? ""));
        if (!stats) return { success: false, data: "Joueur Chess.com introuvable" };
        const formatted = stats.stats
          .map(
            (s) => `${s.mode}: ${s.rating} (best ${s.best}) — ${s.wins}W/${s.losses}L/${s.draws}D`,
          )
          .join("\n");
        return { success: true, data: `♟️ Chess.com — ${stats.username}:\n${formatted}` };
      }

      case "get_lichess_stats": {
        const stats = await getLichessStats(String(args.username ?? ""));
        if (!stats) return { success: false, data: "Joueur Lichess introuvable" };
        const formatted = stats.perfs
          .map((p) => `${p.mode}: ${p.rating} (${p.games} games)`)
          .join("\n");
        return {
          success: true,
          data: `♞ Lichess — ${stats.username} (${stats.playTime}):\n${formatted}`,
        };
      }

      case "search_books": {
        const books = await searchBooks(String(args.query ?? ""));
        if (books.length === 0) return { success: false, data: "Aucun livre trouvé" };
        const formatted = books
          .map((b) => `📖 ${b.title} — ${b.author}${b.year ? ` (${b.year})` : ""}\n${b.url}`)
          .join("\n");
        return { success: true, data: formatted };
      }

      case "search_food": {
        const foods = await searchFood(String(args.query ?? ""));
        if (foods.length === 0) return { success: false, data: "Aucun produit trouvé" };
        const formatted = foods
          .map(
            (f) =>
              `🍔 ${f.name} (${f.brand})${f.calories ? ` — ${f.calories} kcal/100g` : ""}${f.nutriscore ? ` — Nutriscore: ${f.nutriscore.toUpperCase()}` : ""}`,
          )
          .join("\n");
        return { success: true, data: formatted };
      }

      case "search_arxiv": {
        const papers = await searchArxiv(String(args.query ?? ""));
        if (papers.length === 0) return { success: false, data: "Aucun paper trouvé" };
        const formatted = papers
          .map((p) => `📄 ${p.title}\n${p.authors} — ${p.published.slice(0, 10)}\n${p.url}`)
          .join("\n\n");
        return { success: true, data: formatted };
      }

      case "get_flights": {
        const callsign = args.callsign ? String(args.callsign).toUpperCase().trim() : null;
        const region = args.region ? String(args.region).toLowerCase().trim() : null;

        // Build OpenSky API URL
        const bboxes: Record<string, [number, number, number, number]> = {
          paris: [48.5, 1.8, 49.2, 2.6],
          london: [51.2, -0.5, 51.7, 0.3],
          "new york": [40.4, -74.3, 41.0, -73.5],
          tokyo: [35.4, 139.4, 35.9, 140.1],
          berlin: [52.3, 13.0, 52.7, 13.8],
          moscow: [55.4, 37.2, 56.0, 38.0],
          dubai: [24.8, 55.1, 25.4, 55.6],
          france: [41.0, -5.5, 51.5, 10.0],
          europe: [35.0, -10.0, 60.0, 30.0],
          "los angeles": [33.7, -118.7, 34.4, -117.8],
          sydney: [-34.1, 150.8, -33.6, 151.4],
        };

        let url: string;
        if (callsign) {
          // OpenSky doesn't support callsign filter — fetch all and filter client-side
          url = `https://opensky-network.org/api/states/all`;
        } else if (region && bboxes[region]) {
          const [lamin, lomin, lamax, lomax] = bboxes[region];
          url = `https://opensky-network.org/api/states/all?lamin=${lamin}&lomin=${lomin}&lamax=${lamax}&lomax=${lomax}`;
        } else {
          url = `https://opensky-network.org/api/states/all`;
        }

        try {
          const res = await fetch(url, { signal: AbortSignal.timeout(10_000) });
          if (!res.ok) return { success: false, data: `OpenSky API error: ${res.status}` };
          const data = (await res.json()) as { states?: Array<Array<unknown>> };
          let states = data.states;
          if (!states || states.length === 0)
            return { success: true, data: `Aucun vol trouvé${callsign ? ` pour ${callsign}` : region ? ` près de ${region}` : ""}` };

          // Filter by callsign if specified
          if (callsign) {
            states = states.filter(
              (s) => String(s[1] || "").trim().toUpperCase() === callsign,
            );
            if (states.length === 0)
              return { success: true, data: `✈️ Vol ${callsign} non trouvé parmi les vols actifs.` };
          }

          const limited = states.slice(0, 10);
          const formatted = limited
            .map((s) => {
              const cs = String(s[1] || "").trim() || "N/A";
              const origin = String(s[2] || "?");
              const alt = s[7] as number | null;
              const vel = s[9] as number | null;
              const heading = s[10] as number | null;
              const onGround = s[8] as boolean;
              const lat = s[6] as number | null;
              const lon = s[5] as number | null;
              const pos = lat !== null && lon !== null ? `${lat.toFixed(2)},${lon.toFixed(2)}` : "?";
              return `✈️ **${cs}** (${origin}) — ${onGround ? "🛬 Sol" : `🛩️ ${alt?.toFixed(0) || "?"}m`} | 💨 ${vel ? (vel * 3.6).toFixed(0) : "?"}km/h | 🧭 ${heading?.toFixed(0) || "?"}° | 📍 ${pos}`;
            })
            .join("\n");
          return { success: true, data: `✈️ **Vols en temps réel${callsign ? ` — ${callsign}` : region ? ` — ${region}` : ""}** (${states.length} au total, ${limited.length} affichés)\n\n${formatted}` };
        } catch (err) {
          return { success: false, data: `Erreur OpenSky: ${err instanceof Error ? err.message : String(err)}` };
        }
      }

      case "get_google_trends": {
        const trends = await getGoogleTrends(String(args.country ?? "FR"));
        if (trends.length === 0) return { success: false, data: "Tendances indisponibles" };
        const formatted = trends
          .slice(0, 15)
          .map((t, i) => `${i + 1}. ${t.title}${t.traffic ? ` (${t.traffic})` : ""}`)
          .join("\n");
        return { success: true, data: `📈 Tendances Google:\n${formatted}` };
      }

      case "get_rsshub_feed": {
        const route = String(args.route ?? "");
        if (!route) return { success: false, data: "Route RSSHub vide" };
        const items = await getRssHubFeed(route);
        if (items.length === 0)
          return { success: false, data: `Flux RSSHub vide ou indisponible pour: ${route}` };
        const formatted = items
          .map(
            (item) =>
              `📌 ${item.title}${item.author ? ` — ${item.author}` : ""}\n${item.link}\n${item.content.slice(0, 200)}`,
          )
          .join("\n\n");
        return { success: true, data: formatted };
      }

      case "get_devto_articles": {
        const articles = await getDevToArticles(args.tag ? String(args.tag) : undefined);
        if (articles.length === 0) return { success: false, data: "Aucun article Dev.to" };
        const formatted = articles
          .map((a) => `📝 ${a.title} — ${a.author} (${a.reactions} reactions)\n${a.url}`)
          .join("\n\n");
        return { success: true, data: formatted };
      }

      case "elevenLabsTTS": {
        const text = String(args.text ?? "");
        if (!text) return { success: false, data: "Texte vide" };
        const result = await generateElevenLabsTTS(
          text,
          args.voiceId ? String(args.voiceId) : undefined,
        );
        if (!result) {
          const usage = getMonthlyUsage();
          return {
            success: false,
            data: `ElevenLabs indisponible (clé API manquante ou quota mensuel atteint: ${usage.used}/${usage.limit} chars)`,
          };
        }
        const usage = getMonthlyUsage();
        return {
          success: true,
          data: `🎙️ Audio ElevenLabs généré (${result.charsUsed} chars, quota: ${usage.used}/${usage.limit})\n${result.audioUrl}`,
        };
      }

      case "removeBackground": {
        const imageUrl = String(args.imageUrl ?? "").trim();
        if (!imageUrl) return { success: false, data: "URL d'image requise" };
        const result = await removeBackground(imageUrl);
        if (!result)
          return { success: false, data: "Remove.bg indisponible (clé API manquante ou erreur)" };
        return {
          success: true,
          data: `🖼️ Fond supprimé (${result.creditsUsed} crédits utilisés)\n${result.resultUrl}`,
        };
      }

      default:
        // Knowledge Ingestion Tools
        if (toolName === "search_developer_resources") {
          return await handleSearchDeveloperResources(args);
        }
        if (toolName === "lookup_typescript_skill") {
          return await handleLookupTypeScriptSkill(args);
        }
        // ── Knowledge Base Tools (GitHub ingestion) ──
        if (toolName === "search_public_apis") {
          return await handleSearchPublicApis(args);
        }
        if (toolName === "get_dev_snippet") {
          return await handleGetDevSnippet(args);
        }
        if (toolName === "search_programming_books") {
          return await handleSearchProgrammingBooks(args);
        }
        if (toolName === "search_system_design") {
          return await handleSearchSystemDesign(args);
        }
        return null;
    }
  } catch (err) {
    const errMsg = err instanceof Error ? err.message : String(err);
    logger.warn(`[AgentToolsFree] ❌ ${toolName} failed: ${errMsg}`);
    return { success: false, data: `Erreur ${toolName}: ${errMsg}` };
  }
}

// ─── Knowledge Ingestion Tool Handlers ───────────────────────────────────────

async function handleSearchDeveloperResources(
  args: Record<string, unknown>,
): Promise<ToolCallResult> {
  const query = String(args.query ?? "").trim();
  const category = String(args.category ?? "").trim();

  if (!query) return { success: false, data: "Query vide" };

  try {
    const where = category
      ? {
          category: { contains: category, mode: "insensitive" as const },
          OR: [
            { name: { contains: query, mode: "insensitive" as const } },
            { description: { contains: query, mode: "insensitive" as const } },
          ],
        }
      : {
          OR: [
            { name: { contains: query, mode: "insensitive" as const } },
            { description: { contains: query, mode: "insensitive" as const } },
            { category: { contains: query, mode: "insensitive" as const } },
          ],
        };

    const results = await prisma.freeResource.findMany({
      where,
      take: 5,
      orderBy: { updatedAt: "desc" },
    });

    if (results.length === 0) {
      return { success: true, data: `Aucune ressource trouvée pour "${query}"` };
    }

    const formatted = results
      .map(
        (r, i) =>
          `${i + 1}. **${r.name}** [${r.category}]\n   ${r.url}\n   ${r.description.slice(0, 150)}`,
      )
      .join("\n\n");

    return { success: true, data: `Ressources gratuites pour "${query}":\n\n${formatted}` };
  } catch (err) {
    logger.warn(
      `[AgentToolsFree] search_developer_resources DB error: ${err instanceof Error ? err.message : String(err)}`,
    );
    return { success: false, data: "Base de données indisponible pour la recherche de ressources" };
  }
}

async function handleLookupTypeScriptSkill(args: Record<string, unknown>): Promise<ToolCallResult> {
  const query = String(args.query ?? "").trim();

  if (!query) return { success: false, data: "Query vide" };

  try {
    const results = await prisma.typeScriptSkill.findMany({
      where: {
        OR: [
          { title: { contains: query, mode: "insensitive" as const } },
          { category: { contains: query, mode: "insensitive" as const } },
          { explanation: { contains: query, mode: "insensitive" as const } },
          { problemStatement: { contains: query, mode: "insensitive" as const } },
        ],
      },
      take: 3,
      orderBy: { updatedAt: "desc" },
    });

    if (results.length === 0) {
      return { success: true, data: `Aucun pattern TypeScript trouvé pour "${query}"` };
    }

    const formatted = results
      .map(
        (r, i) =>
          `${i + 1}. **${r.title}** [${r.category}]\n` +
          `   Problème: ${r.problemStatement.slice(0, 200)}\n` +
          `   Solution:\n   \`\`\`typescript\n   ${r.solutionCode.slice(0, 500)}\n   \`\`\`\n` +
          `   Explication: ${r.explanation.slice(0, 200)}`,
      )
      .join("\n---\n");

    return { success: true, data: `Patterns TypeScript pour "${query}":\n\n${formatted}` };
  } catch (err) {
    logger.warn(
      `[AgentToolsFree] lookup_typescript_skill DB error: ${err instanceof Error ? err.message : String(err)}`,
    );
    return {
      success: false,
      data: "Base de données indisponible pour la recherche de patterns TS",
    };
  }
}

/**
 * Exported for codeSandbox auto-heal — looks up TS skills by compiler error.
 */
export async function autoHealTypeScriptError(errorMessage: string): Promise<string | null> {
  try {
    const results = await prisma.typeScriptSkill.findMany({
      where: {
        OR: [
          {
            problemStatement: {
              contains: errorMessage.slice(0, 100),
              mode: "insensitive" as const,
            },
          },
          { title: { contains: errorMessage.slice(0, 50), mode: "insensitive" as const } },
          { explanation: { contains: errorMessage.slice(0, 50), mode: "insensitive" as const } },
        ],
      },
      take: 1,
      orderBy: { updatedAt: "desc" },
    });

    if (results.length === 0) return null;
    const r = results[0];
    return `Pattern suggéré: **${r.title}**\nSolution:\n\`\`\`typescript\n${r.solutionCode.slice(0, 800)}\n\`\`\`\n${r.explanation.slice(0, 300)}`;
  } catch {
    return null;
  }
}

// ─── Knowledge Base Tool Handlers (GitHub ingestion pipeline) ───────────────

const CACHE_TTL_24H = 86400;

async function handleSearchPublicApis(args: Record<string, unknown>): Promise<ToolCallResult> {
  const query = String(args.query ?? "");
  const category = args.category ? String(args.category) : undefined;
  const requiresAuth = args.requiresAuth === true;
  if (!query) return { success: false, data: "Recherche vide" };

  const cacheKey = `kb:apis:${query}:${category ?? ""}:${requiresAuth}`;
  const cached = await redisCache.get<ToolCallResult>(cacheKey);
  if (cached) return cached;

  const where: Record<string, unknown> = {
    category: "PUBLIC_API",
    OR: [
      { name: { contains: query, mode: "insensitive" as const } },
      { description: { contains: query, mode: "insensitive" as const } },
      { tags: { contains: query, mode: "insensitive" as const } },
    ],
  };
  if (category) {
    where.tags = { contains: category, mode: "insensitive" as const };
  }

  const results = await prisma.freeResource.findMany({
    where: where as never,
    take: 15,
    orderBy: { updatedAt: "desc" },
  });

  if (results.length === 0) {
    const res: ToolCallResult = { success: false, data: `Aucune API trouvée pour "${query}"` };
    await redisCache.set(cacheKey, res, CACHE_TTL_24H);
    return res;
  }

  const formatted = results
    .map((r, i) => {
      const meta = (r as Record<string, unknown>).metadata as {
        auth?: string;
        https?: boolean;
        cors?: string;
      } | null;
      return `${i + 1}. **${r.name}** — ${r.description.slice(0, 120)}\n   🔗 ${r.url}\n   Auth: ${meta?.auth ?? "?"} | HTTPS: ${meta?.https ?? "?"} | CORS: ${meta?.cors ?? "?"}`;
    })
    .join("\n\n");

  const res: ToolCallResult = {
    success: true,
    data: `APIs trouvées (${results.length}):\n\n${formatted}`,
  };
  await redisCache.set(cacheKey, res, CACHE_TTL_24H);
  return res;
}

async function handleGetDevSnippet(args: Record<string, unknown>): Promise<ToolCallResult> {
  const query = String(args.query ?? "");
  const language = args.language ? String(args.language) : undefined;
  if (!query) return { success: false, data: "Recherche vide" };

  const cacheKey = `kb:snippet:${query}:${language ?? ""}`;
  const cached = await redisCache.get<ToolCallResult>(cacheKey);
  if (cached) return cached;

  const where: Record<string, unknown> = {
    category: "CODE_SNIPPET",
    OR: [
      { name: { contains: query, mode: "insensitive" as const } },
      { description: { contains: query, mode: "insensitive" as const } },
      { tags: { contains: query, mode: "insensitive" as const } },
    ],
  };
  if (language) where.language = { contains: language, mode: "insensitive" as const };

  const results = await prisma.freeResource.findMany({
    where: where as never,
    take: 5,
    orderBy: { updatedAt: "desc" },
  });

  if (results.length === 0) {
    const res: ToolCallResult = { success: false, data: `Aucun snippet trouvé pour "${query}"` };
    await redisCache.set(cacheKey, res, CACHE_TTL_24H);
    return res;
  }

  const formatted = results
    .map((r, i) => `${i + 1}. **${r.name}**\n${r.description.slice(0, 600)}`)
    .join("\n\n---\n\n");

  const res: ToolCallResult = {
    success: true,
    data: `Snippets trouvés (${results.length}):\n\n${formatted}`,
  };
  await redisCache.set(cacheKey, res, CACHE_TTL_24H);
  return res;
}

async function handleSearchProgrammingBooks(
  args: Record<string, unknown>,
): Promise<ToolCallResult> {
  const topic = String(args.topic ?? "");
  if (!topic) return { success: false, data: "Sujet vide" };

  const cacheKey = `kb:books:${topic}`;
  const cached = await redisCache.get<ToolCallResult>(cacheKey);
  if (cached) return cached;

  const results = await prisma.freeResource.findMany({
    where: {
      category: "FREE_BOOK",
      OR: [
        { name: { contains: topic, mode: "insensitive" as const } },
        { description: { contains: topic, mode: "insensitive" as const } },
        { tags: { contains: topic, mode: "insensitive" as const } } as never,
      ],
    } as never,
    take: 15,
    orderBy: { updatedAt: "desc" },
  });

  if (results.length === 0) {
    const res: ToolCallResult = { success: false, data: `Aucun livre trouvé pour "${topic}"` };
    await redisCache.set(cacheKey, res, CACHE_TTL_24H);
    return res;
  }

  const formatted = results
    .map((r, i) => `${i + 1}. **${r.name}** — ${r.description.slice(0, 100)}\n   🔗 ${r.url}`)
    .join("\n\n");

  const res: ToolCallResult = {
    success: true,
    data: `Livres gratuits trouvés (${results.length}):\n\n${formatted}`,
  };
  await redisCache.set(cacheKey, res, CACHE_TTL_24H);
  return res;
}

async function handleSearchSystemDesign(args: Record<string, unknown>): Promise<ToolCallResult> {
  const topic = String(args.topic ?? "");
  if (!topic) return { success: false, data: "Sujet vide" };

  const cacheKey = `kb:sysdesign:${topic}`;
  const cached = await redisCache.get<ToolCallResult>(cacheKey);
  if (cached) return cached;

  const results = await prisma.agentKnowledge.findMany({
    where: {
      OR: [
        { title: { contains: topic, mode: "insensitive" as const } },
        { summary: { contains: topic, mode: "insensitive" as const } },
        { tags: { contains: topic, mode: "insensitive" as const } } as never,
        { content: { contains: topic, mode: "insensitive" as const } },
      ],
    } as never,
    take: 5,
    orderBy: { updatedAt: "desc" },
  });

  if (results.length === 0) {
    const res: ToolCallResult = {
      success: false,
      data: `Aucune ressource system design pour "${topic}"`,
    };
    await redisCache.set(cacheKey, res, CACHE_TTL_24H);
    return res;
  }

  const formatted = results
    .map((r, i) => `${i + 1}. **${r.title}**\n${r.summary.slice(0, 400)}\n   🔗 ${r.url}`)
    .join("\n\n---\n\n");

  const res: ToolCallResult = {
    success: true,
    data: `Ressources system design (${results.length}):\n\n${formatted}`,
  };
  await redisCache.set(cacheKey, res, CACHE_TTL_24H);
  return res;
}
