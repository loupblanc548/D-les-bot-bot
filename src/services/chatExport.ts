/**
 * chatExport.ts — Export de messages de channel Discord
 *
 * Récupère et formate les messages d'un channel en JSON, Markdown, ou CSV.
 */

import logger from "../utils/logger.js";
import { config } from "../config.js";

export interface ChatExportMessage {
  author: string;
  content: string;
  timestamp: Date;
  attachments?: string[];
}

async function fetchChannelMessages(channelId: string, limit: number): Promise<unknown[]> {
  const url = `https://discord.com/api/v10/channels/${channelId}/messages?limit=${Math.min(limit, 100)}`;
  const res = await fetch(url, {
    headers: { Authorization: `Bot ${config.token}` },
    signal: AbortSignal.timeout(10_000),
  });
  if (!res.ok) throw new Error(`Discord API ${res.status}`);
  return (await res.json()) as unknown[];
}

export async function exportChannelMessages(
  channelId: string,
  limit = 100,
): Promise<ChatExportMessage[]> {
  try {
    const raw = await fetchChannelMessages(channelId, limit);
    return (raw as Array<Record<string, unknown>>).map((m) => ({
      author: (m.author as Record<string, string>)?.username ?? "unknown",
      content: String(m.content ?? ""),
      timestamp: new Date(m.timestamp as string),
      attachments: (m.attachments as Array<Record<string, string>>)?.map((a) => a.url) ?? [],
    }));
  } catch (error) {
    logger.error("[ChatExport] exportChannelMessages:", String(error));
    return [];
  }
}

export function exportToJSON(messages: ChatExportMessage[]): string {
  return JSON.stringify(messages, null, 2);
}

export function exportToMarkdown(messages: ChatExportMessage[]): string {
  return messages
    .map(
      (m) =>
        `**[${m.author}] — ${m.timestamp.toISOString()}**\n${m.content}${m.attachments && m.attachments.length > 0 ? `\n📎 ${m.attachments.join("\n📎 ")}` : ""}\n`,
    )
    .join("\n---\n\n");
}

export function exportToCSV(messages: ChatExportMessage[]): string {
  const header = "author,content,timestamp,attachments\n";
  const rows = messages.map((m) => {
    const escapedContent = `"${m.content.replace(/"/g, '""').replace(/\n/g, " ")}"`;
    const escapedAuthor = `"${m.author.replace(/"/g, '""')}"`;
    const attachments = m.attachments?.join(";") ?? "";
    return `${escapedAuthor},${escapedContent},${m.timestamp.toISOString()},"${attachments}"`;
  });
  return header + rows.join("\n");
}
