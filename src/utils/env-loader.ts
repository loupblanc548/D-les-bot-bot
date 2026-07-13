/**
 * Secure Environment Loader with Zod validation
 * Provides type-safe environment variable loading with validation
 */

import { z } from "zod";

import logger from "./logger.js";

// Environment variable schema with validation
const envSchema = z.object({
  // Discord (required)
  DISCORD_TOKEN: z.string().min(1, "DISCORD_TOKEN is required"),
  DISCORD_CLIENT_ID: z.string().min(1, "DISCORD_CLIENT_ID is required"),
  DISCORD_GUILD_ID: z.string().min(1, "DISCORD_GUILD_ID is required"),
  OWNER_ID: z.string().min(1, "OWNER_ID is required"),

  // OpenRouter AI (required)
  OPENROUTER_API_KEY: z.string().min(1, "OPENROUTER_API_KEY is required"),
  OPENROUTER_MODEL: z.string().default("nvidia/nemotron-3-ultra-550b-a55b:free"),
  AI_SYSTEM_PROMPT: z.string().default("Tu es un assistant utile et concis. Reponds en francais."),

  // Twitch (optional)
  TWITTER_ACCOUNTS: z.string().optional(),
  TWITTER_CHANNEL_ID: z.string().optional(),
  LOG_CHANNEL_ID: z.string().optional(),
  TWITCH_CLIENT_ID: z.string().optional(),
  TWITCH_CLIENT_SECRET: z.string().optional(),

  // Twitter multi-platform accounts
  TWITTER_ACCOUNTS_STEAM_ACCOUNTS: z.string().optional(),
  TWITTER_CHANNEL_STEAM_EPIC_ID: z.string().optional(),
  TWITTER_ACCOUNTS_PLAYSTATION_ACCOUNTS: z.string().optional(),
  TWITTER_CHANNEL_PLAYSTATION_ID: z.string().optional(),
  TWITTER_ACCOUNTS_NINTENDO_ACCOUNTS: z.string().optional(),
  TWITTER_CHANNEL_NINTENDO_ID: z.string().optional(),
  TWITTER_ACCOUNTS_XBOX_ACCOUNTS: z.string().optional(),
  TWITTER_CHANNEL_XBOX_ID: z.string().optional(),
  TWITTER_ACCOUNTS_FORTNITE_ACCOUNTS: z.string().optional(),
  TWITTER_CHANNEL_FORTNITE_ID: z.string().optional(),
  TWITTER_ACCOUNTS_INSTANT_GAMING_ACCOUNTS: z.string().optional(),
  TWITTER_CHANNEL_INSTANT_GAMING_ID: z.string().optional(),

  // YouTube multi-platform channels
  YOUTUBE_FORTNITE_CHANNELS: z.string().optional(),
  YOUTUBE_CHANNEL_FORTNITE_ID: z.string().optional(),
  YOUTUBE_PLAYSTATION_CHANNELS: z.string().optional(),
  YOUTUBE_CHANNEL_PLAYSTATION_ID: z.string().optional(),
  YOUTUBE_XBOX_CHANNELS: z.string().optional(),
  YOUTUBE_CHANNEL_XBOX_ID: z.string().optional(),
  YOUTUBE_NINTENDO_CHANNELS: z.string().optional(),
  YOUTUBE_CHANNEL_NINTENDO_ID: z.string().optional(),
  YOUTUBE_STEAM_EPIC_CHANNELS: z.string().optional(),
  YOUTUBE_CHANNEL_STEAM_EPIC_ID: z.string().optional(),
  YOUTUBE_INSTANT_GAMING_CHANNELS: z.string().optional(),
  YOUTUBE_CHANNEL_INSTANT_GAMING_ID: z.string().optional(),

  // Patch Notes RSS per-platform
  PATCH_FORTNITE_RSS: z.string().optional(),
  PATCH_CHANNEL_FORTNITE_ID: z.string().optional(),
  PATCH_PLAYSTATION_RSS: z.string().optional(),
  PATCH_CHANNEL_PLAYSTATION_ID: z.string().optional(),
  PATCH_XBOX_RSS: z.string().optional(),
  PATCH_CHANNEL_XBOX_ID: z.string().optional(),
  PATCH_NINTENDO_RSS: z.string().optional(),
  PATCH_CHANNEL_NINTENDO_ID: z.string().optional(),
  PATCH_STEAM_EPIC_RSS: z.string().optional(),
  PATCH_CHANNEL_STEAM_EPIC_ID: z.string().optional(),
  PATCH_INSTANT_GAMING_RSS: z.string().optional(),
  PATCH_CHANNEL_INSTANT_GAMING_ID: z.string().optional(),
  PATCH_STEAM_RSS: z.string().optional(),
  PATCH_CHANNEL_STEAM_ID: z.string().optional(),

  // Monitoring & Cache
  SENTRY_DSN: z.string().url().optional().or(z.literal("")),
  CONTROL_TOKEN: z.string().optional(),
  CONTROL_PORT: z.string().default("3002"),
  REDIS_URL: z.string().optional(),

  // PlayStation Network (optional)
  PSN_NPSSO_TOKEN: z.string().optional(),

  // IsThereAnyDeal (optional)
  ITAD_API_KEY: z.string().optional(),

  // Steam (optional)
  STEAM_API_KEY: z.string().optional(),

  // ─── Nouvelles APIs externes (optionnelles) ──────────────────────────────
  PERSPECTIVE_API_KEY: z.string().optional(),
  GIPHY_API_KEY: z.string().optional(),
  YOUTUBE_API_KEY: z.string().optional(),
  SPOTIFY_CLIENT_ID: z.string().optional(),
  SPOTIFY_CLIENT_SECRET: z.string().optional(),
  RAWG_API_KEY: z.string().optional(),
  NEWS_API_KEY: z.string().optional(),
  SCREENSHOT_API_KEY: z.string().optional(),
  HF_API_KEY: z.string().optional(),
  LASTFM_API_KEY: z.string().optional(),
  IMGUR_CLIENT_ID: z.string().optional(),
  REDDIT_CLIENT_ID: z.string().optional(),
  REDDIT_CLIENT_SECRET: z.string().optional(),
  REDDIT_USER_AGENT: z.string().optional(),

  // ─── Gaming/Media extras ──────────────────────────────────────────────────
  IGDB_CLIENT_ID: z.string().optional(),
  IGDB_CLIENT_SECRET: z.string().optional(),
  STEAMGRIDDB_API_KEY: z.string().optional(),
  UPTIMEROBOT_API_KEY: z.string().optional(),

  // ─── Multi-provider AI (free tiers) ──────────────────────────────────────
  GROQ_API_KEY: z.string().optional(),
  GROQ_MODEL: z.string().default("llama-3.3-70b-versatile"),
  GEMINI_API_KEY: z.string().optional(),
  GEMINI_MODEL: z.string().default("gemini-1.5-flash"),
  BRAVE_SEARCH_API_KEY: z.string().optional(),
  BRAVE_AUTOSUGGEST_API_KEY: z.string().optional(),
  BRAVE_SPELLCHECK_API_KEY: z.string().optional(),
  BRAVE_ANSWERS_API_KEY: z.string().optional(),
  ASSEMBLYAI_API_KEY: z.string().optional(),
  COHERE_API_KEY: z.string().optional(),

  // Google Cloud
  GOOGLE_CLOUD_PROJECT_ID: z.string().optional(),
  GOOGLE_CLOUD_API_KEY: z.string().optional(),

  // API Base URLs (with defaults)
  OPENROUTER_BASE_URL: z.string().default("https://openrouter.ai/api/v1"),
  TWITTER_API_BASE_URL: z.string().default("https://api.twitch.tv/helix"),
  TWITTER_OAUTH_URL: z.string().default("https://id.twitch.tv/oauth2/token"),
  STEAM_API_BASE_URL: z.string().default("https://api.steampowered.com"),
  STEAM_STORE_URL: z.string().default("https://store.steampowered.com"),
  ITAD_API_BASE_URL: z.string().default("https://api.isthereanydeal.com/v01"),
  EPICGAMES_API_URL: z.string().default("https://store-site-backend-static-ipv4.ak.epicgames.com"),
  FORTNITE_API_BASE_URL: z.string().default("https://fortnite-api.com/v2"),
  YOUTUBE_BASE_URL: z.string().default("https://www.youtube.com"),
  XCANCEL_BASE_URL: z.string().default("https://xcancel.com"),
  BSKY_BASE_URL: z.string().default("https://bsky.app"),
  INSTANT_GAMING_BASE_URL: z.string().default("https://www.instant-gaming.com"),

  // RSS Feeds Configuration (with defaults)
  RSS2JSON_BASE_URL: z.string().default("https://api.rss2json.com/v1/api.json"),
  REDDIT_DEALS_RSS: z.string().default("https://www.reddit.com/r/GameDeals.rss"),
  REDDIT_FREE_GAMES_RSS: z.string().default("https://www.reddit.com/r/FreeGameFindings.rss"),
  REDDIT_PATCH_NOTES_RSS: z.string().default("https://www.reddit.com/r/patchnotes.rss"),
  EPIC_GAMES_RSS: z
    .string()
    .default("https://store-site-backend-static-ipv4.ak.epicgames.com/freeGamesPromotions"),
  STEAM_RSS: z.string().default("https://store.steampowered.com/feeds/news"),
  PLAYSTATION_RSS: z.string().default("https://blog.playstation.com/feed/"),
  XBOX_RSS: z.string().default("https://news.xbox.com/feed"),
  NINTENDO_RSS: z.string().default("https://www.nintendo.com/feed"),

  // Alertes et scoring de risque
  ALERT_THRESHOLD: z.string().default("30"),
  OWNER_NOTIFY_ENABLED: z.string().default("false"),

  // Agent IA autonome (investigation OSINT + décision de modération)
  // off = désactivé, advisory = décision IA mais alerte humaine requise, autonomous = exécution automatique si confiance suffisante
  AUTONOMOUS_AGENT_MODE: z.string().default("autonomous"),
  AUTONOMOUS_AGENT_CONFIDENCE_THRESHOLD: z.string().default("70"),

  // Database
  DATABASE_URL: z
    .string()
    .url("DATABASE_URL must be a valid URL")
    .default("postgresql://discord_bot:discord_bot@localhost:5432/discord_bot?schema=public"),

  // Retrospective
  MAX_RETRO_POSTS: z.string().default("50"),

  // Intervals & TTLs (ms) — tuned for local hardware (i9/32GB/4060Ti)
  // For Raspberry Pi: set these higher in .env to reduce load
  MONITORING_INTERVAL_MS: z.string().default("300000"), // 5 min (was 15)
  TWITCH_CHECK_INTERVAL_MS: z.string().default("60000"), // 1 min (was 2)
  PATCH_NOTES_INTERVAL_MS: z.string().default("600000"), // 10 min (was 1h)
  IG_NEWS_INTERVAL_MS: z.string().default("1800000"), // 30 min (was 1h)
  IG_GIVEAWAY_INTERVAL_MS: z.string().default("7200000"), // 2h (was 12h)
  FORTNITE_CACHE_TTL_MS: z.string().default("300000"), // 5 min (was 15)
  RSS_CACHE_TTL_MS: z.string().default("120000"), // 2 min (was 5)
  AI_TIMEOUT_MS: z.string().default("25000"),
  AI_SUMMARIZE_TIMEOUT_MS: z.string().default("30000"),
  AI_MODERATION_TIMEOUT_MS: z.string().default("10000"),
  STEAM_TIMEOUT_MS: z.string().default("5000"),
  STEAM_NEWS_INTERVAL_MS: z.string().default("300000"), // 5 min (was 10)
  YOUTUBE_TIMEOUT_MS: z.string().default("5000"),

  // Channels (optional)
  STEAM_EPIC_CHANNEL_ID: z.string().optional(),
  STEAM_CHANNEL_ID: z.string().optional(),
  FREE_GAMES_CHANNEL_ID: z.string().optional(),
  FREE_GAMES_MENTION_ROLE: z.string().optional(),
  PLAYSTATION_CHANNEL_ID: z.string().optional(),
  FORTNITE_CHANNEL_ID: z.string().optional(),
  BOUTIQUE_CHANNEL_ID: z.string().optional(),
  XBOX_CHANNEL_ID: z.string().optional(),
  NINTENDO_CHANNEL_ID: z.string().optional(),
  ROBLOX_CHANNEL_ID: z.string().optional(),
  INSTANT_GAMING_CHANNEL_ID: z.string().optional(),
  GAMING_BLOG_CHANNEL_ID: z.string().optional(),
  DEDICATED_CHANNEL_ID: z.string().optional(),
  DEALS_CHANNEL_ID: z.string().optional(),
  PRICE_TRACK_CHANNEL_ID: z.string().optional(),
  TRENDS_CHANNEL_ID: z.string().optional(),
  VIRAL_CHANNEL_ID: z.string().optional(),

  // Crash webhook & Bull Board
  CRASH_WEBHOOK_URL: z.string().optional(),
  BULL_BOARD_PORT: z.string().optional(),

  // Rate Limiting
  RATE_LIMIT_WINDOW_SECONDS: z.string().default("5"),
  RATE_LIMIT_MAX_REQUESTS: z.string().default("3"),
  RATE_LIMIT_BYPASS_ADMINS: z.string().default("true"),

  // Roles
  ADMIN_ROLES: z.string().default(""),
  MOD_ROLES: z.string().default(""),

  // Environment
  NODE_ENV: z.string().default("production"),

  // Fortnite Party Bot (fnbr.js)
  FORTNITE_AUTH_CODE: z.string().optional(),
});

export type Env = z.infer<typeof envSchema>;

/**
 * Load and validate environment variables
 * @throws {Error} If required environment variables are missing or invalid
 */
export function loadEnv(): Env {
  const result = envSchema.safeParse(process.env);

  if (!result.success) {
    const errors = result.error.issues.map((err: z.ZodIssue) => {
      const path = err.path.join(".");
      return `${path}: ${err.message}`;
    });

    logger.error("❌ Environment variable validation failed:");
    errors.forEach((err) => logger.error(`  - ${err}`));
    logger.error("\nPlease check your .env file and ensure all required variables are set.");
    throw new Error("Environment variable validation failed");
  }

  return result.data;
}

/**
 * Get a typed environment variable
 * @param key - The environment variable key
 * @returns The typed value or undefined if not set
 */
export function getEnv<K extends keyof Env>(key: K): Env[K] {
  const env = loadEnv();
  return env[key];
}

/**
 * Check if running in production environment
 */
export function isProduction(): boolean {
  return process.env.NODE_ENV === "production";
}

/**
 * Check if running in development environment
 */
export function isDevelopment(): boolean {
  return process.env.NODE_ENV === "development";
}
