import axios from "axios";
import logger from "../utils/logger.js";

const VALORANT_API_KEY = process.env.VALORANT_API_KEY || "";
const BASE_URL = "https://api.henrikdev.xyz/valorant";

export const VALORANT_STANDBY = true;

export interface ValorantPlayer {
  puuid: string; gameName: string; tagLine: string; region: string; accountLevel: number;
}

export async function getPlayer(name: string, tag: string, region = "eu"): Promise<ValorantPlayer | null> {
  try {
    const res = await axios.get(`${BASE_URL}/v1/account/${name}/${tag}`, {
      headers: VALORANT_API_KEY ? { Authorization: VALORANT_API_KEY } : {}, timeout: 10000,
    });
    const d = res.data?.data; if (!d) return null;
    return { puuid: String(d.puuid || ""), gameName: String(d.name || name), tagLine: String(d.tag || tag), region: String(d.region || region), accountLevel: Number(d.account_level || 0) };
  } catch (err) { logger.error(`[Valorant] getPlayer error: ${err instanceof Error ? err.message : String(err)}`); return null; }
}

export interface ValorantRank { rank: string; tier: number; rr: number; }

export async function getPlayerRank(name: string, tag: string, region = "eu"): Promise<ValorantRank | null> {
  try {
    const res = await axios.get(`${BASE_URL}/v2/mmr/${region}/${name}/${tag}`, {
      headers: VALORANT_API_KEY ? { Authorization: VALORANT_API_KEY } : {}, timeout: 10000,
    });
    const d = res.data?.data?.current_data; if (!d) return null;
    return { rank: String(d.currenttierpatched || "Unranked"), tier: Number(d.currenttier || 0), rr: Number(d.ranking_in_tier || 0) };
  } catch (err) { logger.error(`[Valorant] getPlayerRank error: ${err instanceof Error ? err.message : String(err)}`); return null; }
}

export async function getMatchHistory(name: string, tag: string, region = "eu", count = 5): Promise<Record<string, unknown>[]> {
  try {
    const res = await axios.get(`${BASE_URL}/v3/matches/${region}/${name}/${tag}`, {
      headers: VALORANT_API_KEY ? { Authorization: VALORANT_API_KEY } : {}, params: { size: count }, timeout: 15000,
    });
    return (res.data?.data || []).slice(0, count);
  } catch (err) { logger.error(`[Valorant] getMatchHistory error: ${err instanceof Error ? err.message : String(err)}`); return []; }
}

export async function getServerStatus(region = "eu"): Promise<{ name: string; incidents: unknown[]; maintenances: unknown[] }> {
  try {
    const res = await axios.get(`${BASE_URL}/v1/status/${region}`, { timeout: 10000 });
    return { name: String(res.data?.data?.name || region), incidents: res.data?.data?.incidents || [], maintenances: res.data?.data?.maintenances || [] };
  } catch (err) { logger.error(`[Valorant] getServerStatus error: ${err instanceof Error ? err.message : String(err)}`); return { name: region, incidents: [], maintenances: [] }; }
}

export function isValorantConfigured(): boolean { return VALORANT_API_KEY.length > 0; }
