/**
 * radioGaming.ts — Flash Info Vocal "Radio-Gaming"
 *
 * Agrège les dernières données gaming (Boutique Fortnite, Free Games Epic,
 * Deals majeurs, Patch notes récents) et fait rédiger un script radio
 * par un LLM, puis le diffuse en vocal via TTS + jingle d'intro.
 *
 * Peut être déclenché manuellement via /radio-gaming ou automatiquement
 * via cron (configurable, défaut: 18h00 chaque jour).
 */

import cron from "node-cron";
import {
  Client,
  Guild,
  SlashCommandBuilder,
  ChatInputCommandInteraction,
  MessageFlags,
  EmbedBuilder,
} from "discord.js";
import {
  joinVoiceChannel,
  createAudioPlayer,
  createAudioResource,
  AudioPlayerStatus,
  NoSubscriberBehavior,
  VoiceConnectionStatus,
} from "@discordjs/voice";
import { writeFile, unlink, mkdir, readFile } from "fs/promises";
import { existsSync } from "fs";
import { join, dirname } from "path";
import { fileURLToPath } from "url";
import { tmpdir } from "os";
import { randomUUID } from "crypto";
import * as Sentry from "@sentry/node";
import logger from "../utils/logger.js";
import prisma from "../prisma.js";
import { config } from "../config.js";

const __dirname = dirname(fileURLToPath(import.meta.url));

const RADIO_CRON_EXPRESSION = "0 18 * * *"; // 18h00 chaque jour
const RADIO_MODEL = process.env.RADIO_MODEL || "anthropic/claude-3.5-sonnet";
const TTS_DIR = join(tmpdir(), "bot-radio");
const JINGLE_PATH = join(__dirname, "..", "..", "assets", "sounds", "jingle.mp3");
const RADIO_CHANNEL_ENV = "RADIO_VOICE_CHANNEL_ID";

let cronJob: cron.ScheduledTask | null = null;

interface GamingData {
  freeGames: string[];
  deals: string[];
  patchNotes: string[];
  boutique: string[];
}

/**
 * Récupère les données gaming des dernières 24h depuis Prisma.
 */
async function gatherGamingData(): Promise<GamingData> {
  const since = new Date(Date.now() - 24 * 60 * 60 * 1000);

  const [freeGamesNotifs, dealsNotifs, patchNotifs, boutiqueNotifs] = await Promise.all([
    prisma.notification
      .findMany({
        where: { sentAt: { gte: since }, content: { contains: "free", mode: "insensitive" } },
        select: { content: true, url: true },
        orderBy: { sentAt: "desc" },
        take: 5,
      })
      .catch(() => []),
    prisma.notification
      .findMany({
        where: { sentAt: { gte: since }, content: { contains: "deal", mode: "insensitive" } },
        select: { content: true, url: true },
        orderBy: { sentAt: "desc" },
        take: 5,
      })
      .catch(() => []),
    prisma.notification
      .findMany({
        where: { sentAt: { gte: since }, content: { contains: "patch", mode: "insensitive" } },
        select: { content: true, url: true },
        orderBy: { sentAt: "desc" },
        take: 5,
      })
      .catch(() => []),
    prisma.notification
      .findMany({
        where: { sentAt: { gte: since }, content: { contains: "fortnite", mode: "insensitive" } },
        select: { content: true, url: true },
        orderBy: { sentAt: "desc" },
        take: 3,
      })
      .catch(() => []),
  ]);

  return {
    freeGames: freeGamesNotifs.map((n) => n.content),
    deals: dealsNotifs.map((n) => n.content),
    patchNotes: patchNotifs.map((n) => n.content),
    boutique: boutiqueNotifs.map((n) => n.content),
  };
}

/**
 * Fait rédiger le script radio par le LLM.
 */
async function generateRadioScript(data: GamingData): Promise<string | null> {
  const apiKey = process.env.OPENROUTER_API_KEY;
  if (!apiKey) {
    logger.warn("[RadioGaming] OPENROUTER_API_KEY manquant");
    return null;
  }

  const dataText = `
JEUX GRATUITS (Epic Games): ${data.freeGames.join(", ") || "Rien de nouveau"}
BONS PLANS: ${data.deals.join(", ") || "Aucun deal notable"}
PATCH NOTES RÉCENTS: ${data.patchNotes.join(", ") || "Aucun patch notable"}
BOUTIQUE FORTNITE: ${data.boutique.join(", ") || "Pas de mise à jour"}`;

  const systemPrompt = `Tu es un présentateur radio gaming passionné, style Helldivers / présentateur énergique.
Rédige un flash info radio fluide, immersif et humoristique en français.
Durée maximale : 90 secondes à l'oral (environ 300 mots).
Commence par une accroche énergique ("Citoyens de la Super-Terre !").
Termine par un sign-off style militaire humoristique.
N'utilise PAS d'emojis. N'utilise PAS de markdown. Texte brut uniquement.`;

  try {
    const response = await fetch("https://openrouter.ai/api/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
        "HTTP-Referer": "https://discord-bot.com",
        "X-Title": "John Helldiver - Radio Gaming",
      },
      body: JSON.stringify({
        model: RADIO_MODEL,
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: dataText },
        ],
        max_tokens: 600,
        temperature: 0.8,
      }),
      signal: AbortSignal.timeout(20000),
    });

    if (!response.ok) {
      logger.warn(`[RadioGaming] LLM HTTP ${response.status}`);
      return null;
    }

    const json = (await response.json()) as { choices: Array<{ message: { content: string } }> };
    const content = json.choices?.[0]?.message?.content;
    if (!content) return null;

    return content.slice(0, 500); // Limite TTS
  } catch (err) {
    logger.error(`[RadioGaming] LLM error: ${err instanceof Error ? err.message : String(err)}`);
    return null;
  }
}

/**
 * Génère l'audio TTS via Google Translate (même système que /tts).
 */
async function generateTTS(text: string, lang = "fr"): Promise<Buffer | null> {
  const url = `https://translate.google.com/translate_tts?ie=UTF-8&q=${encodeURIComponent(text)}&tl=${lang}&client=tw-ob`;

  try {
    const res = await fetch(url, {
      headers: {
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36",
        Referer: "https://translate.google.com/",
      },
      signal: AbortSignal.timeout(15000),
    });

    if (!res.ok) {
      logger.warn(`[RadioGaming] TTS HTTP ${res.status}`);
      return null;
    }

    const arrayBuffer = await res.arrayBuffer();
    return Buffer.from(arrayBuffer);
  } catch (err) {
    logger.error(`[RadioGaming] TTS error: ${err instanceof Error ? err.message : String(err)}`);
    return null;
  }
}

/**
 * Diffuse le flash info vocal dans un salon vocal.
 */
export async function broadcastRadioGaming(
  client: Client,
  voiceChannelId: string,
  guildId: string,
  adapterCreator: unknown,
): Promise<{ success: boolean; script: string | null; error?: string }> {
  try {
    // 1. Gather data
    const data = await gatherGamingData();
    logger.info(
      `[RadioGaming] Data: ${data.freeGames.length} free, ${data.deals.length} deals, ${data.patchNotes.length} patches, ${data.boutique.length} boutique`,
    );

    // 2. Generate script
    const script = await generateRadioScript(data);
    if (!script) {
      return { success: false, script: null, error: "Impossible de générer le script" };
    }

    // 3. Generate TTS audio
    const ttsBuffer = await generateTTS(script);
    if (!ttsBuffer) {
      return { success: false, script, error: "Impossible de générer l'audio TTS" };
    }

    await mkdir(TTS_DIR, { recursive: true, mode: 0o700 });
    const ttsFilepath = join(TTS_DIR, `radio-${randomUUID()}.mp3`);
    await writeFile(ttsFilepath, ttsBuffer, { mode: 0o600 });

    // 4. Join voice channel
    const connection = joinVoiceChannel({
      channelId: voiceChannelId,
      guildId,
      adapterCreator: adapterCreator as Parameters<typeof joinVoiceChannel>[0]["adapterCreator"],
    });

    // Wait for ready
    await new Promise<void>((resolve, reject) => {
      const timeout = setTimeout(() => {
        connection.destroy();
        reject(new Error("Timeout connexion vocale (5s)"));
      }, 5000);

      connection.on("stateChange", (_old, newState) => {
        if (newState.status === VoiceConnectionStatus.Ready) {
          clearTimeout(timeout);
          resolve();
        } else if (newState.status === VoiceConnectionStatus.Disconnected) {
          clearTimeout(timeout);
          reject(new Error("Connexion vocale perdue"));
        }
      });

      connection.on("error", (err) => {
        clearTimeout(timeout);
        reject(err);
      });
    });

    const player = createAudioPlayer({
      behaviors: { noSubscriber: NoSubscriberBehavior.Pause },
    });
    connection.subscribe(player);

    // 5. Play jingle if available
    if (existsSync(JINGLE_PATH)) {
      try {
        const jingleBuffer = await readFile(JINGLE_PATH);
        const jinglePath = join(TTS_DIR, `jingle-${randomUUID()}.mp3`);
        await writeFile(jinglePath, jingleBuffer, { mode: 0o600 });
        const jingleResource = createAudioResource(jinglePath);
        player.play(jingleResource);

        await new Promise<void>((resolve) => {
          player.once(AudioPlayerStatus.Idle, () => resolve());
        });

        await unlink(jinglePath).catch(() => {});
        logger.info("[RadioGaming] Jingle joué");
      } catch {
        logger.warn("[RadioGaming] Jingle non joué (erreur lecture)");
      }
    }

    // 6. Play TTS
    const ttsResource = createAudioResource(ttsFilepath);
    player.play(ttsResource);
    logger.info("[RadioGaming] Diffusion TTS en cours...");

    // 7. Cleanup on idle
    await new Promise<void>((resolve) => {
      player.once(AudioPlayerStatus.Idle, () => {
        setTimeout(() => {
          connection.destroy();
          unlink(ttsFilepath).catch(() => {});
          logger.info("[RadioGaming] Diffusion terminée — déconnexion");
          resolve();
        }, 2000);
      });
    });

    return { success: true, script };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    logger.error(`[RadioGaming] Erreur broadcast: ${msg}`);
    Sentry.captureException(err, { tags: { module: "radioGaming" } });
    return { success: false, script: null, error: msg };
  }
}

/**
 * Trouve le salon vocal cible (env var ou premier salon vocal disponible).
 */
async function resolveVoiceChannel(
  client: Client,
  guild: Guild,
): Promise<{ channelId: string; guildId: string; adapterCreator: unknown } | null> {
  const envChannelId = process.env[RADIO_CHANNEL_ENV];

  if (envChannelId) {
    const channel = await client.channels.fetch(envChannelId).catch(() => null);
    if (channel && channel.isVoiceBased()) {
      return {
        channelId: channel.id,
        guildId: guild.id,
        adapterCreator: guild.voiceAdapterCreator,
      };
    }
  }

  // Fallback: premier salon vocal avec des membres connectés
  const voiceChannels = guild.channels.cache.filter((c) => c.isVoiceBased() && c.members.size > 0);

  if (voiceChannels.size > 0) {
    const channel = voiceChannels.first()!;
    return {
      channelId: channel.id,
      guildId: guild.id,
      adapterCreator: guild.voiceAdapterCreator,
    };
  }

  return null;
}

/**
 * Exécute le flash info radio automatique (cron).
 */
async function runRadioGamingCron(client: Client): Promise<void> {
  logger.info("[RadioGaming] Cron déclenché");

  try {
    for (const guild of client.guilds.cache.values()) {
      const target = await resolveVoiceChannel(client, guild);
      if (!target) {
        logger.info(`[RadioGaming] Aucun salon vocal avec des membres sur ${guild.name} — skip`);
        continue;
      }

      const result = await broadcastRadioGaming(
        client,
        target.channelId,
        target.guildId,
        target.adapterCreator,
      );

      if (result.success) {
        logger.info(`[RadioGaming] Flash info diffusé sur ${guild.name}`);
      } else {
        logger.warn(`[RadioGaming] Échec sur ${guild.name}: ${result.error}`);
      }
    }
  } catch (err) {
    logger.error(`[RadioGaming] Erreur cron: ${err instanceof Error ? err.message : String(err)}`);
    Sentry.captureException(err, { tags: { module: "radioGaming" } });
  }
}

/**
 * Démarre le cron radio gaming.
 */
export function startRadioGamingCron(client: Client): void {
  if (cronJob) {
    logger.warn("[RadioGaming] Déjà actif — ignoré");
    return;
  }

  cronJob = cron.schedule(RADIO_CRON_EXPRESSION, () => {
    void runRadioGamingCron(client);
  });

  logger.info("[RadioGaming] Cron planifié à 18h00");
}

/**
 * Arrête le cron.
 */
export function stopRadioGamingCron(): void {
  if (cronJob) {
    cronJob.stop();
    cronJob = null;
    logger.info("[RadioGaming] Cron arrêté");
  }
}

// ─── Commande slash /radio-gaming (admin, test manuel) ───────────────────────

export const radioGamingCommands = [
  new SlashCommandBuilder()
    .setName("radio-gaming")
    .setDescription("Diffuse un flash info vocal Radio-Gaming dans ton salon vocal (Admin)")
    .setDefaultMemberPermissions(BigInt(1 << 3)) // Administrator
    .toJSON(),
];

export async function handleRadioGamingCommand(
  interaction: ChatInputCommandInteraction,
  client: Client,
): Promise<void> {
  if (!config.ownerId || interaction.user.id !== config.ownerId) {
    await interaction.reply({
      content: "❌ Réservé au propriétaire du bot.",
      flags: [MessageFlags.Ephemeral],
    });
    return;
  }

  const member = interaction.member;
  const voiceChannel = (member as { voice?: { channel?: { id: string } } })?.voice?.channel;

  if (!voiceChannel) {
    await interaction.reply({
      content: "❌ Tu dois être dans un salon vocal pour lancer le flash info.",
      flags: [MessageFlags.Ephemeral],
    });
    return;
  }

  await interaction.deferReply({ flags: [MessageFlags.Ephemeral] });

  const guild = interaction.guild;
  if (!guild) {
    await interaction.editReply({ content: "❌ Serveur introuvable." });
    return;
  }

  const result = await broadcastRadioGaming(
    client,
    voiceChannel.id,
    guild.id,
    guild.voiceAdapterCreator,
  );

  if (result.success) {
    const embed = new EmbedBuilder()
      .setColor(0x5865f2)
      .setTitle("📻 Flash Info Radio-Gaming diffusé")
      .setDescription("Le bulletin a été diffusé avec succès dans ton salon vocal.")
      .addFields({ name: "Script généré", value: (result.script || "").slice(0, 1024) || "N/A" })
      .setFooter({ text: "Radio-Gaming • Flash Info" })
      .setTimestamp();

    await interaction.editReply({ embeds: [embed] });
  } else {
    await interaction.editReply({
      content: `❌ Échec du flash info: ${result.error || "erreur inconnue"}`,
    });
  }
}
