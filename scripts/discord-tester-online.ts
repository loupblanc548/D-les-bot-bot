/**
 * Keep the tester bot visible as Online on Discord.
 *
 *   DISCORD_TESTER_TOKEN=... npx tsx scripts/discord-tester-online.ts
 *
 * Used whenever the agent talks in #les-test-de-lb (REST sends look offline otherwise).
 */
import "dotenv/config";
import { writeFileSync } from "node:fs";
import { Client, GatewayIntentBits } from "discord.js";

const pidFile =
  process.env.TESTER_ONLINE_PID_FILE?.trim() ||
  `${process.env.TEMP || "/tmp"}/discord-tester-online.pid`;
writeFileSync(pidFile, String(process.pid));

const token = process.env.DISCORD_TESTER_TOKEN?.trim();
if (!token) {
  console.error("Missing DISCORD_TESTER_TOKEN");
  process.exit(1);
}

const client = new Client({
  intents: [GatewayIntentBits.Guilds, GatewayIntentBits.GuildMessages],
  presence: {
    status: "online",
    activities: [{ name: "en ligne", type: 0 }],
  },
});

async function markOnline(): Promise<void> {
  if (!client.user) return;
  await client.user.setPresence({
    status: "online",
    activities: [{ name: "en ligne", type: 0 }],
  });
}

client.once("ready", () => {
  console.log(`[tester] online as ${client.user?.tag} (${client.user?.id})`);
  void markOnline();
  setInterval(() => {
    void markOnline().catch(() => undefined);
  }, 4 * 60 * 1000);
});

client.on("shardResume", () => {
  void markOnline();
});

await client.login(token);
