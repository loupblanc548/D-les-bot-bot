/**
 * musicService.ts — Service musique basé sur DisTube v5
 *
 * Supporte YouTube, Spotify, SoundCloud, Deezer et 700+ sites.
 * Gratuit, sans clé API.
 */

import { Client } from "discord.js";
import { DisTube, Queue, Song, Events } from "distube";
import logger from "../utils/logger.js";

let distube: DisTube | null = null;

export function initDisTube(client: Client): DisTube {
  if (distube) return distube;

  distube = new DisTube(client, {
    emitNewSongOnly: true,
    savePreviousSongs: true,
  });

  distube
    .on(Events.PLAY_SONG, (queue: Queue, song: Song) => {
      logger.info(`[DisTube] Playing: ${song.name} in ${queue.voiceChannel?.name}`);
    })
    .on(Events.ADD_SONG, (queue: Queue, song: Song) => {
      logger.info(`[DisTube] Added: ${song.name} to queue (${queue.songs.length} songs)`);
    })
    .on(Events.ERROR, (error: Error, queue: Queue) => {
      logger.error(`[DisTube] Error in ${queue?.voiceChannel?.name}:`, error);
    })
    .on(Events.DISCONNECT, (queue: Queue) => {
      logger.info(`[DisTube] Disconnected from ${queue.voiceChannel?.name}`);
    })
    .on(Events.FINISH, (queue: Queue) => {
      logger.info(`[DisTube] Queue finished in ${queue.voiceChannel?.name}`);
    });

  return distube;
}

export function getDisTube(): DisTube | null {
  return distube;
}

export function formatQueue(queue: Queue): string {
  const songs = queue.songs.slice(0, 15);
  const lines = songs.map((song, i) => {
    const marker = i === 0 ? "▶️" : `**${i}.**`;
    const duration = song.formattedDuration || "LIVE";
    return `${marker} [${song.name}](${song.url}) — \`${duration}\``;
  });

  if (queue.songs.length > 15) {
    lines.push(`... et ${queue.songs.length - 15} autre(s)`);
  }

  return lines.join("\n") || "File d'attente vide";
}

export function formatSong(song: Song): string {
  const duration = song.formattedDuration || "LIVE";
  return `[${song.name}](${song.url}) — \`${duration}\``;
}
