import http from "http";
import { authenticate } from "../middleware/auth";
import type { MetricSnapshot, MetricsResponse } from "../types";

const MAX_SNAPSHOTS = 2016; // 7 jours à 5 min d'intervalle
const snapshots: MetricSnapshot[] = [];

export function recordSnapshot(snapshot: MetricSnapshot): void {
  snapshots.push(snapshot);
  if (snapshots.length > MAX_SNAPSHOTS) snapshots.shift();
}

export function handleGetMetrics(req: http.IncomingMessage, res: http.ServerResponse): void {
  if (!authenticate(req, res)) return;

  const url = new URL(req.url || "/", "http://localhost");
  const period = (url.searchParams.get("period") || "1h") as "1h" | "24h" | "7d";

  const now = Date.now();
  const periods: Record<string, number> = { "1h": 3600000, "24h": 86400000, "7d": 604800000 };
  const cutoff = now - (periods[period] || 3600000);

  const filtered = snapshots.filter((s) => new Date(s.timestamp).getTime() >= cutoff);

  if (filtered.length === 0) {
    res.writeHead(200, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ success: true, data: { period, interval: 300, data: [], summary: null }, timestamp: new Date().toISOString() }));
    return;
  }

  const summary = {
    avgCpu: Math.round((filtered.reduce((s, d) => s + d.cpu, 0) / filtered.length) * 100) / 100,
    maxCpu: Math.max(...filtered.map((d) => d.cpu)),
    avgRam: Math.round((filtered.reduce((s, d) => s + d.ram, 0) / filtered.length) * 100) / 100,
    maxRam: Math.max(...filtered.map((d) => d.ram)),
    avgPing: Math.round((filtered.reduce((s, d) => s + d.ping, 0) / filtered.length) * 100) / 100,
    totalEvents: filtered.reduce((s, d) => s + d.events, 0),
    totalErrors: filtered.reduce((s, d) => s + d.errors, 0),
  };

  const data: MetricsResponse = { period, interval: 300, data: filtered, summary };

  res.writeHead(200, { "Content-Type": "application/json" });
  res.end(JSON.stringify({ success: true, data, timestamp: new Date().toISOString() }));
}
