/**
 * videoStream.ts — Stream la page web /releases/showcase en "Go Live" (partage d'écran)
 * dans le salon vocal Discord using @dank074/discord-video-stream.
 *
 * Utilise le token du bot (DISCORD_TOKEN) pour le Go Live.
 * Config .env:
 * - DISCORD_TOKEN : token du bot Discord
 * - GAME_RELEASE_VOICE_CHANNEL_ID : ID du salon vocal
 * - DISCORD_GUILD_ID : ID du serveur
 */

import logger from "../utils/logger.js";
import type { ChildProcess } from "child_process";

const HTTP_BASE = "http://localhost:3000";
const STREAM_WIDTH = 1280;
const STREAM_HEIGHT = 720;
const STREAM_FPS = 30;
const CAPTURE_WIDTH = 1280;
const CAPTURE_HEIGHT = 720;

function getStreamToken(): string {
  return process.env.DISCORD_TOKEN || "";
}

function getVoiceChannelId(): string {
  return process.env.GAME_RELEASE_VOICE_CHANNEL_ID || "";
}

function getGuildId(): string {
  return process.env.GUILD_ID || process.env.DISCORD_GUILD_ID || process.env.MAIN_GUILD_ID || "";
}

async function getNextGamePreviewUrl(): Promise<string> {
  // Use the showcase page (all games with animated platform cards on green background)
  const showcaseUrl = `${HTTP_BASE}/releases/showcase`;

  // Wait for game data to be available
  for (let attempt = 0; attempt < 10; attempt++) {
    try {
      const res = await fetch(`${HTTP_BASE}/releases/data`, { signal: AbortSignal.timeout(5000) });
      if (!res.ok) {
        logger.warn(`[VideoStream] /releases/data HTTP ${res.status} — retry ${attempt + 1}/10`);
        await new Promise((r) => setTimeout(r, 5000));
        continue;
      }
      const games = (await res.json()) as Array<{ gameName: string; releaseDate: string }>;
      if (games.length === 0) {
        logger.info(`[VideoStream] 0 jeux — retry ${attempt + 1}/10 dans 5s`);
        await new Promise((r) => setTimeout(r, 5000));
        continue;
      }
      logger.info(`[VideoStream] ${games.length} jeux disponibles — page showcase`);
      return showcaseUrl;
    } catch (err) {
      logger.warn(
        `[VideoStream] Erreur fetch /releases/data (retry ${attempt + 1}/10): ${err instanceof Error ? err.message : String(err)}`,
      );
      await new Promise((r) => setTimeout(r, 5000));
    }
  }
  logger.warn(`[VideoStream] Aucune donnée après 10 tentatives — fallback /releases/showcase`);
  return showcaseUrl;
}

async function waitForHttpServer(url: string, maxRetries = 30): Promise<boolean> {
  for (let i = 0; i < maxRetries; i++) {
    try {
      const res = await fetch(url, { signal: AbortSignal.timeout(2000) });
      if (res.ok || res.status === 404) return true;
    } catch {
      // Server not ready
    }
    await new Promise((r) => setTimeout(r, 2000));
  }
  return false;
}

let streamerInstance: any = null;
let selfbotClient: any = null;
let isVideoStreaming = false;
let activeBrowser: any = null;
let activePage: any = null;
let activeFfmpeg: ChildProcess | null = null;
let screencastActive = false;
let reconnectTimer: NodeJS.Timeout | null = null;
let reloadTimer: NodeJS.Timeout | null = null;
let frameCount = 0;
let streamManuallyStopped = false;

export function startVideoStream(): void {
  streamManuallyStopped = false;
  const streamToken = getStreamToken();
  const voiceChannelId = getVoiceChannelId();
  const guildId = getGuildId();

  if (!streamToken) {
    logger.info("[VideoStream] Désactivé — DISCORD_TOKEN non configuré");
    return;
  }

  if (!voiceChannelId || !guildId) {
    logger.info("[VideoStream] Désactivé — GAME_RELEASE_VOICE_CHANNEL_ID ou GUILD_ID manquant");
    return;
  }

  // Start async streaming
  void startVideoStreamAsync().catch((err) =>
    logger.error(`[VideoStream] Erreur: ${err instanceof Error ? err.message : String(err)}`),
  );
}

async function startVideoStreamAsync(): Promise<void> {
  const streamToken = getStreamToken();
  const voiceChannelId = getVoiceChannelId();
  const guildId = getGuildId();

  if (isVideoStreaming) {
    logger.debug("[VideoStream] déjà en cours");
    return;
  }

  isVideoStreaming = true;
  logger.info("[VideoStream] Démarrage du Go Live...");

  // Cleanup any previous state
  cleanupResources();

  try {
    // 1. Wait for HTTP server
    const serverReady = await waitForHttpServer(HTTP_BASE);
    if (!serverReady) {
      logger.warn(`[VideoStream] Serveur HTTP ${HTTP_BASE} non disponible`);
      isVideoStreaming = false;
      return;
    }
    logger.info(`[VideoStream] Serveur HTTP ${HTTP_BASE} prêt`);

    // 2. Get the showcase URL
    const showcaseUrl = await getNextGamePreviewUrl();
    logger.info(`[VideoStream] Page de présentation: ${showcaseUrl}`);

    // 3. Create client and streamer (utilise le token du bot)
    // discord.js-selfbot-v13 gère la connexion vocale vidéo différemment de discord.js
    const { Client } = await import("discord.js-selfbot-v13");
    const { Streamer, prepareStream, playStream, Utils, Encoders } =
      await import("@dank074/discord-video-stream");

    selfbotClient = new Client();
    streamerInstance = new Streamer(selfbotClient);

    await new Promise<void>((resolve, reject) => {
      selfbotClient.once("ready", () => {
        logger.info(`[VideoStream] Bot stream connecté: ${selfbotClient.user?.username}`);
        resolve();
      });
      selfbotClient.once("error", reject);
      selfbotClient.login(streamToken).catch(reject);
    });

    // 4. Join voice channel
    await streamerInstance.joinVoice(guildId, voiceChannelId);
    logger.info(`[VideoStream] Connecté au salon vocal ${voiceChannelId}`);

    // 4b. Monitor for voice connection drops
    selfbotClient.on("error", (err: Error) => {
      logger.error(`[VideoStream] Client stream error: ${err.message}`);
    });
    selfbotClient.on("disconnect", () => {
      logger.warn("[VideoStream] Client stream déconnecté — arrêt du stream");
      screencastActive = false;
      isVideoStreaming = false;
    });
    selfbotClient.on("close", () => {
      logger.warn("[VideoStream] Client stream connexion fermée");
      screencastActive = false;
      isVideoStreaming = false;
    });

    // 5. Launch Playwright to capture the showcase page
    const { chromium } = await import("playwright");
    activeBrowser = await chromium.launch({
      headless: true,
      args: [
        "--no-sandbox",
        "--disable-setuid-sandbox",
        "--enable-features=PageCapture",
        "--disable-background-timer-throttling",
        "--disable-renderer-backgrounding",
        "--disable-background-networking",
        "--disable-extensions",
        "--disable-component-extensions-with-background-pages",
        "--disable-default-extensions",
        "--disable-sync",
        "--disable-translate",
        "--no-first-run",
        "--disable-popup-blocking",
      ],
    });
    activePage = await activeBrowser.newPage();
    await activePage.setViewportSize({ width: CAPTURE_WIDTH, height: CAPTURE_HEIGHT });

    let pageLoaded = false;
    for (let attempt = 0; attempt < 5; attempt++) {
      try {
        await activePage.goto(showcaseUrl, { waitUntil: "networkidle", timeout: 20000 });
        pageLoaded = true;
        break;
      } catch (err) {
        logger.warn(
          `[VideoStream] Page load tentative ${attempt + 1}/5: ${err instanceof Error ? err.message : String(err)}`,
        );
        await new Promise((r) => setTimeout(r, 3000));
      }
    }
    if (!pageLoaded) {
      logger.error(`[VideoStream] Impossible de charger ${showcaseUrl}`);
      isVideoStreaming = false;
      cleanupResources();
      return;
    }
    logger.info(`[VideoStream] Page ${showcaseUrl} chargée`);

    // 6. Capture frames via screenshot loop with frame pacing
    const { PassThrough } = await import("stream");
    const videoStream = new PassThrough();
    screencastActive = true;
    frameCount = 0;

    const targetFrameTime = 1000 / STREAM_FPS;
    const captureLoop = async () => {
      while (screencastActive) {
        const frameStart = Date.now();
        try {
          if (!activePage || videoStream.destroyed) break;
          const screenshot: Buffer = await activePage.screenshot({
            type: "jpeg",
            quality: 85,
          });
          frameCount++;
          if (frameCount % 120 === 1) {
            const fps = (120 / ((Date.now() - (frameCount > 120 ? frameStart : frameStart)) / 1000)).toFixed(1);
            logger.info(`[VideoStream] Frame #${frameCount} (${screenshot.length} bytes)`);
          }
          if (!videoStream.destroyed && videoStream.writable) {
            videoStream.write(screenshot);
          }
        } catch {
          // Page might be loading
        }
        const elapsed = Date.now() - frameStart;
        const wait = targetFrameTime - elapsed;
        if (wait > 0) await new Promise((r) => setTimeout(r, wait));
      }
    };
    void captureLoop();

    logger.info(`[VideoStream] Capture démarrée — ${STREAM_FPS}fps (screenshot max speed)`);

    // 7. Encode screenshots via ffmpeg, pipe NUT output to playStream
    const encoder = Encoders.software({
      x264: {
        preset: "superfast",
        tune: "zerolatency",
      },
    });

    const { command, output, promise: ffmpegPromise } = prepareStream(videoStream, {
      encoder,
      height: STREAM_HEIGHT,
      width: STREAM_WIDTH,
      frameRate: STREAM_FPS,
      bitrateVideo: 6000,
      bitrateVideoMax: 8000,
      bitrateAudio: 0,
      includeAudio: false,
      videoCodec: Utils.normalizeVideoCodec("H264"),
      minimizeLatency: true,
      customInputOptions: [
        "-f", "image2pipe",
        "-c:v", "mjpeg",
        "-r", String(STREAM_FPS),
      ],
      customFfmpegFlags: [],
    });

    activeFfmpeg = command;

    command.on("error", (err: Error) => {
      logger.error(`[VideoStream] ffmpeg error: ${err.message}`);
      screencastActive = false;
      isVideoStreaming = false;
    });

    command.on("close", (code: number) => {
      logger.info(`[VideoStream] ffmpeg fermé (code ${code})`);
      screencastActive = false;
      isVideoStreaming = false;
    });

    ffmpegPromise?.catch((err: Error) => {
      logger.error(`[VideoStream] ffmpeg promise error: ${err.message}`);
    });

    // 7b. playStream handles demux + createStream + VideoStream internally
    logger.info("[VideoStream] Appel playStream...");
    logger.info("[VideoStream] Go Live actif — streaming vidéo en temps réel ✅");
    playStream(output, streamerInstance, {
      type: "go-live",
      format: "nut",
      width: STREAM_WIDTH,
      height: STREAM_HEIGHT,
      frameRate: STREAM_FPS,
    })
      .then(() => {
        logger.info("[VideoStream] Go Live terminé");
        screencastActive = false;
        isVideoStreaming = false;
      })
      .catch((err: Error) => {
        logger.error(`[VideoStream] Go Live erreur: ${err.message}`);
        screencastActive = false;
        isVideoStreaming = false;
      });

    // 8. Reload page every 5min to refresh countdown data (page JS updates countdowns live)
    reloadTimer = setInterval(async () => {
      if (!screencastActive || !activePage) return;
      try {
        await activePage.reload({ waitUntil: "networkidle", timeout: 10000 });
        logger.debug("[VideoStream] Page rechargée");
      } catch {
        // Ignore reload errors
      }
    }, 300_000);

    // 9. Auto-reconnect if stream stops (check every 30s)
    reconnectTimer = setInterval(() => {
      if (!isVideoStreaming && getStreamToken() && getVoiceChannelId()) {
        logger.info("[VideoStream] Stream arrêté — nettoyage + reconnexion...");
        cleanupResources();
        void startVideoStreamAsync().catch(() => {});
      }
    }, 30_000);
  } catch (err) {
    logger.error(`[VideoStream] Erreur: ${err instanceof Error ? err.message : String(err)}`);
    isVideoStreaming = false;
    cleanupResources();
  }
}

function cleanupResources(): void {
  screencastActive = false;

  if (reloadTimer) {
    clearInterval(reloadTimer);
    reloadTimer = null;
  }
  if (reconnectTimer) {
    clearInterval(reconnectTimer);
    reconnectTimer = null;
  }
  if (activeFfmpeg) {
    try { activeFfmpeg.kill("SIGTERM"); } catch { /* already dead */ }
    activeFfmpeg = null;
  }
  if (activePage) {
    activePage.close().catch(() => {});
    activePage = null;
  }
  if (activeBrowser) {
    activeBrowser.close().catch(() => {});
    activeBrowser = null;
  }
  if (selfbotClient) {
    selfbotClient.destroy?.();
    selfbotClient = null;
  }
  streamerInstance = null;
}

export function stopVideoStream(): void {
  isVideoStreaming = false;
  streamManuallyStopped = true;
  cleanupResources();
  logger.info("[VideoStream] Arrêté");
}

export function isStreamActive(): boolean {
  return isVideoStreaming;
}

// ─── Stream Watchdog ─────────────────────────────────────────────────────────
let watchdogTimer: NodeJS.Timeout | null = null;
let lastFrameCount = 0;
let watchdogFailures = 0;

export function startStreamWatchdog(): NodeJS.Timeout {
  if (watchdogTimer) return watchdogTimer;

  watchdogTimer = setInterval(() => {
    if (!isVideoStreaming) {
      if (streamManuallyStopped) {
        watchdogFailures = 0;
        return;
      }
      watchdogFailures++;
      if (watchdogFailures >= 2) {
        logger.warn("[VideoStream] Watchdog: stream inactif (non-volontaire) — tentative de redémarrage");
        watchdogFailures = 0;
        try {
          stopVideoStream();
          setTimeout(() => startVideoStream(), 5000);
        } catch (err) {
          logger.error(`[VideoStream] Watchdog redémarrage échoué: ${err instanceof Error ? err.message : String(err)}`);
        }
      }
      return;
    }

    // Vérifier si les frames progressent (capture bloquée ?)
    if (frameCount === lastFrameCount) {
      watchdogFailures++;
      logger.warn(`[VideoStream] Watchdog: frames bloquées (${frameCount} == ${lastFrameCount}), failures=${watchdogFailures}`);
      if (watchdogFailures >= 3) {
        logger.warn("[VideoStream] Watchdog: frames bloquées 3x — redémarrage forcé");
        watchdogFailures = 0;
        try {
          stopVideoStream();
          setTimeout(() => startVideoStream(), 5000);
        } catch (err) {
          logger.error(`[VideoStream] Watchdog redémarrage échoué: ${err instanceof Error ? err.message : String(err)}`);
        }
      }
    } else {
      watchdogFailures = 0;
    }
    lastFrameCount = frameCount;
  }, 60_000); // Check every 60s

  if (watchdogTimer.unref) watchdogTimer.unref();
  logger.info("[VideoStream] Watchdog démarré (check 60s)");
  return watchdogTimer;
}
