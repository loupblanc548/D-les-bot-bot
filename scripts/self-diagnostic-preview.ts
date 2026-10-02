/**
 * Envoie un rapport d'auto-diagnostic de démonstration (données fictives) dans un salon.
 * Usage : npx tsx scripts/self-diagnostic-preview.ts <channelId>
 */
import "dotenv/config";
import { buildDiagnosticReport, getWindowProblems, recordProblem } from "../src/services/selfDiagnostic.js";

const channelId = process.argv[2];
const token = process.env.DISCORD_TOKEN;
if (!channelId || !token) {
  console.error("Usage: tsx scripts/self-diagnostic-preview.ts <channelId> (DISCORD_TOKEN requis)");
  process.exit(1);
}

const feedsErr = new Error("Missing Permissions");
feedsErr.stack = "DiscordAPIError: Missing Permissions\n    at send (/opt/discord-bot/dist/services/feeds.js:345:11)";
for (let i = 0; i < 14; i++) recordProblem("error", ["[Feeds] Discord API error sur 1497977006510440700:", feedsErr]);
const dbErr = new Error("Can't reach database server");
dbErr.stack = "PrismaClientInitializationError\n    at q (/opt/discord-bot/dist/services/monitor.js:451:2)";
for (let i = 0; i < 3; i++) recordProblem("error", ["[Monitor] query failed", dbErr]);
for (let i = 0; i < 22; i++) recordProblem("warn", [`[Steam] rate limited, retry in ${i * 3}s`]);

const { embeds } = buildDiagnosticReport(
  {
    rssMB: 812,
    heapMB: 431,
    memoryLevel: "SURVEILLANCE",
    eventLoopP99Ms: 240,
    discordReady: true,
    discordPingMs: 92,
    dbLatencyMs: 38,
    dbError: null,
    uptimeSec: 3 * 86400 + 4 * 3600,
  },
  getWindowProblems(),
  Date.now() - 6 * 3600_000,
);

const res = await fetch(`https://discord.com/api/v10/channels/${channelId}/messages`, {
  method: "POST",
  headers: { Authorization: `Bot ${token}`, "Content-Type": "application/json" },
  body: JSON.stringify({
    content: "Aperçu de l'auto-diagnostic (données fictives)",
    embeds: embeds.map((e) => e.toJSON()),
  }),
});
const body = (await res.json()) as { id?: string; message?: string };
console.log(res.ok ? `OK message ${body.id}` : `HTTP ${res.status} ${body.message ?? ""}`);
