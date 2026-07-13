import logger from "../utils/logger.js";

interface MsgRecord {
  userId: string;
  content: string;
  timestamp: number;
}
const WINDOW = 60_000;
const THRESHOLD = 70;
const MAX_RECENT_ENTRIES = 5000;
const MAX_SCORE_ENTRIES = 5000;
const RECENT: Map<string, MsgRecord[]> = new Map();
const SCORES: Map<string, { score: number; lastUpdate: number }> = new Map();

function evictOldest(map: Map<string, unknown>, max: number): void {
  if (map.size >= max) {
    const firstKey = map.keys().next().value;
    if (firstKey !== undefined) map.delete(firstKey);
  }
}

export function recordMessage(userId: string, content: string, channelId: string): void {
  const key = `${userId}:${channelId}`;
  if (!RECENT.has(key)) {
    evictOldest(RECENT, MAX_RECENT_ENTRIES);
    RECENT.set(key, []);
  }
  const recs = RECENT.get(key)!;
  recs.push({ userId, content, timestamp: Date.now() });
  const cutoff = Date.now() - WINDOW;
  while (recs.length > 0 && recs[0].timestamp < cutoff) recs.shift();
}

export function analyzeSpam(
  userId: string,
  channelId: string,
): { isSpam: boolean; score: number; reasons: string[] } {
  const key = `${userId}:${channelId}`;
  const recs = (RECENT.get(key) || []).filter((r) => Date.now() - r.timestamp < WINDOW);
  let score = 0;
  const reasons: string[] = [];
  if (recs.length >= 10) {
    score += 40;
    reasons.push(`${recs.length} msgs in 60s`);
  } else if (recs.length >= 5) {
    score += 20;
    reasons.push(`${recs.length} msgs in 60s`);
  }
  if (recs.length >= 3) {
    const counts = new Map<string, number>();
    for (const r of recs) counts.set(r.content, (counts.get(r.content) || 0) + 1);
    const max = Math.max(...counts.values());
    if (max >= 5) {
      score += 50;
      reasons.push(`Identical msg x${max}`);
    } else if (max >= 3) {
      score += 30;
      reasons.push(`Identical msg x${max}`);
    }
  }
  if (recs.filter((r) => r.content.trim().length <= 2).length >= 5) {
    score += 25;
    reasons.push("Many short msgs");
  }
  if (recs.filter((r) => /<@!?\d+>/.test(r.content)).length >= 3) {
    score += 30;
    reasons.push("Mention spam");
  }
  if (recs.filter((r) => /https?:\/\//.test(r.content)).length >= 3) {
    score += 25;
    reasons.push("Link spam");
  }
  const us = SCORES.get(userId);
  if (us) {
    const decayed = Math.max(0, us.score - ((Date.now() - us.lastUpdate) / 60000) * 5);
    score += Math.min(decayed * 0.3, 20);
  }
  const final = Math.min(score, 100);
  evictOldest(SCORES, MAX_SCORE_ENTRIES);
  SCORES.set(userId, { score: final, lastUpdate: Date.now() });
  return { isSpam: final >= THRESHOLD, score: final, reasons };
}

export function detectRaid(
  joins: { userId: string; joinedAt: number }[],
  msgs: { userId: string; content: string; timestamp: number }[],
): { isRaid: boolean; confidence: number; reasons: string[] } {
  const now = Date.now();
  const recent = joins.filter((j) => now - j.joinedAt < 300000);
  let conf = 0;
  const reasons: string[] = [];
  if (recent.length >= 5) {
    conf += 40;
    reasons.push(`${recent.length} new users in 5min`);
  }
  if (recent.length >= 3) {
    const ids = new Set(recent.map((u) => u.userId));
    const newMsgs = msgs.filter((m) => ids.has(m.userId) && now - m.timestamp < 120000);
    if (newMsgs.length >= 5) {
      conf += 30;
      reasons.push(`${newMsgs.length} msgs from new users`);
    }
    const contents = newMsgs.map((m) => m.content.toLowerCase().trim());
    if (new Set(contents).size <= newMsgs.length / 2) {
      conf += 30;
      reasons.push("Similar messages");
    }
  }
  return { isRaid: conf >= 60, confidence: Math.min(conf, 100), reasons };
}

export function getUserScore(userId: string): number {
  const s = SCORES.get(userId);
  return s ? Math.max(0, s.score - ((Date.now() - s.lastUpdate) / 60000) * 5) : 0;
}
export function resetUserScore(userId: string): void {
  SCORES.delete(userId);
}

logger.info("[SpamDetector] Initialized");
