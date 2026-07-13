import axios from "axios";
import logger from "../utils/logger.js";

export const INSTAGRAM_STANDBY = true;

const IG_USERNAME = process.env.IG_USERNAME || "";
const _IG_PASSWORD = process.env.IG_PASSWORD || "";

export interface InstagramProfile {
  username: string;
  fullName: string;
  bio: string;
  followers: number;
  following: number;
  posts: number;
  isPrivate: boolean;
  isVerified: boolean;
  profilePicUrl: string;
  externalUrl: string;
}

export async function getProfile(username: string): Promise<InstagramProfile | null> {
  if (!IG_USERNAME) return null;
  try {
    const res = await axios.get(
      `https://i.instagram.com/api/v1/users/web_profile_info/?username=${username}`,
      {
        headers: {
          "User-Agent": "Instagram 219.0.0.12.117 Android",
          "x-ig-app-id": "936619743392459",
        },
        timeout: 10000,
      },
    );
    const d = res.data?.data?.user;
    if (!d) return null;
    return {
      username: String(d.username || username),
      fullName: String(d.full_name || ""),
      bio: String(d.biography || ""),
      followers: Number(d.edge_followed_by?.count || 0),
      following: Number(d.edge_follow?.count || 0),
      posts: Number(d.edge_owner_to_timeline_media?.count || 0),
      isPrivate: Boolean(d.is_private),
      isVerified: Boolean(d.is_verified),
      profilePicUrl: String(d.profile_pic_url_hd || ""),
      externalUrl: String(d.external_url || ""),
    };
  } catch (err) {
    logger.error(`[Instagram] getProfile: ${err instanceof Error ? err.message : String(err)}`);
    return null;
  }
}

export async function getRecentPosts(
  username: string,
  count = 5,
): Promise<{ id: string; caption: string; likes: number; comments: number; timestamp: string }[]> {
  if (!IG_USERNAME) return [];
  try {
    const res = await axios.get(
      `https://i.instagram.com/api/v1/users/web_profile_info/?username=${username}`,
      {
        headers: {
          "User-Agent": "Instagram 219.0.0.12.117 Android",
          "x-ig-app-id": "936619743392459",
        },
        timeout: 10000,
      },
    );
    const edges = (res.data?.data?.user?.edge_owner_to_timeline_media?.edges || []) as Record<
      string,
      unknown
    >[];
    return edges.slice(0, count).map((e) => {
      const n = e.node as Record<string, unknown>;
      const captionNode = (
        (n.edge_media_to_caption as Record<string, unknown>)?.edges as Record<string, unknown>[]
      )?.[0]?.node as Record<string, unknown>;
      return {
        id: String(n.id || ""),
        caption: String(captionNode?.text || "").slice(0, 200),
        likes: Number((n.edge_liked_by as Record<string, unknown>)?.count || 0),
        comments: Number((n.edge_media_to_comment as Record<string, unknown>)?.count || 0),
        timestamp: new Date(Number(n.taken_at_timestamp || 0) * 1000).toISOString(),
      };
    });
  } catch {
    return [];
  }
}

export function isInstagramConfigured(): boolean {
  return IG_USERNAME.length > 0;
}
