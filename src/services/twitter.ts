import axios from "axios";
import logger from "../utils/logger.js";

const TWITTER_BEARER_TOKEN = process.env.TWITTER_BEARER_TOKEN || "";

export interface TwitterUser {
  id: string; username: string; name: string; description: string;
  followers: number; following: number; tweets: number; verified: boolean;
  profileImageUrl: string; createdAt: string;
}

export interface TwitterTweet {
  id: string; text: string; authorId: string; createdAt: string;
  likes: number; retweets: number; replies: number; quotes: number;
}

export function isTwitterConfigured(): boolean { return TWITTER_BEARER_TOKEN.length > 0; }

export async function getUser(username: string): Promise<TwitterUser | null> {
  if (!TWITTER_BEARER_TOKEN) return null;
  try {
    const res = await axios.get("https://api.twitter.com/2/users/by/username/" + username, {
      headers: { Authorization: `Bearer ${TWITTER_BEARER_TOKEN}` },
      params: { "user.fields": "description,public_metrics,verified,profile_image_url,created_at" },
      timeout: 10000,
    });
    const d = res.data?.data; if (!d) return null;
    const m = d.public_metrics || {};
    return {
      id: String(d.id || ""), username: String(d.username || username), name: String(d.name || ""),
      description: String(d.description || ""), followers: Number(m.followers_count || 0),
      following: Number(m.following_count || 0), tweets: Number(m.tweet_count || 0),
      verified: Boolean(d.verified), profileImageUrl: String(d.profile_image_url || ""),
      createdAt: String(d.created_at || ""),
    };
  } catch (err) { logger.error(`[Twitter] getUser: ${err instanceof Error ? err.message : String(err)}`); return null; }
}

export async function getRecentTweets(userId: string, max = 5): Promise<TwitterTweet[]> {
  if (!TWITTER_BEARER_TOKEN) return [];
  try {
    const res = await axios.get(`https://api.twitter.com/2/users/${userId}/tweets`, {
      headers: { Authorization: `Bearer ${TWITTER_BEARER_TOKEN}` },
      params: { max_results: Math.min(max, 100), "tweet.fields": "public_metrics,created_at" },
      timeout: 10000,
    });
    return (res.data?.data || []).map((t: Record<string, unknown>) => {
      const m = (t.public_metrics || {}) as Record<string, number>;
      return {
        id: String(t.id || ""), text: String(t.text || "").slice(0, 500), authorId: userId,
        createdAt: String(t.created_at || ""), likes: Number(m.like_count || 0),
        retweets: Number(m.retweet_count || 0), replies: Number(m.reply_count || 0), quotes: Number(m.quote_count || 0),
      };
    });
  } catch (err) { logger.error(`[Twitter] getRecentTweets: ${err instanceof Error ? err.message : String(err)}`); return []; }
}

export async function searchTweets(query: string, max = 5): Promise<TwitterTweet[]> {
  if (!TWITTER_BEARER_TOKEN) return [];
  try {
    const res = await axios.get("https://api.twitter.com/2/tweets/search/recent", {
      headers: { Authorization: `Bearer ${TWITTER_BEARER_TOKEN}` },
      params: { query, max_results: Math.min(max, 100), "tweet.fields": "public_metrics,created_at,author_id" },
      timeout: 10000,
    });
    return (res.data?.data || []).map((t: Record<string, unknown>) => {
      const m = (t.public_metrics || {}) as Record<string, number>;
      return {
        id: String(t.id || ""), text: String(t.text || "").slice(0, 500), authorId: String(t.author_id || ""),
        createdAt: String(t.created_at || ""), likes: Number(m.like_count || 0),
        retweets: Number(m.retweet_count || 0), replies: Number(m.reply_count || 0), quotes: Number(m.quote_count || 0),
      };
    });
  } catch (err) { logger.error(`[Twitter] searchTweets: ${err instanceof Error ? err.message : String(err)}`); return []; }
}
