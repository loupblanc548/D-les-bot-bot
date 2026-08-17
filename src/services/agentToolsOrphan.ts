/**
 * agentToolsOrphan.ts — Outils agent exposant les services orphelins existants
 *
 * 10 services qui existaient mais n'étaient pas exposés comme outils agent.
 * Chaque outil délègue au service existant, avec dégradation gracieuse.
 */

import type { AgentToolDef, ToolCallResult, ToolContext } from "./agentTools.js";
import logger from "../utils/logger.js";
import { getLyrics } from "./lyricsService.js";
import { shortenUrl, shortenUrlVgd } from "./urlShortener.js";
import { captureTweetScreenshot } from "./tweetScreenshot.js";
import {
  searchGameByName,
  getGameGrids,
  getGameHeroes,
  isSteamGridDbAvailable,
} from "./steamGridDb.js";
import { summarizeChannel } from "./channelSummary.js";
import { exportChannelMessages, exportToMarkdown, exportToCSV } from "./chatExport.js";
import { fullDnsLookup } from "./dnsResolver.js";
import { compareGamePrices } from "./priceComparator.js";
import { queryMinecraft } from "./gameServerStatus.js";
import { setReminder } from "./reminderService.js";
import { AttachmentBuilder, TextChannel } from "discord.js";
import prisma from "../prisma.js";

// ─── Tool Definitions ────────────────────────────────────────────────────────

export const ORPHAN_TOOLS: AgentToolDef[] = [
  {
    type: "function",
    function: {
      name: "get_lyrics",
      description:
        "Récupère les paroles d'une chanson (gratuit via lyrics.ovh). Fallback Genius si clé configurée.",
      parameters: {
        type: "object",
        properties: {
          artist: { type: "string", description: "Nom de l'artiste" },
          title: { type: "string", description: "Titre de la chanson" },
        },
        required: ["artist", "title"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "shorten_url",
      description:
        "Raccourcit une URL via is.gd (gratuit, sans clé API). Supporte un slug personnalisé.",
      parameters: {
        type: "object",
        properties: {
          url: { type: "string", description: "L'URL à raccourcir" },
          customSlug: { type: "string", description: "Slug personnalisé optionnel (ex: monlien)" },
        },
        required: ["url"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "screenshot_tweet",
      description:
        "Capture un tweet sous forme d'image PNG et l'envoie dans le salon. Utile pour préserver un tweet visuellement.",
      parameters: {
        type: "object",
        properties: {
          tweetUrl: { type: "string", description: "URL du tweet (https://x.com/user/status/123)" },
        },
        required: ["tweetUrl"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "get_game_artwork",
      description:
        "Récupère des artworks HD (covers, heroes, logos) pour un jeu via SteamGridDB. Nécessite une clé API.",
      parameters: {
        type: "object",
        properties: {
          gameName: { type: "string", description: "Nom du jeu" },
          artType: {
            type: "string",
            description: "Type d'art: grid (cover), hero, ou both (défaut)",
          },
        },
        required: ["gameName"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "summarize_channel",
      description: "Résume les N derniers messages du salon actuel en 3-5 points clés via IA.",
      parameters: {
        type: "object",
        properties: {
          messageCount: {
            type: "number",
            description: "Nombre de messages à résumer (défaut 50, max 100)",
          },
        },
        required: [],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "export_chat",
      description:
        "Exporte les messages récents du salon en fichier (Markdown ou CSV). Envoie le fichier dans le salon.",
      parameters: {
        type: "object",
        properties: {
          format: { type: "string", description: "Format: markdown ou csv (défaut: markdown)" },
          limit: { type: "number", description: "Nombre de messages (défaut 50, max 100)" },
        },
        required: [],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "resolve_dns",
      description:
        "Résolution DNS complète d'un domaine: A, AAAA, MX, TXT, NS, CNAME, PTR. Gratuit via Node.js dns.",
      parameters: {
        type: "object",
        properties: {
          domain: { type: "string", description: "Domaine à résoudre (ex: example.com)" },
        },
        required: ["domain"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "compare_game_prices",
      description:
        "Compare les prix d'un jeu sur plusieurs boutiques (Steam, Epic, Instant Gaming). Retourne le moins cher.",
      parameters: {
        type: "object",
        properties: {
          gameName: { type: "string", description: "Nom du jeu à comparer" },
        },
        required: ["gameName"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "check_game_server",
      description:
        "Vérifie le statut d'un serveur de jeu (Minecraft principalement). Retourne joueurs en ligne, max, version, MOTD.",
      parameters: {
        type: "object",
        properties: {
          host: { type: "string", description: "Adresse du serveur (ex: play.mcraft.fr)" },
          port: { type: "number", description: "Port (défaut Minecraft: 25565)" },
        },
        required: ["host"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "set_reminder",
      description:
        "Programme un rappel. Le bot enverra un message au moment voulu. Supporte les dates relatives en français: 'dans 2 heures', 'demain 15h', 'dans 30 min'.",
      parameters: {
        type: "object",
        properties: {
          text: { type: "string", description: "Texte du rappel" },
          when: {
            type: "string",
            description:
              "Quand rappeler (ex: 'dans 2 heures', 'demain 15h', 'dans 30 min', '2024-12-25 10:00')",
          },
        },
        required: ["text", "when"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "search_server_history",
      description:
        "Recherche dans l'historique des messages du serveur (base de données). Permet de retrouver qui a parlé d'un sujet, quand, et dans quel salon. Filtrable par utilisateur, salon et plage de dates. Limite 20 résultats.",
      parameters: {
        type: "object",
        properties: {
          query: { type: "string", description: "Mots-clés à rechercher (insensible à la casse)" },
          userId: { type: "string", description: "ID Discord de l'utilisateur (optionnel)" },
          channelId: { type: "string", description: "ID du salon à filtrer (optionnel)" },
          daysBack: {
            type: "number",
            description: "Nombre de jours en arrière (défaut 7, max 90)",
          },
        },
        required: ["query"],
      },
    },
  },
];

// ─── Natural date parser (FR) ────────────────────────────────────────────────

function parseNaturalDate(input: string): Date | null {
  const now = new Date();
  const lower = input.toLowerCase().trim();

  // "dans X heures/min/minutes/jours"
  const dansMatch = lower.match(
    /dans\s+(\d+)\s*(min|minutes|heure|heures|h|jour|jours|j|semaine|semaines)/,
  );
  if (dansMatch) {
    const num = parseInt(dansMatch[1], 10);
    const unit = dansMatch[2];
    const result = new Date(now);
    if (unit.startsWith("min")) result.setMinutes(result.getMinutes() + num);
    else if (unit.startsWith("h") || unit.startsWith("heure"))
      result.setHours(result.getHours() + num);
    else if (unit.startsWith("j") || unit.startsWith("jour"))
      result.setDate(result.getDate() + num);
    else if (unit.startsWith("semaine")) result.setDate(result.getDate() + num * 7);
    return result;
  }

  // "demain [HH[:MM]]"
  if (lower.startsWith("demain")) {
    const result = new Date(now);
    result.setDate(result.getDate() + 1);
    const timeMatch = lower.match(/(\d{1,2})[:hH]?(\d{0,2})/);
    if (timeMatch) {
      result.setHours(parseInt(timeMatch[1], 10), parseInt(timeMatch[2] || "0", 10), 0, 0);
    }
    return result;
  }

  // "aujourd'hui [HH[:MM]]"
  if (lower.startsWith("aujourd")) {
    const result = new Date(now);
    const timeMatch = lower.match(/(\d{1,2})[:hH]?(\d{0,2})/);
    if (timeMatch) {
      result.setHours(parseInt(timeMatch[1], 10), parseInt(timeMatch[2] || "0", 10), 0, 0);
    }
    return result;
  }

  // ISO format: 2024-12-25 10:00 or 2024-12-25T10:00
  const isoDate = new Date(input);
  if (!isNaN(isoDate.getTime())) return isoDate;

  return null;
}

// ─── Dispatcher ──────────────────────────────────────────────────────────────

export async function executeOrphanTool(
  toolName: string,
  args: Record<string, unknown>,
  ctx: ToolContext,
): Promise<ToolCallResult | null> {
  logger.info(`[OrphanTools] 🔧 ${toolName} args=${JSON.stringify(args).slice(0, 150)}`);

  try {
    switch (toolName) {
      // ── get_lyrics ──
      case "get_lyrics": {
        const artist = String(args.artist ?? "");
        const title = String(args.title ?? "");
        if (!artist || !title) return { success: false, data: "Artiste et titre requis" };
        const result = await getLyrics(artist, title);
        if (!result) return { success: false, data: "Paroles introuvables" };
        const lyrics = result.lyrics.slice(0, 1900);
        return {
          success: true,
          data: `🎵 ${result.title} — ${result.artist} (source: ${result.source})\n\n${lyrics}${result.lyrics.length > 1900 ? "\n...[tronqué]" : ""}`,
        };
      }

      // ── shorten_url ──
      case "shorten_url": {
        const url = String(args.url ?? "");
        if (!url) return { success: false, data: "URL requise" };
        const slug = args.customSlug ? String(args.customSlug) : undefined;
        const result = await shortenUrl(url, slug);
        if (!result) {
          const fallback = await shortenUrlVgd(url);
          if (!fallback) return { success: false, data: "Impossible de raccourcir l'URL" };
          return { success: true, data: `🔗 URL raccourcie: ${fallback.short}` };
        }
        return { success: true, data: `🔗 URL raccourcie: ${result.short}` };
      }

      // ── screenshot_tweet ──
      case "screenshot_tweet": {
        const tweetUrl = String(args.tweetUrl ?? "");
        if (!tweetUrl) return { success: false, data: "URL du tweet requise" };
        const result = await captureTweetScreenshot(tweetUrl);
        if (!result)
          return { success: false, data: "Capture impossible (tweet introuvable ou protégé)" };
        const channel = ctx.client.channels.cache.get(ctx.channelId) as TextChannel | undefined;
        if (!channel) return { success: false, data: "Salon introuvable" };
        const attachment = new AttachmentBuilder(result.buffer, { name: result.filename });
        await channel.send({ content: `📸 Capture du tweet`, files: [attachment] });
        return { success: true, data: `Capture envoyée: ${result.filename}` };
      }

      // ── get_game_artwork ──
      case "get_game_artwork": {
        const gameName = String(args.gameName ?? "");
        if (!gameName) return { success: false, data: "Nom du jeu requis" };
        if (!isSteamGridDbAvailable())
          return { success: false, data: "SteamGridDB non configuré (clé API manquante)" };
        const gameId = await searchGameByName(gameName);
        if (!gameId) return { success: false, data: "Jeu introuvable sur SteamGridDB" };
        const artType = String(args.artType ?? "both");
        const urls: string[] = [];
        if (artType === "grid" || artType === "both") {
          const grids = await getGameGrids(gameId);
          if (grids.length > 0) urls.push(`Cover: ${grids[0].url}`);
        }
        if (artType === "hero" || artType === "both") {
          const heroes = await getGameHeroes(gameId);
          if (heroes.length > 0) urls.push(`Hero: ${heroes[0].url}`);
        }
        if (urls.length === 0) return { success: false, data: "Aucun artwork trouvé" };
        return { success: true, data: `🎨 Artworks pour "${gameName}":\n${urls.join("\n")}` };
      }

      // ── summarize_channel ──
      case "summarize_channel": {
        const count = Math.min(Number(args.messageCount ?? 50), 100);
        const channel = ctx.client.channels.cache.get(ctx.channelId) as TextChannel | undefined;
        if (!channel || !channel.isTextBased())
          return { success: false, data: "Salon introuvable" };
        const fetched = await channel.messages.fetch({ limit: count });
        const sorted = [...fetched.values()].sort(
          (a, b) => a.createdTimestamp - b.createdTimestamp,
        );
        const formatted = sorted.map((m) => `${m.author.username}: ${m.content}`.slice(0, 500));
        const summary = await summarizeChannel(formatted, count);
        return {
          success: true,
          data: `📋 Résumé du salon (${sorted.length} messages):\n\n${summary}`,
        };
      }

      // ── export_chat ──
      case "export_chat": {
        const format = String(args.format ?? "markdown");
        const limit = Math.min(Number(args.limit ?? 50), 100);
        const messages = await exportChannelMessages(ctx.channelId, limit);
        if (messages.length === 0) return { success: false, data: "Aucun message à exporter" };
        const content = format === "csv" ? exportToCSV(messages) : exportToMarkdown(messages);
        const ext = format === "csv" ? "csv" : "md";
        const filename = `export-${ctx.channelId}-${Date.now()}.${ext}`;
        const channel = ctx.client.channels.cache.get(ctx.channelId) as TextChannel | undefined;
        if (!channel) return { success: false, data: "Salon introuvable" };
        const attachment = new AttachmentBuilder(Buffer.from(content, "utf-8"), { name: filename });
        await channel.send({
          content: `📦 Export de ${messages.length} messages`,
          files: [attachment],
        });
        return {
          success: true,
          data: `Export envoyé: ${filename} (${messages.length} messages, format ${format})`,
        };
      }

      // ── resolve_dns ──
      case "resolve_dns": {
        const domain = String(args.domain ?? "");
        if (!domain) return { success: false, data: "Domaine requis" };
        const result = await fullDnsLookup(domain);
        const lines: string[] = [];
        if (result.a.length > 0) lines.push(`A: ${result.a.join(", ")}`);
        if (result.aaaa.length > 0) lines.push(`AAAA: ${result.aaaa.join(", ")}`);
        if (result.mx.length > 0)
          lines.push(`MX: ${result.mx.map((m) => `${m.priority} ${m.exchange}`).join(", ")}`);
        if (result.ns.length > 0) lines.push(`NS: ${result.ns.join(", ")}`);
        if (result.txt.length > 0) lines.push(`TXT: ${result.txt.slice(0, 5).join(", ")}`);
        if (result.cname.length > 0) lines.push(`CNAME: ${result.cname.join(", ")}`);
        if (result.ptr.length > 0) lines.push(`PTR: ${result.ptr.slice(0, 3).join(", ")}`);
        if (lines.length === 0)
          return { success: true, data: `Aucun enregistrement DNS trouvé pour ${domain}` };
        return { success: true, data: `🔍 DNS pour ${domain}:\n${lines.join("\n")}` };
      }

      // ── compare_game_prices ──
      case "compare_game_prices": {
        const gameName = String(args.gameName ?? "");
        if (!gameName) return { success: false, data: "Nom du jeu requis" };
        const result = await compareGamePrices(gameName);
        if (result.prices.length === 0)
          return { success: false, data: `Aucun prix trouvé pour "${gameName}"` };
        const formatted = result.prices
          .map((p) => `${p.store}: ${p.price} ${p.currency}`)
          .join("\n");
        const cheapest = result.cheapest
          ? `\n\n💰 Meilleur prix: ${result.cheapest.store} à ${result.cheapest.price} ${result.cheapest.currency}`
          : "";
        return { success: true, data: `🎮 Prix pour "${gameName}":\n${formatted}${cheapest}` };
      }

      // ── check_game_server ──
      case "check_game_server": {
        const host = String(args.host ?? "");
        if (!host) return { success: false, data: "Adresse du serveur requise" };
        const port = Number(args.port ?? 25565);
        const info = await queryMinecraft(host, port);
        if (!info.online) return { success: true, data: `🔴 Serveur ${host}:${port} hors ligne` };
        const playerList =
          info.playersList && info.playersList.length > 0
            ? `\nJoueurs: ${info.playersList.slice(0, 10).join(", ")}${info.playersList.length > 10 ? "..." : ""}`
            : "";
        return {
          success: true,
          data: `🟢 Serveur ${host}:${port} en ligne\nJoueurs: ${info.players.online}/${info.players.max}${info.version ? `\nVersion: ${info.version}` : ""}${info.motd ? `\nMOTD: ${info.motd}` : ""}${info.ping ? `\nPing: ${info.ping}ms` : ""}${playerList}`,
        };
      }

      // ── set_reminder ──
      case "set_reminder": {
        const text = String(args.text ?? "");
        const whenStr = String(args.when ?? "");
        if (!text || !whenStr) return { success: false, data: "Texte et date requis" };
        const remindAt = parseNaturalDate(whenStr);
        if (!remindAt)
          return {
            success: false,
            data: `Format de date non reconnu: "${whenStr}". Exemples: 'dans 2 heures', 'demain 15h', '2024-12-25 10:00'`,
          };
        if (remindAt.getTime() <= Date.now())
          return { success: false, data: "La date du rappel doit être dans le futur" };
        const id = setReminder(ctx.userId, ctx.channelId, text, remindAt);
        return {
          success: true,
          data: `⏰ Rappel programmé pour ${remindAt.toLocaleString("fr-FR")}: "${text}" (ID: ${id})`,
        };
      }

      // ── search_server_history ──
      case "search_server_history": {
        const query = String(args.query ?? "").trim();
        if (!query) return { success: false, data: "Requête de recherche requise" };
        const daysBack = Math.min(Number(args.daysBack ?? 7), 90);
        const since = new Date(Date.now() - daysBack * 86400_000);

        const where: Record<string, unknown> = {
          content: { contains: query, mode: "insensitive" },
          createdAt: { gte: since },
        };
        if (args.userId) where.userId = String(args.userId);
        if (args.channelId) where.channelId = String(args.channelId);
        else if (ctx.guildId) where.guildId = ctx.guildId;

        const results = await prisma.chatHistory.findMany({
          where,
          orderBy: { createdAt: "desc" },
          take: 20,
        });

        if (results.length === 0) {
          return {
            success: true,
            data: `Aucun message trouvé pour "${query}" dans les ${daysBack} derniers jours`,
          };
        }

        const formatted = results
          .map(
            (m) =>
              `[${m.createdAt.toISOString().slice(0, 16)}] <${m.userId ?? "unknown"}> #${m.channelId}: ${m.content.slice(0, 150)}`,
          )
          .join("\n");
        return {
          success: true,
          data: `🔍 ${results.length} message(s) trouvé(s) pour "${query}" (${daysBack}j):\n${formatted}`,
        };
      }

      default:
        return null;
    }
  } catch (err) {
    const errMsg = err instanceof Error ? err.message : String(err);
    logger.warn(`[OrphanTools] ❌ ${toolName} failed: ${errMsg}`);
    return { success: false, data: `Erreur ${toolName}: ${errMsg}` };
  }
}
