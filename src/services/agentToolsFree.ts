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
        "Récupère les vols en temps réel (OpenSky Network, gratuit). Retourne callsign, origine, altitude, vitesse.",
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
        const flights = await getFlights();
        if (flights.length === 0) return { success: true, data: "Aucun vol en cours trouvé" };
        const formatted = flights
          .slice(0, 10)
          .map(
            (f) =>
              `✈️ ${f.callsign} (${f.origin}) — ${f.altitude}ft, ${f.velocity}km/h, cap ${f.heading}°`,
          )
          .join("\n");
        return { success: true, data: formatted };
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

      default:
        // Knowledge Ingestion Tools
        if (toolName === "search_developer_resources") {
          return await handleSearchDeveloperResources(args);
        }
        if (toolName === "lookup_typescript_skill") {
          return await handleLookupTypeScriptSkill(args);
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
