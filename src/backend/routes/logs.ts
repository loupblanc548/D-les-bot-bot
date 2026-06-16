import http from "http";
import { authenticate } from "../middleware/auth";
import type { LogEntry, LogsResponse } from "../types";

const MAX_LOGS = 2000;
let logs: LogEntry[] = [];

export function addLog(entry: LogEntry): void {
  logs.push(entry);
  if (logs.length > MAX_LOGS * 2) logs = logs.slice(-MAX_LOGS);
}

export function getRecentLogs(limit: number = 500, level?: string, search?: string): LogsResponse {
  let filtered = logs;
  if (level && level !== "all") {
    filtered = filtered.filter((l) => l.level === level);
  }
  if (search) {
    const s = search.toLowerCase();
    filtered = filtered.filter((l) => l.message.toLowerCase().includes(s));
  }
  const recent = filtered.slice(-Math.min(limit, MAX_LOGS));
  return { total: filtered.length, logs: recent };
}

export function clearLogs(): void {
  logs = [];
}

export function handleGetLogs(req: http.IncomingMessage, res: http.ServerResponse): void {
  if (!authenticate(req, res)) return;

  const url = new URL(req.url || "/", "http://localhost");
  const level = url.searchParams.get("level") || undefined;
  const search = url.searchParams.get("search") || undefined;
  const limit = parseInt(url.searchParams.get("limit") || "500", 10);

  const data = getRecentLogs(limit, level, search);
  res.writeHead(200, { "Content-Type": "application/json" });
  res.end(JSON.stringify({ success: true, data, timestamp: new Date().toISOString() }));
}

export function handleDeleteLogs(req: http.IncomingMessage, res: http.ServerResponse): void {
  if (!authenticate(req, res)) return;
  clearLogs();
  res.writeHead(200, { "Content-Type": "application/json" });
  res.end(JSON.stringify({ success: true, data: { cleared: true }, timestamp: new Date().toISOString() }));
}
