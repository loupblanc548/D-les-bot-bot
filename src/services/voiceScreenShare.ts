/**
 * voiceScreenShare.ts — Le bot rejoint un salon vocal et ouvre la page
 * web /releases avec Playwright. Il poste des screenshots périodiques
 * dans le salon texte associé au salon vocal.
 *
 * Note: Les bots Discord ne peuvent PAS faire de "Go Live" / screen share
 * vidéo via l'API. À la place, on poste des screenshots réguliers.
 *
 * Configuration .env:
 * - GAME_RELEASE_VOICE_CHANNEL_ID : ID du salon vocal
 * - DISCORD_GUILD_ID : ID du serveur
 */

import { Client, AttachmentBuilder, EmbedBuilder } from "discord.js";
import { joinVoiceChannel, VoiceConnectionStatus, type VoiceConnection } from "@discordjs/voice";
import logger from "../utils/logger.js";

const HTTP_BASE = "http://localhost:3000";
const RELEASES_URL = `${HTTP_BASE}/releases`;
const SCREENSHOT_INTERVAL_MS = 5 * 60 * 1000; // 5 min between screenshots

async function getNextGamePreviewUrl(): Promise<string> {
  try {
    const res = await fetch(`${HTTP_BASE}/releases/data`, { signal: AbortSignal.timeout(5000) });
    if (!res.ok) return RELEASES_URL;
    const games = (await res.json()) as Array<{ gameName: string; releaseDate: string }>;
    const now = Date.now();
    const upcoming = games
      .filter((g) => new Date(g.releaseDate).getTime() > now)
      .sort((a, b) => new Date(a.releaseDate).getTime() - new Date(b.releaseDate).getTime());
    if (upcoming.length > 0) {
      return `${HTTP_BASE}/releases/preview?game=${encodeURIComponent(upcoming[0].gameName)}`;
    }
    return RELEASES_URL;
  } catch {
    return RELEASES_URL;
  }
}

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
let browserContext: any = null;
let page: any = null;
let isStreaming = false;
let lastScreenshotMessageId: string | null = null;

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
  logger.info("[VoiceScreenShare] Démarrage...");

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
      selfDeaf: true,
      selfMute: true,
    });

    activeConnection.on(VoiceConnectionStatus.Ready, () => {
      logger.info("[VoiceScreenShare] Connecté au salon vocal");
    });

    activeConnection.on(VoiceConnectionStatus.Disconnected, () => {
      logger.warn("[VoiceScreenShare] Déconnecté du salon vocal");
      stopScreenShare();
    });

    // 2. Wait for HTTP server
    const serverReady = await waitForHttpServer(HTTP_BASE);
    if (!serverReady) {
      logger.warn(`[VoiceScreenShare] Serveur HTTP ${HTTP_BASE} non disponible`);
      isStreaming = false;
      if (activeConnection) {
        activeConnection.destroy();
        activeConnection = null;
      }
      return;
    }
    logger.info(`[VoiceScreenShare] Serveur HTTP ${HTTP_BASE} prêt`);

    // 3. Launch Playwright — open the next game's preview page
    const previewUrl = await getNextGamePreviewUrl();
    const { chromium } = await import("playwright");
    browserContext = await chromium.launch({
      headless: true,
      args: ["--no-sandbox", "--disable-setuid-sandbox", "--disable-gpu"],
    });
    page = await browserContext.newPage();
    await page.setViewportSize({ width: 1280, height: 720 });

    let pageLoaded = false;
    for (let attempt = 0; attempt < 5; attempt++) {
      try {
        await page.goto(previewUrl, { waitUntil: "networkidle", timeout: 15000 });
        pageLoaded = true;
        break;
      } catch (err) {
        logger.warn(
          `[VoiceScreenShare] Page load tentative ${attempt + 1}/5: ${err instanceof Error ? err.message : String(err)}`,
        );
        await new Promise((r) => setTimeout(r, 3000));
      }
    }
    if (!pageLoaded) {
      logger.error(`[VoiceScreenShare] Impossible de charger ${previewUrl}`);
      isStreaming = false;
      await browserContext.close().catch(() => {});
      browserContext = null;
      if (activeConnection) {
        activeConnection.destroy();
        activeConnection = null;
      }
      return;
    }
    logger.info(`[VoiceScreenShare] Page ${previewUrl} chargée`);

    // 4. Take initial screenshot and post it
    await takeAndPostScreenshot(client, VOICE_CHANNEL_ID);

    // 5. Post screenshots periodically
    screenshotInterval = setInterval(async () => {
      await takeAndPostScreenshot(client, VOICE_CHANNEL_ID);
    }, SCREENSHOT_INTERVAL_MS);

    logger.info("[VoiceScreenShare] Actif — screenshots toutes les 5 min");
  } catch (err) {
    logger.error(`[VoiceScreenShare] Erreur: ${err instanceof Error ? err.message : String(err)}`);
    isStreaming = false;
  }
}

async function takeAndPostScreenshot(client: Client, voiceChannelId: string): Promise<void> {
  if (!page) return;

  try {
    // Reload page to get fresh countdown data
    await page.reload({ waitUntil: "networkidle", timeout: 10000 }).catch(() => {});

    const screenshot: Buffer = await page.screenshot({ type: "png" });
    const attachment = new AttachmentBuilder(screenshot, { name: "releases-countdown.png" });

    const embed = new EmbedBuilder()
      .setTitle("🎮 Game Release Countdown")
      .setColor(0x5865f2)
      .setImage("attachment://releases-countdown.png")
      .setFooter({
        text: `Mise à jour • ${new Date().toLocaleTimeString("fr-FR")} • ${RELEASES_URL}`,
      })
      .setTimestamp();

    // Find the text channel associated with the voice channel
    const guild = client.guilds.cache.get(getGuildId());
    if (!guild) return;

    const voiceChannel = guild.channels.cache.get(voiceChannelId);
    if (!voiceChannel) return;

    const textChannel = guild.channels.cache.find(
      (c) =>
        c.type === 0 &&
        c.parentId === voiceChannel.parentId &&
        c.name.toLowerCase().includes("release"),
    );

    const targetChannel = textChannel || voiceChannel;

    if (targetChannel && "send" in targetChannel) {
      // Delete previous screenshot to avoid spam
      if (lastScreenshotMessageId) {
        try {
          const oldMsg = await targetChannel.messages.fetch(lastScreenshotMessageId);
          if (oldMsg) await oldMsg.delete();
        } catch {
          // Message might already be deleted
        }
      }

      const sent = await targetChannel.send({
        content: `📊 **Countdown en temps réel** → ${RELEASES_URL}`,
        embeds: [embed],
        files: [attachment],
      });
      lastScreenshotMessageId = sent.id;
      logger.debug(
        `[VoiceScreenShare] Screenshot posté (${new Date().toLocaleTimeString("fr-FR")})`,
      );
    }
  } catch (err) {
    logger.debug(
      `[VoiceScreenShare] Erreur screenshot: ${err instanceof Error ? err.message : String(err)}`,
    );
  }
}

function stopScreenShare(): void {
  if (screenshotInterval) {
    clearInterval(screenshotInterval);
    screenshotInterval = null;
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
  lastScreenshotMessageId = null;
  logger.info("[VoiceScreenShare] Arrêté");
}

export function startVoiceScreenShare(client: Client): void {
  const VOICE_CHANNEL_ID = getVoiceChannelId();
  if (!VOICE_CHANNEL_ID) {
    logger.info("[VoiceScreenShare] Désactivé — GAME_RELEASE_VOICE_CHANNEL_ID non configuré");
    return;
  }

  // If VideoStream (Go Live) is configured, don't start screenshot mode
  if (process.env.SCREEN_SHARE_USER_TOKEN) {
    logger.info("[VoiceScreenShare] Désactivé — VideoStream (Go Live) est actif à la place");
    return;
  }

  const launch = () => {
    void startScreenShare(client).catch((err) =>
      logger.error(
        `[VoiceScreenShare] Erreur: ${err instanceof Error ? err.message : String(err)}`,
      ),
    );
  };

  if (client.isReady()) {
    setTimeout(launch, 3000);
  } else {
    client.once("ready", () => setTimeout(launch, 3000));
  }

  // Auto-reconnect every 2 min
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

// Per-platform: reuse main stream (no duplicate channels)
export async function startPlatformScreenShare(
  client: Client,
  _channelId: string,
  _platform: string,
): Promise<void> {
  if (isStreaming) {
    logger.debug(`[VoiceScreenShare] Stream déjà actif, ${_platform} ignoré`);
    return;
  }
  void startScreenShare(client).catch(() => {});
}
