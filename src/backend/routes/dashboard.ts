import http from "http";
import os from "os";
import { authenticate } from "../middleware/auth.js";
import type { DashboardResponse } from "../types.js";

let clientRef: import("discord.js").Client | null = null;
let startTime = Date.now();
let alertCount = 0;

export function setClient(client: import("discord.js").Client): void {
  clientRef = client;
  startTime = Date.now();
}

export function incrementAlerts(): void { alertCount++; }
export function resetAlerts(): void { alertCount = 0; }

export function handleDashboard(req: http.IncomingMessage, res: http.ServerResponse): void {
  if (!authenticate(req, res)) return;

  const mem = process.memoryUsage();
  const cpus = os.cpus();
  let totalIdle = 0;
  let totalTick = 0;
  for (const cpu of cpus) {
    for (const type of Object.keys(cpu.times) as (keyof typeof cpu.times)[]) {
      totalTick += cpu.times[type];
    }
    totalIdle += cpu.times.idle;
  }
  const cpuUsage = Math.round((1 - totalIdle / totalTick) * 100);
  const uptime = Math.floor((Date.now() - startTime) / 1000);

  const data: DashboardResponse = {
    online: clientRef?.isReady() ?? false,
    uptime,
    memoryMB: Math.round((mem.heapUsed / 1024 / 1024) * 100) / 100,
    cpuPercent: cpuUsage,
    loadAvg: os.loadavg().map((v) => Math.round(v * 100) / 100),
    ping: clientRef?.ws?.ping ?? -1,
    guildCount: clientRef?.guilds?.cache?.size ?? 0,
    userCount: clientRef?.users?.cache?.size ?? 0,
    activePlatforms: 0,
    totalPlatforms: 7,
    cacheTotal: 0,
    alertsTotal: alertCount,
    pid: process.pid,
    version: "1.1.0",
  };

  res.writeHead(200, { "Content-Type": "application/json" });
  res.end(JSON.stringify({ success: true, data, timestamp: new Date().toISOString() }));
}
