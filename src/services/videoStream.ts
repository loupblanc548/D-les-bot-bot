/**
 * videoStream.ts — Stream la page web /releases en "Go Live" (vrai partage d'écran)
 * dans le salon vocal Discord using @dank074/discord-video-stream.
 *
 * Discord bloque la vidéo des bots — il faut un token utilisateur (selfbot).
 * Config .env:
 * - SCREEN_SHARE_USER_TOKEN : token utilisateur Discord
 * - GAME_RELEASE_VOICE_CHANNEL_ID : ID du salon vocal
 * - DISCORD_GUILD_ID : ID du serveur
 */

import logger from "../utils/logger.js";

const HTTP_BASE = "http://localhost:3000";

function getUserToken(): string {
  return process.env.SCREEN_SHARE_USER_TOKEN || "";
}

function getVoiceChannelId(): string {
  return process.env.GAME_RELEASE_VOICE_CHANNEL_ID || "";
}

function getGuildId(): string {
  return process.env.GUILD_ID || process.env.DISCORD_GUILD_ID || process.env.MAIN_GUILD_ID || "";
}

async function getNextGamePreviewUrl(): Promise<string> {
  try {
    const res = await fetch(`${HTTP_BASE}/releases/data`, { signal: AbortSignal.timeout(5000) });
    if (!res.ok) {
      logger.warn(`[VideoStream] /releases/data HTTP ${res.status} — fallback /releases`);
      return `${HTTP_BASE}/releases`;
    }
    const games = (await res.json()) as Array<{ gameName: string; releaseDate: string }>;
    const now = Date.now();
    const upcoming = games
      .filter((g) => new Date(g.releaseDate).getTime() > now)
      .sort((a, b) => new Date(a.releaseDate).getTime() - new Date(b.releaseDate).getTime());
    logger.info(`[VideoStream] ${games.length} jeux, ${upcoming.length} à venir`);
    if (upcoming.length > 0) {
      const url = `${HTTP_BASE}/releases/preview?game=${encodeURIComponent(upcoming[0].gameName)}`;
      logger.info(`[VideoStream] Prochain jeu: ${upcoming[0].gameName} → ${url}`);
      return url;
    }
    logger.info(`[VideoStream] Aucun jeu à venir — fallback /releases`);
    return `${HTTP_BASE}/releases`;
  } catch (err) {
    logger.warn(
      `[VideoStream] Erreur fetch /releases/data: ${err instanceof Error ? err.message : String(err)} — fallback /releases`,
    );
    return `${HTTP_BASE}/releases`;
  }
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

export function startVideoStream(): void {
  const userToken = getUserToken();
  const voiceChannelId = getVoiceChannelId();
  const guildId = getGuildId();

  if (!userToken) {
    logger.info("[VideoStream] Désactivé — SCREEN_SHARE_USER_TOKEN non configuré");
    logger.info(
      "[VideoStream] Pour activer le vrai Go Live (partage d'écran vidéo), ajoutez un token utilisateur dans .env:",
    );
    logger.info("[VideoStream] SCREEN_SHARE_USER_TOKEN=votre_token_utilisateur_discord");
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
  const userToken = getUserToken();
  const voiceChannelId = getVoiceChannelId();
  const guildId = getGuildId();

  if (isVideoStreaming) {
    logger.debug("[VideoStream] déjà en cours");
    return;
  }

  isVideoStreaming = true;
  logger.info("[VideoStream] Démarrage du Go Live...");

  try {
    // 1. Wait for HTTP server
    const serverReady = await waitForHttpServer(HTTP_BASE);
    if (!serverReady) {
      logger.warn(`[VideoStream] Serveur HTTP ${HTTP_BASE} non disponible`);
      isVideoStreaming = false;
      return;
    }
    logger.info(`[VideoStream] Serveur HTTP ${HTTP_BASE} prêt`);

    // 2. Get the preview URL for the next game
    const previewUrl = await getNextGamePreviewUrl();
    logger.info(`[VideoStream] Page de présentation: ${previewUrl}`);

    // 3. Create selfbot client and streamer
    const { Client } = await import("discord.js-selfbot-v13");
    const { Streamer, prepareStream, playStream, Utils, Encoders } =
      await import("@dank074/discord-video-stream");

    selfbotClient = new Client();
    streamerInstance = new Streamer(selfbotClient);

    await new Promise<void>((resolve, reject) => {
      selfbotClient.once("ready", () => {
        logger.info(`[VideoStream] Selfbot connecté: ${selfbotClient.user?.username}`);
        resolve();
      });
      selfbotClient.once("error", reject);
      selfbotClient.login(userToken).catch(reject);
    });

    // 4. Join voice channel
    await streamerInstance.joinVoice(guildId, voiceChannelId);
    logger.info(`[VideoStream] Connecté au salon vocal ${voiceChannelId}`);

    // 5. Launch Playwright to capture the page as a video stream
    const { chromium } = await import("playwright");
    const browser = await chromium.launch({
      headless: true,
      args: ["--no-sandbox", "--disable-setuid-sandbox", "--disable-gpu"],
    });
    const page = await browser.newPage();
    await page.setViewportSize({ width: 1920, height: 1080 });
    await page.goto(previewUrl, { waitUntil: "networkidle", timeout: 30000 });
    logger.info(`[VideoStream] Page ${previewUrl} chargée`);

    // 6. Capture screenshots at 30fps and pipe to ffmpeg via discord-video-stream
    const { PassThrough } = await import("stream");
    const videoStream = new PassThrough();

    // Start capturing screenshots at 30fps and pipe to ffmpeg
    const fps = 30;
    const frameInterval = 1000 / fps;
    let capturing = true;

    const captureLoop = async () => {
      while (capturing) {
        try {
          const screenshot: Buffer = await page.screenshot({ type: "jpeg", quality: 80 });
          if (!videoStream.destroyed) {
            videoStream.write(screenshot);
          }
        } catch {
          // Page might be loading
        }
        await new Promise((r) => setTimeout(r, frameInterval));
      }
    };
    void captureLoop();

    // 7. Stream via discord-video-stream as Go Live
    const encoder = Encoders.software({
      x264: {
        preset: "superfast",
        tune: "zerolatency",
      },
    });

    const { command, output } = prepareStream(videoStream, {
      encoder,
      height: 1080,
      width: 1920,
      frameRate: fps,
      bitrateVideo: 5000,
      bitrateVideoMax: 7500,
      videoCodec: Utils.normalizeVideoCodec("H264"),
    });

    command.on("error", (err: Error) => {
      logger.error(`[VideoStream] ffmpeg error: ${err.message}`);
    });

    // 7b. Start streaming (don't await — keep it running)
    playStream(output, streamerInstance, {
      type: "go-live",
    })
      .then(() => {
        logger.info("[VideoStream] Go Live terminé");
        capturing = false;
        isVideoStreaming = false;
      })
      .catch((err: Error) => {
        logger.error(`[VideoStream] Go Live erreur: ${err.message}`);
        capturing = false;
        isVideoStreaming = false;
      });

    logger.info("[VideoStream] Go Live actif — streaming vidéo en temps réel ✅");

    // 8. Reload page every 60s to refresh countdown data
    setInterval(async () => {
      if (!capturing) return;
      try {
        await page.reload({ waitUntil: "networkidle", timeout: 10000 });
        logger.debug("[VideoStream] Page rechargée");
      } catch {
        // Ignore reload errors
      }
    }, 60_000);

    // 9. Auto-reconnect if stream stops (check every 30s)
    setInterval(() => {
      if (!isVideoStreaming && getUserToken() && getVoiceChannelId()) {
        logger.info("[VideoStream] Stream arrêté — tentative de reconnexion...");
        void startVideoStreamAsync().catch(() => {});
      }
    }, 30_000);
  } catch (err) {
    logger.error(`[VideoStream] Erreur: ${err instanceof Error ? err.message : String(err)}`);
    isVideoStreaming = false;
  }
}

export function stopVideoStream(): void {
  isVideoStreaming = false;
  if (selfbotClient) {
    selfbotClient.destroy?.();
    selfbotClient = null;
  }
  streamerInstance = null;
  logger.info("[VideoStream] Arrêté");
}

export function isStreamActive(): boolean {
  return isVideoStreaming;
}
