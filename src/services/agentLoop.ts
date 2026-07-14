/**
 * agentLoop.ts — Boucle de réflexion de l'Agent IA
 *
 * Implémente le cycle Think → Act → Observe → Respond :
 *  1. PENSER : L'IA reçoit le message + l'historique + les tools disponibles
 *  2. AGIR : Si l'IA demande un tool, on l'exécute sur Discord
 *  3. OBSERVER : On renvoie le résultat du tool à l'IA
 *  4. RÉPONDRE : L'IA synthétise et produit sa réponse finale
 *
 * La boucle peut faire plusieurs cycles (max 5) si l'IA enchaîne plusieurs tools.
 */

import { Client, Message } from "discord.js";
import logger from "../utils/logger.js";
import { config } from "../config.js";
import { getOpenAIClient } from "./ai.js";
import { getGroqClient, isGroqAvailable } from "./groq.js";
import { ALL_AGENT_TOOLS, executeTool, type ToolContext } from "./agentTools.js";
import prisma from "../prisma.js";
import {
  beginInteraction,
  recordLoop,
  completeInteraction,
  tripBreaker,
  createTrippedEmbed,
} from "./circuitBreaker.js";
import { generatePlan, formatPlanForPrompt } from "./agentPlanner.js";
import { storeMemory, formatMemoriesForPrompt, persistMemoryToDb } from "./agentMemory.js";
import { reflectOnToolResult, resetRetries, type ToolExecutionResult } from "./agentReflector.js";
import {
  routeTools,
  getToolHints,
  suggestToolChain,
  getApiKeyStatusLine,
} from "./agentToolRouter.js";
import {
  buildPersonalitySystemPrompt,
  getPersonalityModel,
  getPersonalityTemperature,
  getPersonalityMaxTokens,
} from "../infrastructure/middleware/personalityMiddleware.js";

// ─── Configuration ───────────────────────────────────────────────────────────

const MAX_ITERATIONS = 5;
const MAX_HISTORY_MESSAGES = 15;
const MAX_MEMORY_FACTS = 5;
const AGENT_LOOP_TIMEOUT_MS = 30_000; // 30s max for the entire agent loop

// Per-user concurrency lock: prevents the same user from triggering multiple agent loops
const activeAgentLoops = new Set<string>();

// ─── Types ───────────────────────────────────────────────────────────────────

interface ChatMessage {
  role: "system" | "user" | "assistant" | "tool";
  content: string;
  tool_call_id?: string;
  tool_calls?: unknown;
}

// ─── Mémoire long-terme ──────────────────────────────────────────────────────

/**
 * Récupère les faits mémoire pertinents pour un utilisateur.
 * Utilisé pour donner du contexte long-terme à l'IA.
 */
async function loadLongTermMemory(userId: string): Promise<string> {
  try {
    const facts = await prisma.memoryFact.findMany({
      where: { userId },
      orderBy: { weight: "desc" },
      take: MAX_MEMORY_FACTS,
    });

    if (facts.length === 0) return "";

    const factLines = facts.map((f) => `- ${f.key}: ${f.value} (${f.category || "info"})`);
    return `\n## Mémoire long-terme sur cet utilisateur\n${factLines.join("\n")}\n`;
  } catch {
    return "";
  }
}

/**
 * Récupère l'historique récent du salon (court-terme).
 */
async function loadChannelHistory(message: Message): Promise<ChatMessage[]> {
  try {
    const messages = await message.channel.messages.fetch({ limit: MAX_HISTORY_MESSAGES });
    const sorted = [...messages.values()].sort((a, b) => a.createdTimestamp - b.createdTimestamp);

    const history: ChatMessage[] = [];
    for (const msg of sorted) {
      if (msg.author.bot && msg.author.id !== message.client.user?.id) continue;
      if (!msg.content || msg.content.trim().length === 0) continue;

      const role = msg.author.id === message.client.user?.id ? "assistant" : "user";
      const authorName = msg.author.username;
      history.push({
        role,
        content: role === "user" ? `${authorName}: ${msg.content}` : msg.content,
      });
    }

    return history;
  } catch {
    return [];
  }
}

// ─── Boucle principale de l'agent ────────────────────────────────────────────

/**
 * Exécute la boucle de l'agent IA avec function calling.
 *
 * @param message Le message Discord qui a déclenché l'agent
 * @param userMessage Le contenu du message (sans la mention du bot)
 * @returns La réponse finale de l'IA
 */
export async function runAgentLoop(message: Message, userMessage: string): Promise<string> {
  // Concurrency lock: prevent the same user from running multiple agent loops
  if (activeAgentLoops.has(message.author.id)) {
    return "⏳ Je traite déjà ton message précédent, soldat ! Patiente un instant.";
  }
  activeAgentLoops.add(message.author.id);

  try {
    return await Promise.race([
      runAgentLoopInternal(message, userMessage),
      new Promise<string>((_, reject) =>
        setTimeout(() => reject(new Error("AgentLoop timeout (30s)")), AGENT_LOOP_TIMEOUT_MS),
      ),
    ]);
  } finally {
    activeAgentLoops.delete(message.author.id);
  }
}

// ─── Retry wrapper for OpenRouter API calls ─────────────────────────────────

const API_MAX_RETRIES = 3;
const API_BASE_DELAY_MS = 1_000;

interface RetryableError {
  status?: number;
  message: string;
}

function isRetryableError(err: unknown): boolean {
  const e = err as RetryableError;
  if (
    e.status === 429 ||
    e.status === 500 ||
    e.status === 502 ||
    e.status === 503 ||
    e.status === 504
  ) {
    return true;
  }
  if (
    !e.status &&
    (e.message.includes("timeout") ||
      e.message.includes("ECONNRESET") ||
      e.message.includes("fetch failed") ||
      e.message.includes("socket hang up"))
  ) {
    return true;
  }
  return false;
}

async function callLlmWithRetry(
  client: ReturnType<typeof getOpenAIClient>,
  params: Record<string, unknown>,
  options: { timeout: number },
): Promise<Awaited<ReturnType<typeof client.chat.completions.create>>> {
  let lastError: Error | null = null;

  for (let attempt = 0; attempt <= API_MAX_RETRIES; attempt++) {
    try {
      const result = await client.chat.completions.create(params as never, options as never);
      return result;
    } catch (err) {
      lastError = err instanceof Error ? err : new Error(String(err));

      if (attempt < API_MAX_RETRIES && isRetryableError(err)) {
        const delay = API_BASE_DELAY_MS * Math.pow(2, attempt) + Math.random() * 500;
        logger.warn(
          `[AgentLoop] API retry ${attempt + 1}/${API_MAX_RETRIES} in ${Math.round(delay)}ms: ${lastError.message}`,
        );
        await new Promise((r) => setTimeout(r, delay));
        continue;
      }

      throw lastError;
    }
  }

  throw lastError ?? new Error("API call failed after retries");
}

async function runAgentLoopInternal(message: Message, userMessage: string): Promise<string> {
  const client = getOpenAIClient();
  const ctx: ToolContext = {
    client: message.client as Client,
    message,
    userId: message.author.id,
    guildId: message.guildId || "",
    channelId: message.channelId,
  };

  // ─── MODULE 1: Circuit Breaker — track execution state ───
  const breakerState = beginInteraction(message.author.id, message.guildId || "");

  // ─── MODULE A: Planification multi-étapes ───
  const availableTools = routeTools(userMessage, ALL_AGENT_TOOLS);
  const toolNames = availableTools.map((t) => t.function.name);
  const plan = await generatePlan(userMessage, toolNames);
  const planPrompt = plan ? formatPlanForPrompt(plan) : "";

  // ─── MODULE B: Mémoire vectorielle — récupérer le contexte pertinent ───
  const memoryPrompt = formatMemoriesForPrompt(
    message.author.id,
    userMessage,
    message.guildId || undefined,
  );

  // 1. Construire le contexte (mémoire + historique) — en parallèle pour la perf
  const [longTermMemory, channelHistory] = await Promise.all([
    loadLongTermMemory(message.author.id),
    loadChannelHistory(message),
  ]);

  const systemPrompt =
    buildPersonalitySystemPrompt(config.aiSystemPrompt) +
    "\n\nIMPORTANT: Tu réponds dans la langue du message que tu reçois. " +
    "Adapte-toi à n'importe quelle langue du monde. " +
    "\n\nTu es John Helldiver, un agent IA autonome sur Discord. " +
    "Tu as accès à Internet et à plus de 40 outils.\n\n" +
    "## PROCESSUS DE RAISONNEMENT\n" +
    "Tu DOIS suivre ce cycle pour chaque message utilisateur :\n" +
    "1. REASON : Analyse la demande, détermine quels tools sont nécessaires\n" +
    "2. ACT : Appelle les tools pertinents (searchWeb, getWeather, analyze_image, etc.)\n" +
    "3. OBSERVE : Analyse les résultats retournés par les tools\n" +
    "4. REPLY : Formule ta réponse finale\n\n" +
    "## FORMAT DE RÉPONSE OBLIGATOIRE\n" +
    "Ta réponse finale DOIT contenir exactement 3 blocs :\n\n" +
    "[ANALYSIS] Résumé des findings des tools (détails image, score sentiment, données récupérées)\n" +
    "[RESPONSE] Ta réponse directe à l'utilisateur\n" +
    "[SUGGESTION] Suggestion proactive ou prochaine action recommandée\n\n" +
    "## TOOLS DISPONIBLES\n" +
    "### Internet & Recherche\n" +
    "- searchWeb, readUrl, searchYouTube, getWikipediaSummary, getTechNews, getRedditPosts\n" +
    "### APIs gratuites\n" +
    "- getWeather, getCryptoPrice, getStockPrice, getCurrencyRate, getCountryInfo, getDateTime\n" +
    "- getIpInfo, translateText, getUrbanDict\n" +
    "### Fun\n" +
    "- getJoke, getDadJoke, getAdvice, getQuote, getTrivia, getMeme, getDogImage, getCatImage\n" +
    "### Gaming & Dev\n" +
    "- getPokemon, getSteamGame, getNpmPackage, getPypiPackage, getGitHubRepo, getGithubUser\n" +
    "### Science\n" +
    "- getNasaApod, getBookInfo\n" +
    "### Utilities\n" +
    "- shortenUrl, getQrCode, getRandomUser\n" +
    "### Code Sandbox (exécution de code)\n" +
    "- execute_code : exécute du code Python, JavaScript ou shell dans une sandbox sécurisée. Utilise-le quand l'utilisateur demande d'écrire et exécuter un script, faire un calcul, analyser des données, générer un fichier. Timeout 15s. E2B cloud si configuré, sinon local.\n" +
    "### Génération d'images & audio (gratuit)\n" +
    "- generate_image : génère une image from text (Pollinations.ai, gratuit). Retourne une URL.\n" +
    "- generate_tts : convertit du texte en audio (StreamElements, gratuit). Voix FR: Celine, Mathieu, Chantal.\n" +
    "### Science & Data (gratuit)\n" +
    "- get_nasa_apod : image astronomique du jour (NASA)\n" +
    "- get_earthquakes : séismes récents dans le monde (USGS)\n" +
    "- search_arxiv : papers scientifiques (arXiv)\n" +
    "- search_books : recherche de livres (OpenLibrary)\n" +
    "- search_food : produits alimentaires avec nutriscore (OpenFoodFacts)\n" +
    "- get_flights : vols en temps réel (OpenSky)\n" +
    "- get_google_trends : tendances de recherche Google\n" +
    "### Gaming (gratuit)\n" +
    "- get_chess_stats : stats Chess.com d'un joueur\n" +
    "- get_lichess_stats : stats Lichess d'un joueur\n" +
    "- get_pokemon : infos Pokémon (PokeAPI)\n" +
    "### Dev & Code (gratuit)\n" +
    "- get_npm_package : infos d'un package NPM\n" +
    "- get_pypi_package : infos d'un package Python PyPI\n" +
    "- get_devto_articles : articles Dev.to\n" +
    "### Finance (gratuit)\n" +
    "- get_stock_price : prix d'une action (Alpha Vantage)\n" +
    "- get_currency_rate : conversion de devises\n" +
    "### Social & Web (gratuit — contourne les APIs payantes)\n" +
    "- get_rsshub_feed : flux RSS de Twitter/Instagram/TikTok/YouTube via RSSHub (SANS API payante). Ex: twitter/user/elonmusk\n" +
    "### Misc (gratuit)\n" +
    "- get_country_info : infos d'un pays (capitale, population, langues, drapeau)\n" +
    "- get_urban_dict : définition d'argot (Urban Dictionary)\n" +
    "- get_cat_image : image aléatoire de chat\n" +
    "- get_random_user : profil utilisateur aléatoire\n" +
    "### VPS & Système (externe)\n" +
    "- system_stats : CPU, RAM, disk, uptime du VPS en temps réel\n" +
    "- ssh_command : exécute des commandes shell sur le VPS (whitelist). Nécessite AGENT_SSH_ENABLED=true\n" +
    "- db_query : interroge la DB PostgreSQL (SELECT seulement)\n" +
    "- git_operations : status, log, pull, diff sur le repo du bot. Nécessite AGENT_GIT_ENABLED=true\n" +
    "- docker_manage : liste/logs/restart/stats des containers Docker. Nécessite AGENT_DOCKER_ENABLED=true\n" +
    "- file_read : lit un fichier sur le VPS (chemin absolu)\n" +
    "### Web & HTTP (externe)\n" +
    "- http_request : fait n'importe quelle requête HTTP (GET/POST/PUT/DELETE) vers n'importe quelle URL\n" +
    "- rss_monitor : surveille un flux RSS arbitraire et retourne les derniers articles\n" +
    "- website_diff : détecte les changements sur une page web (compare avec la dernière vérification)\n" +
    "- cron_create : crée un cron job dynamique pour automatiser des tâches récurrentes\n" +
    "### Agent autonome\n" +
    "- analyze_image : analyse une image attachée (URL requis)\n" +
    "- analyze_sentiment : analyse le sentiment et la toxicité d'un texte\n" +
    "- triggerGarbageCollection : nettoyage automatique de la RAM du bot\n" +
    "- summarize_conversation : résume les N derniers messages d'un salon (utile pour rattraper une conversation)\n" +
    "- detect_language : détecte la langue d'un texte (rapide, sans API)\n" +
    "- get_server_insights : statistiques avancées du serveur (membres, channels, rôles, croissance)\n" +
    "### Tools autonomes avancés\n" +
    "- get_user_moderation_history : historique de modération d'un utilisateur\n" +
    "- scrape_urban_slang : définit un terme d'argot via Urban Dictionary\n" +
    "- evaluate_channel_velocity : analyse le taux de messages (raid detection)\n" +
    "- calculate_server_panic_index : indice de panique serveur (raid risk)\n" +
    "- emergency_channel_freeze : verrouille un salon (anti-raid d'urgence)\n" +
    "- verify_link_safety : vérifie une URL via URLVoid (phishing/malware)\n" +
    "- detect_disposable_email : détecte les emails jetables\n" +
    "- scrape_steamrep_status : vérifie les bans Steam d'un profil\n" +
    "- detect_typosquatting : détecte les domaines frauduleux (d1scord, stean)\n" +
    "- track_avatar_hash : hash SHA-256 avatar pour détecter les évadés de ban\n" +
    "- expose_ghost_pinger : détecte les ghost pings (mentions supprimées)\n" +
    "- match_fortnite_shop_wishlist : compare wishlists avec le shop Fortnite\n" +
    "- scrape_epic_free_countdown : jeux gratuits Epic Games actuels/à venir\n" +
    "- check_community_streams : vérifie si un streamer Twitch est en live\n" +
    "- fetch_game_patchnotes : patch notes d'un jeu via Steam\n" +
    "- get_galactic_war_status : statut guerre galactique Helldivers 2\n" +
    "- monitor_ram_health : état RAM du bot (lecture seule)\n" +
    "- enforce_garbage_collection : force le GC (nettoyage RAM)\n" +
    "- self_inspect_logs : lit les dernières lignes de logs d'erreurs\n" +
    "- upsert_user_memory / retrieve_user_memory : mémoire long-terme utilisateurs\n" +
    "### OSINT & Threat Intelligence (auto-use)\n" +
    "- osint_scan : scan OSINT complet (IP, domaine, email) — combine Shodan + DNS + WHOIS + risk scoring\n" +
    "- shodan_search : recherche d'appareils/services exposés sur Internet\n" +
    "### Twitter/X (auto-use)\n" +
    "- twitter_get_user : profil Twitter d'un utilisateur (bio, followers, vérification)\n" +
    "- twitter_search : recherche de tweets récents par mot-clé\n" +
    "### Reddit (auto-use, gratuit)\n" +
    "- reddit_get_posts : posts d'un subreddit (hot, new, top)\n" +
    "- reddit_search : recherche sur Reddit par mot-clé\n" +
    "- reddit_trending : subreddits populaires du moment\n" +
    "### Agent Reach — Zero-API web access (auto-use, gratuit)\n" +
    "- jina_read_url : lit n'importe quelle page web via Jina Reader (gratuit, pas de clé)\n" +
    "- youtube_transcript : transcript de vidéo YouTube via Jina Reader (gratuit)\n" +
    "- exa_web_search : recherche sémantique web via Exa (gratuit, pas de clé)\n" +
    "- bilibili_search : recherche de vidéos Bilibili (gratuit, pas de login)\n" +
    "- jina_read_reddit : lit un subreddit via Jina Reader (sans clé API Reddit)\n" +
    "- jina_read_twitter : lit un profil Twitter/X via Jina Reader (sans clé API Twitter)\n" +
    "### Analytics & Business Intelligence (auto-use)\n" +
    "- guild_analytics : stats serveur (membres actifs, messages, commandes, modération)\n" +
    "- bot_health : métriques bot (uptime, RAM, guilds, erreurs)\n" +
    "- message_trend : tendance d'activité (hausse/baisse/stable)\n" +
    "- top_commands : top 10 commandes utilisées\n" +
    "- moderation_stats : stats modération par type d'action\n" +
    "### Rich Embeds (auto-use)\n" +
    "- build_rich_embed : crée un embed Discord personnalisé (titre, couleur, fields, image, footer)\n" +
    "### Multi-Platform Notifications (auto-use)\n" +
    "- send_telegram : envoie un message Telegram\n" +
    "- send_slack : envoie un message Slack\n" +
    "- broadcast_notification : notifie sur toutes les plateformes configurées\n" +
    "### Auto-Translation (auto-use)\n" +
    "- auto_translate : traduit automatiquement (Google → LibreTranslate fallback, 29 langues)\n" +
    "- detect_language : détecte la langue d'un texte\n" +
    "### Anomaly Detection (auto-use)\n" +
    "- detect_anomalies : détecte pics de messages/erreurs/modération, flood de nouveaux membres (raid)\n" +
    "### Advanced Embeds (auto-use)\n" +
    "- build_rich_embed : embed personnalisé générique\n" +
    "- build_comparison_embed : tableau de comparaison (colonnes/lignes)\n" +
    "- build_leaderboard_embed : classement avec médailles 🥇🥈🥉\n" +
    "- build_progress_embed : barres de progression visuelles █░\n" +
    "- build_timeline_embed : timeline chronologique\n" +
    "- build_stat_cards_embed : cartes de statistiques avec icônes\n" +
    "### Discord\n" +
    "- deleteMessages, timeoutUser, warnUser, kickUser, banUser : modération\n" +
    "- addRole, removeRole, createChannel, deleteChannel, lockChannel, unlockChannel\n" +
    "- getMemberInfo, getServerRoles, getServerStats, getVoiceChannels, getEmojis\n" +
    "- setNickname, sendDM, createEmbed, getAuditLog, createInvite\n" +
    "### Screenshot (Playwright)\n" +
    "- take_screenshot : prend une capture d'écran d'une page web et l'envoie dans le salon. Utile pour montrer visuellement un site, un article, un graphique.\n" +
    "### OpenRouter MCP (live model data)\n" +
    "- or_list_models : liste les modèles IA disponibles avec prix et capacités\n" +
    "- or_model_info : détails complets d'un modèle (prix, contexte, params)\n" +
    "- or_benchmarks : scores de benchmark pour comparer la qualité des modèles\n" +
    "- or_rankings : classement des modèles les plus utilisés aujourd'hui\n" +
    "- or_chat_test : envoie un prompt de test à n'importe quel modèle (payant)\n" +
    "- or_docs_search : recherche dans la doc OpenRouter\n" +
    "- or_credits : vérifie les crédits restants\n" +
    "### Bot Features\n" +
    "- searchGifs, checkToxicity, getRiskProfile, checkPhishing\n" +
    "### Mémoire\n" +
    "- searchUserMemory, saveMemoryFact\n\n" +
    "## RÈGLES\n" +
    "- Si l'utilisateur envoie une image, utilise analyze_image automatiquement.\n" +
    "- Si le message semble agressif, utilise analyze_sentiment.\n" +
    "- Si un utilisateur demande un résumé ou dit 'quoi de neuf', utilise summarize_conversation.\n" +
    "- Si le message n'est pas en français, utilise detect_language puis traduis ta réponse.\n" +
    "- Si on te demande des stats sur le serveur, utilise get_server_insights.\n" +
    "- Si tu trouves une info sur le web, cite ta source (URL).\n" +
    "- Sois concis, naturel, réponds en français.\n" +
    "- Tu peux enchaîner plusieurs tools dans une seule itération.\n" +
    (longTermMemory ? longTermMemory : "") +
    memoryPrompt +
    planPrompt +
    getApiKeyStatusLine() +
    (getToolHints(userMessage)
      ? "\n## Tools suggérés pour cette requête\n" + getToolHints(userMessage)
      : "") +
    (() => {
      const chains = suggestToolChain(userMessage);
      if (chains.length === 0) return "";
      return "\n## Enchaînement suggéré: " + chains.map((c) => c.join(" → ")).join(" | ") + "\n";
    })();

  const conversation: ChatMessage[] = [
    { role: "system", content: systemPrompt },
    ...channelHistory,
    { role: "user", content: `${message.author.username}: ${userMessage}` },
  ];

  // 2. Boucle Think → Act → Observe → Respond
  for (let iteration = 0; iteration < MAX_ITERATIONS; iteration++) {
    logger.info(`[AgentLoop] 🔄 Itération ${iteration + 1}/${MAX_ITERATIONS}`);

    // Circuit breaker: check if we can continue
    if (!recordLoop(breakerState, 800)) {
      // Breaker tripped — return immersive error
      const embed = createTrippedEmbed(breakerState);
      logger.warn(`[AgentLoop] 🚨 Circuit breaker tripped at iteration ${iteration + 1}`);
      return `${embed.data.title ?? "Circuit breaker activated"} — L'agent a dépassé la limite de sécurité. Réessaie ta demande.`;
    }

    let response: Awaited<ReturnType<typeof client.chat.completions.create>>;
    try {
      response = await callLlmWithRetry(
        client,
        {
          model: getPersonalityModel(config.openRouterModel),
          messages: conversation as never,
          tools: availableTools as never,
          max_tokens: getPersonalityMaxTokens(),
          temperature: getPersonalityTemperature(),
          parallel_tool_calls: true,
          stream: false,
        },
        { timeout: 15_000 },
      );
    } catch (apiErr) {
      const errMsg = apiErr instanceof Error ? apiErr.message : String(apiErr);
      logger.error(`[AgentLoop] OpenRouter API call failed after retries: ${errMsg}`);

      // ─── Fallback: Groq (free, supports function calling) ───
      if (isGroqAvailable()) {
        try {
          logger.warn(`[AgentLoop] Tentative de fallback Groq...`);
          const groqClient = getGroqClient()!;
          response = await groqClient.chat.completions.create(
            {
              model: config.groqModel,
              messages: conversation as never,
              tools: availableTools as never,
              max_tokens: getPersonalityMaxTokens(),
              temperature: getPersonalityTemperature(),
              parallel_tool_calls: true,
              stream: false,
            } as never,
            { timeout: 15_000 } as never,
          );
          logger.info(`[AgentLoop] ✅ Groq fallback réussi`);
          // Continue to the normal response processing below
        } catch (groqErr) {
          const groqErrMsg = groqErr instanceof Error ? groqErr.message : String(groqErr);
          logger.error(`[AgentLoop] Groq fallback also failed: ${groqErrMsg}`);
          completeInteraction(breakerState);
          if (errMsg.includes("429") || errMsg.includes("rate")) {
            return "Le serveur IA est sous forte charge en ce moment, soldat. Réessaie dans quelques secondes.";
          }
          if (
            errMsg.includes("timeout") ||
            errMsg.includes("ECONNRESET") ||
            errMsg.includes("fetch")
          ) {
            return "Problème de communication avec le serveur IA. La liaison a été perdue — réessaie ta demande.";
          }
          return "Le serveur IA a rencontré un problème temporaire. Réessaie ta demande, soldat.";
        }
      } else {
        completeInteraction(breakerState);
        if (errMsg.includes("429") || errMsg.includes("rate")) {
          return "Le serveur IA est sous forte charge en ce moment, soldat. Réessaie dans quelques secondes.";
        }
        if (
          errMsg.includes("timeout") ||
          errMsg.includes("ECONNRESET") ||
          errMsg.includes("fetch")
        ) {
          return "Problème de communication avec le serveur IA. La liaison a été perdue — réessaie ta demande.";
        }
        return "Le serveur IA a rencontré un problème temporaire. Réessaie ta demande, soldat.";
      }
    }

    const choice = (
      response as {
        choices: Array<{ message: { content: string | null; tool_calls?: unknown[] } }>;
      }
    ).choices[0];
    if (!choice) break;

    const assistantMessage = choice.message;

    // Si l'IA n'a pas demandé d'outil → c'est la réponse finale
    if (!assistantMessage.tool_calls || assistantMessage.tool_calls.length === 0) {
      const finalReply = assistantMessage.content || "*(silence)*";
      logger.info(`[AgentLoop] ✅ Réponse finale (itération ${iteration + 1})`);
      completeInteraction(breakerState);

      // ─── MODULE B: Stocker en mémoire vectorielle ───
      storeMemory(message.author.id, message.guildId || "", userMessage, "user");
      storeMemory(message.author.id, message.guildId || "", finalReply, "assistant");
      void persistMemoryToDb(message.author.id, message.guildId || "").catch(() => {});

      // ─── MODULE C: Reset retry state ───
      resetRetries(breakerState.interactionId);

      return finalReply;
    }

    // L'IA a demandé un ou plusieurs outils → on les exécute en parallèle
    conversation.push({
      role: "assistant",
      content: assistantMessage.content || "",
      tool_calls: assistantMessage.tool_calls,
    });

    // Exécuter tous les tools en parallèle pour la performance
    const toolCalls = (assistantMessage.tool_calls ?? []) as Array<{
      id: string;
      function: { name: string; arguments: string };
    }>;
    const toolResults = await Promise.all(
      toolCalls.map(async (toolCall) => {
        const tc = toolCall;
        const toolName = tc.function.name;
        let args: Record<string, unknown> = {};

        try {
          args = JSON.parse(tc.function.arguments || "{}");
        } catch {
          logger.warn(`[AgentLoop] Args invalides pour ${toolName}: ${tc.function.arguments}`);
        }

        let result;
        try {
          result = await executeTool(toolName, args, ctx);
        } catch (toolErr) {
          const toolErrMsg = toolErr instanceof Error ? toolErr.message : String(toolErr);
          logger.warn(`[AgentLoop] Tool ${toolName} crashed: ${toolErrMsg}`);
          result = { success: false, data: `Erreur interne (tool ${toolName}). Réessaie.` };
        }
        logger.info(
          `[AgentLoop] 🔧 ${toolName} → ${result.success ? "OK" : "FAIL"}: ${result.data.slice(0, 100)}`,
        );

        // ─── MODULE C: Auto-réflexion sur le résultat du tool ───
        const toolExecResult: ToolExecutionResult = {
          toolName,
          success: result.success,
          data: result.data,
          args,
        };
        let reflection;
        try {
          reflection = await reflectOnToolResult(userMessage, toolExecResult, iteration);
        } catch (reflectErr) {
          logger.warn(
            `[AgentLoop] Reflection failed for ${toolName}: ${reflectErr instanceof Error ? reflectErr.message : String(reflectErr)}`,
          );
          reflection = { action: "continue" as const, reasoning: undefined };
        }

        if (reflection.action === "retry" || reflection.action === "retry_different") {
          const retryArgs = reflection.corrected_args || args;
          logger.info(
            `[AgentLoop] 🔄 Retrying ${toolName} (${reflection.action}): ${reflection.reasoning?.slice(0, 80)}`,
          );
          const retryResult = await executeTool(toolName, retryArgs, ctx);
          logger.info(
            `[AgentLoop] 🔧 ${toolName} retry → ${retryResult.success ? "OK" : "FAIL"}: ${retryResult.data.slice(0, 100)}`,
          );
          return {
            tool_call_id: tc.id,
            content:
              retryResult.data +
              (reflection.reasoning ? `\n[Reflexion: ${reflection.reasoning}]` : ""),
          };
        }

        if (reflection.action === "abort") {
          logger.warn(`[AgentLoop] 🛑 Aborting ${toolName}: ${reflection.reasoning}`);
          return {
            tool_call_id: tc.id,
            content: `Tool ${toolName} abandonné: ${reflection.reasoning}`,
          };
        }

        return {
          tool_call_id: tc.id,
          content: result.data,
        };
      }),
    );

    // Renvoyer tous les résultats à l'IA (Observe)
    for (const result of toolResults) {
      conversation.push({
        role: "tool",
        tool_call_id: result.tool_call_id,
        content: result.content,
      });
    }

    // La boucle continue : l'IA va recevoir les résultats des tools
    // et soit demander d'autres tools, soit formuler sa réponse finale
  }

  // Si on a épuisé les itérations, retourner la dernière réponse
  logger.warn(`[AgentLoop] ⚠️ Max iterations (${MAX_ITERATIONS}) atteint`);
  tripBreaker(breakerState, `Max iterations (${MAX_ITERATIONS}) reached without final reply`);
  return "J'ai analysé la situation mais j'ai besoin de plus de contexte pour répondre. Peux-tu préciser ?";
}

// ─── Sauvegarde automatique en mémoire ───────────────────────────────────────

/**
 * Après une conversation, l'IA peut extraire des faits à mémoriser.
 * Cette fonction demande à l'IA de résumer les points clés à retenir.
 */
export async function extractAndSaveMemory(
  userId: string,
  userMessage: string,
  aiResponse: string,
): Promise<void> {
  try {
    const client = getOpenAIClient();

    const completion = await client.chat.completions.create(
      {
        model: config.openRouterModel,
        messages: [
          {
            role: "system",
            content:
              "Tu extrais les faits importants à mémoriser sur un utilisateur. " +
              'Réponds en JSON : {"facts": [{"key": "...", "value": "...", "category": "..."}]}. ' +
              'Si rien à mémoriser, réponds {"facts": []}.',
          },
          {
            role: "user",
            content: `User: ${userMessage}\nAI: ${aiResponse}`,
          },
        ],
        max_tokens: 200,
        temperature: 0.3,
      },
      { timeout: 10_000 },
    );

    const raw = completion.choices[0]?.message?.content ?? "{}";
    const jsonMatch = raw.match(/\{[\s\S]*\}/);
    if (!jsonMatch) return;

    const parsed = JSON.parse(jsonMatch[0]) as {
      facts?: Array<{ key: string; value: string; category?: string }>;
    };

    if (!parsed.facts || parsed.facts.length === 0) return;

    // S'assurer que UserMemory existe
    await prisma.userMemory.upsert({
      where: { userId },
      create: { userId },
      update: { lastActiveAt: new Date() },
    });

    for (const fact of parsed.facts.slice(0, 3)) {
      await prisma.memoryFact.upsert({
        where: { userId_key: { userId, key: fact.key } },
        create: {
          userId,
          key: fact.key,
          value: fact.value,
          category: fact.category || "auto",
        },
        update: {
          value: fact.value,
          category: fact.category || "auto",
          updatedAt: new Date(),
        },
      });
    }

    logger.info(`[AgentLoop] 💾 ${parsed.facts.length} faits sauvegardés pour ${userId}`);
  } catch (error) {
    // Non-critique — la mémoire est optionnelle
    logger.debug(
      `[AgentLoop] Extraction mémoire échouée: ${error instanceof Error ? error.message : String(error)}`,
    );
  }
}
