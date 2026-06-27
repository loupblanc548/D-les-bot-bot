/**
 * recherche.ts — Commande /recherche
 *
 * Recherche sur Internet via DuckDuckGo (Instant Answer API + scraping HTML)
 * Affiche un résumé + une liste de liens pertinents.
 */

import { ChatInputCommandInteraction, SlashCommandBuilder, EmbedBuilder } from "discord.js";
import logger from "../utils/logger.js";

interface SearchResult {
  title: string;
  url: string;
  snippet: string;
}

export const commands = [
  new SlashCommandBuilder()
    .setName("recherche")
    .setDescription("Recherche sur Internet des informations sur un sujet")
    .addStringOption((o) =>
      o
        .setName("sujet")
        .setDescription("Le sujet à rechercher")
        .setRequired(true)
        .setMaxLength(500),
    )
    .addStringOption((o) =>
      o
        .setName("langue")
        .setDescription("Langue des résultats")
        .setRequired(false)
        .addChoices(
          { name: "🇫🇷 Français", value: "fr" },
          { name: "🇬🇧 English", value: "en" },
          { name: "🇪🇸 Español", value: "es" },
          { name: "🇩🇪 Deutsch", value: "de" },
          { name: "🇮🇹 Italiano", value: "it" },
        ),
    )
    .toJSON(),
];

export async function handleCommand(interaction: ChatInputCommandInteraction) {
  const query = interaction.options.getString("sujet", true);
  const lang = interaction.options.getString("langue") || "fr";

  await interaction.deferReply();

  try {
    // 1. Essayer l'Instant Answer API de DuckDuckGo
    const instantAnswer = await fetchInstantAnswer(query, lang);

    // 2. Scraper les résultats de recherche DuckDuckGo
    const searchResults = await scrapeDuckDuckGo(query, lang);

    // 3. Rechercher sur FindSkills (94 000+ AI skills)
    const skillsResults = await searchFindSkills(query);

    if (!instantAnswer && searchResults.length === 0) {
      await interaction.editReply({
        content: `❌ Aucun résultat trouvé pour **"${query}"**.`,
      });
      return;
    }

    // Construire l'embed
    const embed = new EmbedBuilder()
      .setColor(0x4285f4)
      .setTitle(`🔍 Recherche : ${query}`)
      .setFooter({
        text: "Résultats via DuckDuckGo + FindSkills",
        iconURL: "https://www.findskills.org/favicon.ico",
      })
      .setTimestamp();

    // Ajouter le résumé si disponible
    if (instantAnswer) {
      embed.setDescription(instantAnswer.abstract);
      if (instantAnswer.source) {
        embed.addFields({
          name: "📖 Source",
          value: `[${instantAnswer.sourceTitle || "Wikipedia"}](${instantAnswer.source})`,
          inline: true,
        });
      }
      if (instantAnswer.image) {
        embed.setThumbnail(instantAnswer.image);
      }
    } else {
      embed.setDescription(
        "*Aucun résumé encyclopédique disponible. Voici les meilleurs résultats de recherche :*",
      );
    }

    // Ajouter les liens (max 8)
    const maxResults = 8;
    const results = searchResults.slice(0, maxResults);

    if (results.length > 0) {
      const linksText = results
        .map((r, i) => `**${i + 1}.** [${r.title}](${r.url})\n${r.snippet}`)
        .join("\n\n");

      embed.addFields({
        name: `🌐 Résultats (${results.length})`,
        value: linksText.slice(0, 1024) || "Aucun lien disponible",
      });
    }

    // Ajouter les résultats FindSkills (AI skills)
    if (skillsResults.length > 0) {
      const skillsText = skillsResults
        .map((s, i) => `**${i + 1}.** ${s.name} — ${s.description}`)
        .join("\n");
      embed.addFields({
        name: `🤖 FindSkills (${skillsResults.length})`,
        value: skillsText.slice(0, 1024),
      });
    }

    // Ajouter un lien vers la recherche complète
    const searchUrl = `https://duckduckgo.com/?q=${encodeURIComponent(query)}&ia=web`;
    const findskillsUrl = `https://www.findskills.org/?q=${encodeURIComponent(query)}`;
    embed.addFields({
      name: "🔗 Voir plus",
      value: `[DuckDuckGo](${searchUrl}) • [FindSkills](${findskillsUrl})`,
    });

    await interaction.editReply({ embeds: [embed] });
    logger.info(
      `[Recherche] ${interaction.user.tag} a recherché "${query}" (${lang}) — ${searchResults.length} web + ${skillsResults.length} skills`,
    );
  } catch (error) {
    logger.error("[Recherche] Erreur:", error);
    try {
      await interaction.editReply({ content: "❌ Une erreur est survenue lors de la recherche." });
    } catch {}
  }
}

// ─── DuckDuckGo Instant Answer API ─────────────────────────────────────────────

interface InstantAnswer {
  abstract: string;
  source: string | null;
  sourceTitle: string | null;
  image: string | null;
}

async function fetchInstantAnswer(query: string, lang: string): Promise<InstantAnswer | null> {
  try {
    const url = `https://api.duckduckgo.com/?q=${encodeURIComponent(query)}&format=json&no_html=1&skip_disambig=1&kl=${lang}-${lang}`;

    const res = await fetch(url, {
      headers: { "User-Agent": "DiscordBot/1.0" },
      signal: AbortSignal.timeout(8000),
    });

    if (!res.ok) return null;

    const data = (await res.json()) as {
      Abstract?: string;
      AbstractURL?: string;
      AbstractSource?: string;
      Image?: string;
      Heading?: string;
    };

    if (!data.Abstract && !data.Heading) return null;

    return {
      abstract: data.Abstract || data.Heading || "",
      source: data.AbstractURL || null,
      sourceTitle: data.AbstractSource || null,
      image: data.Image ? `https://duckduckgo.com${data.Image}` : null,
    };
  } catch {
    return null;
  }
}

// ─── Scraping DuckDuckGo HTML ──────────────────────────────────────────────────

async function scrapeDuckDuckGo(query: string, lang: string): Promise<SearchResult[]> {
  try {
    const url = `https://html.duckduckgo.com/html/?q=${encodeURIComponent(query)}&kl=${lang}-${lang}`;

    const res = await fetch(url, {
      headers: {
        "User-Agent":
          "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
        Accept: "text/html",
        "Accept-Language": lang,
      },
      signal: AbortSignal.timeout(10000),
    });

    if (!res.ok) return [];

    const html = await res.text();
    return parseDuckDuckGoHtml(html);
  } catch (error) {
    logger.warn("[Recherche] Erreur scraping DuckDuckGo:", error);
    return [];
  }
}

function parseDuckDuckGoHtml(html: string): SearchResult[] {
  const results: SearchResult[] = [];

  // DuckDuckGo HTML utilise des div.result avec des liens .result__a
  // et des snippets .result__snippet
  const resultRegex =
    /<a[^>]*class="[^"]*result__a[^"]*"[^>]*href="([^"]*)"[^>]*>(.*?)<\/a>[\s\S]*?<a[^>]*class="[^"]*result__snippet[^"]*"[^>]*>(.*?)<\/a>/gi;

  let match: RegExpExecArray | null;
  while ((match = resultRegex.exec(html)) !== null && results.length < 10) {
    const rawUrl = match[1];
    const title = stripHtml(match[2]).trim();
    const snippet = stripHtml(match[3]).trim();

    // DuckDuckGo redirige via /l/?uddg= — extraire l'URL réelle
    const url = decodeDuckDuckGoUrl(rawUrl);

    if (title && url && !url.includes("duckduckgo.com")) {
      results.push({
        title: title.slice(0, 200),
        url,
        snippet: snippet.slice(0, 300),
      });
    }
  }

  // Fallback : parser plus simple si le regex ci-dessus ne matche pas
  if (results.length === 0) {
    const simpleLinkRegex =
      /<a[^>]*class="[^"]*result__a[^"]*"[^>]*href="([^"]*)"[^>]*>(.*?)<\/a>/gi;
    while ((match = simpleLinkRegex.exec(html)) !== null && results.length < 10) {
      const rawUrl = match[1];
      const title = stripHtml(match[2]).trim();
      const url = decodeDuckDuckGoUrl(rawUrl);

      if (title && url && !url.includes("duckduckgo.com")) {
        results.push({ title: title.slice(0, 200), url, snippet: "" });
      }
    }
  }

  return results;
}

function decodeDuckDuckGoUrl(rawUrl: string): string {
  try {
    // Format DuckDuckGo: /l/?uddg=ENCODED_URL&rut=...
    if (rawUrl.includes("uddg=")) {
      const uddgMatch = rawUrl.match(/uddg=([^&]+)/);
      if (uddgMatch) {
        return decodeURIComponent(uddgMatch[1]);
      }
    }
    // URL directe
    if (rawUrl.startsWith("http")) return rawUrl;
    return `https://duckduckgo.com${rawUrl}`;
  } catch {
    return rawUrl;
  }
}

// ─── FindSkills API ────────────────────────────────────────────────────────────

interface FindSkillResult {
  name: string;
  description: string;
  category: string;
  url?: string;
}

async function searchFindSkills(query: string): Promise<FindSkillResult[]> {
  try {
    const url = `https://www.findskills.org/api/v1/search?q=${encodeURIComponent(query)}&limit=5&sort=relevance`;

    const res = await fetch(url, {
      headers: { "User-Agent": "DiscordBot/1.0" },
      signal: AbortSignal.timeout(8000),
    });

    if (!res.ok) {
      logger.warn(`[Recherche] FindSkills HTTP ${res.status}`);
      return [];
    }

    const data = (await res.json()) as {
      skills?: Array<{
        name: string;
        description: string;
        category?: string;
        url?: string;
        _featured?: boolean;
      }>;
    };

    if (!data.skills) return [];

    return data.skills.slice(0, 5).map((s) => ({
      name: s.name,
      description: (s.description || "").slice(0, 150),
      category: s.category || "other",
      url: s.url,
    }));
  } catch (error) {
    logger.warn("[Recherche] Erreur FindSkills:", error);
    return [];
  }
}

function stripHtml(html: string): string {
  return html
    .replace(/<[^>]*>/g, "")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&nbsp;/g, " ")
    .trim();
}
