/**
 * toolRiskRegistry.ts — Centralized Risk Classification for Agent Tools
 *
 * Every agent tool is classified as low / medium / high based on four
 * objective criteria. The classification is IMMUTABLE at runtime — no
 * agent or Discord command can reclassify a tool. Changes require a
 * code commit to this file.
 *
 * Criteria for `low` (ALL four must be true):
 *  1. Read-only or generative without persistence (no DB writes, no durable state change)
 *  2. No real financial cost triggered
 *  3. Instantly reversible or no effect at all if result is wrong
 *  4. Does not touch sensitive personal data of a third party
 *
 * `medium`: writes to DB, modifies bot state, or contacts a third party directly
 * `high`: irreversible, destructive, costs money, or touches sensitive infrastructure
 *
 * Modules covered: Core, Extended, Autonomous, Free, Extra
 * Modules EXCLUDED (classified separately): Kali (agentToolsKali.ts),
 *   External (agentToolsExternal.ts), moderation tools in Core
 */

// ─── Risk Levels ─────────────────────────────────────────────────────────────

export type RiskLevel = "low" | "medium" | "high";

export interface ToolRiskEntry {
  level: RiskLevel;
  module: string;
  reason: string;
}

// ─── The Registry (frozen, immutable) ────────────────────────────────────────

export const TOOL_RISK_REGISTRY: ReadonlyMap<string, ToolRiskEntry> = (() => {
  const map = new Map<string, ToolRiskEntry>([
    // ════════════════════════════════════════════════════════════════════════
    // MODULE 1: Core (agentTools.ts) — excluding moderation/admin tools
    // ════════════════════════════════════════════════════════════════════════

    // ── Moderation tools (HIGH — irreversible Discord actions) ──
    [
      "deleteMessages",
      { level: "high", module: "core", reason: "Bulk deletes Discord messages — irreversible" },
    ],
    [
      "timeoutUser",
      {
        level: "high",
        module: "core",
        reason: "Discord timeout — restricts a user, visible effect",
      },
    ],
    [
      "warnUser",
      { level: "medium", module: "core", reason: "Writes sanction to DB — persistent record" },
    ],
    [
      "pinMessage",
      { level: "medium", module: "core", reason: "Modifies channel state — visible to all" },
    ],

    // ── Information retrieval (LOW) ──
    ["searchWeb", { level: "low", module: "core", reason: "Read-only web search, no persistence" }],
    [
      "searchYouTube",
      { level: "low", module: "core", reason: "Read-only YouTube metadata search" },
    ],
    ["readUrl", { level: "low", module: "core", reason: "Read-only URL fetch, no persistence" }],
    [
      "fetchAndSummarize",
      { level: "low", module: "core", reason: "Read-only fetch + AI summary, no persistence" },
    ],
    [
      "ingestDocumentation",
      { level: "low", module: "core", reason: "Read-only doc ingestion for context, no DB write" },
    ],
    [
      "searchKnowledge",
      { level: "low", module: "core", reason: "Read-only RAG search from existing index" },
    ],
    [
      "getWeather",
      { level: "low", module: "core", reason: "Read-only weather data, no persistence" },
    ],
    [
      "getCryptoPrice",
      { level: "low", module: "core", reason: "Read-only price lookup, no persistence" },
    ],
    ["getGitHubRepo", { level: "low", module: "core", reason: "Read-only GitHub API lookup" }],
    ["getWikipediaSummary", { level: "low", module: "core", reason: "Read-only Wikipedia API" }],
    ["getTechNews", { level: "low", module: "core", reason: "Read-only Hacker News fetch" }],
    [
      "analyzeImageGemini",
      { level: "low", module: "core", reason: "Read-only image analysis, no persistence" },
    ],
    ["detect_language", { level: "low", module: "core", reason: "Read-only language detection" }],

    // ── Code execution (HIGH — arbitrary code) ──
    [
      "execute_code",
      {
        level: "high",
        module: "core",
        reason: "Arbitrary code execution in sandbox — potential escape",
      },
    ],

    // ── Audio transcription (LOW — read-only) ──
    [
      "transcribeAudio",
      { level: "low", module: "core", reason: "Read-only audio transcription, no persistence" },
    ],

    // ── Memory tools (MEDIUM — writes to DB) ──
    [
      "saveMemoryFact",
      { level: "medium", module: "core", reason: "Writes to MemoryFact table — persistent" },
    ],

    // ── DM (MEDIUM — contacts a third party directly) ──
    [
      "sendDM",
      {
        level: "medium",
        module: "core",
        reason: "Direct message to a user — contacts third party",
      },
    ],

    // ── Invite/Channel creation (MEDIUM — modifies server state) ──
    [
      "createInvite",
      { level: "medium", module: "core", reason: "Creates Discord invite — modifies server state" },
    ],
    [
      "createChannel",
      {
        level: "medium",
        module: "core",
        reason: "Creates Discord channel — modifies server state",
      },
    ],

    // ════════════════════════════════════════════════════════════════════════
    // MODULE 2: Extended (agentToolsExtended.ts)
    // ════════════════════════════════════════════════════════════════════════

    // ── Trivia/entertainment (LOW) ──
    ["getJoke", { level: "low", module: "extended", reason: "Read-only joke API, no persistence" }],
    ["getDadJoke", { level: "low", module: "extended", reason: "Read-only dad joke API" }],
    ["getAdvice", { level: "low", module: "extended", reason: "Read-only advice API" }],
    ["getQuote", { level: "low", module: "extended", reason: "Read-only quote API" }],
    ["getTrivia", { level: "low", module: "extended", reason: "Read-only trivia API" }],
    ["getMeme", { level: "low", module: "extended", reason: "Read-only meme API" }],
    ["getDogImage", { level: "low", module: "extended", reason: "Read-only dog image API" }],
    ["getCatImage", { level: "low", module: "extended", reason: "Read-only cat image API" }],

    // ── Info lookups (LOW) ──
    ["getCountryInfo", { level: "low", module: "extended", reason: "Read-only country info API" }],
    [
      "getCurrencyRate",
      { level: "low", module: "extended", reason: "Read-only exchange rate API" },
    ],
    ["getDateTime", { level: "low", module: "extended", reason: "Read-only time API" }],
    ["getIpInfo", { level: "low", module: "extended", reason: "Read-only IP geolocation" }],
    ["getStockPrice", { level: "low", module: "extended", reason: "Read-only stock price API" }],
    ["getRedditPosts", { level: "low", module: "extended", reason: "Read-only Reddit JSON API" }],
    [
      "getUrbanDict",
      { level: "low", module: "extended", reason: "Read-only Urban Dictionary API" },
    ],
    ["getBookInfo", { level: "low", module: "extended", reason: "Read-only Open Library API" }],
    ["getNasaApod", { level: "low", module: "extended", reason: "Read-only NASA APOD API" }],
    ["getPokemon", { level: "low", module: "extended", reason: "Read-only PokeAPI" }],
    ["getSteamGame", { level: "low", module: "extended", reason: "Read-only Steam Store API" }],
    ["getNpmPackage", { level: "low", module: "extended", reason: "Read-only npm API" }],
    ["getPypiPackage", { level: "low", module: "extended", reason: "Read-only PyPI API" }],
    ["getGithubUser", { level: "low", module: "extended", reason: "Read-only GitHub API" }],
    ["shortenUrl", { level: "low", module: "extended", reason: "Read-only URL shortener" }],
    [
      "getQrCode",
      { level: "low", module: "extended", reason: "Generates QR code image, no persistence" },
    ],
    [
      "getRandomUser",
      { level: "low", module: "extended", reason: "Read-only random user API (fake data)" },
    ],
    ["getSteamDeals", { level: "low", module: "extended", reason: "Read-only Steam deals API" }],
    ["getGameNews", { level: "low", module: "extended", reason: "Read-only Steam news API" }],
    [
      "getSpeedrunRecord",
      { level: "low", module: "extended", reason: "Read-only speedrun.com API" },
    ],
    ["getGameReleases", { level: "low", module: "extended", reason: "Read-only IGDB API" }],
    ["getSteamPlayerCount", { level: "low", module: "extended", reason: "Read-only Steam API" }],

    // ── Utilities (LOW) ──
    [
      "generatePassword",
      { level: "low", module: "extended", reason: "Local generation, no persistence" },
    ],
    [
      "solveMath",
      { level: "low", module: "extended", reason: "Local math evaluation, no persistence" },
    ],
    ["dnsLookup", { level: "low", module: "extended", reason: "Read-only DNS lookup" }],
    ["getHttpStatus", { level: "low", module: "extended", reason: "Read-only HTTP status check" }],
    ["getUrlHeaders", { level: "low", module: "extended", reason: "Read-only HTTP headers check" }],
    [
      "getServerStats",
      { level: "low", module: "extended", reason: "Read-only Discord server stats" },
    ],

    // ════════════════════════════════════════════════════════════════════════
    // MODULE 3: Autonomous (agentToolsAutonomous.ts)
    // ════════════════════════════════════════════════════════════════════════

    // ── Moderation (HIGH — irreversible Discord actions) ──
    [
      "emergency_channel_freeze",
      {
        level: "high",
        module: "autonomous",
        reason: "Locks channel — irreversible visible effect on all users",
      },
    ],

    // ── OSINT on third parties (MEDIUM — touches personal data) ──
    [
      "osint_scan",
      {
        level: "medium",
        module: "autonomous",
        reason: "OSINT scan on a target — touches personal/infrastructure data",
      },
    ],
    [
      "shodan_search",
      {
        level: "medium",
        module: "autonomous",
        reason: "Shodan search — exposes infrastructure data of third parties",
      },
    ],
    [
      "twitter_get_user",
      {
        level: "medium",
        module: "autonomous",
        reason: "Twitter profile lookup — personal data of a third party",
      },
    ],
    [
      "twitter_search",
      {
        level: "medium",
        module: "autonomous",
        reason: "Twitter search — may expose personal data",
      },
    ],
    [
      "reddit_get_posts",
      { level: "low", module: "autonomous", reason: "Read-only public Reddit posts" },
    ],
    [
      "reddit_search",
      { level: "low", module: "autonomous", reason: "Read-only public Reddit search" },
    ],
    [
      "reddit_trending",
      { level: "low", module: "autonomous", reason: "Read-only public Reddit trending" },
    ],
    [
      "detect_disposable_email",
      { level: "medium", module: "autonomous", reason: "Checks a specific email — personal data" },
    ],
    [
      "track_avatar_hash",
      {
        level: "medium",
        module: "autonomous",
        reason: "Hashes and stores avatar — persistent tracking of a user",
      },
    ],
    [
      "expose_ghost_pinger",
      { level: "low", module: "autonomous", reason: "Read-only detection from local cache" },
    ],
    [
      "verify_link_safety",
      { level: "low", module: "autonomous", reason: "Read-only URL safety check via URLVoid" },
    ],
    [
      "detect_typosquatting",
      { level: "low", module: "autonomous", reason: "Local heuristic, no persistence" },
    ],
    [
      "scrape_urban_slang",
      { level: "low", module: "autonomous", reason: "Read-only Urban Dictionary scrape" },
    ],
    [
      "scrape_steamrep_status",
      {
        level: "medium",
        module: "autonomous",
        reason: "Checks a specific Steam ID — personal data",
      },
    ],
    [
      "username_search",
      {
        level: "medium",
        module: "autonomous",
        reason: "Searches for a username across platforms — personal data",
      },
    ],
    [
      "email_reputation",
      { level: "medium", module: "autonomous", reason: "Checks a specific email — personal data" },
    ],
    [
      "phone_lookup",
      { level: "medium", module: "autonomous", reason: "Looks up a phone number — personal data" },
    ],
    [
      "ip_geolocation",
      {
        level: "low",
        module: "autonomous",
        reason: "Read-only IP geolocation (same as getIpInfo)",
      },
    ],
    [
      "domain_age",
      { level: "low", module: "autonomous", reason: "Read-only WHOIS domain age check" },
    ],

    // ── Data breach & URL safety ──
    [
      "checkDataBreach",
      {
        level: "medium",
        module: "autonomous",
        reason: "Checks a specific email against HIBP — personal data",
      },
    ],
    [
      "scanUrlSafety",
      { level: "low", module: "autonomous", reason: "Read-only URL safety scan via urlscan.io" },
    ],

    // ── New tools (Part A) ──
    [
      "solveMathAdvanced",
      { level: "low", module: "extended", reason: "Read-only Wolfram Alpha computation" },
    ],
    [
      "translateTextDeepL",
      { level: "low", module: "extended", reason: "Read-only translation via DeepL" },
    ],
    [
      "getAirQuality",
      { level: "low", module: "extra", reason: "Read-only OpenAQ air quality data" },
    ],
    [
      "searchRawgGames",
      { level: "low", module: "extra", reason: "Read-only RAWG game database search" },
    ],
    [
      "sendAlertEmail",
      {
        level: "high",
        module: "external",
        reason: "Sends email to recipients — external communication",
      },
    ],

    // ── Jina readers (LOW — read-only) ──
    [
      "jina_read_url",
      { level: "low", module: "autonomous", reason: "Read-only URL content via Jina Reader" },
    ],
    [
      "jina_read_reddit",
      { level: "low", module: "autonomous", reason: "Read-only Reddit content via Jina Reader" },
    ],
    [
      "jina_read_twitter",
      { level: "low", module: "autonomous", reason: "Read-only Twitter content via Jina Reader" },
    ],

    // ── Gaming (LOW) ──
    [
      "match_fortnite_shop_wishlist",
      { level: "low", module: "autonomous", reason: "Read-only Fortnite shop comparison" },
    ],
    [
      "scrape_epic_free_countdown",
      { level: "low", module: "autonomous", reason: "Read-only Epic Games Store scrape" },
    ],
    [
      "check_community_streams",
      { level: "low", module: "autonomous", reason: "Read-only Twitch stream check" },
    ],
    [
      "fetch_game_patchnotes",
      { level: "low", module: "autonomous", reason: "Read-only patch notes fetch" },
    ],
    [
      "get_galactic_war_status",
      { level: "low", module: "autonomous", reason: "Read-only Helldivers 2 API" },
    ],

    // ── Server monitoring (LOW) ──
    [
      "evaluate_channel_velocity",
      { level: "low", module: "autonomous", reason: "Read-only channel activity analysis" },
    ],
    [
      "calculate_server_panic_index",
      { level: "low", module: "autonomous", reason: "Read-only server risk calculation" },
    ],
    [
      "get_user_moderation_history",
      {
        level: "medium",
        module: "autonomous",
        reason: "Reads moderation history of a specific user — personal data",
      },
    ],

    // ── Self-maintenance (LOW — no external effect) ──
    ["monitor_ram_health", { level: "low", module: "autonomous", reason: "Read-only RAM stats" }],
    [
      "enforce_garbage_collection",
      { level: "low", module: "autonomous", reason: "Local GC trigger, no external effect" },
    ],
    [
      "self_inspect_logs",
      { level: "low", module: "autonomous", reason: "Read-only local log inspection" },
    ],

    // ── Memory (MEDIUM — writes to DB) ──
    [
      "upsert_user_memory",
      {
        level: "medium",
        module: "autonomous",
        reason: "Writes to UserMemory + MemoryFact tables — persistent",
      },
    ],
    [
      "retrieve_user_memory",
      { level: "low", module: "autonomous", reason: "Read-only memory retrieval" },
    ],

    // ── Notifications (MEDIUM — contacts third parties) ──
    [
      "send_telegram",
      {
        level: "medium",
        module: "autonomous",
        reason: "Sends Telegram message — contacts third party",
      },
    ],
    [
      "send_slack",
      {
        level: "medium",
        module: "autonomous",
        reason: "Sends Slack message — contacts third party",
      },
    ],
    [
      "broadcast_notification",
      {
        level: "high",
        module: "autonomous",
        reason: "Broadcasts to ALL platforms simultaneously — mass contact",
      },
    ],

    // ── Translation (LOW) ──
    [
      "auto_translate",
      { level: "low", module: "autonomous", reason: "Read-only translation, no persistence" },
    ],

    // ── Web browsing (LOW) ──
    ["open_web_page", { level: "low", module: "autonomous", reason: "Read-only web page fetch" }],

    // ════════════════════════════════════════════════════════════════════════
    // MODULE 4: Free APIs (agentToolsFree.ts)
    // ════════════════════════════════════════════════════════════════════════
    [
      "generate_image",
      { level: "low", module: "free", reason: "Generative image, no persistence, free API" },
    ],
    [
      "generate_tts",
      { level: "low", module: "free", reason: "Generates TTS audio, no persistence, free API" },
    ],
    [
      "get_nasa_apod",
      { level: "low", module: "free", reason: "Read-only NASA APOD (duplicate of getNasaApod)" },
    ],
    ["get_earthquakes", { level: "low", module: "free", reason: "Read-only USGS earthquake data" }],
    ["get_chess_stats", { level: "low", module: "free", reason: "Read-only Chess.com stats" }],
    ["get_lichess_stats", { level: "low", module: "free", reason: "Read-only Lichess stats" }],
    ["search_books", { level: "low", module: "free", reason: "Read-only Open Library search" }],
    ["search_food", { level: "low", module: "free", reason: "Read-only Open Food Facts" }],
    ["search_arxiv", { level: "low", module: "free", reason: "Read-only arXiv paper search" }],
    ["get_flights", { level: "low", module: "free", reason: "Read-only OpenSky flight data" }],
    ["get_google_trends", { level: "low", module: "free", reason: "Read-only Google Trends" }],
    ["get_rsshub_feed", { level: "low", module: "free", reason: "Read-only RSSHub feed" }],
    ["get_devto_articles", { level: "low", module: "free", reason: "Read-only Dev.to articles" }],
    [
      "get_cat_image",
      { level: "low", module: "free", reason: "Read-only cat image (duplicate of getCatImage)" },
    ],
    [
      "get_pokemon",
      { level: "low", module: "free", reason: "Read-only PokeAPI (duplicate of getPokemon)" },
    ],
    [
      "get_npm_package",
      { level: "low", module: "free", reason: "Read-only npm (duplicate of getNpmPackage)" },
    ],
    [
      "get_pypi_package",
      { level: "low", module: "free", reason: "Read-only PyPI (duplicate of getPypiPackage)" },
    ],
    [
      "get_country_info",
      {
        level: "low",
        module: "free",
        reason: "Read-only country info (duplicate of getCountryInfo)",
      },
    ],
    [
      "get_urban_dict",
      { level: "low", module: "free", reason: "Read-only Urban Dictionary (duplicate)" },
    ],
    [
      "get_currency_rate",
      {
        level: "low",
        module: "free",
        reason: "Read-only exchange rate (duplicate of getCurrencyRate)",
      },
    ],
    [
      "get_random_user",
      {
        level: "low",
        module: "free",
        reason: "Read-only random user (duplicate of getRandomUser)",
      },
    ],
    [
      "get_stock_price",
      {
        level: "low",
        module: "free",
        reason: "Read-only stock price (duplicate of getStockPrice)",
      },
    ],
    [
      "search_developer_resources",
      { level: "low", module: "free", reason: "Read-only free-for-dev search" },
    ],
    [
      "lookup_typescript_skill",
      { level: "low", module: "free", reason: "Read-only TypeScript skills lookup" },
    ],

    // ════════════════════════════════════════════════════════════════════════
    // MODULE 5: Extra (agentToolsExtra.ts)
    // ════════════════════════════════════════════════════════════════════════
    [
      "get_hackernews_top",
      { level: "low", module: "extra", reason: "Read-only Hacker News top stories" },
    ],
    [
      "get_github_trending",
      { level: "low", module: "extra", reason: "Read-only GitHub trending scrape" },
    ],
    [
      "get_weather_forecast",
      { level: "low", module: "extra", reason: "Read-only 5-day weather forecast" },
    ],
    [
      "get_crypto_top",
      { level: "low", module: "extra", reason: "Read-only top 10 crypto by market cap" },
    ],
    [
      "get_steam_requirements",
      { level: "low", module: "extra", reason: "Read-only Steam game requirements" },
    ],
    [
      "get_discord_events",
      { level: "low", module: "extra", reason: "Read-only Discord scheduled events" },
    ],
    ["search_igdb_games", { level: "low", module: "extra", reason: "Read-only IGDB game search" }],
    ["search_wikipedia", { level: "low", module: "extra", reason: "Read-only Wikipedia search" }],
    [
      "get_space_launches",
      { level: "low", module: "extra", reason: "Read-only space launch schedule" },
    ],
    [
      "validate_email",
      { level: "medium", module: "extra", reason: "Validates a specific email — personal data" },
    ],
    [
      "generate_hash",
      { level: "low", module: "extra", reason: "Local hash generation, no persistence" },
    ],
    [
      "generate_uuid",
      { level: "low", module: "extra", reason: "Local UUID generation, no persistence" },
    ],
    [
      "base64_encode_decode",
      { level: "low", module: "extra", reason: "Local base64, no persistence" },
    ],
    ["explain_cron", { level: "low", module: "extra", reason: "Local cron expression parser" }],
    [
      "generate_palette",
      { level: "low", module: "extra", reason: "Local color palette generation" },
    ],
    ["get_emoji_info", { level: "low", module: "extra", reason: "Read-only emoji info API" }],
    [
      "get_minecraft_status",
      { level: "low", module: "extra", reason: "Read-only Minecraft server status" },
    ],
    ["get_valorant_agents", { level: "low", module: "extra", reason: "Read-only Valorant API" }],
    ["get_lorem_ipsum", { level: "low", module: "extra", reason: "Local lorem ipsum generation" }],
    [
      "get_twitch_clips",
      { level: "low", module: "extra", reason: "Read-only Twitch clips scrape" },
    ],
    [
      "get_producthunt_products",
      { level: "low", module: "extra", reason: "Read-only Product Hunt scrape" },
    ],
    ["get_github_gists", { level: "low", module: "extra", reason: "Read-only GitHub gists API" }],

    // ════════════════════════════════════════════════════════════════════════
    // MODULE 6: External (agentToolsExternal.ts) — classified here for reference
    // but these are also in RESTRICTED_TOOLS (context guard strips in public)
    // ════════════════════════════════════════════════════════════════════════
    [
      "http_request",
      {
        level: "high",
        module: "external",
        reason: "Arbitrary HTTP request to any URL — SSRF risk",
      },
    ],
    [
      "system_stats",
      {
        level: "medium",
        module: "external",
        reason: "Reads VPS system stats — infrastructure info",
      },
    ],
    [
      "ssh_command",
      { level: "high", module: "external", reason: "Shell command execution on VPS — root access" },
    ],
    [
      "db_query",
      { level: "high", module: "external", reason: "Direct SQL query on production DB" },
    ],
    [
      "git_operations",
      { level: "high", module: "external", reason: "Git operations on production repo" },
    ],
    ["rss_monitor", { level: "low", module: "external", reason: "Read-only RSS feed monitor" }],
    [
      "website_diff",
      { level: "low", module: "external", reason: "Read-only website change detection" },
    ],
    [
      "cron_create",
      { level: "high", module: "external", reason: "Creates persistent cron job — state change" },
    ],
    [
      "docker_manage",
      { level: "high", module: "external", reason: "Docker container management — infrastructure" },
    ],
    [
      "file_read",
      { level: "high", module: "external", reason: "Reads arbitrary files on VPS — data exposure" },
    ],
    [
      "control_stream",
      {
        level: "high",
        module: "external",
        reason: "Controls Go Live stream — visible state change",
      },
    ],
    [
      "check_vps_storage",
      { level: "low", module: "external", reason: "Read-only disk usage check" },
    ],

    // ════════════════════════════════════════════════════════════════════════
    // MODULE 7: Kali (agentToolsKali.ts) — all HIGH (active security scanning)
    // ════════════════════════════════════════════════════════════════════════
    [
      "runKaliPortAudit",
      { level: "high", module: "kali", reason: "Active port scan — security tool" },
    ],
    ["runKaliWebAudit", { level: "high", module: "kali", reason: "Active web vulnerability scan" }],
    [
      "runWifiSecurityAudit",
      { level: "high", module: "kali", reason: "WiFi handshake capture — security tool" },
    ],
    ["runWifiConfigScan", { level: "high", module: "kali", reason: "Active WiFi config scan" }],
    [
      "runRogueApDetection",
      { level: "high", module: "kali", reason: "Active wireless monitoring" },
    ],
    ["runArpScan", { level: "high", module: "kali", reason: "Active network scan" }],
    [
      "runArpWatch",
      { level: "high", module: "kali", reason: "Persistent network monitoring — state change" },
    ],
    [
      "runNetworkIdsSnapshot",
      { level: "high", module: "kali", reason: "Reads IDS logs — infrastructure security data" },
    ],
    [
      "runSystemHardeningAudit",
      { level: "high", module: "kali", reason: "Active system audit — infrastructure" },
    ],
  ]);

  // Remove mutating methods to enforce immutability at runtime
  (map as unknown as Record<string, unknown>).set = undefined;
  (map as unknown as Record<string, unknown>).delete = undefined;
  (map as unknown as Record<string, unknown>).clear = undefined;

  return Object.freeze(map);
})();

// ─── Public API ──────────────────────────────────────────────────────────────

export function getRiskLevel(toolName: string): RiskLevel | undefined {
  return TOOL_RISK_REGISTRY.get(toolName)?.level;
}

export function getToolRiskEntry(toolName: string): ToolRiskEntry | undefined {
  return TOOL_RISK_REGISTRY.get(toolName);
}

export function isLowRisk(toolName: string): boolean {
  return TOOL_RISK_REGISTRY.get(toolName)?.level === "low";
}

export function isHighRisk(toolName: string): boolean {
  return TOOL_RISK_REGISTRY.get(toolName)?.level === "high";
}

export function requiresApproval(toolName: string): boolean {
  const level = TOOL_RISK_REGISTRY.get(toolName)?.level;
  return level === "medium" || level === "high";
}

/**
 * Returns a summary of the registry for health checks / embeds.
 */
export function getRegistrySummary(): {
  total: number;
  low: number;
  medium: number;
  high: number;
  unclassified: string[];
} {
  let low = 0,
    medium = 0,
    high = 0;
  for (const [, entry] of TOOL_RISK_REGISTRY) {
    if (entry.level === "low") low++;
    else if (entry.level === "medium") medium++;
    else if (entry.level === "high") high++;
  }
  return {
    total: TOOL_RISK_REGISTRY.size,
    low,
    medium,
    high,
    unclassified: [],
  };
}
