/**
 * voiceScreenShare.ts — Le bot rejoint un salon vocal et partage
 * la page web /releases en streaming vidéo (screen share).
 *
 * Utilise Playwright pour capturer la page en screenshots,
 * ffmpeg pour encoder en flux vidéo H.264,
 * et @discordjs/voice pour streamer dans le salon vocal.
 *
 * Configuration .env:
 * - GAME_RELEASE_VOICE_CHANNEL_ID : ID du salon vocal
 * - SCREEN_SHARE_GUILD_ID : ID du serveur (guild)
 */

import { Client } from "discord.js";
import {
  joinVoiceChannel,
  createAudioPlayer,
  createAudioResource,
  AudioPlayerStatus,
  VoiceConnectionStatus,
  getVoiceConnection,
  type VoiceConnection,
} from "@discordjs/voice";
import { spawn } from "child_process";
import logger from "../utils/logger.js";
import { PassThrough } from "stream";

const HTTP_BASE = `http://localhost:3000`;
const RELEASES_URL = `${HTTP_BASE}/releases`;

async function waitForHttpServer(url: string, maxRetries = 30): Promise<boolean> {
  for (let i = 0; i < maxRetries; i++) {
    try {
      const res = await fetch(url, { signal: AbortSignal.timeout(2000) });
      if (res.ok || res.status === 404) return true;
    } catch {
      // Server not ready yet
    }
    logger.debug(`[VoiceScreenShare] Attente serveur HTTP... (${i + 1}/${maxRetries})`);
    await new Promise((r) => setTimeout(r, 2000));
  }
  return false;
}

function getVoiceChannelId(): string {
  return process.env.GAME_RELEASE_VOICE_CHANNEL_ID || "";
}

function getGuildId(): string {
  return process.env.GUILD_ID || process.env.DISCORD_GUILD_ID || process.env.MAIN_GUILD_ID || "";
}

let activeConnection: VoiceConnection | null = null;
let screenshotInterval: NodeJS.Timeout | null = null;
let ffmpegProcess: ReturnType<typeof spawn> | null = null;
let browserContext: any = null;
let page: any = null;
let isStreaming = false;

async function startScreenShare(client: Client): Promise<void> {
  const VOICE_CHANNEL_ID = getVoiceChannelId();
  const GUILD_ID = getGuildId();
  if (!VOICE_CHANNEL_ID || !GUILD_ID) {
    logger.info(
      "[VoiceScreenShare] Désactivé — GAME_RELEASE_VOICE_CHANNEL_ID ou GUILD_ID non configuré",
    );
    return;
  }

  if (isStreaming) {
    logger.debug("[VoiceScreenShare] déjà en cours");
    return;
  }

  isStreaming = true;
  logger.info("[VoiceScreenShare] Démarrage du screen share...");

  try {
    // 1. Join voice channel
    const guild = client.guilds.cache.get(GUILD_ID);
    if (!guild) {
      logger.warn(`[VoiceScreenShare] Guild ${GUILD_ID} introuvable`);
      isStreaming = false;
      return;
    }

    const channel = guild.channels.cache.get(VOICE_CHANNEL_ID);
    if (!channel || !channel.isVoiceBased()) {
      logger.warn(`[VoiceScreenShare] Salon ${VOICE_CHANNEL_ID} n'est pas vocal`);
      isStreaming = false;
      return;
    }

    activeConnection = joinVoiceChannel({
      channelId: VOICE_CHANNEL_ID,
      guildId: GUILD_ID,
      adapterCreator: guild.voiceAdapterCreator as never,
      selfDeaf: false,
      selfMute: false,
    });

    activeConnection.on(VoiceConnectionStatus.Ready, () => {
      logger.info("[VoiceScreenShare] Connecté au salon vocal");
    });

    activeConnection.on(VoiceConnectionStatus.Disconnected, () => {
      logger.warn("[VoiceScreenShare] Déconnecté du salon vocal");
      stopScreenShare();
    });

    // 2. Wait for HTTP server to be ready
    const serverReady = await waitForHttpServer(HTTP_BASE);
    if (!serverReady) {
      logger.warn(`[VoiceScreenShare] Serveur HTTP ${HTTP_BASE} non disponible — abandon`);
      isStreaming = false;
      if (activeConnection) {
        activeConnection.destroy();
        activeConnection = null;
      }
      return;
    }
    logger.info(`[VoiceScreenShare] Serveur HTTP ${HTTP_BASE} prêt`);

    // 3. Launch Playwright to capture the page
    const { chromium } = await import("playwright");
    browserContext = await chromium.launch({
      headless: true,
      args: ["--no-sandbox", "--disable-setuid-sandbox", "--disable-gpu"],
    });
    page = await browserContext.newPage();
    await page.setViewportSize({ width: 1920, height: 1080 });

    // Retry page load up to 5 times
    let pageLoaded = false;
    for (let attempt = 0; attempt < 5; attempt++) {
      try {
        await page.goto(RELEASES_URL, { waitUntil: "networkidle", timeout: 15000 });
        pageLoaded = true;
        break;
      } catch (err) {
        logger.warn(
          `[VoiceScreenShare] Page load tentative ${attempt + 1}/5 échouée: ${err instanceof Error ? err.message : String(err)}`,
        );
        await new Promise((r) => setTimeout(r, 3000));
      }
    }
    if (!pageLoaded) {
      logger.error(`[VoiceScreenShare] Impossible de charger ${RELEASES_URL} après 5 tentatives`);
      isStreaming = false;
      await browserContext.close().catch(() => {});
      browserContext = null;
      if (activeConnection) {
        activeConnection.destroy();
        activeConnection = null;
      }
      return;
    }
    logger.info(`[VoiceScreenShare] Page ${RELEASES_URL} chargée`);

    // 4. Create ffmpeg process to encode screenshots as video stream
    const videoStream = new PassThrough();
    ffmpegProcess = spawn(
      "ffmpeg",
      [
        "-re",
        "-f",
        "image2pipe",
        "-vcodec",
        "png",
        "-r",
        "10",
        "-i",
        "-",
        "-c:v",
        "libx264",
        "-preset",
        "ultrafast",
        "-tune",
        "zerolatency",
        "-pix_fmt",
        "yuv420p",
        "-f",
        "opus",
        "-ar",
        "48000",
        "-ac",
        "2",
        "pipe:1",
      ],
      { stdio: ["pipe", "pipe", "pipe"] },
    );

    ffmpegProcess.stdin?.on("error", () => {});
    ffmpegProcess.stdout?.on("error", () => {});
    ffmpegProcess.stderr?.on("data", (data: Buffer) => {
      const msg = data.toString();
      if (msg.includes("error") || msg.includes("Error")) {
        logger.debug(`[VoiceScreenShare] ffmpeg: ${msg.trim()}`);
      }
    });

    // Pipe ffmpeg output to audio resource
    videoStream.pipe(ffmpegProcess.stdin!);

    // 5. Create audio player and resource
    const player = createAudioPlayer();
    const resource = createAudioResource(ffmpegProcess.stdout!, {
      inputType: "ogg/opus" as never,
    });

    player.play(resource);
    activeConnection.subscribe(player);

    player.on(AudioPlayerStatus.Playing, () => {
      logger.info("[VoiceScreenShare] Streaming vidéo actif");
    });

    player.on(AudioPlayerStatus.Idle, () => {
      logger.debug("[VoiceScreenShare] Player idle");
    });

    player.on("error", (err) => {
      logger.error(`[VoiceScreenShare] Player error: ${err.message}`);
    });

    // 6. Capture screenshots every 100ms and feed to ffmpeg
    screenshotInterval = setInterval(async () => {
      if (!page || !ffmpegProcess?.stdin?.writable) return;
      try {
        const screenshot = await page.screenshot({ type: "png" });
        ffmpegProcess.stdin.write(screenshot);
      } catch {
        // Page might be loading
      }
    }, 100);

    logger.info("[VoiceScreenShare] Screen share démarré avec succès");
  } catch (err) {
    logger.error(
      `[VoiceScreenShare] Erreur démarrage: ${err instanceof Error ? err.message : String(err)}`,
    );
    isStreaming = false;
  }
}

function stopScreenShare(): void {
  if (screenshotInterval) {
    clearInterval(screenshotInterval);
    screenshotInterval = null;
  }
  if (ffmpegProcess) {
    ffmpegProcess.stdin?.end();
    ffmpegProcess.kill("SIGTERM");
    ffmpegProcess = null;
  }
  if (page) {
    page.close().catch(() => {});
    page = null;
  }
  if (browserContext) {
    browserContext.close().catch(() => {});
    browserContext = null;
  }
  if (activeConnection) {
    activeConnection.destroy();
    activeConnection = null;
  }
  isStreaming = false;
  logger.info("[VoiceScreenShare] Arrêté");
}

export function startVoiceScreenShare(client: Client): void {
  const VOICE_CHANNEL_ID = getVoiceChannelId();
  if (!VOICE_CHANNEL_ID) {
    logger.info("[VoiceScreenShare] Désactivé — GAME_RELEASE_VOICE_CHANNEL_ID non configuré");
    return;
  }

  // Start as soon as client is ready (or immediately if already ready)
  const launch = () => {
    void startScreenShare(client).catch((err) =>
      logger.error(
        `[VoiceScreenShare] Erreur: ${err instanceof Error ? err.message : String(err)}`,
      ),
    );
  };

  if (client.isReady()) {
    setTimeout(launch, 3000); // 3s pour laisser le HTTP server démarrer
  } else {
    client.once("ready", () => setTimeout(launch, 3000));
  }

  // Auto-reconnect if disconnected (check every 2 min)
  setInterval(
    () => {
      if (!isStreaming && getVoiceChannelId()) {
        logger.info("[VoiceScreenShare] Tentative de reconnexion...");
        void startScreenShare(client).catch(() => {});
      }
    },
    2 * 60 * 1000,
  );
}

export function stopVoiceScreenShare(): void {
  stopScreenShare();
}

// ─── Per-platform screen share ───────────────────────────────────────────────

const platformStreams = new Map<
  string,
  {
    connection: VoiceConnection;
    interval: NodeJS.Timeout;
    ffmpeg: ReturnType<typeof spawn>;
    browser: any;
    page: any;
  }
>();

export async function startPlatformScreenShare(
  client: Client,
  channelId: string,
  platform: string,
): Promise<void> {
  // Don't create duplicate streams
  if (platformStreams.has(platform)) {
    logger.debug(`[VoiceScreenShare] Stream déjà actif pour ${platform}`);
    return;
  }

  const guildId = getGuildId();
  if (!guildId || !channelId) return;

  const guild = client.guilds.cache.get(guildId);
  if (!guild) return;

  logger.info(`[VoiceScreenShare] Démarrage stream plateforme ${platform} → salon ${channelId}`);

  try {
    const connection = joinVoiceChannel({
      channelId,
      guildId,
      adapterCreator: guild.voiceAdapterCreator as never,
      selfDeaf: false,
      selfMute: false,
    });

    connection.on(VoiceConnectionStatus.Disconnected, () => {
      logger.info(`[VoiceScreenShare] Déconnexion stream ${platform}`);
      stopPlatformScreenShare(platform);
    });

    // Wait for HTTP server then load page with retries
    await waitForHttpServer(HTTP_BASE);
    const { chromium } = await import("playwright");
    const browser = await chromium.launch({
      headless: true,
      args: ["--no-sandbox", "--disable-setuid-sandbox", "--disable-gpu"],
    });
    const pg = await browser.newPage();
    await pg.setViewportSize({ width: 1920, height: 1080 });
    const url = `${HTTP_BASE}/releases?platform=${encodeURIComponent(platform)}`;

    let pageLoaded = false;
    for (let attempt = 0; attempt < 5; attempt++) {
      try {
        await pg.goto(url, { waitUntil: "networkidle", timeout: 15000 });
        pageLoaded = true;
        break;
      } catch (err) {
        logger.warn(
          `[VoiceScreenShare] Page load ${platform} tentative ${attempt + 1}/5: ${err instanceof Error ? err.message : String(err)}`,
        );
        await new Promise((r) => setTimeout(r, 3000));
      }
    }
    if (!pageLoaded) {
      logger.error(`[VoiceScreenShare] Impossible de charger ${url}`);
      await browser.close().catch(() => {});
      connection.destroy();
      return;
    }
    logger.info(`[VoiceScreenShare] Page ${url} chargée pour ${platform}`);

    // ffmpeg to encode screenshots as video
    const ffmpeg = spawn(
      "ffmpeg",
      [
        "-re",
        "-f",
        "image2pipe",
        "-vcodec",
        "png",
        "-r",
        "10",
        "-i",
        "-",
        "-c:v",
        "libx264",
        "-preset",
        "ultrafast",
        "-tune",
        "zerolatency",
        "-pix_fmt",
        "yuv420p",
        "-f",
        "opus",
        "-ar",
        "48000",
        "-ac",
        "2",
        "pipe:1",
      ],
      { stdio: ["pipe", "pipe", "pipe"] },
    );

    ffmpeg.stdin?.on("error", () => {});
    ffmpeg.stdout?.on("error", () => {});
    ffmpeg.stderr?.on("data", () => {});

    const player = createAudioPlayer();
    const resource = createAudioResource(ffmpeg.stdout!, {
      inputType: "ogg/opus" as never,
    });
    player.play(resource);
    connection.subscribe(player);

    // Capture screenshots every 100ms
    const interval = setInterval(async () => {
      if (!pg || !ffmpeg.stdin?.writable) return;
      try {
        const screenshot = await pg.screenshot({ type: "png" });
        ffmpeg.stdin.write(screenshot);
      } catch {
        // Page might be loading
      }
    }, 100);

    platformStreams.set(platform, { connection, interval, ffmpeg, browser, page: pg });
    logger.info(`[VoiceScreenShare] Stream ${platform} actif ✅`);
  } catch (err) {
    logger.error(
      `[VoiceScreenShare] Erreur stream ${platform}: ${err instanceof Error ? err.message : String(err)}`,
    );
  }
}

function stopPlatformScreenShare(platform: string): void {
  const stream = platformStreams.get(platform);
  if (!stream) return;

  clearInterval(stream.interval);
  stream.ffmpeg.stdin?.end();
  stream.ffmpeg.kill("SIGTERM");
  stream.page?.close?.().catch(() => {});
  stream.browser?.close?.().catch(() => {});
  stream.connection.destroy();
  platformStreams.delete(platform);
  logger.info(`[VoiceScreenShare] Stream ${platform} arrêté`);
}
