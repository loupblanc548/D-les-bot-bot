/**
 * githubWebhook.ts — GitHub webhook handler for push/PR notifications
 *
 * Notifies a Discord channel when commits are pushed or PRs are opened/merged.
 * Register with: registerWebhook("/webhook/github", secret, handleGithubWebhook)
 */

import { Client, EmbedBuilder, TextChannel } from "discord.js";
import logger from "../utils/logger.js";
import { registerWebhook } from "./webhookReceiver.js";

let discordClient: Client | null = null;
let notificationChannelId: string | null = null;

export function initGithubWebhook(client: Client, channelId: string, secret: string): void {
  discordClient = client;
  notificationChannelId = channelId;

  registerWebhook("/webhook/github", secret, handleGithubWebhook, {
    signatureHeader: "x-hub-signature-256",
    signaturePrefix: "sha256=",
  });

  logger.info(`[GithubWebhook] Initialized — notifications → channel ${channelId}`);
}

async function handleGithubWebhook(
  event: string,
  payload: any,
  _headers: Record<string, string>,
): Promise<void> {
  if (!discordClient || !notificationChannelId) {
    logger.warn("[GithubWebhook] Not initialized — dropping event");
    return;
  }

  const channel = discordClient.channels.cache.get(notificationChannelId) as
    TextChannel | undefined;
  if (!channel?.isTextBased()) {
    logger.warn(`[GithubWebhook] Channel ${notificationChannelId} not found or not text`);
    return;
  }

  try {
    switch (event) {
      case "push":
        await handlePush(channel, payload as PushPayload);
        break;
      case "pull_request":
        await handlePullRequest(channel, payload as PullRequestPayload);
        break;
      default:
        logger.debug(`[GithubWebhook] Unhandled event: ${event}`);
    }
  } catch (err) {
    logger.error(
      `[GithubWebhook] Error handling ${event}: ${err instanceof Error ? err.message : String(err)}`,
    );
  }
}

interface PushPayload {
  ref: string;
  repository: {
    full_name: string;
    html_url: string;
  };
  commits: Array<{
    id: string;
    message: string;
    author: { username: string };
    url: string;
  }>;
  pusher: { name: string };
}

async function handlePush(channel: TextChannel, payload: PushPayload): Promise<void> {
  const branch = payload.ref.replace("refs/heads/", "");
  const commitCount = payload.commits.length;

  if (commitCount === 0) return;

  const embed = new EmbedBuilder()
    .setTitle(`📦 Push sur ${payload.repository.full_name} — ${branch}`)
    .setColor(0x24292e)
    .setURL(payload.repository.html_url)
    .setDescription(
      payload.commits
        .slice(0, 5)
        .map((c) => {
          const shortSha = c.id.slice(0, 7);
          const firstLine = c.message.split("\n")[0].slice(0, 80);
          return `[\`${shortSha}\`](${c.url}) ${firstLine} — **${c.author.username}**`;
        })
        .join("\n"),
    )
    .addFields(
      { name: "Branch", value: branch, inline: true },
      { name: "Commits", value: commitCount.toString(), inline: true },
      { name: "Pushed by", value: payload.pusher.name, inline: true },
    )
    .setFooter({ text: "GitHub Webhook" })
    .setTimestamp();

  if (commitCount > 5) {
    embed.addFields({ name: "...", value: `+${commitCount - 5} autres commits`, inline: false });
  }

  await channel.send({ embeds: [embed] });
  logger.info(`[GithubWebhook] Push notification sent: ${branch} (${commitCount} commits)`);
}

interface PullRequestPayload {
  action: string;
  number: number;
  pull_request: {
    title: string;
    html_url: string;
    state: string;
    merged: boolean;
    user: { login: string };
    additions: number;
    deletions: number;
    changed_files: number;
  };
  repository: {
    full_name: string;
  };
}

async function handlePullRequest(channel: TextChannel, payload: PullRequestPayload): Promise<void> {
  const { action, number, pull_request: pr, repository } = payload;

  const relevantActions = ["opened", "closed", "reopened", "merged"];
  if (!relevantActions.includes(action)) return;

  const color = pr.merged
    ? 0x6f42c1
    : action === "closed"
      ? 0xd73a49
      : action === "opened"
        ? 0x2da44e
        : 0x58a6ff;

  const embed = new EmbedBuilder()
    .setTitle(`🔀 PR #${number} ${action} — ${repository.full_name}`)
    .setColor(color)
    .setURL(pr.html_url)
    .setDescription(`**${pr.title}**`)
    .addFields(
      { name: "Author", value: pr.user.login, inline: true },
      { name: "State", value: pr.merged ? "Merged ✅" : pr.state, inline: true },
      {
        name: "Changes",
        value: `+${pr.additions} / -${pr.deletions} (${pr.changed_files} files)`,
        inline: true,
      },
    )
    .setFooter({ text: "GitHub Webhook" })
    .setTimestamp();

  await channel.send({ embeds: [embed] });
  logger.info(`[GithubWebhook] PR #${number} ${action} notification sent`);
}
