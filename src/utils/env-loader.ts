/**
 * Secure Environment Loader with Zod validation
 * Provides type-safe environment variable loading with validation
 */

import { z } from "zod";

// Environment variable schema with validation
const envSchema = z.object({
  // Discord (required)
  DISCORD_TOKEN: z.string().min(1, "DISCORD_TOKEN is required"),
  DISCORD_CLIENT_ID: z.string().min(1, "DISCORD_CLIENT_ID is required"),
  DISCORD_GUILD_ID: z.string().min(1, "DISCORD_GUILD_ID is required"),
  OWNER_ID: z.string().min(1, "OWNER_ID is required"),

  // OpenRouter AI (required)
  OPENROUTER_API_KEY: z.string().min(1, "OPENROUTER_API_KEY is required"),
  OPENROUTER_MODEL: z.string().default("openai/gpt-4o"),
  AI_SYSTEM_PROMPT: z.string().default("Tu es un assistant utile et concis. Reponds en francais."),

  // Twitch (optional)
  TWITTER_ACCOUNTS: z.string().optional(),
  TWITTER_CHANNEL_ID: z.string().optional(),
  LOG_CHANNEL_ID: z.string().optional(),
  TWITCH_CLIENT_ID: z.string().optional(),
  TWITCH_CLIENT_SECRET: z.string().optional(),

  // Monitoring & Cache
  SENTRY_DSN: z.string().url().optional().or(z.literal("")),
  CONTROL_TOKEN: z.string().optional(),
  CONTROL_PORT: z.string().default("3002"),
  REDIS_URL: z.string().default("redis://localhost:6379"),

  // PlayStation Network (optional)
  PSN_NPSSO_TOKEN: z.string().optional(),

  // IsThereAnyDeal (optional)
  ITAD_API_KEY: z.string().optional(),

  // Steam (optional)
  STEAM_API_KEY: z.string().optional(),

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

  // Database
  DATABASE_URL: z
    .string()
    .url("DATABASE_URL must be a valid URL")
    .default("postgresql://discord_bot:discord_bot@localhost:5432/discord_bot?schema=public"),

  // Retrospective
  MAX_RETRO_POSTS: z.string().default("25"),

  // Intervals & TTLs (ms) with defaults
  MONITORING_INTERVAL_MS: z.string().default("900000"),
  TWITCH_CHECK_INTERVAL_MS: z.string().default("120000"),
  PATCH_NOTES_INTERVAL_MS: z.string().default("3600000"),
  IG_NEWS_INTERVAL_MS: z.string().default("3600000"),
  IG_GIVEAWAY_INTERVAL_MS: z.string().default("43200000"),
  FORTNITE_CACHE_TTL_MS: z.string().default("900000"),
  RSS_CACHE_TTL_MS: z.string().default("300000"),
  AI_TIMEOUT_MS: z.string().default("25000"),
  AI_SUMMARIZE_TIMEOUT_MS: z.string().default("30000"),
  AI_MODERATION_TIMEOUT_MS: z.string().default("10000"),
  STEAM_TIMEOUT_MS: z.string().default("5000"),
  STEAM_NEWS_INTERVAL_MS: z.string().default("600000"),
  YOUTUBE_TIMEOUT_MS: z.string().default("5000"),

  // Channels (optional)
  STEAM_EPIC_CHANNEL_ID: z.string().optional(),
  STEAM_CHANNEL_ID: z.string().optional(),
  FREE_GAMES_CHANNEL_ID: z.string().optional(),
  FREE_GAMES_MENTION_ROLE: z.string().optional(),
  PLAYSTATION_CHANNEL_ID: z.string().optional(),
  FORTNITE_CHANNEL_ID: z.string().optional(),
  XBOX_CHANNEL_ID: z.string().optional(),
  NINTENDO_CHANNEL_ID: z.string().optional(),
  ROBLOX_CHANNEL_ID: z.string().optional(),
  INSTANT_GAMING_CHANNEL_ID: z.string().optional(),
  GAMING_BLOG_CHANNEL_ID: z.string().optional(),
  DEDICATED_CHANNEL_ID: z.string().optional(),

  // Rate Limiting
  RATE_LIMIT_WINDOW_SECONDS: z.string().default("5"),
  RATE_LIMIT_MAX_REQUESTS: z.string().default("3"),
  RATE_LIMIT_BYPASS_ADMINS: z.string().default("true"),

  // Roles
  ADMIN_ROLES: z.string().default(""),
  MOD_ROLES: z.string().default(""),

  // Environment
  NODE_ENV: z.string().default("production"),
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

    console.error("❌ Environment variable validation failed:");
    errors.forEach((err) => console.error(`  - ${err}`));
    console.error("\nPlease check your .env file and ensure all required variables are set.");
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
