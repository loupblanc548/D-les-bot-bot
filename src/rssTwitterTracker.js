// src/rssTwitterTracker.js
// @ts-check
/**
 * rssTwitterTracker.js — Surveillance de flux RSS Twitter / X vers Discord.
 *
 * Architecture:
 *   - Cron via node-cron (expression configurable : RSS_TWITTER_CRON, defaut *\/15 * * * *).
 *   - Regles externalisees dans config/rssTwitterTracker.config.json (zod).
 *   - Hot-reload du fichier JSON par mtime au debut de chaque tick.
 *   - Anti-doublon Postgres (`rss_twitter_posts`).
 *   - Image d'illustration chainee via src/imageExtractor.js (5 tiers, RAWG fallback).
 *
 * Variables d'environnement :
 *   RSS_TWITTER_CRON   defaut "*\/15 * * * *"
 *   TZ                 defaut UTC
 *   RSS_TWITTER_FEEDS  liste CSV
 *   DATABASE_URL       Postgres (Neon)
 *   RAWG_API_KEY       cle RAWG.io (optionnel)
 *
 * Politique hot-reload :
 *   - ENOENT        -> fallback BUNDLED_DEFAULTS (reset mtime = 0)
 *   - parse/Zod KO  -> REGLES PRECEDEMMENT CHARGEES PRESERVEES (pas de wipe)
 */

import Parser from 'rss-parser';
import { Pool } from 'pg';
import { EmbedBuilder } from 'discord.js';
import cron from 'node-cron';
import { readFile, stat } from 'node:fs/promises';
import path from 'node:path';
import { z } from 'zod';
import { extractImage } from './imageExtractor.js';
import { RawgClient } from './rawgClient.js';

/** @typedef {import('discord.js').Client} Client */

const RuleConfigSchema = z.object({
  name: z.string().min(1),
  keywords: z.array(z.string().min(1)).min(1),
  channelEnv: z.string().regex(/^[A-Z][A-Z0-9_]*$/),
  color: z.number().int().min(0).max(16777215),
});
const TrackerConfigSchema = z.object({
  rules: z.array(RuleConfigSchema).min(1),
  defaultRule: RuleConfigSchema,
});

const BUNDLED_DEFAULTS = Object.freeze({
  rules: Object.freeze([
    { name: 'Fortnite',       keywords: ['fortnite','battle royale','chapter ','season ','live event','fn ','fortbytes','victory crown'], channelEnv: 'FORTNITE_CHANNEL_ID',       color: 0xf7b500 },
    { name: 'PlayStation',    keywords: ['playstation','ps5 ','ps4 ','psn','sony interactive','playstation plus','ps plus','psn store','playstation studios'], channelEnv: 'PLAYSTATION_CHANNEL_ID', color: 0x003791 },
    { name: 'Xbox',           keywords: ['xbox','microsoft',' game pass','series x','series s','halo','forza','bethesda','activision blizzard'], channelEnv: 'XBOX_CHANNEL_ID',          color: 0x107c10 },
    { name: 'Nintendo',       keywords: ['nintendo','switch','nintendo switch','mario','zelda','pokemon','nintendo direct','3ds'], channelEnv: 'NINTENDO_CHANNEL_ID',     color: 0xe60012 },
    { name: 'Instant Gaming', keywords: ['instant gaming','instantgaming','instant-gaming','ig deal','cdkey'], channelEnv: 'INSTANT_GAMING_CHANNEL_ID', color: 0x9b59b6 },
  ]),
  defaultRule: Object.freeze({ name: 'Steam / Epic / Jeux', channelEnv: 'STEAM_EPIC_CHANNEL_ID', color: 0x1b2838 }),
});

const DEFAULT_CRON = '*/15 * * * *';
const EMPTY_FEED_STATS = Object.freeze({ items: 0, posts: 0, duplicates: 0, errors: 0, byRule: {} });
const EXTRACT_CONCURRENCY = 6;

/**
 * URL absolue http(s). Indispensable pour valider avant EmbedBuilder.setURL
 * (Discord throw sur URL non valide).
 * @param {unknown} s
 */
function isHttpUrl(s) {
  return typeof s === 'string' && s.length > 0 && /^https?:\/\//i.test(s);
}

export class RssTwitterTracker {
  /**
   * @param {Client} client
   * @param {{
   *   feeds?: string[],
   *   cron?: string,
   *   timezone?: string,
   *   configPath?: string,
   *   runOnStart?: boolean,
   *   pool?: import('pg').Pool,
   *   parser?: import('rss-parser').default,
   *   rawgClient?: RawgClient,
   *   logger?: { info?: (...a: unknown[]) => void; warn?: (...a: unknown[]) => void; error?: (...a: unknown[]) => void },
   * }} [options]
   */
  constructor(client, options = {}) {
    this.client = client;
    this.options = Object.freeze({ runOnStart: true, ...options });

    this.feeds = (options.feeds !== undefined ? options.feeds : this.parseFeedsFromEnv()).map(function (s) { return String(s); });
    this.parser = options.parser || new Parser({
      timeout: 20000,
      headers: { 'User-Agent': 'discord-rss-twitter-tracker/1.0 (+bot)' },
      customFields: { item: ['content:encoded','dc:creator','media:thumbnail','media:content'] },
    });
    this.pool = options.pool || new Pool({
      connectionString: process.env.DATABASE_URL || process.env.NEON_DATABASE_URL,
      ssl: this.detectSsl(),
      max: 5,
      idleTimeoutMillis: 30000,
      connectionTimeoutMillis: 5000,
    });
    this.logger = options.logger || console;

    this._configPath = options.configPath || path.resolve(process.cwd(), 'config', 'rssTwitterTracker.config.json');
    this._rules = BUNDLED_DEFAULTS.rules;
    this._defaultRule = BUNDLED_DEFAULTS.defaultRule;
    this._configMtime = 0;

    this._cronExpr = null;
    this._cronTask = null;
    this._timezone = options.timezone || process.env.TZ || 'UTC';

    // Image provider RAWG — source unique (DI ou construction depuis env).
    this.rawgClient = options.rawgClient !== undefined
      ? options.rawgClient
      : (process.env.RAWG_API_KEY ? new RawgClient({ logger: this.logger }) : null);

    this._running = false;
    this._stopped = false;
    this._currentTick = null;
    this._lastTick = null;
  }

  get isRunning() { return this._running; }
  get lastTick() { return this._lastTick; }
  get cronExpr() { return this._cronExpr; }
  get rules() { return this._rules; }
  get defaultRule() { return this._defaultRule; }

  async reloadConfig() { return this.loadConfig(); }

  async start() {
    if (this._cronTask) return;
    // Ré-armement du flag stop() permet un redémarrage de l'instance.
    this._stopped = false;

    await this.loadConfig();
    if (this.feeds.length === 0 && this.logger && this.logger.warn) {
      this.logger.warn('[rssTwitterTracker] Aucun flux RSS configure (RSS_TWITTER_FEEDS vide).');
    }

    const expr = this.options.cron || process.env.RSS_TWITTER_CRON || DEFAULT_CRON;
    if (!cron.validate(expr)) {
      if (this.logger && this.logger.error) this.logger.error('[rssTwitterTracker] expression cron invalide: ' + expr);
      return;
    }

    const self = this;
    if (this.options.runOnStart) {
      setTimeout(function () { self.tick().catch(function () {}); }, 5000);
    }
    this._cronExpr = expr;
    this._cronTask = cron.schedule(
      expr,
      function () { self.tick().catch(function () {}); },
      { timezone: this._timezone },
    );
    if (this.logger && this.logger.info) this.logger.info(
      '[rssTwitterTracker] cron `' + expr + '` tz=' + this._timezone
      + ', ' + this.feeds.length + ' feed(s), ' + this._rules.length + ' rule(s), config=' + this._configPath,
    );
  }

  async stop() {
    this._stopped = true;
    if (this._cronTask) { this._cronTask.stop(); this._cronTask = null; }
    const deadline = Date.now() + 5000;
    while (this._running && Date.now() < deadline) await new Promise(function (r) { setTimeout(r, 100); });
    await this.pool.end().catch(function () {});
    if (this.logger && this.logger.info) this.logger.info('[rssTwitterTracker] Arrete.');
  }

  async tick() {
    if (this._currentTick) {
      if (this.logger && this.logger.warn) this.logger.warn('[rssTwitterTracker] tick concurrent — await du precedent.');
      return await this._currentTick;
    }
    const t0 = Date.now();
    const job = this.runTick(t0);
    this._currentTick = job;
    try { return await job; } finally { this._currentTick = null; }
  }

  async runTick(t0) {
    this._running = true;
    const result = {
      startedAt: new Date(t0),
      durationMs: 0,
      feeds: 0,
      feedsFailed: [],
      total: { items: 0, posts: 0, duplicates: 0, errors: 0 },
      perFeed: {},
    };
    try {
      // 1. Snapshot des règles — pas de mutation durant le tour (hot-reload OK entre ticks).
      const rules = this._rules;
      const defaultRule = this._defaultRule;

      // 2. Recharger la config si elle a changé.
      await this.maybeReloadConfig();

      // 3. Pour chaque flux : parse, extrait images en batch, dédup puis envoie.
      const feeds = this.fe
