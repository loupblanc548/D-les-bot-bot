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

const RELEASES_URL = `http://localhost:3000/releases`;

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

    // 2. Launch Playwright to capture the page
    const { chromium } = await import("playwright");
    browserContext = await chromium.launch({
      headless: true,
      args: ["--no-sandbox", "--disable-setuid-sandbox", "--disable-gpu"],
    });
    page = await browserContext.newPage();
    await page.setViewportSize({ width: 1920, height: 1080 });
    await page.goto(RELEASES_URL, { waitUntil: "networkidle" });
    logger.info(`[VoiceScreenShare] Page ${RELEASES_URL} chargée`);

    // 3. Create ffmpeg process to encode screenshots as video stream
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

    // 4. Create audio player and resource
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

    // 5. Capture screenshots every 100ms and feed to ffmpeg
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

  // Wait for bot to be ready, then start screen share
  const startDelay = 20_000; // 20s after boot
  setTimeout(() => {
    void startScreenShare(client).catch((err) =>
      logger.error(
        `[VoiceScreenShare] Erreur: ${err instanceof Error ? err.message : String(err)}`,
      ),
    );
  }, startDelay);

  // Auto-reconnect if disconnected
  setInterval(
    () => {
      if (!isStreaming && getVoiceChannelId()) {
        logger.info("[VoiceScreenShare] Tentative de reconnexion...");
        void startScreenShare(client).catch(() => {});
      }
    },
    5 * 60 * 1000,
  ); // Check every 5 min
}

export function stopVoiceScreenShare(): void {
  stopScreenShare();
}
