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

export type RiskLevel = "low" | "medium" | "high" | "restricted";

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
    ["ip_ping", { level: "low", module: "extended", reason: "ICMP ping, no data exposure" }],
    [
      "ip_traceroute",
      { level: "low", module: "extended", reason: "Network path discovery, read-only" },
    ],
    [
      "ip_portscan",
      { level: "medium", module: "extended", reason: "Active port scan, may trigger IDS" },
    ],
    ["ip_http_check", { level: "low", module: "extended", reason: "Read-only HTTP headers" }],
    ["ip_ssl_check", { level: "low", module: "extended", reason: "Read-only SSL certificate" }],
    [
      "ip_full_report",
      { level: "medium", module: "extended", reason: "Combined scan including port scan" },
    ],
    ["dns_lookup", { level: "low", module: "extended", reason: "Read-only DNS resolution" }],
    [
      "banner_grab",
      { level: "low", module: "extended", reason: "TCP connect + read, minimal intrusion" },
    ],
    ["http_methods_check", { level: "low", module: "extended", reason: "Read-only HTTP OPTIONS" }],
    [
      "directory_check",
      { level: "medium", module: "extended", reason: "Probes common paths, may trigger WAF" },
    ],
    [
      "tech_detect",
      { level: "low", module: "extended", reason: "Read-only HTTP headers analysis" },
    ],
    ["cors_test", { level: "low", module: "extended", reason: "Read-only CORS probe" }],
    [
      "email_validate",
      { level: "low", module: "extended", reason: "Read-only DNS MX/SPF/DKIM/DMARC" },
    ],
    [
      "jwt_decode",
      { level: "low", module: "extended", reason: "Local decode only, no network call" },
    ],
    ["url_expand", { level: "low", module: "extended", reason: "Follow redirects, read-only" }],
    [
      "security_score",
      { level: "low", module: "extended", reason: "Read-only HTTP headers analysis" },
    ],
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
    // Duplicates removed: get_nasa_apod, get_cat_image, get_pokemon, get_npm_package,
    // get_pypi_package, get_country_info, get_urban_dict, get_currency_rate,
    // get_random_user, get_stock_price — all exist in Extended module
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

    // ════════════════════════════════════════════════════════════════════════
    // MODULE 8: Threat Intel Extended (threatIntelExtended.ts)
    // ════════════════════════════════════════════════════════════════════════
    [
      "securityTrailsDnsHistory",
      {
        level: "low",
        module: "threat-intel",
        reason: "Read-only DNS history lookup — no personal data, no cost within quota",
      },
    ],
    [
      "censysAttackSurface",
      {
        level: "low",
        module: "threat-intel",
        reason: "Read-only attack surface scan of an IP — no active scanning of third parties",
      },
    ],
    [
      "greyNoiseClassify",
      {
        level: "low",
        module: "threat-intel",
        reason: "Read-only noise classification — reduces false positives, no personal data",
      },
    ],

    // ════════════════════════════════════════════════════════════════════════
    // MODULE 9: Google Calendar (googleCalendar.ts)
    // ════════════════════════════════════════════════════════════════════════
    [
      "listUpcomingEvents",
      {
        level: "low",
        module: "calendar",
        reason: "Read-only calendar event listing — no persistence, no cost",
      },
    ],
    [
      "createCalendarEvent",
      {
        level: "medium",
        module: "calendar",
        reason: "Writes to shared calendar — persistent state visible to others, reversible",
      },
    ],

    // ════════════════════════════════════════════════════════════════════════
    // MODULE 10: ElevenLabs TTS (elevenLabsTts.ts)
    // ════════════════════════════════════════════════════════════════════════
    [
      "elevenLabsTTS",
      {
        level: "medium",
        module: "tts",
        reason: "Real financial cost per character — metered API, not free",
      },
    ],

    // ════════════════════════════════════════════════════════════════════════
    // MODULE 11: Remove.bg (removeBg.ts)
    // ════════════════════════════════════════════════════════════════════════
    [
      "removeBackground",
      {
        level: "medium",
        module: "image",
        reason: "Real financial cost per call beyond free quota — metered API",
      },
    ],

    // ════════════════════════════════════════════════════════════════════════
    // MODULE 12: Voice Auto-Response (voiceAgent.ts — speakResponseInVoice)
    // ════════════════════════════════════════════════════════════════════════
    [
      "speakResponseInVoice",
      {
        level: "medium",
        module: "voice",
        reason:
          "Intrusive audible effect on all users in voice channel — requires opt-in + rate-limit",
      },
    ],

    // ════════════════════════════════════════════════════════════════════════
    // MODULE 13: Batch 2 Free Tools (80+ tools, agentToolsExtra.ts)
    // ════════════════════════════════════════════════════════════════════════
    // Text & crypto tools — all local, no persistence
    [
      "grammar_check",
      { level: "low", module: "extra", reason: "Read-only LanguageTool API, no persistence" },
    ],
    [
      "text_summarize",
      { level: "low", module: "extra", reason: "Local text processing, no persistence" },
    ],
    [
      "text_case_convert",
      { level: "low", module: "extra", reason: "Local text transform, no persistence" },
    ],
    [
      "word_counter",
      { level: "low", module: "extra", reason: "Local text analysis, no persistence" },
    ],
    ["text_to_morse", { level: "low", module: "extra", reason: "Local encoding, no persistence" }],
    ["rot13", { level: "low", module: "extra", reason: "Local encoding, no persistence" }],
    ["caesar_cipher", { level: "low", module: "extra", reason: "Local encoding, no persistence" }],
    ["palindrome_check", { level: "low", module: "extra", reason: "Local check, no persistence" }],
    [
      "anagram_solver",
      { level: "low", module: "extra", reason: "Local computation, no persistence" },
    ],
    [
      "roman_numeral_convert",
      { level: "low", module: "extra", reason: "Local conversion, no persistence" },
    ],
    ["leet_speak", { level: "low", module: "extra", reason: "Local encoding, no persistence" }],
    [
      "accent_remover",
      { level: "low", module: "extra", reason: "Local text transform, no persistence" },
    ],
    [
      "text_reverse",
      { level: "low", module: "extra", reason: "Local text transform, no persistence" },
    ],
    [
      "text_similarity",
      { level: "low", module: "extra", reason: "Local comparison, no persistence" },
    ],
    ["text_diff", { level: "low", module: "extra", reason: "Local comparison, no persistence" }],
    [
      "markdown_to_html",
      { level: "low", module: "extra", reason: "Local conversion, no persistence" },
    ],
    ["json_formatter", { level: "low", module: "extra", reason: "Local parsing, no persistence" }],
    [
      "url_encode_decode",
      { level: "low", module: "extra", reason: "Local encoding, no persistence" },
    ],
    [
      "html_entity_encode_decode",
      { level: "low", module: "extra", reason: "Local encoding, no persistence" },
    ],
    [
      "base32_encode_decode",
      { level: "low", module: "extra", reason: "Local encoding, no persistence" },
    ],
    [
      "hash_identifier",
      { level: "low", module: "extra", reason: "Local pattern matching, no persistence" },
    ],
    // Calculators & dates — all local
    [
      "password_strength",
      { level: "low", module: "extra", reason: "Local evaluation, no persistence" },
    ],
    [
      "bmi_calculator",
      { level: "low", module: "extra", reason: "Local computation, no persistence" },
    ],
    [
      "calorie_calculator",
      { level: "low", module: "extra", reason: "Local computation, no persistence" },
    ],
    [
      "compound_interest",
      { level: "low", module: "extra", reason: "Local computation, no persistence" },
    ],
    [
      "percentage_calculator",
      { level: "low", module: "extra", reason: "Local computation, no persistence" },
    ],
    [
      "tip_calculator",
      { level: "low", module: "extra", reason: "Local computation, no persistence" },
    ],
    [
      "days_between_dates",
      { level: "low", module: "extra", reason: "Local computation, no persistence" },
    ],
    [
      "age_calculator",
      { level: "low", module: "extra", reason: "Local computation, no persistence" },
    ],
    ["day_of_week", { level: "low", module: "extra", reason: "Local computation, no persistence" }],
    [
      "leap_year_check",
      { level: "low", module: "extra", reason: "Local computation, no persistence" },
    ],
    ["week_number", { level: "low", module: "extra", reason: "Local computation, no persistence" }],
    [
      "random_number",
      { level: "low", module: "extra", reason: "Local generation, no persistence" },
    ],
    ["dice_roll", { level: "low", module: "extra", reason: "Local generation, no persistence" }],
    ["coin_flip", { level: "low", module: "extra", reason: "Local generation, no persistence" }],
    [
      "uuid_generator",
      { level: "low", module: "extra", reason: "Local generation, no persistence" },
    ],
    [
      "nano_id_generator",
      { level: "low", module: "extra", reason: "Local generation, no persistence" },
    ],
    [
      "sleep_calculator",
      { level: "low", module: "extra", reason: "Local computation, no persistence" },
    ],
    [
      "gradient_generator",
      { level: "low", module: "extra", reason: "Local generation, no persistence" },
    ],
    [
      "cron_generator",
      { level: "low", module: "extra", reason: "Local generation, no persistence" },
    ],
    [
      "license_generator",
      { level: "low", module: "extra", reason: "Local generation, no persistence" },
    ],
    ["http_status_info", { level: "low", module: "extra", reason: "Local lookup, no persistence" }],
    ["mime_type_lookup", { level: "low", module: "extra", reason: "Local lookup, no persistence" }],
    [
      "caniuse",
      { level: "low", module: "extra", reason: "Read-only caniuse.com link, no persistence" },
    ],
    // API tools — read-only external APIs
    ["search_anime", { level: "low", module: "extra", reason: "Read-only Jikan/MyAnimeList API" }],
    ["iss_tracker", { level: "low", module: "extra", reason: "Read-only Open-Notify API" }],
    ["moon_phase", { level: "low", module: "extra", reason: "Local astronomical computation" }],
    ["reddit_hot", { level: "low", module: "extra", reason: "Read-only Reddit JSON API" }],
    ["boardgame_search", { level: "low", module: "extra", reason: "Read-only BoardGameGeek API" }],
    ["random_fact", { level: "low", module: "extra", reason: "Read-only Numbers API" }],
    ["this_day_in_history", { level: "low", module: "extra", reason: "Read-only Wikipedia API" }],
    [
      "word_of_the_day",
      { level: "low", module: "extra", reason: "Local selection, no persistence" },
    ],
    ["bored_activity", { level: "low", module: "extra", reason: "Read-only BoredAPI" }],
    ["chuck_norris_fact", { level: "low", module: "extra", reason: "Read-only Chuck Norris API" }],
    ["programming_joke", { level: "low", module: "extra", reason: "Read-only JokeAPI" }],
    [
      "would_you_rather",
      { level: "low", module: "extra", reason: "Local selection, no persistence" },
    ],
    ["country_info", { level: "low", module: "extra", reason: "Read-only REST Countries API" }],
    [
      "geocode_address",
      { level: "low", module: "extra", reason: "Read-only OpenStreetMap Nominatim API" },
    ],
    [
      "distance_calculator",
      { level: "low", module: "extra", reason: "Local haversine computation" },
    ],
    ["periodic_table", { level: "low", module: "extra", reason: "Read-only element API" }],
    [
      "fake_person_generator",
      { level: "low", module: "extra", reason: "Read-only RandomUser API (fake data)" },
    ],
    [
      "gitignore_generator",
      { level: "low", module: "extra", reason: "Read-only gitignore.io API" },
    ],
    ["npm_package_info", { level: "low", module: "extra", reason: "Read-only npm registry API" }],
    [
      "open_library_search",
      { level: "low", module: "extra", reason: "Read-only Open Library API" },
    ],
    ["aurora_forecast", { level: "low", module: "extra", reason: "Read-only NOAA SWPC API" }],
    ["steam_player_count", { level: "low", module: "extra", reason: "Read-only Steam Web API" }],
    ["esports_matches", { level: "low", module: "extra", reason: "Read-only PandaScore API" }],
    ["pokemon_info", { level: "low", module: "extra", reason: "Read-only PokeAPI" }],
    ["meme_generator", { level: "low", module: "extra", reason: "Read-only Imgflip API" }],
    ["ssl_checker", { level: "low", module: "extra", reason: "Read-only TLS connection check" }],
    ["dns_lookup", { level: "low", module: "extra", reason: "Read-only DNS resolution" }],
    [
      "color_palette_from_image",
      { level: "low", module: "extra", reason: "Read-only color.pizza API" },
    ],
    ["uv_index", { level: "low", module: "extra", reason: "Informational, no persistence" }],
    ["image_to_ascii", { level: "low", module: "extra", reason: "Informational, no persistence" }],
    // Fun & misc
    [
      "workout_generator",
      { level: "low", module: "extra", reason: "Local generation, no persistence" },
    ],
    [
      "name_generator",
      { level: "low", module: "extra", reason: "Local generation, no persistence" },
    ],
    [
      "zodiac_compatibility",
      { level: "low", module: "extra", reason: "Local computation, no persistence" },
    ],
    [
      "text_to_speech_info",
      { level: "low", module: "extra", reason: "Informational, no persistence" },
    ],
    [
      "teraterm_info",
      { level: "low", module: "extra", reason: "Read-only GitHub API for Tera Term project" },
    ],
    // Social follow — medium risk (notifications to other users)
    [
      "follow_social",
      {
        level: "medium",
        module: "social",
        reason: "Sends notifications to DMs/channels — can be used for spam",
      },
    ],
    [
      "unfollow_social",
      { level: "low", module: "social", reason: "Removes a follow, no external effect" },
    ],
    [
      "list_social_follows",
      { level: "low", module: "social", reason: "Read-only list of follows" },
    ],

    // ════════════════════════════════════════════════════════════════════════
    // MODULE 14: Voice Subtitles & Conversation (voiceSubtitles.ts, voiceConversation.ts)
    // ════════════════════════════════════════════════════════════════════════
    [
      "voice_subtitles",
      {
        level: "high",
        module: "voice",
        reason:
          "Continuous listening of all users in voice channel — privacy-sensitive, requires opt-in + toggle",
      },
    ],
    [
      "voice_conversation",
      {
        level: "high",
        module: "voice",
        reason:
          "Full conversational loop: listens to user speech, sends to AI, speaks response — most intrusive voice feature, requires opt-in + toggle + rate-limit",
      },
    ],
    // MODULE 15: Voice Translation (voiceTranslation.ts)
    [
      "voice_translation",
      {
        level: "high",
        module: "voice",
        reason:
          "Real-time speech translation: captures audio, transcribes, translates via DeepL, generates AI response, speaks it — requires opt-in + toggle + rate-limit, audio is ephemeral (not stored)",
      },
    ],
    // MODULE 16: NSFW Classifier (nsfwClassifier.ts)
    [
      "nsfw_classifier",
      {
        level: "medium",
        module: "moderation",
        reason:
          "Classifies images for NSFW content via Sightengine/Gemini — read-only API call, no data stored, cache LRU for efficiency",
      },
    ],
    // MODULE 17: Community Digest (communityDigest.ts)
    [
      "community_digest",
      {
        level: "low",
        module: "utility",
        reason:
          "Periodic aggregated server activity report — opt-in per guild, uses only aggregated data (no individual PII), configurable frequency",
      },
    ],
    // MODULE 18: Temporary Email (tempEmail.ts)
    [
      "create_temp_email",
      {
        level: "low",
        module: "utility",
        reason:
          "Creates a disposable email address via Mail.tm/1secmail — no PII involved, address is ephemeral by design, no API keys required",
      },
    ],
    [
      "check_temp_email",
      {
        level: "low",
        module: "utility",
        reason:
          "Reads inbox of a temporary email — content is not private (anyone with the address can read it), no PII stored, includes explicit privacy warning in response",
      },
    ],
    // MODULE 19: Password Generator (passwordGenerator.ts)
    [
      "generate_password",
      {
        level: "low",
        module: "utility",
        reason:
          "100% local password generation via crypto.randomInt() — no network calls, no storage, no PII. Response must be ephemeral to avoid leaking in channel history",
      },
    ],
    // MODULE 20: Orphan Tools (agentToolsOrphan.ts)
    [
      "get_lyrics",
      {
        level: "low",
        module: "entertainment",
        reason: "Fetches song lyrics from public free APIs (lyrics.ovh/Genius) — no PII, read-only",
      },
    ],
    [
      "shorten_url",
      {
        level: "low",
        module: "utility",
        reason: "Shortens URLs via is.gd/v.gd free APIs — no auth, no PII, read-only",
      },
    ],
    [
      "screenshot_tweet",
      {
        level: "low",
        module: "utility",
        reason: "Captures a public tweet screenshot via Playwright headless — read-only, no auth",
      },
    ],
    [
      "get_game_artwork",
      {
        level: "low",
        module: "entertainment",
        reason:
          "Fetches game artwork from SteamGridDB — read-only, requires API key but no user PII",
      },
    ],
    [
      "summarize_channel",
      {
        level: "low",
        module: "utility",
        reason:
          "Summarizes recent channel messages via AI — only reads messages the bot can already see",
      },
    ],
    [
      "export_chat",
      {
        level: "medium",
        module: "utility",
        reason:
          "Exports channel messages to a file — could expose conversation history, requires channel access",
      },
    ],
    [
      "resolve_dns",
      {
        level: "low",
        module: "utility",
        reason: "DNS resolution via Node.js built-in — public data, no PII, read-only",
      },
    ],
    [
      "compare_game_prices",
      {
        level: "low",
        module: "entertainment",
        reason: "Compares game prices across stores — public data, read-only, no PII",
      },
    ],
    [
      "check_game_server",
      {
        level: "low",
        module: "entertainment",
        reason: "Queries game server status (Minecraft etc.) — public data, read-only",
      },
    ],
    [
      "set_reminder",
      {
        level: "low",
        module: "utility",
        reason: "Sets a personal reminder — only affects the requesting user, stored in memory",
      },
    ],
    // MODULE 21: Vision & Image Composition (Phase 2)
    [
      "extract_text_from_image",
      {
        level: "low",
        module: "utility",
        reason: "OCR via Gemini Vision — reads text from public images, no PII stored, read-only",
      },
    ],
    [
      "compose_image",
      {
        level: "low",
        module: "utility",
        reason:
          "Generates image via Pollinations (free) + optional Remove.bg — no PII, outputs are user-requested content",
      },
    ],
    // MODULE 22: Server History Search (Phase 3)
    [
      "search_server_history",
      {
        level: "restricted",
        module: "moderation",
        reason:
          "Searches persisted chat history in database — can expose other users' messages, requires SOAR gate approval. Privacy: only searches within the requesting guild, limited to 20 results, max 90 days back",
      },
    ],
    // MODULE 23: Memory, Persona & Conversation (V2 features)
    [
      "memory_search",
      { level: "low", module: "utility", reason: "Read-only semantic search in user's own memory" },
    ],
    [
      "memory_list",
      { level: "low", module: "utility", reason: "Read-only listing of user's own stored facts" },
    ],
    [
      "memory_forget",
      {
        level: "low",
        module: "utility",
        reason: "User-initiated deletion of their own memory data",
      },
    ],
    [
      "persona_set",
      { level: "low", module: "utility", reason: "User sets their own custom instructions" },
    ],
    [
      "persona_list",
      {
        level: "low",
        module: "utility",
        reason: "Read-only listing of user's own custom instructions",
      },
    ],
    [
      "persona_clear",
      { level: "low", module: "utility", reason: "User clears their own custom instructions" },
    ],
    [
      "conversation_start",
      { level: "low", module: "utility", reason: "Starts a named conversation session" },
    ],
    [
      "conversation_end",
      { level: "low", module: "utility", reason: "Ends the active conversation session" },
    ],
    [
      "conversation_status",
      { level: "low", module: "utility", reason: "Read-only status of active conversation" },
    ],
    // MODULE 24: Knowledge Base Tools (GitHub ingestion)
    [
      "search_public_apis",
      { level: "low", module: "utility", reason: "Read-only search in public APIs database" },
    ],
    [
      "get_dev_snippet",
      { level: "low", module: "utility", reason: "Read-only search in code snippets database" },
    ],
    [
      "search_programming_books",
      { level: "low", module: "utility", reason: "Read-only search in free books database" },
    ],
    [
      "search_system_design",
      {
        level: "low",
        module: "utility",
        reason: "Read-only search in system design knowledge base",
      },
    ],

    // ════════════════════════════════════════════════════════════════════════
    // MODULE 25: Batch 2 Remaining Tools (agentToolsExtra.ts — 65 missing tools)
    // ════════════════════════════════════════════════════════════════════════
    // All read-only/local unless noted. Tools making network calls to user-supplied
    // URLs are cross-referenced with SSRF guard (ssrfGuard.ts).

    // ── Text & encoding (LOW — local) ──
    ["caesar_cipher", { level: "low", module: "extra", reason: "Local encoding, no persistence" }],
    ["text_to_morse", { level: "low", module: "extra", reason: "Local encoding, no persistence" }],
    ["rot13", { level: "low", module: "extra", reason: "Local encoding, no persistence" }],
    ["leet_speak", { level: "low", module: "extra", reason: "Local encoding, no persistence" }],
    ["palindrome_check", { level: "low", module: "extra", reason: "Local check, no persistence" }],
    ["text_diff", { level: "low", module: "extra", reason: "Local comparison, no persistence" }],
    ["json_formatter", { level: "low", module: "extra", reason: "Local parsing, no persistence" }],
    [
      "test_regex",
      { level: "low", module: "extra", reason: "Local regex testing, no persistence" },
    ],
    [
      "decode_jwt",
      {
        level: "low",
        module: "extra",
        reason: "Local JWT decode (no verification), no persistence",
      },
    ],

    // ── Converters (LOW — local) ──
    [
      "convert_color",
      { level: "low", module: "extra", reason: "Local color conversion, no persistence" },
    ],
    ["convert_currency", { level: "low", module: "extra", reason: "Read-only exchange rate API" }],
    [
      "convert_number_base",
      { level: "low", module: "extra", reason: "Local computation, no persistence" },
    ],
    [
      "convert_timestamp",
      { level: "low", module: "extra", reason: "Local computation, no persistence" },
    ],
    [
      "convert_timezone",
      { level: "low", module: "extra", reason: "Local computation, no persistence" },
    ],
    [
      "convert_units",
      { level: "low", module: "extra", reason: "Local computation, no persistence" },
    ],

    // ── Calculators & dates (LOW — local) ──
    ["day_of_week", { level: "low", module: "extra", reason: "Local computation, no persistence" }],
    ["week_number", { level: "low", module: "extra", reason: "Local computation, no persistence" }],
    ["dice_roll", { level: "low", module: "extra", reason: "Local generation, no persistence" }],
    ["coin_flip", { level: "low", module: "extra", reason: "Local generation, no persistence" }],
    [
      "solve_math",
      { level: "low", module: "extra", reason: "Local math evaluation, no persistence" },
    ],

    // ── Generators (LOW — local) ──
    [
      "generate_ascii_art",
      { level: "low", module: "extra", reason: "Local generation, no persistence" },
    ],
    [
      "generate_qr_code",
      { level: "low", module: "extra", reason: "Generates QR code image, no persistence" },
    ],
    [
      "generate_image_advanced",
      { level: "low", module: "extra", reason: "Generative image via free API, no persistence" },
    ],
    [
      "create_poll",
      { level: "low", module: "extra", reason: "Creates poll in chat — ephemeral, no DB write" },
    ],

    // ── Read-only API tools (LOW) ──
    [
      "analyze_pdf",
      {
        level: "low",
        module: "extra",
        reason: "Read-only PDF analysis via Gemini, no persistence — SSRF guarded",
      },
    ],
    [
      "analyze_sentiment",
      { level: "low", module: "extra", reason: "Local sentiment analysis, no persistence" },
    ],
    ["aurora_forecast", { level: "low", module: "extra", reason: "Read-only NOAA aurora API" }],
    ["boardgame_search", { level: "low", module: "extra", reason: "Read-only BoardGameGeek API" }],
    ["bored_activity", { level: "low", module: "extra", reason: "Read-only BoredAPI" }],
    ["chuck_norris_fact", { level: "low", module: "extra", reason: "Read-only Chuck Norris API" }],
    ["country_info", { level: "low", module: "extra", reason: "Read-only REST Countries API" }],
    [
      "define_word",
      { level: "low", module: "extra", reason: "Read-only Wiktionary lookup, no persistence" },
    ],
    ["dns_lookup", { level: "low", module: "extra", reason: "Read-only DNS resolution" }],
    ["esports_matches", { level: "low", module: "extra", reason: "Read-only PandaScore API" }],
    ["explain_cron", { level: "low", module: "extra", reason: "Local cron expression parser" }],
    ["get_emoji_info", { level: "low", module: "extra", reason: "Read-only emoji info API" }],
    ["get_github_gists", { level: "low", module: "extra", reason: "Read-only GitHub gists API" }],
    ["get_horoscope", { level: "low", module: "extra", reason: "Read-only horoscope API" }],
    ["get_lorem_ipsum", { level: "low", module: "extra", reason: "Local lorem ipsum generation" }],
    ["get_sports_scores", { level: "low", module: "extra", reason: "Read-only sports scores API" }],
    ["get_stock_price", { level: "low", module: "extra", reason: "Read-only stock price API" }],
    [
      "get_sun_moon_info",
      { level: "low", module: "extra", reason: "Read-only astronomical data API" },
    ],
    ["get_valorant_agents", { level: "low", module: "extra", reason: "Read-only Valorant API" }],
    [
      "http_status_info",
      { level: "low", module: "extra", reason: "Local HTTP status lookup, no persistence" },
    ],
    [
      "image_to_ascii",
      { level: "low", module: "extra", reason: "Local image-to-ASCII conversion, no persistence" },
    ],
    ["iss_tracker", { level: "low", module: "extra", reason: "Read-only Open-Notify ISS API" }],
    [
      "mime_type_lookup",
      { level: "low", module: "extra", reason: "Local MIME type lookup, no persistence" },
    ],
    ["moon_phase", { level: "low", module: "extra", reason: "Local astronomical computation" }],
    ["meme_generator", { level: "low", module: "extra", reason: "Read-only Imgflip API" }],
    ["npm_package_info", { level: "low", module: "extra", reason: "Read-only npm registry API" }],
    ["periodic_table", { level: "low", module: "extra", reason: "Read-only element API" }],
    ["pokemon_info", { level: "low", module: "extra", reason: "Read-only PokeAPI" }],
    ["programming_joke", { level: "low", module: "extra", reason: "Read-only JokeAPI" }],
    ["random_fact", { level: "low", module: "extra", reason: "Read-only Numbers API" }],
    ["reddit_hot", { level: "low", module: "extra", reason: "Read-only Reddit JSON API" }],
    ["search_anime", { level: "low", module: "extra", reason: "Read-only Jikan/MyAnimeList API" }],
    ["search_igdb_games", { level: "low", module: "extra", reason: "Read-only IGDB game search" }],
    ["search_movies", { level: "low", module: "extra", reason: "Read-only movie database API" }],
    ["search_music", { level: "low", module: "extra", reason: "Read-only music search API" }],
    ["search_recipe", { level: "low", module: "extra", reason: "Read-only recipe API" }],
    [
      "search_stackoverflow",
      { level: "low", module: "extra", reason: "Read-only StackOverflow API" },
    ],
    ["search_wikipedia", { level: "low", module: "extra", reason: "Read-only Wikipedia search" }],
    [
      "ssl_checker",
      { level: "low", module: "extra", reason: "Read-only TLS connection check — SSRF guarded" },
    ],
    ["steam_player_count", { level: "low", module: "extra", reason: "Read-only Steam Web API" }],
    ["this_day_in_history", { level: "low", module: "extra", reason: "Read-only Wikipedia API" }],
    ["uv_index", { level: "low", module: "extra", reason: "Read-only UV index API" }],
    [
      "would_you_rather",
      { level: "low", module: "extra", reason: "Local selection, no persistence" },
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
