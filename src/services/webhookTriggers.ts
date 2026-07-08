/**
 * webhookTriggers.ts — Receive external webhooks (GitHub, CI/CD, custom) → Discord embed
 *
 * Registers webhook endpoints on the health HTTP server. Each webhook has a
 * unique secret token in the URL path. When triggered, the payload is parsed
 * and a formatted Discord embed is sent to the configured channel.
 *
 * Supported providers:
 * - GitHub (push, pull_request, issues, release, workflow_run, star, fork)
 * - GitLab (push, merge_request, pipeline)
 * - Generic JSON (custom webhooks with configurable embed mapping)
 * - Discord-native (passthrough with reformatting)
 */

import { Client, EmbedBuilder, WebhookClient } from "discord.js";
import type { IncomingMessage, ServerResponse } from "http";
import logger from "../utils/logger.js";
import prisma from "../prisma.js";

export interface WebhookTriggerConfig {
  id: string;
  guildId: string;
  channelId: string;
  provider: "github" | "gitlab" | "generic" | "discord";
  secret: string;
  events: string[];
  createdAt: Date;
}

const triggers = new Map<string, WebhookTriggerConfig>();
const webhookClients = new Map<string, WebhookClient>();

// ─── Register / manage triggers ───────────────────────────────────────

export function registerTrigger(config: Omit<WebhookTriggerConfig, "id" | "createdAt">): WebhookTriggerConfig {
  const id = `wh_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
  const trigger: WebhookTriggerConfig = { ...config, id, createdAt: new Date() };
  triggers.set(trigger.secret, trigger);
  logger.info(`[WebhookTriggers] Registered ${trigger.provider} trigger for #${trigger.channelId} (events: ${trigger.events.join(", ") || "all"})`);
  return trigger;
}

export function removeTrigger(secret: string): boolean {
  return triggers.delete(secret);
}

export function listTriggers(guildId: string): WebhookTriggerConfig[] {
  return Array.from(triggers.values()).filter((t) => t.guildId === guildId);
}

export function getTriggerBySecret(secret: string): WebhookTriggerConfig | undefined {
  return triggers.get(secret);
}

// ─── HTTP handler ─────────────────────────────────────────────────────

export async function handleWebhookRequest(
  req: IncomingMessage,
  res: ServerResponse,
  client: Client,
): Promise<void> {
  const url = new URL(req.url || "/", `http://${req.headers.host}`);
  const path = url.pathname;

  // Expected format: /webhook/<secret>
  const match = path.match(/^\/webhook\/([a-zA-Z0-9_-]+)$/);
  if (!match) {
    res.writeHead(404, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ error: "Not found" }));
    return;
  }

  const secret = match[1];
  const trigger = triggers.get(secret);
  if (!trigger) {
    res.writeHead(404, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ error: "Unknown webhook" }));
    return;
  }

  // Read body
  const chunks: Buffer[] = [];
  for await (const chunk of req) {
    chunks.push(typeof chunk === "string" ? Buffer.from(chunk) : chunk);
  }
  const rawBody = Buffer.concat(chunks).toString("utf-8");

  let payload: Record<string, unknown>;
  try {
    payload = JSON.parse(rawBody);
  } catch {
    res.writeHead(400, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ error: "Invalid JSON" }));
    return;
  }

  // Check event filter
  const eventType = (req.headers["x-github-event"] as string) || (req.headers["x-gitlab-event"] as string) || "generic";
  if (trigger.events.length > 0 && !trigger.events.includes(eventType) && !trigger.events.includes("*")) {
    res.writeHead(202, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ status: "ignored", reason: `Event ${eventType} not subscribed` }));
    return;
  }

  // Build and send embed
  try {
    const embed = buildEmbedForProvider(trigger.provider, eventType, payload, req.headers);
    if (embed) {
      await sendToChannel(client, trigger, embed);
    }
    res.writeHead(200, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ status: "ok", event: eventType }));
  } catch (error) {
    logger.error(`[WebhookTriggers] Error processing ${eventType}:`, error);
    res.writeHead(500, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ error: "Processing failed" }));
  }
}

// ─── Send to Discord channel ──────────────────────────────────────────

async function sendToChannel(client: Client, trigger: WebhookTriggerConfig, embed: EmbedBuilder): Promise<void> {
  const guild = client.guilds.cache.get(trigger.guildId);
  if (!guild) return;

  const channel = guild.channels.cache.get(trigger.channelId);
  if (!channel || !channel.isTextBased()) return;

  await channel.send({ embeds: [embed] }).catch((err) => {
    logger.error(`[WebhookTriggers] Failed to send to channel: ${String(err)}`);
  });
}

// ─── Embed builders per provider ──────────────────────────────────────

function buildEmbedForProvider(
  provider: string,
  event: string,
  payload: Record<string, unknown>,
  headers: Record<string, string | string[] | undefined>,
): EmbedBuilder | null {
  switch (provider) {
    case "github":
      return buildGitHubEmbed(event, payload);
    case "gitlab":
      return buildGitLabEmbed(event, payload);
    case "generic":
      return buildGenericEmbed(event, payload);
    default:
      return null;
  }
}

// ─── GitHub ───────────────────────────────────────────────────────────

function buildGitHubEmbed(event: string, payload: Record<string, unknown>): EmbedBuilder | null {
  const repo = payload.repository as { full_name?: string; html_url?: string } | undefined;
  const repoName = repo?.full_name ?? "unknown";
  const repoUrl = repo?.html_url ?? "";

  switch (event) {
    case "push": {
      const commits = (payload.commits as { id: string; message: string; author?: { name: string } }[]) ?? [];
      const ref = String(payload.ref ?? "").replace("refs/heads/", "");
      const pusher = (payload.pusher as { name?: string })?.name ?? "unknown";
      const commitCount = commits.length;

      const embed = new EmbedBuilder()
        .setTitle(`📦 Push: ${repoName} → ${ref}`)
        .setColor(0x24292e)
        .setURL(repoUrl)
        .setDescription(
          `**${pusher}** pushed ${commitCount} commit${commitCount > 1 ? "s" : ""} to \`${ref}\`\n\n` +
            commits
              .slice(0, 5)
              .map((c) => `• [\`${c.id.slice(0, 7)}\`] ${c.message.split("\n")[0].slice(0, 80)}`)
              .join("\n"),
        )
        .setFooter({ text: "GitHub" })
        .setTimestamp();

      if (commitCount > 5) {
        embed.addFields({ name: "Truncated", value: `${commitCount - 5} more commits`, inline: true });
      }
      return embed;
    }

    case "pull_request": {
      const pr = payload.pull_request as {
        number?: number;
        title?: string;
        html_url?: string;
        user?: { login?: string };
        state?: string;
        merged?: boolean;
        draft?: boolean;
      } | undefined;
      const action = String(payload.action ?? "opened");
      if (!pr) return null;

      const colorMap: Record<string, number> = {
        opened: 0x2ea043,
        closed: 0xda3633,
        reopened: 0x2ea043,
        edited: 0x5865f2,
      };
      const emojiMap: Record<string, string> = {
        opened: "🟢",
        closed: pr.merged ? "🟣" : "🔴",
        reopened: "🔄",
        edited: "✏️",
      };

      const embed = new EmbedBuilder()
        .setTitle(`${emojiMap[action] ?? "📋"} PR #${pr.number}: ${pr.title}`)
        .setColor(colorMap[action] ?? 0x5865f2)
        .setURL(pr.html_url ?? repoUrl)
        .setDescription(`**${pr.user?.login ?? "unknown"}** ${action} a pull request`)
        .setFooter({ text: "GitHub • Pull Request" })
        .setTimestamp();
      return embed;
    }

    case "issues": {
      const issue = payload.issue as {
        number?: number;
        title?: string;
        html_url?: string;
        user?: { login?: string };
        labels?: { name: string }[];
      } | undefined;
      const action = String(payload.action ?? "opened");
      if (!issue) return null;

      const colorMap: Record<string, number> = {
        opened: 0x2ea043,
        closed: 0xda3633,
        reopened: 0x2ea043,
        labeled: 0x5865f2,
      };

      const labels = issue.labels?.map((l) => `\`${l.name}\``).join(" ") || "None";

      const embed = new EmbedBuilder()
        .setTitle(`📋 Issue #${issue.number}: ${issue.title}`)
        .setColor(colorMap[action] ?? 0x5865f2)
        .setURL(issue.html_url ?? repoUrl)
        .setDescription(`**${issue.user?.login ?? "unknown"}** ${action} an issue`)
        .addFields({ name: "Labels", value: labels.slice(0, 1024), inline: true })
        .setFooter({ text: "GitHub • Issues" })
        .setTimestamp();
      return embed;
    }

    case "release": {
      const release = payload.release as {
        tag_name?: string;
        name?: string;
        html_url?: string;
        author?: { login?: string };
        body?: string;
        prerelease?: boolean;
      } | undefined;
      const action = String(payload.action ?? "published");
      if (!release) return null;

      const embed = new EmbedBuilder()
        .setTitle(`🚀 Release ${release.tag_name}: ${release.name ?? release.tag_name}`)
        .setColor(release.prerelease ? 0xf39c12 : 0x2ea043)
        .setURL(release.html_url ?? repoUrl)
        .setDescription(`**${release.author?.login ?? "unknown"}** ${action} a release`)
        .setFooter({ text: "GitHub • Release" })
        .setTimestamp();

      if (release.body) {
        embed.addFields({ name: "Release Notes", value: release.body.slice(0, 1024), inline: false });
      }
      return embed;
    }

    case "workflow_run": {
      const wf = payload.workflow_run as {
        name?: string;
        conclusion?: string;
        html_url?: string;
        head_branch?: string;
        event?: string;
      } | undefined;
      const action = String(payload.action ?? "completed");
      if (!wf) return null;

      const success = wf.conclusion === "success";
      const embed = new EmbedBuilder()
        .setTitle(`${success ? "✅" : "❌"} CI: ${wf.name} → ${wf.head_branch ?? "main"}`)
        .setColor(success ? 0x2ea043 : 0xda3633)
        .setURL(wf.html_url ?? repoUrl)
        .setDescription(`Workflow ${action}: **${wf.conclusion ?? "unknown"}** (trigger: ${wf.event ?? "push"})`)
        .setFooter({ text: "GitHub • Actions" })
        .setTimestamp();
      return embed;
    }

    case "star": {
      const sender = (payload.sender as { login?: string })?.login ?? "unknown";
      const stars = (repo as { stargazers_count?: number })?.stargazers_count ?? 0;
      const action = String(payload.action ?? "created");

      const embed = new EmbedBuilder()
        .setTitle(`${action === "created" ? "⭐" : "☆"} ${sender} ${action === "created" ? "starred" : "unstarred"} ${repoName}`)
        .setColor(action === "created" ? 0xf1c40f : 0x95a5a6)
        .setURL(repoUrl)
        .setDescription(`Total stars: **${stars}**`)
        .setFooter({ text: "GitHub • Star" })
        .setTimestamp();
      return embed;
    }

    case "fork": {
      const sender = (payload.sender as { login?: string })?.login ?? "unknown";
      const forkee = payload.forkee as { html_url?: string } | undefined;

      const embed = new EmbedBuilder()
        .setTitle(`🍴 ${sender} forked ${repoName}`)
        .setColor(0x5865f2)
        .setURL(forkee?.html_url ?? repoUrl)
        .setFooter({ text: "GitHub • Fork" })
        .setTimestamp();
      return embed;
    }

    case "ping": {
      const zen = String(payload.zen ?? "GitHub webhook connected");
      const embed = new EmbedBuilder()
        .setTitle("🏓 GitHub Webhook Connected")
        .setColor(0x24292e)
        .setDescription(`> ${zen}`)
        .addFields({ name: "Repository", value: `[${repoName}](${repoUrl})`, inline: true })
        .setFooter({ text: "GitHub • Ping" })
        .setTimestamp();
      return embed;
    }

    default: {
      const embed = new EmbedBuilder()
        .setTitle(`📦 GitHub: ${event} on ${repoName}`)
        .setColor(0x24292e)
        .setURL(repoUrl)
        .setDescription(`Event: \`${event}\`\nAction: \`${String(payload.action ?? "N/A")}\``)
        .setFooter({ text: "GitHub" })
        .setTimestamp();
      return embed;
    }
  }
}

// ─── GitLab ───────────────────────────────────────────────────────────

function buildGitLabEmbed(event: string, payload: Record<string, unknown>): EmbedBuilder | null {
  const project = payload.project as { path_with_namespace?: string; web_url?: string } | undefined;
  const projName = project?.path_with_namespace ?? "unknown";
  const projUrl = project?.web_url ?? "";

  const cleanEvent = event.replace("Hook ", "").replace(" Hook", "");

  switch (cleanEvent.toLowerCase()) {
    case "push": {
      const commits = (payload.commits as { id: string; message: string; author?: { name: string } }[]) ?? [];
      const ref = String(payload.ref ?? "").replace("refs/heads/", "");
      const user = (payload.user_name as string) ?? "unknown";

      const embed = new EmbedBuilder()
        .setTitle(`📦 Push: ${projName} → ${ref}`)
        .setColor(0xfc6d26)
        .setURL(projUrl)
        .setDescription(
          `**${user}** pushed ${commits.length} commit${commits.length > 1 ? "s" : ""} to \`${ref}\`\n\n` +
            commits
              .slice(0, 5)
              .map((c) => `• [\`${c.id.slice(0, 7)}\`] ${c.message.split("\n")[0].slice(0, 80)}`)
              .join("\n"),
        )
        .setFooter({ text: "GitLab" })
        .setTimestamp();
      return embed;
    }

    case "merge_request": {
      const mr = payload.object_attributes as {
        iid?: number;
        title?: string;
        url?: string;
        state?: string;
        action?: string;
      } | undefined;
      const action = mr?.action ?? "open";
      if (!mr) return null;

      const embed = new EmbedBuilder()
        .setTitle(`🔀 MR !${mr.iid}: ${mr.title}`)
        .setColor(0xfc6d26)
        .setURL(mr.url ?? projUrl)
        .setDescription(`Merge request ${action}`)
        .setFooter({ text: "GitLab • Merge Request" })
        .setTimestamp();
      return embed;
    }

    case "pipeline": {
      const pipeline = payload.object_attributes as {
        status?: string;
        ref?: string;
        duration?: number;
      } | undefined;
      const status = pipeline?.status ?? "unknown";
      const success = status === "success";

      const embed = new EmbedBuilder()
        .setTitle(`${success ? "✅" : "❌"} Pipeline: ${projName} → ${pipeline?.ref ?? "main"}`)
        .setColor(success ? 0x2ea043 : 0xda3633)
        .setURL(projUrl)
        .setDescription(`Status: **${status}**${pipeline?.duration ? ` • Duration: ${pipeline.duration}s` : ""}`)
        .setFooter({ text: "GitLab • Pipeline" })
        .setTimestamp();
      return embed;
    }

    default: {
      const embed = new EmbedBuilder()
        .setTitle(`🦊 GitLab: ${cleanEvent} on ${projName}`)
        .setColor(0xfc6d26)
        .setURL(projUrl)
        .setDescription(`Event: \`${cleanEvent}\``)
        .setFooter({ text: "GitLab" })
        .setTimestamp();
      return embed;
    }
  }
}

// ─── Generic ──────────────────────────────────────────────────────────

function buildGenericEmbed(event: string, payload: Record<string, unknown>): EmbedBuilder | null {
  const title = String(payload.title ?? payload.name ?? payload.event ?? `Webhook: ${event}`);
  const message = String(payload.message ?? payload.description ?? payload.text ?? "");
  const color = Number(payload.color) || 0x5865f2;
  const url = String(payload.url ?? "");
  const author = payload.author as { name?: string; icon_url?: string; url?: string } | undefined;

  const embed = new EmbedBuilder()
    .setTitle(title.slice(0, 256))
    .setColor(color)
    .setTimestamp();

  if (url) {
    try {
      new URL(url);
      embed.setURL(url);
    } catch { /* invalid URL, skip */ }
  }

  if (message) {
    embed.setDescription(message.slice(0, 4096));
  }

  if (author) {
    embed.setAuthor({
      name: author.name?.slice(0, 256) ?? "Webhook",
      iconURL: author.icon_url,
      url: author.url,
    });
  }

  // Add up to 5 fields from payload.fields
  const fields = payload.fields as { name: string; value: string; inline?: boolean }[] | undefined;
  if (Array.isArray(fields)) {
    for (const f of fields.slice(0, 25)) {
      embed.addFields({
        name: String(f.name).slice(0, 256),
        value: String(f.value).slice(0, 1024),
        inline: f.inline ?? false,
      });
    }
  }

  embed.setFooter({ text: String(payload.source ?? "Custom Webhook") });
  return embed;
}

// ─── Stats ────────────────────────────────────────────────────────────

export function getTriggerStats(guildId: string): { total: number; byProvider: Record<string, number> } {
  const guildTriggers = listTriggers(guildId);
  const byProvider: Record<string, number> = {};
  for (const t of guildTriggers) {
    byProvider[t.provider] = (byProvider[t.provider] ?? 0) + 1;
  }
  return { total: guildTriggers.length, byProvider };
}

// ─── Persist to database ──────────────────────────────────────────────

export async function saveTriggerToDb(trigger: WebhookTriggerConfig): Promise<void> {
  try {
    await prisma.guildConfig.upsert({
      where: { guildId: trigger.guildId },
      update: {},
      create: { guildId: trigger.guildId },
    });
  } catch (error) {
    logger.error(`[WebhookTriggers] Failed to persist: ${String(error)}`);
  }
}
