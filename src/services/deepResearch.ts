/**
 * deepResearch.ts — Mode Deep Research (recherche approfondie multi-étapes)
 *
 * Orchestrateur qui:
 * 1. Planifie N requêtes de recherche à partir de la question
 * 2. Exécute chaque requête (searchWeb + webIngestion)
 * 3. Synthétise les résultats en un rapport sourcé
 * 4. Génère un fichier .md joint sur Discord
 */

import { Message, AttachmentBuilder } from "discord.js";
import logger from "../utils/logger.js";
import { getOpenAIClient } from "./ai.js";
import { config } from "../config.js";

interface ResearchStep {
  query: string;
  results: string;
  sources: string[];
}

/**
 * Detects if a message is a deep research request.
 */
export function isDeepResearchRequest(message: string): boolean {
  const lower = message.toLowerCase();
  return (
    lower.includes("deep research") ||
    lower.includes("recherche approfondie") ||
    lower.includes("recherche complète sur") ||
    lower.includes("fais une étude sur") ||
    lower.includes("rapport de recherche") ||
    lower.includes("research report on")
  );
}

/**
 * Step 1: Generate a research plan (list of search queries).
 */
async function generateResearchPlan(topic: string): Promise<string[]> {
  const client = getOpenAIClient();
  const completion = await client.chat.completions.create({
    model: config.openRouterModel,
    messages: [
      {
        role: "system",
        content:
          "Tu es un planificateur de recherche. Génère 5 requêtes de recherche web pertinentes " +
          'pour explorer en profondeur le sujet donné. Réponds en JSON: {"queries": ["q1", "q2", ...]}. ' +
          "Les requêtes doivent couvrir différents aspects du sujet.",
      },
      { role: "user", content: topic },
    ],
    max_tokens: 300,
    temperature: 0.5,
  });

  const raw = completion.choices[0]?.message?.content ?? "{}";
  const jsonMatch = raw.match(/\{[\s\S]*\}/);
  if (!jsonMatch) return [topic];

  try {
    const parsed = JSON.parse(jsonMatch[0]) as { queries?: string[] };
    return parsed.queries?.slice(0, 5) ?? [topic];
  } catch {
    return [topic];
  }
}

/**
 * Step 2: Execute a single search query.
 */
async function executeSearch(query: string): Promise<{ results: string; sources: string[] }> {
  try {
    const apiKey = process.env.OPENROUTER_API_KEY;
    if (!apiKey) return { results: "API non configurée", sources: [] };

    // Use Google search via OpenRouter or direct web search
    const response = await fetch(
      `https://www.googleapis.com/customsearch/v1?key=${process.env.GOOGLE_API_KEY ?? ""}&cx=${process.env.GOOGLE_CSE_ID ?? ""}&q=${encodeURIComponent(query)}&num=5`,
      { signal: AbortSignal.timeout(15000) },
    ).catch(() => null);

    if (response && response.ok) {
      const data = (await response.json()) as {
        items?: Array<{ title: string; link: string; snippet: string }>;
      };
      if (data.items && data.items.length > 0) {
        const results = data.items.map((item) => `**${item.title}**: ${item.snippet}`).join("\n\n");
        const sources = data.items.map((item) => item.link);
        return { results, sources };
      }
    }

    // Fallback: simple DuckDuckGo HTML scrape
    const ddgResponse = await fetch(
      `https://html.duckduckgo.com/html/?q=${encodeURIComponent(query)}`,
      {
        headers: { "User-Agent": "Mozilla/5.0" },
        signal: AbortSignal.timeout(10000),
      },
    ).catch(() => null);

    if (ddgResponse && ddgResponse.ok) {
      const html = await ddgResponse.text();
      const snippets: string[] = [];
      const links: string[] = [];
      const snippetMatches = html.match(/<a class="result__a"[^>]*>([^<]+)<\/a>/g);
      const linkMatches = html.match(/<a class="result__a" href="([^"]+)"/g);
      if (snippetMatches) {
        for (const m of snippetMatches.slice(0, 5)) {
          const text = m.replace(/<[^>]+>/g, "").trim();
          snippets.push(text);
        }
      }
      if (linkMatches) {
        for (const m of linkMatches.slice(0, 5)) {
          const href = m.match(/href="([^"]+)"/)?.[1] ?? "";
          if (href) links.push(href);
        }
      }
      if (snippets.length > 0) {
        return { results: snippets.join("\n\n"), sources: links };
      }
    }

    return { results: "Aucun résultat trouvé", sources: [] };
  } catch (err) {
    logger.debug(`[DeepResearch] Search failed for "${query}": ${err}`);
    return {
      results: `Erreur de recherche: ${err instanceof Error ? err.message : String(err)}`,
      sources: [],
    };
  }
}

/**
 * Step 3: Synthesize all research into a final report.
 */
async function synthesizeReport(topic: string, steps: ResearchStep[]): Promise<string> {
  const client = getOpenAIClient();
  const allSources = [...new Set(steps.flatMap((s) => s.sources))];

  const researchData = steps
    .map((s, i) => `## Recherche ${i + 1}: ${s.query}\n${s.results}`)
    .join("\n\n---\n\n");

  const completion = await client.chat.completions.create({
    model: config.openRouterModel,
    messages: [
      {
        role: "system",
        content:
          "Tu es un analyste de recherche. Synthétise les résultats de recherche en un rapport " +
          "structuré et sourcé. Utilise le format Markdown avec des sections, des citations [1], [2], etc. " +
          "et une liste de sources à la fin. Réponds dans la langue de la question.",
      },
      {
        role: "user",
        content: `Sujet: ${topic}\n\nRésultats de recherche:\n${researchData}\n\nSources:\n${allSources.map((s, i) => `[${i + 1}] ${s}`).join("\n")}`,
      },
    ],
    max_tokens: 2000,
    temperature: 0.5,
  });

  const report = completion.choices[0]?.message?.content ?? "Synthèse échouée";

  // Append sources
  const sourcesSection =
    allSources.length > 0
      ? `\n\n---\n\n## Sources\n${allSources.map((s, i) => `[${i + 1}] ${s}`).join("\n")}`
      : "";

  return report + sourcesSection;
}

/**
 * Main entry point: runs a deep research and sends the report as a file.
 */
export async function runDeepResearch(message: Message, topic: string): Promise<boolean> {
  try {
    // Notify user
    const statusMsg = await message.reply(
      "🔬 **Deep Research lancé** — Planification des recherches...",
    );

    // Step 1: Plan
    const queries = await generateResearchPlan(topic);
    await statusMsg.edit(
      `🔬 **Deep Research** — ${queries.length} recherches planifiées. Exécution en cours...`,
    );

    // Step 2: Execute searches
    const steps: ResearchStep[] = [];
    for (let i = 0; i < queries.length; i++) {
      await statusMsg.edit(
        `🔬 **Deep Research** — Recherche ${i + 1}/${queries.length}: "${queries[i].slice(0, 50)}..."`,
      );
      const { results, sources } = await executeSearch(queries[i]);
      steps.push({ query: queries[i], results, sources });
    }

    // Step 3: Synthesize
    await statusMsg.edit("🔬 **Deep Research** — Synthèse du rapport en cours...");
    const report = await synthesizeReport(topic, steps);

    // Step 4: Send as file
    const fileName = `research_${topic.slice(0, 30).replace(/[^a-zA-Z0-9]/g, "_")}_${Date.now()}.md`;
    const attachment = new AttachmentBuilder(Buffer.from(report, "utf-8"), { name: fileName });

    await statusMsg.edit({
      content: `🔬 **Deep Research terminé** — ${steps.length} recherches effectuées, ${steps.flatMap((s) => s.sources).length} sources trouvées.\nRapport complet en fichier joint:`,
      files: [attachment],
    });

    logger.info(
      `[DeepResearch] Completed for "${topic}" — ${steps.length} steps, report: ${report.length} chars`,
    );
    return true;
  } catch (err) {
    logger.error(`[DeepResearch] Failed: ${err instanceof Error ? err.message : String(err)}`);
    return false;
  }
}
