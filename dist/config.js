"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.config = void 0;
exports.validateConfig = validateConfig;
const dotenv_1 = __importDefault(require("dotenv"));
dotenv_1.default.config();
exports.config = {
    // Discord
    token: process.env.DISCORD_TOKEN || "",
    clientId: process.env.DISCORD_CLIENT_ID || "",
    guildId: process.env.DISCORD_GUILD_ID || "",
    ownerId: process.env.OWNER_ID || "",
    // OpenRouter AI
    openRouterApiKey: process.env.OPENROUTER_API_KEY || "",
    openRouterModel: process.env.OPENROUTER_MODEL || "openai/gpt-4o",
    aiSystemPrompt: process.env.AI_SYSTEM_PROMPT ||
        "Tu es un assistant utile et concis. Reponds en francais.",
    // Twitch
    twitterAccounts: process.env.TWITTER_ACCOUNTS || "",
    twitterChannel: process.env.TWITTER_CHANNEL_ID || process.env.LOG_CHANNEL_ID || "",
    twitchClientId: process.env.TWITCH_CLIENT_ID || "",
    twitchClientSecret: process.env.TWITCH_CLIENT_SECRET || "",
    // Monitoring & Cache
    sentryDsn: process.env.SENTRY_DSN || "",
    redisUrl: process.env.REDIS_URL || "redis://localhost:6379",
    // PlayStation Network
    psnNpssoToken: process.env.PSN_NPSSO_TOKEN || "",
    // IsThereAnyDeal (comparateur de prix)
    itadApiKey: process.env.ITAD_API_KEY || "",
    // Steam
    steamApiKey: process.env.STEAM_API_KEY || "",
    // ===== API Base URLs =====
    openRouterBaseUrl: process.env.OPENROUTER_BASE_URL || "https://openrouter.ai/api/v1",
    twitchApiBaseUrl: process.env.TWITCH_API_BASE_URL || "https://api.twitch.tv/helix",
    twitchOAuthUrl: process.env.TWITCH_OAUTH_URL || "https://id.twitch.tv/oauth2/token",
    steamApiBaseUrl: process.env.STEAM_API_BASE_URL || "https://api.steampowered.com",
    steamStoreUrl: process.env.STEAM_STORE_URL || "https://store.steampowered.com",
    itadApiBaseUrl: process.env.ITAD_API_BASE_URL || "https://api.isthereanydeal.com/v01",
    epicGamesApiUrl: process.env.EPICGAMES_API_URL || "https://store-site-backend-static-ipv4.ak.epicgames.com",
    fortniteApiBaseUrl: process.env.FORTNITE_API_BASE_URL || "https://fortnite-api.com/v2",
    youtubeBaseUrl: process.env.YOUTUBE_BASE_URL || "https://www.youtube.com",
    xcancelBaseUrl: process.env.XCANCEL_BASE_URL || "https://xcancel.com",
    bskyBaseUrl: process.env.BSKY_BASE_URL || "https://bsky.app",
    instantGamingBaseUrl: process.env.INSTANT_GAMING_BASE_URL || "https://www.instant-gaming.com",
    // RSS Feeds Configuration
    rss2jsonBaseUrl: process.env.RSS2JSON_BASE_URL || "https://api.rss2json.com/v1/api.json",
    redditDealsRss: process.env.REDDIT_DEALS_RSS || "https://www.reddit.com/r/GameDeals.rss",
    redditFreeGamesRss: process.env.REDDIT_FREE_GAMES_RSS || "https://www.reddit.com/r/FreeGameFindings.rss",
    redditPatchNotesRss: process.env.REDDIT_PATCH_NOTES_RSS || "https://www.reddit.com/r/patchnotes.rss",
    epicGamesRss: process.env.EPIC_GAMES_RSS || "https://store-site-backend-static-ipv4.ak.epicgames.com/freeGamesPromotions",
    steamRss: process.env.STEAM_RSS || "https://store.steampowered.com/feeds/news",
    playstationRss: process.env.PLAYSTATION_RSS || "https://blog.playstation.com/feed/",
    xboxRss: process.env.XBOX_RSS || "https://news.xbox.com/feed",
    nintendoRss: process.env.NINTENDO_RSS || "https://www.nintendo.com/feed",
    // Alertes et scoring de risque
    alertThreshold: parseInt(process.env.ALERT_THRESHOLD || "30", 10) || 30,
    ownerNotifyEnabled: process.env.OWNER_NOTIFY_ENABLED === "true",
    // Database
    databaseUrl: process.env.DATABASE_URL || "file:./database.sqlite",
    // Retrospective
    maxRetroPosts: parseInt(process.env.MAX_RETRO_POSTS || "25", 10) || 25,
    // ===== Intervals & TTLs (ms) =====
    monitoringIntervalMs: parseInt(process.env.MONITORING_INTERVAL_MS || "900000", 10) || 900000,
    twitchCheckIntervalMs: parseInt(process.env.TWITCH_CHECK_INTERVAL_MS || "120000", 10) || 120000,
    patchNotesIntervalMs: parseInt(process.env.PATCH_NOTES_INTERVAL_MS || "3600000", 10) || 3600000,
    igNewsIntervalMs: parseInt(process.env.IG_NEWS_INTERVAL_MS || "3600000", 10) || 3600000,
    igGiveawayIntervalMs: parseInt(process.env.IG_GIVEAWAY_INTERVAL_MS || "43200000", 10) || 43200000,
    fortniteCacheTtlMs: parseInt(process.env.FORTNITE_CACHE_TTL_MS || "900000", 10) || 900000,
    rssCacheTtlMs: parseInt(process.env.RSS_CACHE_TTL_MS || "300000", 10) || 300000,
    aiTimeoutMs: parseInt(process.env.AI_TIMEOUT_MS || "25000", 10) || 25000,
    aiSummarizeTimeoutMs: parseInt(process.env.AI_SUMMARIZE_TIMEOUT_MS || "30000", 10) || 30000,
    aiModerationTimeoutMs: parseInt(process.env.AI_MODERATION_TIMEOUT_MS || "10000", 10) || 10000,
    steamTimeoutMs: parseInt(process.env.STEAM_TIMEOUT_MS || "5000", 10) || 5000,
    steamNewsIntervalMs: parseInt(process.env.STEAM_NEWS_INTERVAL_MS || "600000", 10) || 600000,
    youtubeTimeoutMs: parseInt(process.env.YOUTUBE_TIMEOUT_MS || "5000", 10) || 5000,
    // Channels (extraits des captures d'ecran)
    steamEpicChannel: process.env.STEAM_EPIC_CHANNEL_ID || "",
    steamChannel: process.env.STEAM_CHANNEL_ID || process.env.STEAM_EPIC_CHANNEL_ID,
    freeGamesChannel: process.env.FREE_GAMES_CHANNEL_ID || null,
    freeGamesMention: process.env.FREE_GAMES_MENTION_ROLE || null,
    playstationChannel: process.env.PLAYSTATION_CHANNEL_ID || "",
    fortniteChannel: process.env.FORTNITE_CHANNEL_ID || "",
    xboxChannel: process.env.XBOX_CHANNEL_ID || "",
    nintendoChannel: process.env.NINTENDO_CHANNEL_ID || "",
    robloxChannel: process.env.ROBLOX_CHANNEL_ID || "",
    instantGamingChannel: process.env.INSTANT_GAMING_CHANNEL_ID || "",
    gamingBlogChannel: process.env.GAMING_BLOG_CHANNEL_ID || "",
    logChannel: process.env.LOG_CHANNEL_ID || null,
    dedicatedChannel: process.env.DEDICATED_CHANNEL_ID || "",
    // ─── Rate Limiting ────────────────────────────────────────────────────────
    rateLimit: {
        windowSeconds: parseInt(process.env.RATE_LIMIT_WINDOW_SECONDS ?? "5", 10),
        maxRequests: parseInt(process.env.RATE_LIMIT_MAX_REQUESTS ?? "3", 10),
        bypassAdmins: (process.env.RATE_LIMIT_BYPASS_ADMINS ?? "true").toLowerCase() === "true",
    },
    // Roles
    adminRoles: (process.env.ADMIN_ROLES || "").split(",").filter(Boolean),
    modRoles: (process.env.MOD_ROLES || "").split(",").filter(Boolean),
};
function validateConfig() {
    const errors = [];
    const warnings = [];
    // Discord (fatal)
    if (!exports.config.token)
        errors.push("DISCORD_TOKEN manquant dans .env");
    if (!exports.config.clientId)
        errors.push("DISCORD_CLIENT_ID manquant dans .env");
    // AI (fatal)
    if (!exports.config.openRouterApiKey)
        errors.push("OPENROUTER_API_KEY manquant dans .env");
    // Channels (warning - le bot fonctionne sans)
    if (!exports.config.logChannel)
        warnings.push("LOG_CHANNEL_ID manquant dans .env (les logs ne seront pas envoyes)");
    if (!exports.config.freeGamesChannel)
        warnings.push("FREE_GAMES_CHANNEL_ID manquant dans .env (les alertes de jeux gratuits seront desactivees)");
    // Owner (warning)
    if (!exports.config.ownerId)
        warnings.push("OWNER_ID manquant dans .env (notifications owner desactivees)");
    // Gaming APIs (warnings)
    if (!exports.config.steamApiKey)
        warnings.push("STEAM_API_KEY manquant dans .env (commandes /steam desactivees)");
    if (!exports.config.twitterChannel)
        warnings.push("TWITTER_CHANNEL_ID manquant dans .env (surveillance Twitter desactivee)");
    if (!exports.config.twitterAccounts)
        warnings.push("TWITTER_ACCOUNTS manquant dans .env (surveillance Twitter desactivee)");
    if (!exports.config.twitchClientId)
        warnings.push("TWITCH_CLIENT_ID manquant dans .env (monitoring Twitch desactive)");
    if (!exports.config.twitchClientSecret)
        warnings.push("TWITCH_CLIENT_SECRET manquant dans .env (monitoring Twitch desactive)");
    // Monitoring (warning)
    if (!exports.config.sentryDsn)
        warnings.push("SENTRY_DSN manquant dans .env (monitoring Sentry desactive)");
    return { errors, warnings };
}
//# sourceMappingURL=config.js.map