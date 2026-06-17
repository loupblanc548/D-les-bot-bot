import dotenv from "dotenv";
import { loadEnv } from "./utils/env-loader.js";

dotenv.config();

// Load and validate environment variables
const env = loadEnv();

export const config = {
  // Discord
  token: env.DISCORD_TOKEN,
  clientId: env.DISCORD_CLIENT_ID,
  guildId: env.DISCORD_GUILD_ID,
  ownerId: env.OWNER_ID,

  // OpenRouter AI
  openRouterApiKey: env.OPENROUTER_API_KEY,
  openRouterModel: env.OPENROUTER_MODEL,
  aiSystemPrompt: env.AI_SYSTEM_PROMPT,

  // Twitch
  twitterAccounts: env.TWITTER_ACCOUNTS || "",
  twitterChannel: env.TWITTER_CHANNEL_ID || env.LOG_CHANNEL_ID || "",
  twitchClientId: env.TWITCH_CLIENT_ID || "",
  twitchClientSecret: env.TWITCH_CLIENT_SECRET || "",

  // Monitoring & Cache
  sentryDsn: env.SENTRY_DSN || "",
  controlToken: env.CONTROL_TOKEN || "",
  controlPort: parseInt(env.CONTROL_PORT, 10),
  redisUrl: env.REDIS_URL,

  // PlayStation Network
  psnNpssoToken: env.PSN_NPSSO_TOKEN || "",

  // IsThereAnyDeal (comparateur de prix)
  itadApiKey: env.ITAD_API_KEY || "",

  // Steam
  steamApiKey: env.STEAM_API_KEY || "",

  // ===== API Base URLs =====
  openRouterBaseUrl: env.OPENROUTER_BASE_URL,
  twitchApiBaseUrl: env.TWITTER_API_BASE_URL,
  twitchOAuthUrl: env.TWITTER_OAUTH_URL,
  steamApiBaseUrl: env.STEAM_API_BASE_URL,
  steamStoreUrl: env.STEAM_STORE_URL,
  itadApiBaseUrl: env.ITAD_API_BASE_URL,
  epicGamesApiUrl: env.EPICGAMES_API_URL,
  fortniteApiBaseUrl: env.FORTNITE_API_BASE_URL,
  youtubeBaseUrl: env.YOUTUBE_BASE_URL,
  xcancelBaseUrl: env.XCANCEL_BASE_URL,
  bskyBaseUrl: env.BSKY_BASE_URL,
  instantGamingBaseUrl: env.INSTANT_GAMING_BASE_URL,

  // RSS Feeds Configuration
  rss2jsonBaseUrl: env.RSS2JSON_BASE_URL,
  redditDealsRss: env.REDDIT_DEALS_RSS,
  redditFreeGamesRss: env.REDDIT_FREE_GAMES_RSS,
  redditPatchNotesRss: env.REDDIT_PATCH_NOTES_RSS,
  epicGamesRss: env.EPIC_GAMES_RSS,
  steamRss: env.STEAM_RSS,
  playstationRss: env.PLAYSTATION_RSS,
  xboxRss: env.XBOX_RSS,
  nintendoRss: env.NINTENDO_RSS,

  // Alertes et scoring de risque
  alertThreshold: parseInt(env.ALERT_THRESHOLD, 10),
  ownerNotifyEnabled: env.OWNER_NOTIFY_ENABLED === "true",

  // Database
  databaseUrl: env.DATABASE_URL,

  // Retrospective
  maxRetroPosts: parseInt(env.MAX_RETRO_POSTS, 10),
  // ===== Intervals & TTLs (ms) =====
  monitoringIntervalMs: parseInt(env.MONITORING_INTERVAL_MS, 10),
  twitchCheckIntervalMs: parseInt(env.TWITCH_CHECK_INTERVAL_MS, 10),
  patchNotesIntervalMs: parseInt(env.PATCH_NOTES_INTERVAL_MS, 10),
  igNewsIntervalMs: parseInt(env.IG_NEWS_INTERVAL_MS, 10),
  igGiveawayIntervalMs: parseInt(env.IG_GIVEAWAY_INTERVAL_MS, 10),
  fortniteCacheTtlMs: parseInt(env.FORTNITE_CACHE_TTL_MS, 10),
  rssCacheTtlMs: parseInt(env.RSS_CACHE_TTL_MS, 10),
  aiTimeoutMs: parseInt(env.AI_TIMEOUT_MS, 10),
  aiSummarizeTimeoutMs: parseInt(env.AI_SUMMARIZE_TIMEOUT_MS, 10),
  aiModerationTimeoutMs: parseInt(env.AI_MODERATION_TIMEOUT_MS, 10),
  steamTimeoutMs: parseInt(env.STEAM_TIMEOUT_MS, 10),
  steamNewsIntervalMs: parseInt(env.STEAM_NEWS_INTERVAL_MS, 10),
  youtubeTimeoutMs: parseInt(env.YOUTUBE_TIMEOUT_MS, 10),

  // Channels (extraits des captures d'ecran)
  steamEpicChannel: env.STEAM_EPIC_CHANNEL_ID || "",
  steamChannel: env.STEAM_CHANNEL_ID || env.STEAM_EPIC_CHANNEL_ID,
  freeGamesChannel: env.FREE_GAMES_CHANNEL_ID || null,
  freeGamesMention: env.FREE_GAMES_MENTION_ROLE || null,
  playstationChannel: env.PLAYSTATION_CHANNEL_ID || "",
  fortniteChannel: env.FORTNITE_CHANNEL_ID || "",
  xboxChannel: env.XBOX_CHANNEL_ID || "",
  nintendoChannel: env.NINTENDO_CHANNEL_ID || "",
  robloxChannel: env.ROBLOX_CHANNEL_ID || "",
  instantGamingChannel: env.INSTANT_GAMING_CHANNEL_ID || "",
  gamingBlogChannel: env.GAMING_BLOG_CHANNEL_ID || "",
  logChannel: env.LOG_CHANNEL_ID || null,
  dedicatedChannel: env.DEDICATED_CHANNEL_ID || "",

  // ─── Rate Limiting ────────────────────────────────────────────────────────
  rateLimit: {
    windowSeconds: parseInt(env.RATE_LIMIT_WINDOW_SECONDS, 10),
    maxRequests: parseInt(env.RATE_LIMIT_MAX_REQUESTS, 10),
    bypassAdmins: env.RATE_LIMIT_BYPASS_ADMINS === "true",
  },

  // Roles
  adminRoles: env.ADMIN_ROLES.split(",").filter(Boolean),
  modRoles: env.MOD_ROLES.split(",").filter(Boolean),
};

export function validateConfig(): { errors: string[]; warnings: string[] } {
  const errors: string[] = [];
  const warnings: string[] = [];
  // Discord (fatal)
  if (!config.token) errors.push("DISCORD_TOKEN manquant dans .env");
  if (!config.clientId) errors.push("DISCORD_CLIENT_ID manquant dans .env");
  // AI (fatal)
  if (!config.openRouterApiKey) errors.push("OPENROUTER_API_KEY manquant dans .env");
  // Channels (warning - le bot fonctionne sans)
  if (!config.logChannel)
    warnings.push("LOG_CHANNEL_ID manquant dans .env (les logs ne seront pas envoyes)");
  if (!config.freeGamesChannel)
    warnings.push(
      "FREE_GAMES_CHANNEL_ID manquant dans .env (les alertes de jeux gratuits seront desactivees)",
    );
  // Owner (warning)
  if (!config.ownerId)
    warnings.push("OWNER_ID manquant dans .env (notifications owner desactivees)");
  // Gaming APIs (warnings)
  if (!config.steamApiKey)
    warnings.push("STEAM_API_KEY manquant dans .env (commandes /steam desactivees)");
  if (!config.twitterChannel)
    warnings.push("TWITTER_CHANNEL_ID manquant dans .env (surveillance Twitter desactivee)");
  if (!config.twitterAccounts)
    warnings.push("TWITTER_ACCOUNTS manquant dans .env (surveillance Twitter desactivee)");
  if (!config.twitchClientId)
    warnings.push("TWITCH_CLIENT_ID manquant dans .env (monitoring Twitch desactive)");
  if (!config.twitchClientSecret)
    warnings.push("TWITCH_CLIENT_SECRET manquant dans .env (monitoring Twitch desactive)");
  // Monitoring (warning)
  if (!config.sentryDsn)
    warnings.push("SENTRY_DSN manquant dans .env (monitoring Sentry desactive)");
  return { errors, warnings };
}
