/**
 * githubReleases.ts — Monitor GitHub repos for new releases and tags.
 *
 * Liste = githubKnowledgeCatalog (trackReleases).
 */

import { Client, TextChannel, EmbedBuilder } from "discord.js";
import logger from "../utils/logger.js";
import { safeInterval } from "../utils/safe-interval.js";
import { dedupCache } from "../utils/deduplicationCache.js";
import { translateAutoToFrench } from "../utils/translator.js";
import { releaseRepos } from "./githubKnowledgeCatalog.js";

const CHECK_INTERVAL_MS = parseInt(process.env.GITHUB_RELEASES_INTERVAL_MS || "1800000", 10);
const GITHUB_TOKEN = process.env.GITHUB_TOKEN || "";
let releasesInterval: NodeJS.Timeout | null = null;

interface TrackedRepo {
  owner: string;
  repo: string;
  platform: string;
  label: string;
  channelId: string;
  color: number;
  emoji: string;
}

function getTrackedRepos(): TrackedRepo[] {
  const channelId = process.env.LOG_CHANNEL_ID || "";
  return releaseRepos().map((e) => ({
    owner: e.owner,
    repo: e.repo,
    platform: e.platform || "general",
    label: e.label || `${e.owner}/${e.repo}`,
    channelId,
    color: e.color ?? 0x5865f2,
    emoji: e.emoji ?? "📦",
  }));
}

interface GitHubRelease {
  tag_name: string;
  name: string;
  body: string;
  html_url: string;
  published_at: string;
  prerelease: boolean;
  author: { login: string };
  assets: Array<{ name: string; download_count: number; browser_download_url: string }>;
}

async function checkRepoReleases(client: Client, repo: TrackedRepo): Promise<void> {
  if (!repo.channelId) return;

  const url = `https://api.github.com/repos/${repo.owner}/${repo.repo}/releases?per_page=5`;
  const headers: Record<string, string> = {
    Accept: "application/vnd.github.v3+json",
    "User-Agent": "DiscordBot/1.0",
  };
  if (GITHUB_TOKEN) headers.Authorization = `Bearer ${GITHUB_TOKEN}`;

  try {
    const res = await fetch(url, { headers, signal: AbortSignal.timeout(15000) });
    if (!res.ok) {
      if (res.status === 404) {
        logger.debug(`[GitHubReleases] Repo ${repo.owner}/${repo.repo} not found (404)`);
      } else if (res.status === 403) {
        logger.warn(`[GitHubReleases] Rate limit atteint pour ${repo.owner}/${repo.repo}`);
      }
      return;
    }

    const releases = (await res.json()) as GitHubRelease[];
    if (!Array.isArray(releases) || releases.length === 0) return;

    const channel = client.channels.cache.get(repo.channelId) as TextChannel;
    if (!channel?.isTextBased()) return;

    for (const release of releases.slice(0, 3)) {
      const dedupKey = `github:${repo.owner}/${repo.repo}:${release.tag_name}`;
      if (dedupCache.isAlreadyProcessed("game_updates", dedupKey)) continue;

      let displayTitle = release.name || release.tag_name;
      let displayBody = release.body || "Pas de notes de version.";
      try {
        const titleResult = await translateAutoToFrench(displayTitle);
        if (titleResult && titleResult.detectedLanguage !== "fr") {
          displayTitle = titleResult.translatedText;
        }
        const bodyResult = await translateAutoToFrench(displayBody.slice(0, 1500));
        if (bodyResult && bodyResult.detectedLanguage !== "fr") {
          displayBody = bodyResult.translatedText;
        }
      } catch {
        logger.error("[Silent catch]");
      }

      const totalDownloads = release.assets.reduce((sum, a) => sum + a.download_count, 0);
      const timestamp = release.published_at
        ? Math.floor(new Date(release.published_at).getTime() / 1000)
        : Math.floor(Date.now() / 1000);

      const embed = new EmbedBuilder()
        .setAuthor({ name: `${repo.emoji} ${repo.label}` })
        .setTitle(`📦 ${displayTitle}`)
        .setColor(repo.color)
        .setURL(release.html_url)
        .setDescription(displayBody.slice(0, 4000))
        .addFields(
          { name: "🏷️ Version", value: `\`${release.tag_name}\``, inline: true },
          { name: "👤 Auteur", value: release.author?.login || "N/A", inline: true },
          { name: "📅 Publié", value: `<t:${timestamp}:R>`, inline: true },
        )
        .setFooter({
          text: `GitHub Releases • ${repo.owner}/${repo.repo}${release.prerelease ? " • PRE-RELEASE" : ""}`,
        })
        .setTimestamp(release.published_at ? new Date(release.published_at) : new Date());

      if (totalDownloads > 0) {
        embed.addFields({
          name: "📥 Téléchargements",
          value: totalDownloads.toLocaleString("fr-FR"),
          inline: true,
        });
      }

      if (release.assets.length > 0) {
        const assetsList = release.assets
          .slice(0, 5)
          .map(
            (a) =>
              `• [${a.name}](${a.browser_download_url}) (${a.download_count.toLocaleString("fr-FR")} DL)`,
          )
          .join("\n");
        embed.addFields({ name: "📎 Assets", value: assetsList.slice(0, 1024), inline: false });
      }

      try {
        await channel.send({ embeds: [embed] });
        await dedupCache.markAsProcessed("game_updates", dedupKey);
        logger.info(
          `[GitHubReleases] Release postée: ${repo.owner}/${repo.repo} ${release.tag_name}`,
        );
        await new Promise((resolve) => setTimeout(resolve, 800));
      } catch (err) {
        logger.error(
          `[GitHubReleases] Erreur envoi: ${err instanceof Error ? err.message : String(err)}`,
        );
      }
    }
  } catch (err) {
    logger.debug(
      `[GitHubReleases] Erreur fetch ${repo.owner}/${repo.repo}: ${err instanceof Error ? err.message : String(err)}`,
    );
  }
}

async function checkAllRepos(client: Client): Promise<void> {
  const tracked = getTrackedRepos();
  logger.info(`[GitHubReleases] Vérification de ${tracked.length} repos...`);
  for (const repo of tracked) {
    await checkRepoReleases(client, repo);
  }
}

export function startGitHubReleasesMonitor(client: Client): void {
  if (releasesInterval) return;
  logger.info(
    `[GitHubReleases] Monitoring ${getTrackedRepos().length} repos (intervalle: ${CHECK_INTERVAL_MS / 60000}min)`,
  );

  setTimeout(() => checkAllRepos(client), 30000);

  releasesInterval = safeInterval("GitHubReleases", () => checkAllRepos(client), CHECK_INTERVAL_MS);
}

export function stopGitHubReleasesMonitor(): void {
  if (releasesInterval) {
    clearInterval(releasesInterval);
    releasesInterval = null;
    logger.info("[GitHubReleases] Arrêté");
  }
}
