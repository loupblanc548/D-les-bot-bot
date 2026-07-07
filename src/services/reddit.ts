import axios from "axios";
import logger from "../utils/logger.js";

const REDDIT_BASE = "https://www.reddit.com";

export interface RedditPost {
  id: string; title: string; author: string; subreddit: string; score: number;
  numComments: number; url: string; permalink: string; createdUtc: string; isVideo: boolean; isSelf: boolean; selftext: string;
}

export async function getSubredditPosts(subreddit: string, sort: "hot" | "new" | "top" | "rising" = "hot", limit = 5): Promise<RedditPost[]> {
  try {
    const res = await axios.get(`${REDDIT_BASE}/r/${subreddit}/${sort}.json`, {
      params: { limit: Math.min(limit, 100), raw_json: 1 },
      headers: { "User-Agent": "DiscordBot/1.0" },
      timeout: 10000,
    });
    return (res.data?.data?.children || []).map((c: Record<string, unknown>) => {
      const d = c.data as Record<string, unknown>;
      return {
        id: String(d.id || ""), title: String(d.title || ""), author: String(d.author || ""),
        subreddit: String(d.subreddit || subreddit), score: Number(d.score || 0),
        numComments: Number(d.num_comments || 0), url: String(d.url || ""),
        permalink: `https://reddit.com${String(d.permalink || "")}`,
        createdUtc: new Date(Number(d.created_utc || 0) * 1000).toISOString(),
        isVideo: Boolean(d.is_video), isSelf: Boolean(d.is_self), selftext: String(d.selftext || "").slice(0, 1000),
      };
    });
  } catch (err) { logger.error(`[Reddit] getSubredditPosts: ${err instanceof Error ? err.message : String(err)}`); return []; }
}

export async function searchReddit(query: string, limit = 5, sort: "relevance" | "new" | "top" = "relevance"): Promise<RedditPost[]> {
  try {
    const res = await axios.get(`${REDDIT_BASE}/search.json`, {
      params: { q: query, limit: Math.min(limit, 100), sort, raw_json: 1 },
      headers: { "User-Agent": "DiscordBot/1.0" },
      timeout: 10000,
    });
    return (res.data?.data?.children || []).map((c: Record<string, unknown>) => {
      const d = c.data as Record<string, unknown>;
      return {
        id: String(d.id || ""), title: String(d.title || ""), author: String(d.author || ""),
        subreddit: String(d.subreddit || ""), score: Number(d.score || 0),
        numComments: Number(d.num_comments || 0), url: String(d.url || ""),
        permalink: `https://reddit.com${String(d.permalink || "")}`,
        createdUtc: new Date(Number(d.created_utc || 0) * 1000).toISOString(),
        isVideo: Boolean(d.is_video), isSelf: Boolean(d.is_self), selftext: String(d.selftext || "").slice(0, 1000),
      };
    });
  } catch (err) { logger.error(`[Reddit] searchReddit: ${err instanceof Error ? err.message : String(err)}`); return []; }
}

export async function getTrendingSubreddits(): Promise<{ name: string; subscribers: number; description: string }[]> {
  try {
    const res = await axios.get(`${REDDIT_BASE}/subreddits/popular.json`, {
      params: { limit: 10, raw_json: 1 },
      headers: { "User-Agent": "DiscordBot/1.0" },
      timeout: 10000,
    });
    return (res.data?.data?.children || []).map((c: Record<string, unknown>) => {
      const d = c.data as Record<string, unknown>;
      return { name: String(d.display_name || ""), subscribers: Number(d.subscribers || 0), description: String(d.public_description || "").slice(0, 300) };
    });
  } catch { return []; }
}
