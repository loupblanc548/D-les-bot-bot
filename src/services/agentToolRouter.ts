/**
 * agentToolRouter.ts — Router intelligent pour la sélection d'outils
 *
 * Analyse la requête utilisateur et:
 *  1. Pré-sélectionne les tools pertinents (réduit le contexte LLM)
 *  2. Vérifie quelles clés API sont configurées
 *  3. Désactive les tools qui nécessitent une clé absente
 *  4. Suggère des enchaînements de tools (multi-step)
 */

import logger from "../utils/logger.js";
import type { AgentToolDef } from "./agentTools.js";

// ─── API Key Registry ────────────────────────────────────────────────────────

interface ApiKeyRequirement {
  envVar: string;
  tools: string[]; // tool names that require this key
  optional?: boolean; // if true, tool works without key but with limited features
}

const API_KEY_REGISTRY: ApiKeyRequirement[] = [
  { envVar: "OPENROUTER_API_KEY", tools: ["searchWeb", "transcribeAudio"], optional: false },
  { envVar: "BRAVE_SEARCH_API_KEY", tools: ["searchWeb"], optional: true },
  { envVar: "GROQ_API_KEY", tools: [], optional: true },
  { envVar: "GEMINI_API_KEY", tools: ["analyzeImageGemini"], optional: true },
  { envVar: "COHERE_API_KEY", tools: [], optional: true },
  { envVar: "ASSEMBLYAI_API_KEY", tools: ["transcribeAudio"], optional: true },
  { envVar: "STEAM_API_KEY", tools: ["getSteamGame"], optional: true },
  { envVar: "TWITCH_CLIENT_ID", tools: [], optional: true },
  { envVar: "SPOTIFY_CLIENT_ID", tools: [], optional: true },
  { envVar: "LASTFM_API_KEY", tools: [], optional: true },
  { envVar: "IGDB_CLIENT_ID", tools: [], optional: true },
  { envVar: "ITAD_API_KEY", tools: [], optional: true },
  { envVar: "STEAMGRIDDB_API_KEY", tools: [], optional: true },
  { envVar: "NEWS_API_KEY", tools: ["getTechNews"], optional: true },
  { envVar: "E2B_API_KEY", tools: ["execute_code"], optional: true },
  { envVar: "ALPHA_VANTAGE_API_KEY", tools: ["get_stock_price"], optional: true },
  { envVar: "NASA_API_KEY", tools: ["get_nasa_apod"], optional: true },
  { envVar: "RSSHUB_URL", tools: ["get_rsshub_feed"], optional: true },
  { envVar: "TELEGRAM_BOT_TOKEN", tools: ["send_telegram"], optional: true },
  { envVar: "DISCORD_WEBHOOK_URL", tools: [], optional: true },
  { envVar: "AGENT_SSH_ENABLED", tools: ["ssh_command"], optional: false },
  { envVar: "AGENT_DOCKER_ENABLED", tools: ["docker_manage"], optional: false },
  { envVar: "AGENT_GIT_ENABLED", tools: ["git_operations"], optional: false },
  { envVar: "AGENT_DB_ENABLED", tools: ["db_query"], optional: true },
];

/**
 * Vérifie quelles clés API sont configurées.
 */
export function getConfiguredApiKeys(): Record<string, boolean> {
  const result: Record<string, boolean> = {};
  for (const req of API_KEY_REGISTRY) {
    const val = process.env[req.envVar];
    // Boolean env vars (AGENT_*_ENABLED) must be "true"
    if (req.envVar.startsWith("AGENT_")) {
      result[req.envVar] = val === "true";
    } else {
      result[req.envVar] = !!val;
    }
  }
  return result;
}

/**
 * Filtre les tools dont les clés API requises (non-optionnelles) sont absentes.
 */
export function filterAvailableTools(allTools: AgentToolDef[]): AgentToolDef[] {
  const disabledTools = new Set<string>();

  for (const req of API_KEY_REGISTRY) {
    const val = process.env[req.envVar];
    const isConfigured = req.envVar.startsWith("AGENT_") ? val === "true" : !!val;
    if (!req.optional && !isConfigured) {
      for (const toolName of req.tools) {
        disabledTools.add(toolName);
      }
    }
  }

  if (disabledTools.size > 0) {
    logger.info(
      `[ToolRouter] Tools désactivés (clés manquantes): ${[...disabledTools].join(", ")}`,
    );
  }

  return allTools.filter((t) => !disabledTools.has(t.function.name));
}

// ─── Tool Category Mapping ───────────────────────────────────────────────────

interface ToolCategory {
  keywords: string[];
  tools: string[];
}

const TOOL_CATEGORIES: ToolCategory[] = [
  {
    keywords: ["météo", "weather", "température", "pluie", "soleil", "neige", "vent"],
    tools: ["getWeather"],
  },
  {
    keywords: ["crypto", "bitcoin", "btc", "ethereum", "eth", "prix", "price"],
    tools: ["getCryptoPrice"],
  },
  {
    keywords: ["action", "stock", "bourse", "trading", "aapl", "msft", "tsla"],
    tools: ["get_stock_price"],
  },
  {
    keywords: ["devise", "currency", "convertir", "euro", "dollar", "yen", "taux change"],
    tools: ["get_currency_rate"],
  },
  {
    keywords: ["recherche", "search", "google", "trouver", "chercher", "web"],
    tools: ["searchWeb", "getWikipediaSummary"],
  },
  {
    keywords: ["youtube", "vidéo", "video", "transcript", "sous-titre"],
    tools: ["searchYouTube", "youtube_transcript"],
  },
  {
    keywords: ["github", "repo", "code", "projet"],
    tools: ["getGitHubRepo", "github_profile"],
  },
  {
    keywords: ["pokemon", "pokémon"],
    tools: ["get_pokemon"],
  },
  {
    keywords: ["échec", "chess", "échecs", "joueur"],
    tools: ["get_chess_stats", "get_lichess_stats"],
  },
  {
    keywords: ["livre", "book", "lire", "auteur"],
    tools: ["search_books"],
  },
  {
    keywords: ["nasa", "espace", "astronomie", "étoile", "galaxie"],
    tools: ["get_nasa_apod"],
  },
  {
    keywords: ["séisme", "earthquake", "tremblement"],
    tools: ["get_earthquakes"],
  },
  {
    keywords: ["science", "paper", "recherche scientifique", "arxiv", "étude"],
    tools: ["search_arxiv"],
  },
  {
    keywords: ["nourriture", "food", "aliment", "calorie", "nutriscore"],
    tools: ["search_food"],
  },
  {
    keywords: ["vol", "flight", "avion", "flight tracker"],
    tools: ["get_flights"],
  },
  {
    keywords: ["tendance", "trend", "trending", "populaire"],
    tools: ["get_google_trends"],
  },
  {
    keywords: ["twitter", "tweet", "x.com", "elonmusk"],
    tools: ["get_rsshub_feed", "jina_read_twitter", "twitter_get_user", "twitter_search"],
  },
  {
    keywords: ["instagram", "insta", "post insta"],
    tools: ["get_rsshub_feed"],
  },
  {
    keywords: ["tiktok", "tok"],
    tools: ["get_rsshub_feed"],
  },
  {
    keywords: ["image", "génère", "dessine", "crée image", "picture"],
    tools: ["generate_image"],
  },
  {
    keywords: ["voix", "audio", "tts", "parle", "speech"],
    tools: ["generate_tts"],
  },
  {
    keywords: [
      "free", "gratuit", "free tier", "free plan", "gratuit pour dev",
      "hébergement gratuit", "hebergement gratuit", "hosting free",
      "api gratuite", "api gratuit", "saas gratuit",
      "base de données gratuite", "database free", "ci/cd gratuit",
      "monitoring gratuit", "outil gratuit", "outils gratuits",
      "service gratuit", "services gratuits", "ressource gratuite",
      "ressources gratuites", "free for dev", "free-for-dev",
    ],
    tools: ["search_developer_resources"],
  },
  {
    keywords: [
      "typescript", "ts error", "erreur ts", "type error", "typage",
      "generic", "generics", "générique", "conditional type", "type conditionnel",
      "mapped type", "inference", "inférence", "type assertion",
      "is not assignable", "does not exist on type", "no overload",
      "type guard", "narrowing", "typeof", "instanceof",
      "pattern typescript", "ts pattern", "matt pocock",
    ],
    tools: ["lookup_typescript_skill"],
  },
  {
    keywords: [
      "problème réseau", "network problem", "network issue", "attaque",
      "ip suspecte", "suspicious ip", "intrusion", "brute force", "brute-force",
      "port scan", "scan de ports", "whois", "dns lookup", "reverse dns",
      "géolocalisation ip", "ip geo", "osint", "investigation réseau",
      "network investigation", "sécurité réseau", "network security",
      "menace", "threat", "wazuh", "siem", "alerte sécurité",
      "firewall", "pare-feu", "ip ban", "bannir ip",
      "ouvre internet", "ouvrir internet", "open internet",
      "voir le réseau", "voir réseau", "voir ce qu'il se passe",
      "voir le trafic", "trafic réseau", "network traffic",
      "connexions actives", "active connections", "ports ouverts",
      "monitoring réseau", "network monitoring", "état du réseau",
      "network status", "statut réseau", "dashboard réseau",
      "what's happening", "que se passe-t-il", "activité réseau",
      "network activity", "live network", "réseau live",
      "connexions en cours", "listening ports", "ports en écoute",
      "interfaces réseau", "bande passante", "bandwidth",
      "routes", "table de routage", "routing table",
      "virus", "malware", "trojan", "ransomware", "worm", "backdoor",
      "rootkit", "spyware", "botnet", "cryptominer", "payload",
      "phishing", "hameçonnage", "unsafe url", "url suspecte",
      "file hash", "hash fichier", "scan virus", "scan malware",
      "virustotal", "abuseipdb", "phishtank", "safe browsing",
      "threat intel", "renseignement de menace", "réputation ip",
      "espace disque", "disk space", "stockage vps", "vps storage",
      "disque plein", "disk full", "vps status", "état du vps",
      "system resources", "ressources système", "disk usage",
    ],
    tools: ["network_investigate", "ip_geolocation", "network_status", "open_web_page", "runKaliPortAudit", "runKaliWebAudit", "threat_intel_sweep", "check_vps_storage"],
  },
  {
    keywords: ["code", "python", "javascript", "script", "exécute", "compile"],
    tools: ["execute_code"],
  },
  {
    keywords: ["traduire", "translate", "traduction"],
    tools: ["translateText", "auto_translate"],
  },
  {
    keywords: ["pays", "country", "capitale", "population"],
    tools: ["get_country_info"],
  },
  {
    keywords: ["argot", "slang", "définition", "urban"],
    tools: ["get_urban_dict", "scrape_urban_slang"],
  },
  {
    keywords: ["npm", "package", "node"],
    tools: ["get_npm_package"],
  },
  {
    keywords: ["pypi", "pip", "python package"],
    tools: ["get_pypi_package"],
  },
  {
    keywords: ["dev.to", "article", "blog tech"],
    tools: ["get_devto_articles"],
  },
  {
    keywords: ["chat", "random user", "profil"],
    tools: ["get_random_user"],
  },
  {
    keywords: ["modération", "ban", "kick", "timeout", "warn", "sanction"],
    tools: ["get_user_moderation_history", "timeoutUser", "warnUser"],
  },
  {
    keywords: ["santé", "health", "ram", "mémoire", "performance"],
    tools: [
      "monitor_ram_health",
      "enforce_garbage_collection",
      "bot_health",
      "triggerGarbageCollection",
      "system_stats",
    ],
  },
  {
    keywords: ["vps", "serveur", "cpu", "disk", "uptime", "load"],
    tools: ["system_stats", "ssh_command"],
  },
  {
    keywords: ["docker", "container", "conteneur"],
    tools: ["docker_manage"],
  },
  {
    keywords: ["git", "repo", "pull", "commit", "push", "diff"],
    tools: ["git_operations"],
  },
  {
    keywords: ["sql", "query", "database", "base de données", "select"],
    tools: ["db_query"],
  },
  {
    keywords: ["http", "api request", "post request", "get request", "fetch url"],
    tools: ["http_request"],
  },
  {
    keywords: ["rss", "flux", "feed"],
    tools: ["rss_monitor", "get_rsshub_feed"],
  },
  {
    keywords: ["changement", "diff", "change", "monitoring site", "surveiller site"],
    tools: ["website_diff"],
  },
  {
    keywords: ["cron", "automatiser", "tâche planifiée", "schedule"],
    tools: ["cron_create"],
  },
  {
    keywords: ["fichier", "file", "log", "lire fichier", "cat"],
    tools: ["file_read"],
  },
  {
    keywords: [
      "osint",
      "investigation",
      "background check",
      "domaine",
      "ip",
      "email",
      "whois",
      "dns",
      "scan",
      "shodan",
      "username",
      "pseudo",
      "profil",
    ],
    tools: [
      "osint_scan",
      "shodan_search",
      "github_profile",
      "domain_age",
      "detect_disposable_email",
      "detect_typosquatting",
      "verify_link_safety",
      "scrape_steamrep_status",
      "track_avatar_hash",
      "expose_ghost_pinger",
    ],
  },
  {
    keywords: [
      "lien",
      "url",
      "article",
      "page web",
      "lis ça",
      "analyse ça",
      "doc",
      "documentation",
      "apprends",
      "ingère",
    ],
    tools: ["fetchAndSummarize", "readUrl", "searchKnowledge"],
  },
  {
    keywords: [
      "connaissance",
      "tu sais",
      "tu as appris",
      "base de connaissances",
      "tu te souviens",
    ],
    tools: ["searchKnowledge"],
  },
  {
    keywords: ["phishing", "arnaque", "scam", "suspect", "douteux", "fraude", "malware"],
    tools: [
      "verify_link_safety",
      "detect_typosquatting",
      "detect_disposable_email",
      "checkPhishing",
    ],
  },
  {
    keywords: ["steam", "ban steam", "trade ban", "scammer"],
    tools: ["scrape_steamrep_status"],
  },
  {
    keywords: ["epic", "jeu gratuit", "free game", "epic games"],
    tools: ["scrape_epic_free_countdown"],
  },
  {
    keywords: ["twitch", "stream", "live", "streamer"],
    tools: ["check_community_streams"],
  },
  {
    keywords: ["patch note", "mise à jour", "update", "changelog", "version"],
    tools: ["fetch_game_patchnotes"],
  },
  {
    keywords: ["helldivers", "galactic war", "guerre galactique", "major order"],
    tools: ["get_galactic_war_status"],
  },
  // ═══ Fun & Divertissement ═══
  {
    keywords: ["mème", "meme", "mème aléatoire", "drôle", "fun"],
    tools: ["getJoke", "getMeme", "getDadJoke"],
  },
  {
    keywords: ["blague", "joke", "rigolo", "humour"],
    tools: ["getJoke", "getDadJoke"],
  },
  {
    keywords: ["citation", "quote", "inspirant", "motivant", "proverbe"],
    tools: ["getQuote"],
  },
  {
    keywords: ["conseil", "advice", "que faire", "ennui", "ennuyé", "activité"],
    tools: ["getAdvice"],
  },
  {
    keywords: ["trivia", "question culture", "quiz", "saviez-vous"],
    tools: ["getTrivia"],
  },
  {
    keywords: ["pile ou face", "coinflip", "pile face", "lancer pièce"],
    tools: ["execute_code"],
  },
  {
    keywords: ["dé", "dice", "lancer dé", "roll", "d20", "d6"],
    tools: ["execute_code"],
  },
  {
    keywords: ["chien", "dog", "photo chien", "toutou", "wouf"],
    tools: ["getDogImage", "get_cat_image"],
  },
  {
    keywords: ["chat", "cat image", "photo chat", "minou", "miaou"],
    tools: ["get_cat_image"],
  },
  {
    keywords: ["nombre", "number fact", "fait sur", "chiffre aléatoire"],
    tools: ["getTrivia"],
  },
  {
    keywords: ["8ball", "boule magique", "prédiction", "futur", "destin"],
    tools: ["execute_code"],
  },
  {
    keywords: ["hacker news", "tech news", "actualité tech", "hn"],
    tools: ["getTechNews", "get_devto_articles"],
  },
  // ═══ Community & Social ═══
  {
    keywords: ["giveaway", "tirage au sort", "cadeau", "concours"],
    tools: ["build_rich_embed"],
  },
  {
    keywords: ["anniversaire", "birthday", "né le", "date de naissance"],
    tools: ["get_server_insights"],
  },
  {
    keywords: ["niveau", "rank", "xp", "leaderboard", "classement", "progression"],
    tools: ["get_server_insights", "top_commands"],
  },
  {
    keywords: ["server info", "infos serveur", "membres", "member count", "boost"],
    tools: ["get_server_insights", "guild_analytics"],
  },
  {
    keywords: ["avatar", "photo de profil", "pp", "image profil"],
    tools: ["track_avatar_hash"],
  },
  {
    keywords: ["lfg", "groupe", "qui veut jouer", "recherche joueurs"],
    tools: ["build_rich_embed"],
  },
  // ═══ Musique ═══
  {
    keywords: ["joue musique", "play music", "lance musique", "écoute", "chanson"],
    tools: ["searchYouTube"],
  },
  // ═══ Modération auto ═══
  {
    keywords: ["raid", "attaque", "spam massif", "invasion"],
    tools: [
      "evaluate_channel_velocity",
      "calculate_server_panic_index",
      "emergency_channel_freeze",
    ],
  },
  {
    keywords: ["ghost ping", "mention fantôme", "faux ping"],
    tools: ["expose_ghost_pinger"],
  },
  {
    keywords: ["évadé de ban", "ban evasion", "retour ban", "multi-compte"],
    tools: ["track_avatar_hash", "get_user_moderation_history"],
  },
  // ═══ Debug & Système ═══
  {
    keywords: ["erreur", "bug", "crash", "problème", "logs", "log erreur"],
    tools: ["self_inspect_logs", "monitor_ram_health", "bot_health"],
  },
  {
    keywords: ["reload", "recharger", "redémarrer module", "hot reload"],
    tools: ["triggerGarbageCollection"],
  },
];

/**
 * Analyse une requête et retourne les tools pertinents.
 */
export function routeTools(userMessage: string, allTools: AgentToolDef[]): AgentToolDef[] {
  const lowerMsg = userMessage.toLowerCase();
  const relevantToolNames = new Set<string>();

  for (const cat of TOOL_CATEGORIES) {
    for (const keyword of cat.keywords) {
      if (lowerMsg.includes(keyword)) {
        for (const toolName of cat.tools) {
          relevantToolNames.add(toolName);
        }
        break;
      }
    }
  }

  // Si on a identifié des tools pertinents, les prioriser
  // mais garder tous les tools disponibles (l'IA peut toujours en utiliser d'autres)
  if (relevantToolNames.size > 0) {
    logger.info(
      `[ToolRouter] Tools suggérés pour "${lowerMsg.slice(0, 50)}": ${[...relevantToolNames].join(", ")}`,
    );
  }

  // Filtrer les tools désactivés (clés manquantes)
  return filterAvailableTools(allTools);
}

/**
 * Génère un hint pour le system prompt sur les tools suggérés.
 */
export function getToolHints(userMessage: string): string {
  const lowerMsg = userMessage.toLowerCase();
  const hints: string[] = [];

  for (const cat of TOOL_CATEGORIES) {
    for (const keyword of cat.keywords) {
      if (lowerMsg.includes(keyword)) {
        hints.push(`Pour "${keyword}", utilise: ${cat.tools.join(" ou ")}`);
        break;
      }
    }
  }

  return hints.length > 0 ? hints.join("\n") : "";
}

/**
 * Suggère un enchaînement de tools (multi-step).
 */
export function suggestToolChain(userMessage: string): string[][] {
  const lowerMsg = userMessage.toLowerCase();
  const chains: string[][] = [];

  // "Vérifie les deals" → searchWeb + getSteamGame + build_rich_embed
  if (
    lowerMsg.includes("deal") ||
    lowerMsg.includes("promotion") ||
    lowerMsg.includes("réduction")
  ) {
    chains.push(["searchWeb", "getSteamGame", "build_rich_embed"]);
  }

  // "Analyse ce user" → get_user_moderation_history + osint_scan + track_avatar_hash
  if (
    lowerMsg.includes("analyse") &&
    (lowerMsg.includes("user") || lowerMsg.includes("utilisateur"))
  ) {
    chains.push(["get_user_moderation_history", "osint_scan", "track_avatar_hash"]);
  }

  // "Écris un script" → execute_code
  if (
    lowerMsg.includes("script") ||
    lowerMsg.includes("code python") ||
    lowerMsg.includes("exécute")
  ) {
    chains.push(["execute_code"]);
  }

  // "Tendances" → get_google_trends + get_devto_articles + getTechNews
  if (lowerMsg.includes("tendance") || lowerMsg.includes("trend") || lowerMsg.includes("actu")) {
    chains.push(["get_google_trends", "get_devto_articles", "getTechNews"]);
  }

  // "Génère une image" → generate_image
  if (lowerMsg.includes("image") || lowerMsg.includes("dessine") || lowerMsg.includes("génère")) {
    chains.push(["generate_image"]);
  }

  // "Analyse ce lien" → fetchAndSummarize + searchKnowledge
  if (
    lowerMsg.includes("lien") ||
    lowerMsg.includes("url") ||
    lowerMsg.includes("article") ||
    lowerMsg.includes("page web")
  ) {
    chains.push(["fetchAndSummarize", "searchKnowledge"]);
  }

  // "Apprends cette doc" → ingestDocumentation + searchKnowledge
  if (
    lowerMsg.includes("apprends") ||
    lowerMsg.includes("ingère") ||
    lowerMsg.includes("documentation")
  ) {
    chains.push(["ingestDocumentation", "searchKnowledge"]);
  }

  // "Ressources gratuites" → search_developer_resources
  if (
    lowerMsg.includes("gratuit") ||
    lowerMsg.includes("free") ||
    lowerMsg.includes("free tier") ||
    lowerMsg.includes("free plan") ||
    lowerMsg.includes("hébergement") ||
    lowerMsg.includes("api gratuite")
  ) {
    chains.push(["search_developer_resources"]);
  }

  // "Erreur TypeScript" → lookup_typescript_skill + execute_code (fix + test)
  if (
    lowerMsg.includes("typescript") ||
    lowerMsg.includes("ts error") ||
    lowerMsg.includes("type error") ||
    lowerMsg.includes("typage") ||
    lowerMsg.includes("generic")
  ) {
    chains.push(["lookup_typescript_skill", "execute_code"]);
  }

  // "Scan ce domaine/IP" → osint_scan + verify_link_safety + domain_age
  if (lowerMsg.includes("domaine") || lowerMsg.includes("ip") || lowerMsg.includes("scan")) {
    chains.push(["osint_scan", "verify_link_safety", "domain_age"]);
  }

  // "C'est une arnaque ?" → verify_link_safety + detect_typosquatting + detect_disposable_email
  if (
    lowerMsg.includes("arnaque") ||
    lowerMsg.includes("scam") ||
    lowerMsg.includes("suspect") ||
    lowerMsg.includes("fraude")
  ) {
    chains.push(["verify_link_safety", "detect_typosquatting", "detect_disposable_email"]);
  }

  // "Question technique" → searchKnowledge + searchWeb
  if (
    lowerMsg.includes("comment") ||
    lowerMsg.includes("documentation") ||
    lowerMsg.includes("aide")
  ) {
    chains.push(["searchKnowledge", "searchWeb"]);
  }

  // "Raid ?" → evaluate_channel_velocity + calculate_server_panic_index
  if (lowerMsg.includes("raid") || lowerMsg.includes("attaque") || lowerMsg.includes("invasion")) {
    chains.push(["evaluate_channel_velocity", "calculate_server_panic_index"]);
  }

  // "Évadé de ban ?" → track_avatar_hash + get_user_moderation_history
  if (
    lowerMsg.includes("évadé") ||
    lowerMsg.includes("ban evasion") ||
    lowerMsg.includes("multi-compte")
  ) {
    chains.push(["track_avatar_hash", "get_user_moderation_history"]);
  }

  // "Bug / erreur" → self_inspect_logs + bot_health
  if (
    lowerMsg.includes("bug") ||
    lowerMsg.includes("erreur") ||
    lowerMsg.includes("crash") ||
    lowerMsg.includes("problème")
  ) {
    chains.push(["self_inspect_logs", "bot_health", "monitor_ram_health"]);
  }

  // "Fun" → getJoke + getMeme
  if (
    lowerMsg.includes("blague") ||
    lowerMsg.includes("mème") ||
    lowerMsg.includes("drôle") ||
    lowerMsg.includes("rigole")
  ) {
    chains.push(["getJoke", "getMeme"]);
  }

  // "Stats serveur" → guild_analytics + get_server_insights + top_commands
  if (
    lowerMsg.includes("stat") ||
    (lowerMsg.includes("serveur") && (lowerMsg.includes("info") || lowerMsg.includes("membres")))
  ) {
    chains.push(["guild_analytics", "get_server_insights", "top_commands"]);
  }

  // "Conseil" → getAdvice + getQuote
  if (
    lowerMsg.includes("conseil") ||
    lowerMsg.includes("motivation") ||
    lowerMsg.includes("inspir")
  ) {
    chains.push(["getAdvice", "getQuote"]);
  }

  return chains;
}

/**
 * Statut des API keys pour le system prompt.
 */
export function getApiKeyStatusLine(): string {
  const keys = getConfiguredApiKeys();
  const configured = Object.entries(keys)
    .filter(([, v]) => v)
    .map(([k]) => k);
  const missing = Object.entries(keys)
    .filter(([, v]) => !v)
    .map(([k]) => k);

  let line = "## API Keys configurées\n";
  if (configured.length > 0) {
    line += `✅ Actives: ${configured.join(", ")}\n`;
  }
  if (missing.length > 0) {
    line += `⚠️ Manquantes (tools correspondants en mode dégradé): ${missing.join(", ")}\n`;
  }
  return line;
}
