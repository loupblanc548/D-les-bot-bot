/**
 * Drive the « encore un test » Discord bot from this repo (REST + optional Gateway).
 *
 *   DISCORD_TESTER_TOKEN=... npx tsx scripts/discord-tester-probe.ts
 *   DISCORD_TESTER_TOKEN=... npx tsx scripts/discord-tester-probe.ts --online-only
 *
 * Never prints the token. Privileged Message Content intent is optional:
 * without it we still detect that John replied (author id), but reply text is empty.
 */
import "dotenv/config";
import { Client, GatewayIntentBits } from "discord.js";
import {
  buildJohnMention,
  DEFAULT_JOHN_BOT_USER_ID,
  DEFAULT_TEST_CHANNEL_ID,
  findJohnReplyAfter,
  summarizeProbeMessage,
  type ProbeChannelMessage,
} from "../src/utils/discordTesterProbe.ts";

const API = "https://discord.com/api/v10";

function argValue(flag: string): string | undefined {
  const i = process.argv.indexOf(flag);
  if (i === -1 || i + 1 >= process.argv.length) return undefined;
  return process.argv[i + 1];
}

function hasFlag(flag: string): boolean {
  return process.argv.includes(flag);
}

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

async function discordJson(
  token: string,
  method: string,
  path: string,
  body?: unknown,
): Promise<{ status: number; data: unknown }> {
  const res = await fetch(`${API}${path}`, {
    method,
    headers: {
      Authorization: `Bot ${token}`,
      "Content-Type": "application/json",
      "User-Agent": "JohnTesterProbe (local, 1.0)",
    },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const text = await res.text();
  let data: unknown = null;
  if (text) {
    try {
      data = JSON.parse(text);
    } catch {
      data = { raw: text.slice(0, 400) };
    }
  }
  return { status: res.status, data };
}

async function connectPresence(token: string): Promise<Client> {
  const client = new Client({
    intents: [GatewayIntentBits.Guilds, GatewayIntentBits.GuildMessages],
    presence: {
      status: "online",
      activities: [{ name: "en ligne", type: 0 }],
    },
  });
  await client.login(token);
  await client.user?.setPresence({
    status: "online",
    activities: [{ name: "en ligne", type: 0 }],
  });
  console.log(`[tester] online as ${client.user?.tag} (${client.user?.id})`);
  return client;
}

async function pollJohnReply(opts: {
  token: string;
  channelId: string;
  afterId: string;
  johnId: string;
  waitMs: number;
}): Promise<ProbeChannelMessage | undefined> {
  const deadline = Date.now() + opts.waitMs;
  let attempt = 0;
  while (Date.now() < deadline) {
    attempt += 1;
    const { status, data } = await discordJson(
      opts.token,
      "GET",
      `/channels/${opts.channelId}/messages?after=${opts.afterId}&limit=50`,
    );
    if (status === 429) {
      const retry = Number((data as { retry_after?: number })?.retry_after ?? 2);
      await sleep(Math.ceil(retry * 1000) + 250);
      continue;
    }
    const list = Array.isArray(data) ? (data as ProbeChannelMessage[]) : [];
    const hit = findJohnReplyAfter(list, opts.afterId, opts.johnId);
    if (hit) return hit;
    const left = Math.max(0, deadline - Date.now());
    console.log(`[tester] wait ${attempt}: no John reply yet (${Math.round(left / 1000)}s left)`);
    await sleep(Math.min(4000, left || 0));
  }
  return undefined;
}

async function main(): Promise<void> {
  const token = process.env.DISCORD_TESTER_TOKEN?.trim();
  if (!token) {
    console.error("Missing DISCORD_TESTER_TOKEN");
    process.exit(1);
  }

  const channelId =
    argValue("--channel") ||
    process.env.DISCORD_TESTER_CHANNEL_ID?.trim() ||
    DEFAULT_TEST_CHANNEL_ID;
  const johnId =
    argValue("--john") || process.env.JOHN_BOT_USER_ID?.trim() || DEFAULT_JOHN_BOT_USER_ID;
  const prompt =
    argValue("--prompt") || "ping de contrôle — tu m'entends ? (agent Cursor)";
  const waitMs = Number(argValue("--wait-ms") || process.env.DISCORD_TESTER_WAIT_MS || "55000");
  const onlineOnly = hasFlag("--online-only");
  const stayOnline = hasFlag("--stay-online") || onlineOnly;

  let presence: Client | undefined;
  if (stayOnline) {
    presence = await connectPresence(token);
  }

  if (onlineOnly) {
    console.log("[tester] staying online — Ctrl+C to stop");
    await new Promise(() => {
      /* keep the gateway session until killed */
    });
    return;
  }

  const content = buildJohnMention(prompt, johnId);
  const sent = await discordJson(token, "POST", `/channels/${channelId}/messages`, { content });
  if (sent.status < 200 || sent.status >= 300) {
    console.error("[tester] send failed", sent.status, JSON.stringify(sent.data).slice(0, 500));
    process.exit(1);
  }
  const sentMsg = sent.data as ProbeChannelMessage;
  console.log(`[tester] sent ${sentMsg.id} in ${channelId}: ${content}`);

  const reply = await pollJohnReply({
    token,
    channelId,
    afterId: sentMsg.id,
    johnId,
    waitMs: Number.isFinite(waitMs) ? waitMs : 55000,
  });

  if (reply) {
    console.log(`[tester] JOHN REPLIED ${summarizeProbeMessage(reply)}`);
    if (presence && !hasFlag("--stay-online")) await presence.destroy();
    process.exit(0);
  }

  console.log(
    "[tester] timeout — John did not reply. If the VPS still runs the old bot, it ignores tester bots until deploy.",
  );
  if (presence && !hasFlag("--stay-online")) await presence.destroy();
  process.exit(2);
}

main().catch((err) => {
  console.error("[tester] fatal", err instanceof Error ? err.message : err);
  process.exit(1);
});
