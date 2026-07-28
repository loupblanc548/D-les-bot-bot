/**
 * gamingToolkit.ts — Gaming & Entertainment utilities
 * Called by Quant (the AI brain) via tool handlers in agentToolsExtended.ts
 */

import https from "https";

function fetchJson(url: string, timeout = 10000): Promise<any> {
  return new Promise((resolve, reject) => {
    const req = https.get(url, { timeout, headers: { "User-Agent": "QuantBot/1.0" } }, (res) => {
      let data = "";
      res.on("data", (c) => (data += c));
      res.on("end", () => {
        try {
          resolve(JSON.parse(data));
        } catch {
          resolve(data);
        }
      });
    });
    req.on("error", reject);
    req.on("timeout", () => {
      req.destroy();
      reject(new Error("Timeout"));
    });
  });
}

// ─── Riot account lookup ────────────────────────────────────────────────────
export async function riotAccountLookup(gameName: string, tagLine: string): Promise<string> {
  return `Riot Account lookup for ${gameName}#${tagLine}:\n  - Requires Riot API key (RIOT_API_KEY env var)\n  - API: https://asia.api.riotgames.com/riot/account/v1/accounts/by-riot-id/${gameName}/${tagLine}`;
}

// ─── LoL match history ──────────────────────────────────────────────────────
export async function lolMatchHistory(summonerName: string): Promise<string> {
  return `LoL match history for ${summonerName}:\n  - Requires Riot API key\n  - Region-specific endpoint needed\n  - API: https://{region}.api.riotgames.com/lol/match/v5/matches/by-puuid/{puuid}/ids`;
}

// ─── LoL rank check ─────────────────────────────────────────────────────────
export async function lolRankCheck(summonerName: string, region: string): Promise<string> {
  return `LoL rank check for ${summonerName} (${region || "euw1"}):\n  - Requires Riot API key\n  - API: https://${region || "euw1"}.api.riotgames.com/lol/league/v4/entries/by-summoner/{summonerId}`;
}

// ─── CSGO/CS2 stats fetch ───────────────────────────────────────────────────
export async function csgoStatsFetch(steamId: string): Promise<string> {
  return `CSGO/CS2 stats for Steam ID ${steamId}:\n  - Requires Steam API key (STEAM_API_KEY)\n  - API: https://api.steampowered.com/ISteamUserStats/GetUserStatsForGame/v2/?appid=730&key={KEY}&steamid=${steamId}`;
}

// ─── Apex Legends stats ─────────────────────────────────────────────────────
export async function apexLegendsStats(playerName: string, platform: string): Promise<string> {
  return `Apex Legends stats for ${playerName} (${platform || "PC"}):\n  - Requires Apex API key from https://apex.tracker.gg\n  - API: https://public-api.tracker.gg/v2/apex/standard/profile/${platform || "5"}/${playerName}`;
}

// ─── Rocket League stats ────────────────────────────────────────────────────
export async function rocketLeagueStats(playerName: string, platform: string): Promise<string> {
  return `Rocket League stats for ${playerName} (${platform || "steam"}):\n  - Requires Tracker.gg API key\n  - API: https://api.tracker.gg/api/v2/rocket-league/standard/profile/${platform || "steam"}/${playerName}`;
}

// ─── Osu! user stats ────────────────────────────────────────────────────────
export async function osuUserStats(username: string): Promise<string> {
  try {
    const data = await fetchJson(
      `https://osu.ppy.sh/api/get_user?k=${process.env.OSU_API_KEY || "REQUIRED"}&u=${encodeURIComponent(username)}`,
    );
    if (!Array.isArray(data) || !data[0]) return "User not found or OSU_API_KEY not set";
    const u = data[0];
    return JSON.stringify(
      {
        username: u.username,
        level: u.level,
        pp: u.pp_raw,
        rank: u.pp_rank,
        country: u.country,
        accuracy: u.accuracy,
        playCount: u.playcount,
      },
      null,
      2,
    );
  } catch (err) {
    return `Error: ${(err as Error).message}`;
  }
}

// ─── Minecraft server status ────────────────────────────────────────────────
export async function minecraftServerStatus(host: string, port: number): Promise<string> {
  try {
    const data = await fetchJson(`https://api.mcsrvstat.us/2/${host}:${port || 25565}`);
    return JSON.stringify(
      {
        online: data.online,
        motd: data.motd?.clean?.join("\n"),
        players: { online: data.players?.online, max: data.players?.max },
        version: data.version,
        icon: data.icon ? "Available" : "None",
      },
      null,
      2,
    );
  } catch (err) {
    return `Error: ${(err as Error).message}`;
  }
}

// ─── Fortnite item shop ─────────────────────────────────────────────────────
export async function fortniteItemShop(): Promise<string> {
  try {
    const data = await fetchJson("https://fortnite-api.com/v2/shop/br");
    if (!data?.data) return "Could not fetch item shop";
    const items = (data.data.daily?.entries || [])
      .concat(data.data.featured?.entries || [])
      .slice(0, 20);
    return JSON.stringify(
      items.map((e: any) => ({
        name: e.items?.[0]?.name,
        type: e.items?.[0]?.type?.name,
        price: e.finalPrice,
        rarity: e.items?.[0]?.rarity?.name,
      })),
      null,
      2,
    );
  } catch (err) {
    return `Error: ${(err as Error).message}`;
  }
}

// ─── Epic Games free games ──────────────────────────────────────────────────
export async function epicGamesFreeGames(): Promise<string> {
  try {
    const data = await fetchJson(
      "https://store-site-backend-static.ak.epicgames.com/freeGamesPromotions?locale=fr&country=FR&allowCountries=FR",
    );
    if (!data?.data?.Catalog?.searchStore?.elements) return "Could not fetch free games";
    const now = new Date();
    const free = data.data.Catalog.searchStore.elements.filter((e: any) => {
      const promo = e.promotions?.promotionalOffers?.[0]?.promotionalOffers?.[0];
      if (!promo) return false;
      const start = new Date(promo.startDate);
      const end = new Date(promo.endDate);
      return now >= start && now <= end;
    });
    return JSON.stringify(
      free.map((e: any) => ({
        title: e.title,
        description: e.description?.slice(0, 100),
        publisher: e.publisher,
        originalPrice: e.price?.totalPrice?.fmtPrice?.originalPrice,
      })),
      null,
      2,
    );
  } catch (err) {
    return `Error: ${(err as Error).message}`;
  }
}

// ─── Twitch stream check ────────────────────────────────────────────────────
export async function twitchStreamCheck(streamerName: string): Promise<string> {
  return `Twitch stream check for ${streamerName}:\n  - Requires Twitch API client ID + access token\n  - API: https://api.twitch.tv/helix/streams?user_login=${streamerName}\n  - Alternative: https://twitch.tv/${streamerName}`;
}

// ─── Twitch clip create ─────────────────────────────────────────────────────
export async function twitchClipCreate(broadcasterId: string): Promise<string> {
  return `Twitch clip creation for broadcaster ${broadcasterId}:\n  - Requires Twitch OAuth token with clips:edit scope\n  - POST https://api.twitch.tv/helix/clips?broadcaster_id=${broadcasterId}`;
}

// ─── Spotify track search ───────────────────────────────────────────────────
export async function spotifyTrackSearch(query: string): Promise<string> {
  return `Spotify search for "${query}":\n  - Requires Spotify API token\n  - API: https://api.spotify.com/v1/search?q=${encodeURIComponent(query)}&type=track&limit=10`;
}

// ─── Spotify playlist analyze ───────────────────────────────────────────────
export async function spotifyPlaylistAnalyze(playlistId: string): Promise<string> {
  return `Spotify playlist analysis for ${playlistId}:\n  - Requires Spotify API token\n  - API: https://api.spotify.com/v1/playlists/${playlistId}/tracks\n  - Audio features: https://api.spotify.com/v1/audio-features?ids={trackIds}`;
}

// ─── BoardGameGeek search ───────────────────────────────────────────────────
export async function boardgameGeekSearch(query: string): Promise<string> {
  try {
    const data = await fetchJson(
      `https://boardgamegeek.com/xmlapi2/search?search=${encodeURIComponent(query)}&type=boardgame`,
    );
    return `BoardGameGeek search results:\n${data.slice(0, 500)}\n\nFull XML response available. Use readUrl for details.`;
  } catch (err) {
    return `Error: ${(err as Error).message}`;
  }
}
