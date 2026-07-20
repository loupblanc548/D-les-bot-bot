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

// ─── Directive 2: Restricted tools — blocked in public channels ───────────────

export const RESTRICTED_TOOLS = new Set<string>([
  "ssh_command",
  "db_query",
  "docker_manage",
  "git_operations",
  "file_read",
  "cron_create",
  "system_stats",
  "http_request",
  // Module 7: Kali Linux audit tools — high risk, admin-only DM execution
  "runKaliPortAudit",
  "runKaliWebAudit",
  "runWifiSecurityAudit",
  "runWifiConfigScan",
  "runRogueApDetection",
  "runArpScan",
  "runArpWatch",
  "runNetworkIdsSnapshot",
  "runSystemHardeningAudit",
  // New tools — medium risk (personal data / email)
  "checkDataBreach",
  // New tools — high risk (external communication)
  "sendAlertEmail",
  // New tools — medium risk (financial cost or persistent state change)
  "createCalendarEvent",
  "elevenLabsTTS",
  "removeBackground",
]);

/**
 * Check if a channel is private (DM or admin-only).
 * Public channels = any guild text channel that is not a DM.
 */
export function isPrivateChannel(channelId: string, guildId: string | null): boolean {
  // DM channels have no guildId
  if (!guildId) return true;
  // Admin DM channel — check if it matches admin DM pattern
  const adminDmChannel = process.env.ADMIN_DISCORD_ID;
  if (adminDmChannel && channelId === adminDmChannel) return true;
  return false;
}

/**
 * Directive 2: Context Guarding — strip restricted tools from public channels.
 * Prevents prompt injection from public chats accessing ssh/db/docker.
 */
export function applyContextGuard(tools: AgentToolDef[], isPublic: boolean): AgentToolDef[] {
  if (!isPublic) return tools;

  const filtered = tools.filter((t) => !RESTRICTED_TOOLS.has(t.function.name));
  const stripped = tools.length - filtered.length;
  if (stripped > 0) {
    logger.warn(
      `[ToolRouter] 🛡️ Context Guard: stripped ${stripped} restricted tool(s) from public channel`,
    );
  }
  return filtered;
}

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
  { envVar: "HIBP_API_KEY", tools: ["checkDataBreach"], optional: true },
  { envVar: "URLSCAN_API_KEY", tools: ["scanUrlSafety"], optional: true },
  { envVar: "WOLFRAM_APP_ID", tools: ["solveMathAdvanced"], optional: true },
  { envVar: "DEEPL_API_KEY", tools: ["translateTextDeepL"], optional: true },
  { envVar: "RAWG_API_KEY", tools: ["searchRawgGames"], optional: true },
  // Threat Intel Extended
  { envVar: "SECURITYTRAILS_API_KEY", tools: ["securityTrailsDnsHistory"], optional: true },
  { envVar: "CENSYS_API_ID", tools: ["censysAttackSurface"], optional: true },
  { envVar: "GREYNOISE_API_KEY", tools: ["greyNoiseClassify"], optional: true },
  // Google Calendar
  {
    envVar: "GOOGLE_CALENDAR_ID",
    tools: ["listUpcomingEvents", "createCalendarEvent"],
    optional: true,
  },
  // ElevenLabs TTS
  { envVar: "ELEVENLABS_API_KEY", tools: ["elevenLabsTTS"], optional: true },
  // Remove.bg
  { envVar: "REMOVEBG_API_KEY", tools: ["removeBackground"], optional: true },
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
      "free",
      "gratuit",
      "free tier",
      "free plan",
      "gratuit pour dev",
      "hébergement gratuit",
      "hebergement gratuit",
      "hosting free",
      "api gratuite",
      "api gratuit",
      "saas gratuit",
      "base de données gratuite",
      "database free",
      "ci/cd gratuit",
      "monitoring gratuit",
      "outil gratuit",
      "outils gratuits",
      "service gratuit",
      "services gratuits",
      "ressource gratuite",
      "ressources gratuites",
      "free for dev",
      "free-for-dev",
    ],
    tools: ["search_developer_resources"],
  },
  {
    keywords: [
      "typescript",
      "ts error",
      "erreur ts",
      "type error",
      "typage",
      "generic",
      "generics",
      "générique",
      "conditional type",
      "type conditionnel",
      "mapped type",
      "inference",
      "inférence",
      "type assertion",
      "is not assignable",
      "does not exist on type",
      "no overload",
      "type guard",
      "narrowing",
      "typeof",
      "instanceof",
      "pattern typescript",
      "ts pattern",
      "matt pocock",
    ],
    tools: ["lookup_typescript_skill"],
  },
  {
    keywords: [
      "problème réseau",
      "network problem",
      "network issue",
      "attaque",
      "ip suspecte",
      "suspicious ip",
      "intrusion",
      "brute force",
      "brute-force",
      "port scan",
      "scan de ports",
      "whois",
      "dns lookup",
      "reverse dns",
      "géolocalisation ip",
      "ip geo",
      "osint",
      "investigation réseau",
      "network investigation",
      "sécurité réseau",
      "network security",
      "menace",
      "threat",
      "wazuh",
      "siem",
      "alerte sécurité",
      "firewall",
      "pare-feu",
      "ip ban",
      "bannir ip",
      "ouvre internet",
      "ouvrir internet",
      "open internet",
      "voir le réseau",
      "voir réseau",
      "voir ce qu'il se passe",
      "voir le trafic",
      "trafic réseau",
      "network traffic",
      "connexions actives",
      "active connections",
      "ports ouverts",
      "monitoring réseau",
      "network monitoring",
      "état du réseau",
      "network status",
      "statut réseau",
      "dashboard réseau",
      "what's happening",
      "que se passe-t-il",
      "activité réseau",
      "network activity",
      "live network",
      "réseau live",
      "connexions en cours",
      "listening ports",
      "ports en écoute",
      "interfaces réseau",
      "bande passante",
      "bandwidth",
      "routes",
      "table de routage",
      "routing table",
      "virus",
      "malware",
      "trojan",
      "ransomware",
      "worm",
      "backdoor",
      "rootkit",
      "spyware",
      "botnet",
      "cryptominer",
      "payload",
      "phishing",
      "hameçonnage",
      "unsafe url",
      "url suspecte",
      "file hash",
      "hash fichier",
      "scan virus",
      "scan malware",
      "virustotal",
      "abuseipdb",
      "phishtank",
      "safe browsing",
      "threat intel",
      "renseignement de menace",
      "réputation ip",
      "espace disque",
      "disk space",
      "stockage vps",
      "vps storage",
      "disque plein",
      "disk full",
      "vps status",
      "état du vps",
      "system resources",
      "ressources système",
      "disk usage",
    ],
    tools: [
      "network_investigate",
      "ip_geolocation",
      "network_status",
      "open_web_page",
      "runKaliPortAudit",
      "runKaliWebAudit",
      "threat_intel_sweep",
      "check_vps_storage",
    ],
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
  // ═══ New Tools (Part A) ═══
  {
    keywords: [
      "breach",
      "fuite",
      "fuite de données",
      "have i been pwned",
      "hibp",
      "email compromis",
      "mot de passe volé",
      "data leak",
    ],
    tools: ["checkDataBreach"],
  },
  {
    keywords: [
      "scan url",
      "url safety",
      "sécurité url",
      "urlscan",
      "url suspecte",
      "verifie ce lien",
      "scan ce site",
    ],
    tools: ["scanUrlSafety", "verify_link_safety"],
  },
  {
    keywords: [
      "qualité air",
      "air quality",
      "pollution",
      "pm2.5",
      "pm10",
      "ozone",
      "no2",
      "openaq",
      "air pollution",
    ],
    tools: ["getAirQuality"],
  },
  {
    keywords: ["rawg", "jeu vidéo", "game database", "fiche jeu", "game info", "game rating"],
    tools: ["searchRawgGames", "search_igdb_games"],
  },
  {
    keywords: [
      "wolfram",
      "calcul complexe",
      "derivee",
      "intégrale",
      "integral",
      "equation",
      "solve equation",
      "conversion unité",
      "unit conversion",
      "math avancé",
    ],
    tools: ["solveMathAdvanced"],
  },
  {
    keywords: [
      "deepl",
      "traduction professionnelle",
      "traduire en",
      "translate to",
      "traduction précise",
    ],
    tools: ["translateTextDeepL"],
  },
  // ═══ Threat Intel Extended ═══
  {
    keywords: [
      "securitytrails",
      "dns history",
      "historique dns",
      "dns lookup",
      "dns records",
      "domain history",
      "historique domaine",
    ],
    tools: ["securityTrailsDnsHistory"],
  },
  {
    keywords: [
      "censys",
      "attack surface",
      "surface d'attaque",
      "exposed services",
      "services exposés",
      "open ports ip",
      "ports ouverts ip",
    ],
    tools: ["censysAttackSurface"],
  },
  {
    keywords: [
      "greynoise",
      "internet noise",
      "bruit internet",
      "noise classification",
      "scan noise",
      "false positive",
      "faux positif",
      "targeted attack",
      "attaque ciblée",
    ],
    tools: ["greyNoiseClassify"],
  },
  // ═══ Google Calendar ═══
  {
    keywords: [
      "calendrier",
      "calendar",
      "événement",
      "event",
      "prochain événement",
      "upcoming event",
      "réunion",
      "meeting",
      "planning",
      "schedule",
    ],
    tools: ["listUpcomingEvents", "createCalendarEvent"],
  },
  // ═══ ElevenLabs TTS ═══
  {
    keywords: [
      "voix haute qualité",
      "premium voice",
      "elevenlabs",
      "tts premium",
      "voix réaliste",
      "realistic voice",
      "voix naturelle",
      "natural voice",
    ],
    tools: ["elevenLabsTTS"],
  },
  // ═══ Remove.bg ═══
  {
    keywords: [
      "remove bg",
      "remove background",
      "supprimer fond",
      "supprimer arrière-plan",
      "fond transparent",
      "transparent background",
      "removebg",
      "couper fond",
    ],
    tools: ["removeBackground"],
  },
  // ═══ Dictionary / Define word ═══
  {
    keywords: [
      "définis",
      "définition",
      "define",
      "definition",
      "que veut dire",
      "what does it mean",
      "c'est quoi",
      "what is",
      "que signifie",
      "what means",
      "sens du mot",
      "meaning of",
      "explique ce mot",
      "explain this word",
      "dictionnaire",
      "dictionary",
      "que es",
      "qué significa",
      "was bedeutet",
      "cosa significa",
      "o que significa",
      "意味",
      "定义",
      "تعريف",
      "معنى",
      "betekent",
      "znaczenie",
      "anlamı",
      "je ne connais pas ce mot",
      "i don't know this word",
      "mot inconnu",
      "unknown word",
      "terme",
      "term",
      "jargon",
      "vocabulaire",
      "vocabulary",
      "définition mot",
      "word definition",
      " définition française",
      "définition anglaise",
    ],
    tools: ["define_word"],
  },
  // ═══ Movies / TV Shows ═══
  {
    keywords: [
      "film",
      "movie",
      "série",
      "tv show",
      "série tv",
      "tv series",
      "cinéma",
      "cinema",
      "acteur",
      "actor",
      "actrice",
      "actress",
      "réalisateur",
      "director",
      "sortie film",
      "movie release",
      "date de sortie",
      "release date",
      "note film",
      "movie rating",
      "synopsis",
      "overview",
      "poster",
      "what movie",
      "quel film",
      "film avec",
      "movie with",
      "pelicula",
      "serie de tv",
      "film",
      "fernsehen",
      "filme",
      "serie",
      "映画",
      "电影",
      "فيلم",
      "مسلسل",
      "film",
      "seriale",
      "tmdb",
      "imdb",
      "rotten tomatoes",
      "allociné",
      "allocine",
      "film recommandé",
      "movie recommendation",
      "quoi regarder",
      "what to watch",
      "film streaming",
      "où regarder",
      "where to watch",
      "disponible sur",
    ],
    tools: ["search_movies"],
  },
  // ═══ Music Search ═══
  {
    keywords: [
      "musique",
      "music",
      "chanson",
      "song",
      "artiste",
      "artist",
      "album",
      "groupe",
      "band",
      "musicien",
      "musician",
      "disque",
      "record",
      "qui chante",
      "who sings",
      "qui a fait",
      "who made",
      "paroles chanson",
      "song lyrics",
      "lyrics",
      "paroles",
      "musica",
      "canción",
      "lied",
      "canzone",
      "música",
      "音楽",
      "歌曲",
      "موسيقى",
      "أغنية",
      "liedje",
      "piosenka",
      "şarkı",
      "musicbrainz",
      "discogs",
      "spotify",
      "deezer",
      "quelle chanson",
      "what song",
      "musique qui dit",
      "album de",
      "album by",
      "nouvel album",
      "new album",
      "discographie",
      "discography",
      "single",
      "ep",
    ],
    tools: ["search_music"],
  },
  // ═══ Stack Overflow / Programming Help ═══
  {
    keywords: [
      "stack overflow",
      "stackoverflow",
      "erreur code",
      "code error",
      "bug code",
      "problème programmation",
      "programming problem",
      "comment coder",
      "how to code",
      "aide code",
      "code help",
      "question dev",
      "dev question",
      "comment faire en",
      "how to in",
      "pourquoi erreur",
      "why error",
      "fix bug",
      "corriger bug",
      "fix code",
      "debug",
      "python error",
      "javascript error",
      "java error",
      "c++ error",
      "rust error",
      "erreur python",
      "erreur javascript",
      "erreur java",
      "stackexchange",
      "stack exchange",
      "code review",
      "erreur compilation",
      "compilation error",
      "runtime error",
      "erreur exécution",
      "exception",
      "traceback",
      "stack trace",
      "pile d'appel",
      "how to fix",
      "comment réparer",
      "comment résoudre",
      "how to resolve",
      "programming question",
      "question programmation",
      "coding question",
    ],
    tools: ["search_stackoverflow", "searchKnowledge"],
  },
  // ═══ Code Execution / Sandbox ═══
  {
    keywords: [
      "exécute code",
      "execute code",
      "run code",
      "lance code",
      "code sandbox",
      "exécute",
      "run script",
      "exécute script",
      "code interpreter",
      "calcule",
      "calculate",
      "compute",
      "calcule ça",
      "calculate this",
      "évalue expression",
      "evaluate expression",
      "évalue",
      "eval",
      "javascript",
      "js code",
      "node code",
      "node.js",
      "test code",
      "teste code",
      "try code",
      "essaie code",
      "code python",
      "python code",
      "code java",
      "java code",
      "écris fonction",
      "write function",
      "crée fonction",
      "create function",
      "algorithme",
      "algorithm",
      "logique",
      "logic",
      "exécute moi ça",
      "run this for me",
      "calcule moi",
      "que vaut",
      "what is the value of",
      "résultat de",
      "result of",
    ],
    tools: ["execute_code", "solve_math"],
  },
  // ═══ Unit Converter ═══
  {
    keywords: [
      "convertir",
      "convert",
      "conversion",
      "convertit",
      "mètres en",
      "meters to",
      "km en",
      "km to",
      "miles en",
      "miles to",
      "kilomètres",
      "kilometers",
      "centimètres",
      "centimeters",
      "pieds",
      "feet",
      "pouces",
      "inches",
      "yards",
      "kg en",
      "kg to",
      "livres",
      "pounds",
      "lbs",
      "onces",
      "ounces",
      "oz",
      "litres",
      "liters",
      "gallons",
      "millilitres",
      "ml",
      "celsius",
      "fahrenheit",
      "kelvin",
      "°c",
      "°f",
      "k",
      "km/h",
      "mph",
      "m/s",
      "vitesse",
      "speed",
      "bytes",
      "ko",
      "mo",
      "go",
      "to",
      "kb",
      "mb",
      "gb",
      "tb",
      "unité",
      "unit",
      "mesure",
      "measurement",
      "conversión",
      "umrechnung",
      "conversione",
      "conversão",
      "変換",
      "转换",
      "تحويل",
      "conversie",
      "combien fait",
      "how much is",
      "équivalent",
      "equivalent",
    ],
    tools: ["convert_units"],
  },
  // ═══ Timezone Converter ═══
  {
    keywords: [
      "fuseau horaire",
      "timezone",
      "time zone",
      "heure locale",
      "local time",
      "quelle heure",
      "what time",
      "heure à",
      "time in",
      "décalage horaire",
      "time difference",
      "jet lag",
      "tokyo",
      "new york",
      "londres",
      "london",
      "paris",
      "los angeles",
      "sydney",
      "moscou",
      "moscow",
      "dubai",
      "singapour",
      "singapore",
      "convertir heure",
      "convert time",
      "heure mondiale",
      "world clock",
      "horaire",
      "schedule time",
      "réunion internationale",
      "international meeting",
      "zona horaria",
      "zeitzone",
      "fuso orario",
      "fuso horário",
      "タイムゾーン",
      "时区",
      "المنطقة الزمنية",
    ],
    tools: ["convert_timezone"],
  },
  // ═══ Regex Tester ═══
  {
    keywords: [
      "regex",
      "expression régulière",
      "regular expression",
      "regexp",
      "pattern",
      "motif",
      "test regex",
      "teste regex",
      "valider email regex",
      "validate regex",
      "match pattern",
      "remplacer regex",
      "replace regex",
      "capture group",
      "groupe capture",
      "regex tester",
      "regex test",
      "regex cheat sheet",
      "aide regex",
      "regex help",
      "comment regex",
      "how to regex",
      "apprendre regex",
      "learn regex",
    ],
    tools: ["test_regex"],
  },
  // ═══ JWT Decoder ═══
  {
    keywords: [
      "jwt",
      "json web token",
      "token jwt",
      "decode jwt",
      "décode jwt",
      "décoder token",
      "decode token",
      "jwt token",
      "header jwt",
      "payload jwt",
      "signature jwt",
      "jwt header",
      "jwt payload",
      "jwt signature",
      "inspect token",
      "inspecter token",
      "token content",
      "contenu token",
      "what's in my jwt",
      "que contient mon jwt",
      "base64 jwt",
      "jwt base64",
      "jwt decode",
    ],
    tools: ["decode_jwt"],
  },
  // ═══ Sports Scores ═══
  {
    keywords: [
      "score",
      "résultat",
      "result",
      "match",
      "game",
      "jeu",
      "football",
      "soccer",
      "basketball",
      "basket",
      "tennis",
      "hockey",
      "baseball",
      "rugby",
      "handball",
      "volley",
      "volleyball",
      "nba",
      "nfl",
      "nhl",
      "mls",
      "epl",
      "premier league",
      "serie a",
      "la liga",
      "bundesliga",
      "ligue 1",
      "atp",
      "wta",
      "score en direct",
      "live score",
      "score match",
      "match score",
      "résultat match",
      "match result",
      "qui gagne",
      "who wins",
      "résultat foot",
      "résultat basket",
      "résultat tennis",
      "partido",
      "ergebnis",
      "risultato",
      "resultado",
      "試合",
      "比赛",
      "نتيجة",
      "uitslag",
      "sport",
      "sports",
      "actualité sport",
      "sports news",
      "compétition",
      "competition",
      "championnat",
      "championship",
    ],
    tools: ["get_sports_scores"],
  },
  // ═══ Recipe Search ═══
  {
    keywords: [
      "recette",
      "recipe",
      "cuisine",
      "cooking",
      "cook",
      "cuisiner",
      "plat",
      "dish",
      "repas",
      "meal",
      "dîner",
      "dinner",
      "déjeuner",
      "lunch",
      "ingrédient",
      "ingredient",
      "comment cuisiner",
      "how to cook",
      "recette avec",
      "recipe with",
      "que faire avec",
      "what to make with",
      "recette poulet",
      "chicken recipe",
      "recette vegan",
      "vegan recipe",
      "recette végétarienne",
      "vegetarian recipe",
      "dessert",
      "pâtisserie",
      "baking",
      "bake",
      "faire un gâteau",
      "make a cake",
      "plat du jour",
      "dish of the day",
      "idée repas",
      "meal idea",
      "receta",
      "rezept",
      "ricetta",
      "receita",
      "レシピ",
      "食谱",
      "وصفة",
      "recept",
      "themaldb",
      "mealdb",
      "food",
      "nourriture",
    ],
    tools: ["search_recipe"],
  },
  // ═══ Color Converter ═══
  {
    keywords: [
      "couleur",
      "color",
      "couleur hex",
      "hex color",
      "rgb",
      "hsl",
      "convertir couleur",
      "convert color",
      "code couleur",
      "color code",
      "hexadécimal",
      "hexadecimal",
      "hex code",
      "code hex",
      "rouge vert bleu",
      "red green blue",
      "teinte saturation",
      "hue saturation",
      "color picker",
      "sélecteur couleur",
      "quelle couleur",
      "what color",
      "couleur de",
      "color of",
      "hex to rgb",
      "rgb to hex",
      "hsl to rgb",
      "color converter",
      "convertisseur couleur",
      "color hex",
      "couleur rgb",
      "couleur hsl",
    ],
    tools: ["convert_color", "generate_palette"],
  },
  // ═══ Number Base Converter ═══
  {
    keywords: [
      "binaire",
      "binary",
      "décimal",
      "decimal",
      "hexadécimal",
      "hexadecimal",
      "octal",
      "base 2",
      "base 10",
      "base 16",
      "base 8",
      "convertir base",
      "convert base",
      "base numérique",
      "number base",
      "bin to dec",
      "dec to hex",
      "hex to bin",
      "bin to hex",
      "binaire en décimal",
      "décimal en hexa",
      "hexa en binaire",
      "0b",
      "0x",
      "nombre binaire",
      "binary number",
      "système numérique",
      "number system",
      "radix",
      "binary converter",
      "convertisseur binaire",
    ],
    tools: ["convert_number_base"],
  },
  // ═══ Timestamp Converter ═══
  {
    keywords: [
      "timestamp",
      "unix timestamp",
      "epoch",
      "temps unix",
      "convertir timestamp",
      "convert timestamp",
      "timestamp to date",
      "date to timestamp",
      "timestamp en date",
      "date en timestamp",
      "unix time",
      "temps epoch",
      "epoch time",
      "quelle date",
      "what date",
      "timestamp unix",
      "1630000000",
      "convertir epoch",
      "convert epoch",
      "timestamp converter",
      "convertisseur timestamp",
      "unix epoch",
      "posix time",
      "temps posix",
    ],
    tools: ["convert_timestamp"],
  },
  // ═══ Sun / Moon Info ═══
  {
    keywords: [
      "lever soleil",
      "sunrise",
      "coucher soleil",
      "sunset",
      "heure lever",
      "heure coucher",
      "sunrise time",
      "sunset time",
      "soleil",
      "sun",
      "lune",
      "moon",
      "golden hour",
      "heure dorée",
      "midi solaire",
      "solar noon",
      "durée du jour",
      "day length",
      "crépuscule",
      "dawn",
      "dusk",
      "aube",
      "quand le soleil",
      "when does the sun",
      "quelle heure lever soleil",
      "what time sunrise",
      "soleil paris",
      "sunrise paris",
      "soleil london",
      "amanecer",
      "atardecer",
      "sonnenaufgang",
      "sonnenuntergang",
      "日の出",
      "日落",
      "شروق",
      "غروب",
    ],
    tools: ["get_sun_moon_info"],
  },
  // ═══ ASCII Art ═══
  {
    keywords: [
      "ascii art",
      "ascii",
      "art ascii",
      "texte ascii",
      "ascii text",
      "bannière ascii",
      "ascii banner",
      "ascii logo",
      "génère ascii",
      "generate ascii",
      "fait ascii",
      "make ascii",
      "texte en art",
      "text as art",
      "ascii font",
      "figlet",
      "big text",
      "grand texte",
      "texte géant",
      "ascii dessin",
      "ascii drawing",
      "ascii characters",
    ],
    tools: ["generate_ascii_art"],
  },
  // ═══ PDF Analysis ═══
  {
    keywords: [
      "pdf",
      "analyse pdf",
      "analyze pdf",
      "lire pdf",
      "read pdf",
      "résumer pdf",
      "summarize pdf",
      "summary pdf",
      "résumé pdf",
      "extraire pdf",
      "extract pdf",
      "texte pdf",
      "pdf text",
      "document pdf",
      "pdf document",
      "ouvrir pdf",
      "open pdf",
      "contenu pdf",
      "pdf content",
      "que dit ce pdf",
      "what's in this pdf",
      "télécharger pdf",
      "download pdf",
      "pdf url",
      "metadata pdf",
      "métadonnées pdf",
      "pdf info",
      "analyser document",
      "analyze document",
    ],
    tools: ["analyze_pdf", "fetchAndSummarize"],
  },
  // ═══ QR Code ═══
  {
    keywords: [
      "qr code",
      "qr",
      "qrcode",
      "génère qr",
      "generate qr",
      "crée qr code",
      "create qr code",
      "fait qr code",
      "make qr code",
      "qr pour",
      "qr for",
      "code qr",
      "qr code pour",
      "scan qr",
      "scanner qr",
      "qr generator",
      "générateur qr",
      "qr url",
      "qr link",
      "qr lien",
      "qr texte",
      "codigo qr",
      "qr-kode",
      "codice qr",
      "código qr",
      "QRコード",
      "二维码",
      "رمز QR",
    ],
    tools: ["generate_qr_code"],
  },
  // ═══ Sentiment Analysis ═══
  {
    keywords: [
      "sentiment",
      "émotion",
      "emotion",
      "humeur",
      "mood",
      "analyse sentiment",
      "sentiment analysis",
      "ressenti",
      "positif négatif",
      "positive negative",
      "ton du message",
      "tone of message",
      "ressent",
      "feels",
      "mood of text",
      "colère",
      "anger",
      "joie",
      "joy",
      "tristesse",
      "sadness",
      "peur",
      "fear",
      "surprise",
      "peur",
      "anxiété",
      "anxiety",
      "que ressent",
      "what does it feel",
      "émotion du texte",
      "emotion in text",
      "analyse émotion",
      "emotion analysis",
      "sentimiento",
      "emotion",
      "gefühl",
      "emozione",
      "sentimento",
      "感情",
      "情感",
      "مشاعر",
    ],
    tools: ["analyze_sentiment"],
  },
  // ═══ Reminder / Timer ═══
  {
    keywords: [
      "rappelle-moi",
      "remind me",
      "rappel",
      "reminder",
      "n'oublie pas",
      "don't forget",
      "rappelle moi dans",
      "remind me in",
      "dans 5 minutes",
      "in 5 minutes",
      "dans 10 min",
      "in 10 min",
      "dans une heure",
      "in an hour",
      "dans 30 min",
      "in 30 min",
      "timer",
      "minuteur",
      "chronomètre",
      "compte à rebours",
      "countdown",
      "alerte",
      "alert",
      "notification",
      "rappel personnalisé",
      "custom reminder",
      "rappelle moi de",
      "remind me to",
      "n'oublie pas de",
      "don't forget to",
      "dans un quart d'heure",
      "dans 20 minutes",
      "rappele moi",
      "rappel moi",
      "rappelle",
      "recordatorio",
      "erinnerung",
      "promemoria",
      "lembrete",
      "リマインダー",
      "提醒",
      "تذكير",
    ],
    tools: ["set_reminder"],
  },
  // ═══ Poll / Sondage ═══
  {
    keywords: [
      "sondage",
      "poll",
      "vote",
      "voter",
      "election",
      "élection",
      "crée sondage",
      "create poll",
      "fais un sondage",
      "make a poll",
      "qui vote",
      "who votes",
      "sondage discord",
      "discord poll",
      "question choix",
      "multiple choice",
      "choix multiple",
      "préférence",
      "preference",
      "opinion",
      "avis",
      "quel est le meilleur",
      "which is better",
      "a ou b",
      "sondage rapide",
      "quick poll",
      "vote rapide",
      "quick vote",
      "encuesta",
      "umfrage",
      "sondaggio",
      "enquete",
      "アンケート",
      "投票",
      "استطلاع",
    ],
    tools: ["create_poll"],
  },
  // ═══ Math Solver ═══
  {
    keywords: [
      "math",
      "maths",
      "mathématique",
      "mathematics",
      "équation",
      "equation",
      "résoudre",
      "solve",
      "calcule",
      "calculate",
      "dérivée",
      "derivative",
      "intégrale",
      "integral",
      "algèbre",
      "algebra",
      "trigonométrie",
      "trigonometry",
      "sin",
      "cos",
      "tan",
      "pythagore",
      "pythagorean",
      "théorème",
      "theorem",
      "racine carrée",
      "square root",
      "puissance",
      "power",
      "logarithme",
      "logarithm",
      "exponentielle",
      "exponential",
      "2x + 5",
      "résous équation",
      "solve equation",
      "derive x",
      "dérivée de",
      "derivative of",
      "factoriser",
      "factorize",
      "développer",
      "expand",
      "math help",
      "aide maths",
      "exercice maths",
      "math problem",
      "problème maths",
      "devoir maths",
      "math homework",
      "matemáticas",
      "mathe",
      "matematica",
      "matemática",
      "数学",
      "数学",
      "رياضيات",
    ],
    tools: ["solve_math", "execute_code"],
  },
  // ═══ Advanced Image Generation ═══
  {
    keywords: [
      "génère image",
      "generate image",
      "crée image",
      "create image",
      "dessine",
      "draw",
      "fais une image",
      "make an image",
      "image flux",
      "flux image",
      "sdxl",
      "turbo image",
      "image réaliste",
      "realistic image",
      "image anime",
      "anime image",
      "image 3d",
      "3d image",
      "ia image",
      "ai image",
      "ai art",
      "art ia",
      "text to image",
      "texte en image",
      "prompt image",
      "dalle",
      "midjourney",
      "stable diffusion",
      "sdxl",
      "image generation",
      "génération image",
      "génère moi",
      "generate me",
      "dessine moi",
      "draw me",
      "crée une photo",
      "create a photo",
      "photo ia",
      "ai photo",
      "genera imagen",
      "bild generieren",
      "genera immagine",
      "画像生成",
      "生成图片",
      "إنشاء صورة",
    ],
    tools: ["generate_image_advanced", "generate_image"],
  },
  // ═══ Currency Converter ═══
  {
    keywords: [
      "devise",
      "currency",
      "taux de change",
      "exchange rate",
      "euro dollar",
      "eur usd",
      "convertir euro",
      "convert euros",
      "dollar euro",
      "usd eur",
      "livre euro",
      "gbp eur",
      "yen euro",
      "jpy eur",
      "yuan",
      "cny",
      "rouble",
      "rub",
      "franc suisse",
      "chf",
      "dollar canadien",
      "cad",
      "dollar australien",
      "aud",
      "rupee",
      "inr",
      "combien en dollar",
      "how much in dollars",
      "combien en euro",
      "how much in euros",
      "conversion devise",
      "currency conversion",
      "xof",
      "fcfa",
      "franc cfa",
      "peso",
      "real",
      "real brésilien",
      "btc eur",
      "bitcoin euro",
      "eth usd",
      "ethereum dollar",
      "conversión moneda",
      "währung",
      "valuta",
      "moeda",
      "通貨",
      "货币",
      "عملة",
    ],
    tools: ["convert_currency", "getCryptoPrice"],
  },
  // ═══ Stock Price ═══
  {
    keywords: [
      "action",
      "stock",
      "bourse",
      "stock market",
      "marché boursier",
      "prix action",
      "stock price",
      "cotation",
      "quote",
      "aapl",
      "tsla",
      "googl",
      "msft",
      "amzn",
      "meta",
      "nvda",
      "apple action",
      "tesla action",
      "google action",
      "apple stock",
      "tesla stock",
      "google stock",
      "microsoft action",
      "amazon action",
      "nvidia action",
      "share price",
      "cours de l'action",
      "cours action",
      "wall street",
      "nasdaq",
      "nyse",
      "dow jones",
      "cac 40",
      "sbf 120",
      "dax",
      "ftse",
      "nikkei",
      "investissement",
      "investment",
      "trading",
      "trader",
      "portefeuille",
      "portfolio",
      "dividende",
      "dividend",
      "acción",
      "aktie",
      "azione",
      "ação",
      "株価",
      "股票",
      "سهم",
    ],
    tools: ["get_stock_price"],
  },
  // ═══ Horoscope ═══
  {
    keywords: [
      "horoscope",
      "astrologie",
      "astrology",
      "signe astrologique",
      "zodiac sign",
      "signe du zodiaque",
      "zodiaque",
      "bélier",
      "aries",
      "taureau",
      "taurus",
      "gémeaux",
      "gemini",
      "cancer",
      "lion",
      "leo",
      "vierge",
      "virgo",
      "balance",
      "libra",
      "scorpion",
      "scorpio",
      "sagittaire",
      "sagittarius",
      "capricorne",
      "capricorn",
      "verseau",
      "aquarius",
      "poissons",
      "pisces",
      "horoscope du jour",
      "daily horoscope",
      "horoscope aujourd'hui",
      "mon horoscope",
      "my horoscope",
      "prédiction astrale",
      "astro",
      "étoiles",
      "stars",
      "astre",
      "natal",
      "horóscopo",
      "horoskop",
      "oroscopo",
      "horóscopo",
      "星占い",
      "星座",
      "أبراج",
    ],
    tools: ["get_horoscope"],
  },
];

/**
 * Analyse une requête et retourne les tools pertinents.
 */
export function routeTools(
  userMessage: string,
  allTools: AgentToolDef[],
  isPublic: boolean = true,
): AgentToolDef[] {
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
  const filtered = filterAvailableTools(allTools);

  // Directive 2: Context Guard — strip restricted tools in public channels
  return applyContextGuard(filtered, isPublic);
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
