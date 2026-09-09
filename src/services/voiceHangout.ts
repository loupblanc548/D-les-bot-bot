/**
 * Conversation vocale : John rejoint dès qu'il y a quelqu'un,
 * écoute le micro, répond à voix haute.
 */
import {
  EndBehaviorType,
  entersState,
  getVoiceConnection,
  VoiceConnectionStatus,
  type VoiceConnection,
} from "@discordjs/voice";
import { ChannelType, Client, Guild, VoiceChannel, VoiceState } from "discord.js";
import prism from "prism-media";
import logger from "../utils/logger.js";
import { pcmToWavBuffer, transcribeAudio } from "./dictation.js";
import { joinVoiceChannelById, leaveVoiceChannel, speakInCurrentChannel } from "./voiceAgent.js";
import { callLlm } from "./aiGateway.js";
import { recall } from "./aiMemory.js";
import { shouldReplyToUtterance } from "./memoryHints.js";
import { isTesterBot } from "../utils/testerBots.js";
import { pickVoiceFallback, pickVoiceGreeting } from "./voiceGreetings.js";

const MIN_HUMANS = 1;
const LEAVE_AFTER_MS = 45_000;
const SESSION_MS = 120_000;
const MIN_AUDIO_BYTES = 4_000;
const MAX_SESSION_LISTENERS = 8;

interface HangoutSession {
  channelId: string;
  listening: Set<string>;
  lastReplyAt: number;
  talkingTo: Map<string, number>;
  turns: Array<{ user: string; text: string }>;
  greeted: boolean;
}

const hangouts = new Map<string, HangoutSession>();
const leaveTimers = new Map<string, ReturnType<typeof setTimeout>>();
let tickTimer: ReturnType<typeof setInterval> | null = null;
let started = false;
let clientRef: Client | null = null;

function humanCount(channel: VoiceChannel): number {
  return channel.members.filter((m) => !m.user.bot || isTesterBot(m.id)).size;
}

function isHangoutVoice(channel: VoiceChannel): boolean {
  if (channel.id === channel.guild.afkChannelId) return false;
  const goLiveChannel = process.env.GAME_RELEASE_VOICE_CHANNEL_ID || "";
  if (goLiveChannel && channel.id === goLiveChannel) return false;
  if (/créer un salon|creer un salon|hub/i.test(channel.name)) return false;
  if (/sorties\s*jeux/i.test(channel.name)) return false;
  if (/^(utilisateurs|membres|bots)\b/i.test(channel.name)) return false;
  return true;
}

function pickBusyChannel(guild: Guild): { id: string; humans: number } | null {
  let best: { id: string; humans: number } | null = null;
  for (const channel of guild.channels.cache.values()) {
    if (channel.id === guild.afkChannelId) continue;
    if (channel.type !== ChannelType.GuildVoice || !channel.isVoiceBased()) continue;
    const voice = channel as VoiceChannel;
    if (!isHangoutVoice(voice)) continue;
    const humans = humanCount(voice);
    if (humans < MIN_HUMANS) continue;
    if (!best || humans > best.humans) best = { id: voice.id, humans };
  }
  return best;
}

function sessionOpen(session: HangoutSession, userId: string): boolean {
  const last = session.talkingTo.get(userId) ?? 0;
  return Date.now() - last < SESSION_MS;
}

async function generateVoiceReply(
  userId: string,
  username: string,
  prompt: string,
  turns: Array<{ user: string; text: string }>,
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

  const history = turns
    .slice(-6)
    .map((t) => `${t.user}: ${t.text}`)
    .join("\n");

  const result = await callLlm({
    messages: [
      {
        role: "system",
        content:
          "Tu es John, dans un vocal Discord. Réponds en 1 ou 2 phrases parlées, naturel, français. " +
          "Pas de markdown, pas de listes, pas de *astérisques*. " +
          "Ne commence jamais par yo. Varie tes formulations, comme un pote au micro. " +
          memoryLine,
      },
      {
        role: "user",
        content: `${history ? `Conversation:\n${history}\n\n` : ""}${username}: ${prompt}`,
      },
    ],
    maxTokens: 120,
    temperature: 0.8,
    timeoutMs: 12_000,
    maxRetries: 0,
  });

  return (result.content || pickVoiceFallback()).replace(/\*\*/g, "").slice(0, 280);
}

async function listenUtterance(
  client: Client,
  guildId: string,
  connection: VoiceConnection,
  userId: string,
  humans: number,
): Promise<void> {
  const session = hangouts.get(guildId);
  if (!session || session.listening.has(userId)) return;
  if (session.listening.size >= MAX_SESSION_LISTENERS) return;
  if (userId === client.user?.id) return;

  session.listening.add(userId);
  const chunks: Buffer[] = [];

  try {
    const audioStream = connection.receiver.subscribe(userId, {
      end: { behavior: EndBehaviorType.AfterSilence, duration: 1200 },
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
    const decision = shouldReplyToUtterance({
      text: text || "",
      humans,
      sessionOpen: sessionOpen(session, userId),
    });
    if (!decision.reply) return;

    logger.info(`[VoiceHangout] ${userId}: "${(text || "").slice(0, 80)}"`);

    const member = await client.guilds.cache
      .get(guildId)
      ?.members.fetch(userId)
      .catch(() => null);
    const username = member?.displayName || member?.user.username || "quelqu'un";
    const reply = await generateVoiceReply(userId, username, decision.prompt, session.turns);
    session.turns.push({ user: username, text: decision.prompt }, { user: "John", text: reply });
    if (session.turns.length > 12) session.turns.splice(0, session.turns.length - 12);
    session.talkingTo.set(userId, Date.now());
    session.lastReplyAt = Date.now();
    const spoken = await speakInCurrentChannel(guildId, reply, "fr");
    if (!spoken) logger.warn("[VoiceHangout] TTS n'a pas pu parler");
  } catch (err) {
    logger.warn(
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
    const channel = client.guilds.cache
      .get(guildId)
      ?.channels.cache.get(hangouts.get(guildId)?.channelId || "");
    const humans =
      channel && channel.type === ChannelType.GuildVoice ? humanCount(channel as VoiceChannel) : 1;
    void listenUtterance(client, guildId, connection, userId, humans);
  });
}

async function reconcileGuild(client: Client, guildId: string): Promise<void> {
  const guild = client.guilds.cache.get(guildId);
  if (!guild) return;

  const target = pickBusyChannel(guild);
  const current = hangouts.get(guildId);

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

  const existingConn = getVoiceConnection(guildId);
  if (current?.channelId === target.id && existingConn) {
    attachReceiver(client, guildId, existingConn);
    return;
  }

  const joined = await joinVoiceChannelById(client, guildId, target.id);
  if (!joined) return;
  const connection = getVoiceConnection(guildId);
  if (!connection) return;
  try {
    await entersState(connection, VoiceConnectionStatus.Ready, 8_000);
  } catch {
    logger.warn("[VoiceHangout] Connexion vocale pas prête");
    return;
  }

  const session: HangoutSession = {
    channelId: target.id,
    listening: new Set(),
    lastReplyAt: current?.lastReplyAt ?? 0,
    talkingTo: current?.talkingTo ?? new Map(),
    turns: current?.turns ?? [],
    greeted: current?.greeted ?? false,
  };
  hangouts.set(guildId, session);
  attachReceiver(client, guildId, connection);
  logger.info(`[VoiceHangout] John écoute dans ${target.id} (${target.humans} pers.)`);

  if (!session.greeted && target.humans <= 2) {
    session.greeted = true;
    void speakInCurrentChannel(guildId, pickVoiceGreeting().text, "fr");
  }
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
    for (const g of clientRef.guilds.cache.values()) {
      void reconcileGuild(clientRef, g.id);
    }
  }, 20_000);
  if (tickTimer.unref) tickTimer.unref();

  logger.info("[VoiceHangout] Conversation vocale active — parle, John répond");
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
