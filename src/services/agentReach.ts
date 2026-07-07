import axios from "axios";
import logger from "../utils/logger.js";

const JINA_READER_BASE = "https://r.jina.ai";
const EXA_SEARCH_BASE = "https://api.exa.ai/search";

export interface WebContent {
  url: string; title: string; content: string; links: string[];
}

export async function readUrlViaJina(url: string): Promise<WebContent | null> {
  try {
    const res = await axios.get(`${JINA_READER_BASE}/${url}`, {
      headers: { "Accept": "application/json", "X-Return-Format": "markdown" },
      timeout: 15000,
    });
    const d = res.data;
    return {
      url: String(d?.url || url),
      title: String(d?.data?.title || d?.title || ""),
      content: String(d?.data?.content || d?.content || "").slice(0, 8000),
      links: Array.isArray(d?.data?.links) ? d.data.links.map((l: Record<string, unknown>) => String(l.url || l)) : [],
    };
  } catch (err) { logger.error(`[AgentReach] Jina read: ${err instanceof Error ? err.message : String(err)}`); return null; }
}

export interface YouTubeTranscript {
  videoId: string; title: string; transcript: string; duration: string; channel: string;
}

export async function getYouTubeTranscript(videoIdOrUrl: string): Promise<YouTubeTranscript | null> {
  const videoId = extractYouTubeId(videoIdOrUrl);
  if (!videoId) return null;
  try {
    const res = await axios.get(`${JINA_READER_BASE}/https://www.youtube.com/watch?v=${videoId}`, {
      headers: { "Accept": "application/json" },
      timeout: 15000,
    });
    const d = res.data;
    const content = String(d?.data?.content || d?.content || "");
    return {
      videoId,
      title: String(d?.data?.title || ""),
      transcript: content.slice(0, 8000),
      duration: String(d?.data?.duration || ""),
      channel: String(d?.data?.channel || ""),
    };
  } catch (err) { logger.error(`[AgentReach] YT transcript: ${err instanceof Error ? err.message : String(err)}`); return null; }
}

export interface ExaSearchResult {
  title: string; url: string; snippet: string; score: number;
}

export async function exaSearch(query: string, numResults = 5): Promise<ExaSearchResult[]> {
  try {
    const res = await axios.post(EXA_SEARCH_BASE, {
      query, numResults: Math.min(numResults, 10), type: "neural",
      contents: { text: { maxCharacters: 500 } },
    }, { timeout: 12000 });
    return (res.data?.results || []).map((r: Record<string, unknown>) => ({
      title: String(r.title || ""), url: String(r.url || ""),
      snippet: String(r.text || "").slice(0, 300), score: Number(r.score || 0),
    }));
  } catch (err) { logger.error(`[AgentReach] Exa search: ${err instanceof Error ? err.message : String(err)}`); return []; }
}

export interface BilibiliSearchResult {
  title: string; bvid: string; url: string; up: string; playCount: number; description: string;
}

export async function searchBilibili(keyword: string, limit = 5): Promise<BilibiliSearchResult[]> {
  try {
    const res = await axios.get("https://api.bilibili.com/x/web-interface/search/type", {
      params: { search_type: "video", keyword, page_size: Math.min(limit, 10), page: 1 },
      headers: { "User-Agent": "Mozilla/5.0" },
      timeout: 10000,
    });
    return (res.data?.data?.result || []).slice(0, limit).map((v: Record<string, unknown>) => ({
      title: String(v.title || "").replace(/<[^>]*>/g, ""),
      bvid: String(v.bvid || ""),
      url: `https://www.bilibili.com/video/${String(v.bvid || "")}`,
      up: String(v.author || ""),
      playCount: Number(v.play || 0),
      description: String(v.description || "").slice(0, 200),
    }));
  } catch (err) { logger.error(`[AgentReach] Bilibili search: ${err instanceof Error ? err.message : String(err)}`); return []; }
}

export async function readRedditViaJina(subreddit: string, sort = "hot"): Promise<{ title: string; content: string } | null> {
  const url = `https://www.reddit.com/r/${subreddit}/${sort}/`;
  const result = await readUrlViaJina(url);
  if (!result) return null;
  return { title: result.title, content: result.content.slice(0, 6000) };
}

export async function readTwitterViaJina(username: string): Promise<{ title: string; content: string } | null> {
  const url = `https://x.com/${username}`;
  const result = await readUrlViaJina(url);
  if (!result) return null;
  return { title: result.title, content: result.content.slice(0, 6000) };
}

function extractYouTubeId(input: string): string | null {
  if (/^[\w-]{11}$/.test(input)) return input;
  const match = input.match(/(?:v=|youtu\.be\/|embed\/|shorts\/)([\w-]{11})/);
  return match ? match[1] : null;
}
