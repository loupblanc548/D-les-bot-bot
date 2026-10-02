/**
 * Reconnaissance d'un extrait : empreinte locale, puis catalogue AudD
 * (le catalogue commercial, comme le fait Shazam avec le sien).
 */

import logger from "../utils/logger.js";
import { checkUrlForSsrf } from "../utils/ssrfGuard.js";

export interface IdentifiedSong {
  title: string;
  artist: string;
  album: string;
  timecode: string;
  link: string;
}

interface AuddResult {
  artist?: string;
  title?: string;
  album?: string;
  timecode?: string;
  song_link?: string;
}

export async function identifySongFromUrl(audioUrl: string): Promise<IdentifiedSong> {
  const guard = await checkUrlForSsrf(audioUrl, "identify_song");
  if (!guard.allowed) {
    throw new Error("Lien audio refusé");
  }

  const token = process.env.AUDD_API_TOKEN?.trim();
  if (!token) {
    throw new Error(
      "Reconnaissance de chanson pas configurée. Il manque AUDD_API_TOKEN pour interroger le catalogue.",
    );
  }

  const body = new URLSearchParams({
    api_token: token,
    url: audioUrl,
    return: "apple_music,spotify",
  });
  const response = await fetch("https://api.audd.io/", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body,
    signal: AbortSignal.timeout(20_000),
  });
  if (!response.ok) {
    throw new Error(`Catalogue musical injoignable (HTTP ${response.status})`);
  }

  const payload = (await response.json()) as {
    status?: string;
    result?: AuddResult | null;
    error?: { error_message?: string };
  };
  if (payload.status !== "success") {
    logger.warn(`[SongIdentify] AudD: ${payload.error?.error_message ?? "échec"}`);
    throw new Error("Le catalogue n'a pas pu analyser cet extrait");
  }
  if (!payload.result?.title) {
    throw new Error("Aucune chanson reconnue dans cet extrait");
  }

  return {
    title: payload.result.title,
    artist: payload.result.artist || "artiste inconnu",
    album: payload.result.album || "",
    timecode: payload.result.timecode || "",
    link: payload.result.song_link || "",
  };
}
