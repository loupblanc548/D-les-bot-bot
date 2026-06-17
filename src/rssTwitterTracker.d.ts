// src/rssTwitterTracker.d.ts
import type { Client } from 'discord.js';
import type Parser from 'rss-parser';
import type { Pool as PgPool } from 'pg';
import type { RawgClient } from './rawgClient.js';

export interface FeedStats {
  items: number;
  posts: number;
  duplicates: number;
  errors: number;
  byRule: Record<string, number>;
}

export interface TickResult {
  startedAt: Date;
  durationMs: number;
  feeds: number;
  feedsFailed: string[];
  total: { items: number; posts: number; duplicates: number; errors: number };
  perFeed: Record<string, FeedStats>;
}

export interface RuleConfig {
  name: string;
  keywords: string[];
  channelEnv: string;
  color: number;
}

export interface TrackerConfig {
  rules: RuleConfig[];
  defaultRule: RuleConfig;
}

export interface RssTwitterTrackerOptions {
  feeds?: string[];
  // Expression cron (par ex. "*/15 * * * *"). Defaut : RSS_TWITTER_CRON env ou '*/15 * * * *'.
  cron?: string;
  /** Fuseau IANA du cron. Defaut : process.env.TZ ou 'UTC'. */
  timezone?: string;
  /** Chemin du fichier JSON de regles. Defaut : ./config/rssTwitterTracker.config.json. */
  configPath?: string;
  /** Si true, lance un tick 5 s apres start(). Defaut : true. */
  runOnStart?: boolean;
  pool?: PgPool;
  parser?: Parser;
  /** Client RAWG.io DI. Cree depuis RAWG_API_KEY par defaut si absent. */
  rawgClient?: RawgClient;
  logger?: {
    info?: (...args: unknown[]) => void;
    warn?: (...args: unknown[]) => void;
    error?: (...args: unknown[]) => void;
  };
}

export class RssTwitterTracker {
  constructor(client: Client, options?: RssTwitterTrackerOptions);
  start(): Promise<void>;
  stop(): Promise<void>;
  tick(): Promise<TickResult>;
  reloadConfig(): Promise<'ok' | 'fallback' | null>;
  readonly isRunning: boolean;
  readonly lastTick: TickResult | null;
  readonly cronExpr: string | null;
  readonly rules: ReadonlyArray<RuleConfig>;
  readonly defaultRule: RuleConfig;
  readonly rawgClient: RawgClient | null;
}

export function getRssTwitterTracker(): RssTwitterTracker | undefined;
export function startRssTwitterTracker(
  client: Client,
  options?: RssTwitterTrackerOptions,
): RssTwitterTracker;
export function stopRssTwitterTracker(): Promise<void>;

export default {
  RssTwitterTracker,
  getRssTwitterTracker,
  startRssTwitterTracker,
  stopRssTwitterTracker,
};

declare global {
  var __rssTwitterTracker: import('./rssTwitterTracker.js').RssTwitterTracker | undefined;
}
