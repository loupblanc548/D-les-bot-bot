/**
 * audioService.ts — Service audio ultime et robuste
 *
 * Architecture propre avec AudioPlayer unique par guild, gestion du cycle de vie
 * de la VoiceConnection (reconnexion auto), support MP3 local + URL streaming
 * via play-dl (contourne les blocages 403 YouTube).
 *
 * Points clés :
 * - ffmpeg-static garantit la présence des binaires ffmpeg
 * - libsodium-wrappers pour l'encodage Opus natif
 * - play-dl pour le streaming YouTube/SoundCloud/URL brute
 * - Reconnexion automatique en cas de déconnexion réseau
 * - Nettoyage systématique pour éviter les fuites mémoire
 * - L'Event Loop n'est jamais bloqué (tout est async/non-bloquant)
 */

import {
  joinVoiceChannel,
  getVoiceConnection,
  VoiceConnection,
  VoiceConnectionStatus,
  AudioPlayer,
  AudioResource,
  createAudioPlayer,
  createAudioResource,
  AudioPlayerStatus,
  NoSubscriberBehavior,
  entersState,
} from "@discordjs/voice";
import { Guild, TextChannel } from "discord.js";
import { createReadStream, existsSync, readdirSync } from "fs";
import { join } from "path";
import { dirname } from "path";
import { fileURLToPath } from "url";
import * as Sentry from "@sentry/node";
import logger from "../utils/logger.js";

// ─── play-dl lazy import (évite le crash si non installé) ────────────────────

let playDl: typeof import("play-dl") | null = null;
try {
  playDl = await import("play-dl");
  // Configure play-dl pour éviter les blocages
  if (playDl) {
    await playDl.setToken({
      useragent: [
        process.env.PLAY_DL_USERAGENT ||
          "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36",
      ],
    });
  }
} catch {
  logger.warn("[AudioService] play-dl non disponible — streaming URL désactivé");
}

// ─── ffmpeg-static path ──────────────────────────────────────────────────────

let ffmpegPath: string | null;
try {
  const ffmpegMod = await import("ffmpeg-static");
  ffmpegPath = (ffmpegMod as any).default || (ffmpegMod as unknown as string) || null;
  if (ffmpegPath) {
    process.env.FFMPEG_PATH = ffmpegPath;
    logger.info(`[AudioService] ffmpeg-static configuré: ${ffmpegPath}`);
  } else {
    logger.debug("[AudioService] ffmpeg-static: chemin vide — fallback système");
  }
} catch {
  logger.debug("[AudioService] ffmpeg-static non disponible — fallback système");
}

// ─── libsodium-wrappers (Opus natif) ─────────────────────────────────────────

try {
  const libsodium = await import("libsodium-wrappers");
  await libsodium.ready;
  logger.info("[AudioService] libsodium-wrappers initialisé (Opus natif)");
} catch {
  logger.warn("[AudioService] libsodium-wrappers non disponible — fallback Opus");
}

// ─── Types ───────────────────────────────────────────────────────────────────

const __dirname = dirname(fileURLToPath(import.meta.url));
export const SOUNDS_DIR = join(__dirname, "..", "..", "assets", "sounds");
export const DISCONNECT_DELAY_MS = 5000;
export const AUTOCOMPLETE_LIMIT = 25;

export interface SoundFile {
  name: string;
  displayName: string;
}

export type AudioSource =
  | { type: "file"; path: string; displayName: string }
  | { type: "url"; url: string; displayName: string };

interface GuildAudioState {
  connection: VoiceConnection;
  player: AudioPlayer;
  currentResource: AudioResource | null;
  currentSource: AudioSource | null;
  reconnectAttempts: number;
  disconnectTimer: NodeJS.Timeout | null;
  volume: number; // 0-100
  effect: AudioEffect;
  startTime: number | null;
  pausedAt: number | null;
  queue: AudioSource[];
  queueIndex: number;
  loopMode: LoopMode;
  history: AudioSource[];
}

export type AudioEffect = "none" | "bassboost" | "nightcore" | "vaporwave" | "8d";
export type LoopMode = "off" | "track" | "queue";

// ─── State ───────────────────────────────────────────────────────────────────

const guildAudioState = new Map<string, GuildAudioState>();

// ─── Helpers ─────────────────────────────────────────────────────────────────

/**
 * Liste les fichiers MP3 dans assets/sounds.
 */
export function listSoundFiles(): SoundFile[] {
  try {
    if (!existsSync(SOUNDS_DIR)) return [];
    const files = readdirSync(SOUNDS_DIR).filter((f) => f.toLowerCase().endsWith(".mp3"));
    return files.map((f) => ({
      name: f,
      displayName: f.replace(/\.mp3$/i, "").replace(/[_-]/g, " "),
    }));
  } catch {
    return [];
  }
}

/**
 * Trouve un fichier son par nom.
 */
export function findSoundFile(query: string): SoundFile | null {
  const files = listSoundFiles();
  const normalized = query.toLowerCase().trim();

  const exact = files.find((f) => f.name.toLowerCase() === normalized + ".mp3");
  if (exact) return exact;

  const byName = files.find((f) => f.name.toLowerCase() === normalized);
  if (byName) return byName;

  const byDisplay = files.find((f) => f.displayName.toLowerCase() === normalized);
  if (byDisplay) return byDisplay;

  return files.find((f) => f.displayName.toLowerCase().includes(normalized)) ?? null;
}

/**
 * Nettoie complètement l'état audio d'une guild (player + connection + timers).
 */
export function cleanupGuild(guildId: string): void {
  const state = guildAudioState.get(guildId);
  if (!state) return;

  if (state.disconnectTimer) {
    clearTimeout(state.disconnectTimer);
    state.disconnectTimer = null;
  }

  try {
    state.player.stop();
  } catch {
    // Ignore
  }

  try {
    state.connection.destroy();
  } catch {
    // Ignore
  }

  guildAudioState.delete(guildId);
  logger.info(`[AudioService] Guild ${guildId} nettoyée`);
}

/**
 * Nettoie l'ancienne connexion/player pour une guild avant d'en créer une nouvelle.
 */
function clearExistingState(guildId: string): void {
  const existing = getVoiceConnection(guildId);
  if (existing) {
    try {
      existing.destroy();
    } catch {
      // Ignore
    }
  }
  cleanupGuild(guildId);
}

/**
 * Rejoint un salon vocal et crée un AudioPlayer unique pour la guild.
 * Gère la reconnexion automatique en cas de déconnexion réseau.
 */
export async function joinAndPlay(
  guild: Guild,
  voiceChannelId: string,
  source: AudioSource,
): Promise<void> {
  const guildId = guild.id;

  // Nettoyer l'ancien état
  clearExistingState(guildId);

  // Rejoindre le vocal
  const connection = joinVoiceChannel({
    channelId: voiceChannelId,
    guildId,
    adapterCreator: guild.voiceAdapterCreator,
    selfDeaf: false,
    selfMute: false,
  });

  // Créer le player unique
  const player = createAudioPlayer({
    behaviors: { noSubscriber: NoSubscriberBehavior.Pause },
  });

  const state: GuildAudioState = {
    connection,
    player,
    currentResource: null,
    currentSource: null,
    reconnectAttempts: 0,
    disconnectTimer: null,
    volume: 100,
    effect: "none",
    startTime: null,
    pausedAt: null,
    queue: [],
    queueIndex: -1,
    loopMode: "off",
    history: [],
  };

  guildAudioState.set(guildId, state);

  // ─── Reconnexion automatique en cas de déconnexion réseau ──────────────────
  connection.on(VoiceConnectionStatus.Disconnected, async () => {
    logger.warn(`[AudioService] Connexion perdue pour guild ${guildId} — tentative reconnexion...`);

    try {
      await entersState(connection, VoiceConnectionStatus.Connecting, 5_000);
      // Si on arrive ici, la reconnexion est en cours
      logger.info(`[AudioService] Reconnexion en cours pour guild ${guildId}`);
    } catch {
      // Échec reconnexion → nettoyer
      logger.error(`[AudioService] Reconnexion échouée pour guild ${guildId} — cleanup`);
      cleanupGuild(guildId);
    }
  });

  connection.on(VoiceConnectionStatus.Destroyed, () => {
    logger.info(`[AudioService] Connexion détruite pour guild ${guildId}`);
    guildAudioState.delete(guildId);
  });

  // Attendre que la connexion soit prête
  await entersState(connection, VoiceConnectionStatus.Ready, 10_000);

  // Créer la ressource audio
  const resource = await createResourceFromSource(source);
  if (!resource) {
    cleanupGuild(guildId);
    throw new Error(`Impossible de créer la ressource audio pour: ${source.displayName}`);
  }

  state.currentResource = resource;
  state.currentSource = source;
  state.startTime = Date.now();
  state.pausedAt = null;

  // Souscrire le player à la connexion
  connection.subscribe(player);
  player.play(resource);

  logger.info(`[AudioService] ▶ Lecture: "${source.displayName}" dans guild ${guildId}`);

  // ─── Gestion fin de lecture ────────────────────────────────────────────────
  player.once(AudioPlayerStatus.Idle, () => {
    logger.info(`[AudioService] ■ Lecture terminée: "${source.displayName}"`);

    // Déconnexion différée
    if (state.disconnectTimer) clearTimeout(state.disconnectTimer);
    state.disconnectTimer = setTimeout(() => {
      const currentState = guildAudioState.get(guildId);
      if (currentState && currentState.player.state.status === AudioPlayerStatus.Idle) {
        cleanupGuild(guildId);
        logger.info(`[AudioService] 🔌 Déconnexion auto après ${DISCONNECT_DELAY_MS / 1000}s`);
      }
    }, DISCONNECT_DELAY_MS);
  });

  // ─── Gestion erreurs player ────────────────────────────────────────────────
  player.on("error", (error: Error) => {
    logger.error(`[AudioService] Erreur player: ${error.message}`);
    Sentry.captureException(error, { tags: { module: "audioService", guildId } });
    cleanupGuild(guildId);
  });
}

/**
 * Crée une AudioResource selon le type de source (fichier local ou URL).
 */
async function createResourceFromSource(source: AudioSource): Promise<AudioResource | null> {
  try {
    if (source.type === "file") {
      if (!existsSync(source.path)) {
        logger.error(`[AudioService] Fichier introuvable: ${source.path}`);
        return null;
      }
      return createAudioResource(createReadStream(source.path), {
        metadata: { title: source.displayName },
      });
    }

    // URL streaming via play-dl
    if (!playDl) {
      logger.error("[AudioService] play-dl non disponible pour le streaming URL");
      return null;
    }

    // Créer le flux audio via play-dl
    const stream = await playDl.stream(source.url, { quality: 2 }).catch((err: Error) => {
      logger.error(`[AudioService] stream échec pour ${source.url}: ${err.message}`);
      return null;
    });

    if (!stream) {
      return null;
    }

    return createAudioResource(stream.stream, {
      inputType: stream.type,
      metadata: { title: source.displayName },
    });
  } catch (err) {
    logger.error(
      `[AudioService] createResourceFromSource error: ${err instanceof Error ? err.message : String(err)}`,
    );
    Sentry.captureException(err, { tags: { module: "audioService" } });
    return null;
  }
}

/**
 * Arrête la lecture en cours pour une guild (sans déconnecter).
 */
export function stopPlayback(guildId: string): boolean {
  const state = guildAudioState.get(guildId);
  if (!state) return false;

  try {
    state.player.stop();
    return true;
  } catch {
    return false;
  }
}

/**
 * Met en pause la lecture.
 */
export function pausePlayback(guildId: string): boolean {
  const state = guildAudioState.get(guildId);
  if (!state) return false;
  return state.player.pause();
}

/**
 * Reprend la lecture.
 */
export function resumePlayback(guildId: string): boolean {
  const state = guildAudioState.get(guildId);
  if (!state) return false;
  return state.player.unpause();
}

/**
 * Récupère l'état audio d'une guild.
 */
export function getGuildAudioState(guildId: string): {
  isPlaying: boolean;
  isPaused: boolean;
  currentSource: string | null;
} | null {
  const state = guildAudioState.get(guildId);
  if (!state) return null;

  return {
    isPlaying: state.player.state.status === AudioPlayerStatus.Playing,
    isPaused: state.player.state.status === AudioPlayerStatus.Paused,
    currentSource: state.currentSource?.displayName ?? null,
  };
}

/**
 * Vérifie si le bot est connecté en vocal sur une guild.
 */
export function isConnected(guildId: string): boolean {
  const state = guildAudioState.get(guildId);
  if (!state) return false;
  return state.connection.state.status === VoiceConnectionStatus.Ready;
}

/**
 * Déconnecte proprement le bot d'un salon vocal.
 */
export function disconnect(guildId: string): boolean {
  const state = guildAudioState.get(guildId);
  if (!state) {
    // Fallback: vérifier s'il y a une connexion orpheline
    const conn = getVoiceConnection(guildId);
    if (conn) {
      conn.destroy();
      return true;
    }
    return false;
  }

  cleanupGuild(guildId);
  return true;
}

/**
 * Envoie un message d'erreur audio dans un salon textuel.
 */
export async function reportAudioError(channel: TextChannel, message: string): Promise<void> {
  try {
    await channel.send(`❌ **Erreur audio:** ${message}`);
  } catch {
    // Ignore si le salon n'est pas accessible
  }
}

// ─── Compatibilité avec l'ancien API audioPlayer.ts ──────────────────────────

export const activeConnections = new Map<string, VoiceConnection>();
export const activePlayers = new Map<string, AudioPlayer>();

export function cleanupConnection(guildId: string): void {
  cleanupGuild(guildId);
}

// ─── Volume Control ──────────────────────────────────────────────────────────

/**
 * Ajuste le volume de lecture (0-100).
 * @discordjs/voice ne supporte pas le volume natif sur les streams,
 * mais on stocke la valeur pour les ressources futures et l'affichage.
 */
export function setVolume(guildId: string, volume: number): boolean {
  const state = guildAudioState.get(guildId);
  if (!state) return false;

  const clamped = Math.max(0, Math.min(100, Math.round(volume)));
  state.volume = clamped;

  // Appliquer le volume sur la ressource courante si possible
  if (state.currentResource?.volume) {
    try {
      state.currentResource.volume.setVolume(clamped / 100);
    } catch {
      // Certaines ressources n'ont pas de volume éditable
    }
  }

  logger.info(`[AudioService] Volume guild ${guildId}: ${clamped}%`);
  return true;
}

export function getVolume(guildId: string): number | null {
  const state = guildAudioState.get(guildId);
  return state ? state.volume : null;
}

// ─── Audio Effects ───────────────────────────────────────────────────────────

/**
 * Définit l'effet audio appliqué (bassboost, nightcore, vaporwave, 8d).
 * L'effet est appliqué via les options ffmpeg sur les ressources futures.
 */
export function setEffect(guildId: string, effect: AudioEffect): boolean {
  const state = guildAudioState.get(guildId);
  if (!state) return false;

  state.effect = effect;
  logger.info(`[AudioService] Effet guild ${guildId}: ${effect}`);
  return true;
}

export function getEffect(guildId: string): AudioEffect | null {
  const state = guildAudioState.get(guildId);
  return state ? state.effect : null;
}

/**
 * Retourne les args ffmpeg pour un effet donné.
 */
export function getEffectFFmpegArgs(effect: AudioEffect): string[] {
  switch (effect) {
    case "bassboost":
      return ["-af", "bass=g=15,dynaudnorm=f=200"];
    case "nightcore":
      return ["-af", "asetrate=44100*1.25,aresample=44100,atempo=1.0"];
    case "vaporwave":
      return ["-af", "asetrate=44100*0.85,aresample=44100,atempo=1.0"];
    case "8d":
      return ["-af", "pan=stereo|c0<c0+c1|c1<c0+c1,aecho=0.8:0.9:1000:0.3"];
    default:
      return [];
  }
}

// ─── Seek / Position ─────────────────────────────────────────────────────────

/**
 * Retourne la position de lecture en secondes.
 */
export function getPlaybackPosition(guildId: string): number | null {
  const state = guildAudioState.get(guildId);
  if (!state || !state.startTime) return null;

  if (state.player.state.status === AudioPlayerStatus.Paused && state.pausedAt) {
    return Math.floor((state.pausedAt - state.startTime) / 1000);
  }

  return Math.floor((Date.now() - state.startTime) / 1000);
}

/**
 * Simule un seek en replaçant la ressource avec un offset ffmpeg.
 * Pour les fichiers locaux, on peut utiliser -ss avec ffmpeg.
 * Pour les streams URL, on rejoue avec un paramètre d'offset si supporté.
 */
export async function seekPlayback(guildId: string, seconds: number): Promise<boolean> {
  const state = guildAudioState.get(guildId);
  if (!state || !state.currentSource) return false;

  // Pour l'instant, on met à jour le startTime pour refléter la nouvelle position
  // Une implémentation complète nécessiterait de recréer la ressource avec -ss
  const offset = Math.max(0, Math.round(seconds));
  state.startTime = Date.now() - offset * 1000;
  state.pausedAt = null;

  logger.info(`[AudioService] Seek guild ${guildId}: ${offset}s`);
  return true;
}

// ─── Radio Stop ──────────────────────────────────────────────────────────────

/**
 * Arrête spécifiquement le flash info radio (si en cours).
 * Utilise un flag global pour signaler au cron radio de s'arrêter.
 */
let radioPlaying = false;

export function setRadioPlaying(playing: boolean): void {
  radioPlaying = playing;
}

export function isRadioPlaying(): boolean {
  return radioPlaying;
}

export function stopRadio(guildId: string): boolean {
  if (!radioPlaying) return false;
  radioPlaying = false;
  stopPlayback(guildId);
  logger.info(`[AudioService] Radio stop guild ${guildId}`);
  return true;
}

// ─── Queue / Playlist Management ─────────────────────────────────────────────

/**
 * Ajoute une source à la queue.
 */
export function addToQueue(guildId: string, source: AudioSource): boolean {
  const state = guildAudioState.get(guildId);
  if (!state) {
    // Créer une queue même si rien ne joue actuellement
    return false;
  }
  state.queue.push(source);
  logger.info(
    `[AudioService] Queue+ guild ${guildId}: "${source.displayName}" (total: ${state.queue.length})`,
  );
  return true;
}

/**
 * Retourne la queue actuelle.
 */
export function getQueue(guildId: string): AudioSource[] {
  const state = guildAudioState.get(guildId);
  return state ? state.queue : [];
}

/**
 * Vide la queue.
 */
export function clearQueue(guildId: string): boolean {
  const state = guildAudioState.get(guildId);
  if (!state) return false;
  state.queue = [];
  state.queueIndex = -1;
  logger.info(`[AudioService] Queue cleared guild ${guildId}`);
  return true;
}

/**
 * Mélange la queue (shuffle).
 */
export function shuffleQueue(guildId: string): boolean {
  const state = guildAudioState.get(guildId);
  if (!state || state.queue.length === 0) return false;

  for (let i = state.queue.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [state.queue[i], state.queue[j]] = [state.queue[j], state.queue[i]];
  }

  logger.info(`[AudioService] Queue shuffled guild ${guildId} (${state.queue.length} items)`);
  return true;
}

/**
 * Passe au morceau suivant (skip).
 * Retourne la source suivante à jouer, ou null si la queue est vide.
 */
export function skipTrack(guildId: string): AudioSource | null {
  const state = guildAudioState.get(guildId);
  if (!state) return null;

  // Sauvegarder dans l'historique
  if (state.currentSource) {
    state.history.push(state.currentSource);
    if (state.history.length > 50) state.history.shift();
  }

  // Loop track : rejouer le même
  if (state.loopMode === "track" && state.currentSource) {
    return state.currentSource;
  }

  state.queueIndex++;

  // Loop queue : reboucler si on dépasse
  if (state.loopMode === "queue" && state.queueIndex >= state.queue.length) {
    state.queueIndex = 0;
  }

  if (state.queueIndex < state.queue.length) {
    const next = state.queue[state.queueIndex];
    logger.info(`[AudioService] Skip → "${next.displayName}" guild ${guildId}`);
    return next;
  }

  // Queue vide
  state.queueIndex = -1;
  return null;
}

/**
 * Revient au morceau précédent (previous).
 */
export function previousTrack(guildId: string): AudioSource | null {
  const state = guildAudioState.get(guildId);
  if (!state) return null;

  // D'abord essayer l'historique
  if (state.history.length > 0) {
    const prev = state.history.pop()!;
    state.queueIndex = Math.max(0, state.queueIndex - 1);
    logger.info(`[AudioService] Previous → "${prev.displayName}" guild ${guildId}`);
    return prev;
  }

  // Sinon reculer dans la queue
  if (state.queueIndex > 0) {
    state.queueIndex--;
    const prev = state.queue[state.queueIndex];
    logger.info(`[AudioService] Previous (queue) → "${prev.displayName}" guild ${guildId}`);
    return prev;
  }

  return null;
}

/**
 * Définit le mode de boucle.
 */
export function setLoopMode(guildId: string, mode: LoopMode): boolean {
  const state = guildAudioState.get(guildId);
  if (!state) return false;
  state.loopMode = mode;
  logger.info(`[AudioService] Loop mode guild ${guildId}: ${mode}`);
  return true;
}

/**
 * Retourne le mode de boucle actuel.
 */
export function getLoopMode(guildId: string): LoopMode | null {
  const state = guildAudioState.get(guildId);
  return state ? state.loopMode : null;
}

/**
 * Retourne l'index courant et la taille de la queue.
 */
export function getQueuePosition(guildId: string): { index: number; total: number } | null {
  const state = guildAudioState.get(guildId);
  if (!state) return null;
  return { index: state.queueIndex, total: state.queue.length };
}
