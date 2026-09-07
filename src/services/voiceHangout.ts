/**
 * John rejoint le vocal quand il y a du monde, écoute un mot-clé ("John"),
 * et répond à voix haute. Pas d'enregistrement persisté.
 */
import { EndBehaviorType, getVoiceConnection, type VoiceConnection } from "@discordjs/voice";
import { ChannelType, Client, Guild, VoiceChannel, VoiceState } from "discord.js";
import prism from "prism-media";
import logger from "../utils/logger.js";
import { pcmToWavBuffer, transcribeAudio } from "./dictation.js";
import { joinVoiceChannelById, leaveVoiceChannel, speakResponseInVoice } from "./voiceAgent.js";
import { callLlm } from "./aiGateway.js";
import { recall } from "./aiMemory.js";
import { matchJohnWakeWord } from "./memoryHints.js";

const MIN_HUMANS = 2;
const LEAVE_AFTER_MS = 45_000;
const REPLY_COOLDOWN_MS = 8_000;
const MIN_AUDIO_BYTES = 8_000;
const MAX_SESSION_LISTENERS = 8;

const hangouts = new Map<
  string,
  { channelId: string; listening: Set<string>; lastReplyAt: number }
>();
const leaveTimers = new Map<string, ReturnType<typeof setTimeout>>();
let tickTimer: ReturnType<typeof setInterval> | null = null;
let started = false;
let clientRef: Client | null = null;

function humanCount(channel: VoiceChannel): number {
  return channel.members.filter((m) => !m.user.bot).size;
}

function pickBusyChannel(guild: Guild): { id: string; humans: number } | null {
  let best: { id: string; humans: number } | null = null;
  for (const channel of guild.channels.cache.values()) {
    if (channel.id === guild.afkChannelId) continue;
    if (channel.type !== ChannelType.GuildVoice || !channel.isVoiceBased()) continue;
    const voice = channel as VoiceChannel;
    const humans = humanCount(voice);
    if (humans < MIN_HUMANS) continue;
    if (!best || humans > best.humans) best = { id: voice.id, humans };
  }
  return best;
}

async function generateVoiceReply(
  userId: string,
  username: string,
  prompt: string,
): Promise<string> {
  let memoryLine = "";
  try {
    const snap = await recall(userId, { limit: 6, includeMessages: false });
    if (snap.facts.length > 0) {
      memoryLine = "Tu sais: " + snap.facts.map((f) => `${f.key}=${f.value}`).join("; ") + ". ";
    }
  } catch {
    memoryLine = "";
  }

  const result = await callLlm({
    messages: [
      {
        role: "system",
        content:
          "Tu es John, dans un vocal Discord. Réponds en 1 ou 2 phrases parlées, naturel, français. " +
          "Pas de markdown, pas de listes. " +
          memoryLine,
      },
      { role: "user", content: `${username}: ${prompt}` },
    ],
    maxTokens: 120,
    temperature: 0.8,
    timeoutMs: 12_000,
    maxRetries: 0,
  });

  return (result.content || "ouais ?").replace(/\*\*/g, "").slice(0, 280);
}

async function listenUtterance(
  client: Client,
  guildId: string,
  connection: VoiceConnection,
  userId: string,
): Promise<void> {
  const session = hangouts.get(guildId);
  if (!session || session.listening.has(userId)) return;
  if (session.listening.size >= MAX_SESSION_LISTENERS) return;
  if (userId === client.user?.id) return;

  session.listening.add(userId);
  const chunks: Buffer[] = [];

  try {
    const audioStream = connection.receiver.subscribe(userId, {
      end: { behavior: EndBehaviorType.AfterSilence, duration: 1500 },
    });
    const decoder = new prism.opus.Decoder({ rate: 48000, channels: 2, frameSize: 960 });
    decoder.on("data", (chunk: Buffer) => {
      chunks.push(chunk);
    });
    audioStream.pipe(decoder);

    await new Promise<void>((resolve) => {
      const done = () => resolve();
      audioStream.once("end", done);
      audioStream.once("close", done);
      setTimeout(done, 12_000);
    });

    audioStream.destroy();
    decoder.destroy();

    const pcm = Buffer.concat(chunks);
    if (pcm.length < MIN_AUDIO_BYTES) return;

    const text = await transcribeAudio(pcmToWavBuffer(pcm));
    const wake = matchJohnWakeWord(text || "");
    if (!wake.hit) return;

    const now = Date.now();
    if (now - session.lastReplyAt < REPLY_COOLDOWN_MS) return;
    session.lastReplyAt = now;

    logger.info(`[VoiceHangout] ${userId}: "${(text || "").slice(0, 80)}"`);

    const member = await client.guilds.cache
      .get(guildId)
      ?.members.fetch(userId)
      .catch(() => null);
    const username = member?.displayName || member?.user.username || "quelqu'un";
    const reply = await generateVoiceReply(userId, username, wake.prompt);
    await speakResponseInVoice(client, guildId, userId, reply, "fr", true);
  } catch (err) {
    logger.debug(
      `[VoiceHangout] listen ${userId}: ${err instanceof Error ? err.message : String(err)}`,
    );
  } finally {
    hangouts.get(guildId)?.listening.delete(userId);
  }
}

function attachReceiver(client: Client, guildId: string, connection: VoiceConnection): void {
  const speaking = connection.receiver.speaking;
  speaking.removeAllListeners("start");
  speaking.on("start", (userId: string) => {
    void listenUtterance(client, guildId, connection, userId);
  });
}

async function reconcileGuild(client: Client, guildId: string): Promise<void> {
  const guild = client.guilds.cache.get(guildId);
  if (!guild) return;

  const target = pickBusyChannel(guild);
  const current = hangouts.get(guildId);
  const existingConn = getVoiceConnection(guildId);

  if (!target) {
    if (!current) return;
    if (leaveTimers.has(guildId)) return;
    const timer = setTimeout(() => {
      leaveTimers.delete(guildId);
      if (pickBusyChannel(guild)) return;
      hangouts.delete(guildId);
      leaveVoiceChannel(guildId);
      logger.info(`[VoiceHangout] Plus personne, John quitte ${guildId}`);
    }, LEAVE_AFTER_MS);
    leaveTimers.set(guildId, timer);
    return;
  }

  const pendingLeave = leaveTimers.get(guildId);
  if (pendingLeave) {
    clearTimeout(pendingLeave);
    leaveTimers.delete(guildId);
  }

  if (existingConn && !current) {
    return;
  }

  if (current?.channelId === target.id && existingConn) {
    return;
  }

  const joined = await joinVoiceChannelById(client, guildId, target.id);
  if (!joined) return;
  const connection = getVoiceConnection(guildId);
  if (!connection) return;

  hangouts.set(guildId, {
    channelId: target.id,
    listening: new Set(),
    lastReplyAt: current?.lastReplyAt ?? 0,
  });
  attachReceiver(client, guildId, connection);
  logger.info(`[VoiceHangout] John est dans ${target.id} (${target.humans} personnes)`);
}

export function startVoiceHangout(client: Client): void {
  if (started) return;
  started = true;
  clientRef = client;

  client.on("voiceStateUpdate", (oldState: VoiceState, newState: VoiceState) => {
    const guildId = newState.guild.id || oldState.guild.id;
    if (!guildId) return;
    void reconcileGuild(client, guildId);
  });

  tickTimer = setInterval(() => {
    if (!clientRef) return;
    for (const guild of clientRef.guilds.cache.values()) {
      void reconcileGuild(clientRef, guild.id);
    }
  }, 30_000);
  if (tickTimer.unref) tickTimer.unref();

  logger.info("[VoiceHangout] John rejoint le vocal dès qu'il y a du monde");
}

export function stopVoiceHangout(): void {
  started = false;
  clientRef = null;
  if (tickTimer) {
    clearInterval(tickTimer);
    tickTimer = null;
  }
  for (const timer of leaveTimers.values()) clearTimeout(timer);
  leaveTimers.clear();
  for (const guildId of hangouts.keys()) {
    leaveVoiceChannel(guildId);
  }
  hangouts.clear();
}
