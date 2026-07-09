/**
 * githubReleases.ts — Monitor GitHub repos for new releases and tags.
 *
 * Polls the GitHub API for releases on tracked repos and posts
 * formatted embeds to the appropriate Discord channel.
 * Auto-translates release notes to French.
 */

import { Client, TextChannel, EmbedBuilder } from "discord.js";
import logger from "../utils/logger.js";
import { safeInterval } from "../utils/safe-interval.js";
import { dedupCache } from "../utils/deduplicationCache.js";
import { translateAutoToFrench } from "../utils/translator.js";

const CHECK_INTERVAL_MS = parseInt(process.env.GITHUB_RELEASES_INTERVAL_MS || "1800000", 10); // 30 min
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

// Repos à surveiller — modifiable via env ou directement ici
const TRACKED_REPOS: TrackedRepo[] = [
  // Emulateurs / Outils gaming
  { owner: "PCSX2", repo: "pcsx2", platform: "playstation", label: "PCSX2 (PS2 Emulator)", channelId: process.env.PLAYSTATION_CHANNEL_ID || "", color: 0x003791, emoji: "🕹️" },
  { owner: "RPCS3", repo: "rpcs3", platform: "playstation", label: "RPCS3 (PS3 Emulator)", channelId: process.env.PLAYSTATION_CHANNEL_ID || "", color: 0x003791, emoji: "🕹️" },
  { owner: "RetroArch", repo: "RetroArch", platform: "nintendo", label: "RetroArch", channelId: process.env.NINTENDO_CHANNEL_ID || "", color: 0xe60012, emoji: "🎲" },
  { owner: "dolphin-emu", repo: "dolphin", platform: "nintendo", label: "Dolphin (Wii/GC Emulator)", channelId: process.env.NINTENDO_CHANNEL_ID || "", color: 0xe60012, emoji: "🎲" },
  { owner: "cemu-project", repo: "Cemu", platform: "nintendo", label: "Cemu (Wii U Emulator)", channelId: process.env.NINTENDO_CHANNEL_ID || "", color: 0xe60012, emoji: "🎲" },
  { owner: "xenia-project", repo: "xenia", platform: "xbox", label: "Xenia (Xbox 360 Emulator)", channelId: process.env.XBOX_CHANNEL_ID || "", color: 0x107c10, emoji: "🎯" },
  { owner: "ValveSoftware", repo: "source-sdk-2013", platform: "steam", label: "Valve Source SDK", channelId: process.env.STEAM_EPIC_CHANNEL_ID || "", color: 0x1b2838, emoji: "🎮" },

  // Mods / Outils communautaires
  { owner: "LavaGaming", repo: "MelonLoader", platform: "steam", label: "MelonLoader (Mod Loader)", channelId: process.env.STEAM_EPIC_CHANNEL_ID || "", color: 0x1b2838, emoji: "🎮" },
  { owner: "BepInEx", repo: "BepInEx", platform: "steam", label: "BepInEx (Mod Framework)", channelId: process.env.STEAM_EPIC_CHANNEL_ID || "", color: 0x1b2838, emoji: "🎮" },

  // Outils Discord / Bot
  { owner: "discordjs", repo: "discord.js", platform: "general", label: "discord.js", channelId: process.env.LOG_CHANNEL_ID || "", color: 0x5865f2, emoji: "🤖" },

  // Projets gaming open source
  { owner: "OpenRCT2", repo: "OpenRCT2", platform: "steam", label: "OpenRCT2 (RollerCoaster Tycoon)", channelId: process.env.STEAM_EPIC_CHANNEL_ID || "", color: 0x1b2838, emoji: "🎮" },
  { owner: "OpenMW", repo: "openmw", platform: "steam", label: "OpenMW (Morrowind)", channelId: process.env.STEAM_EPIC_CHANNEL_ID || "", color: 0x1b2838, emoji: "🎮" },
  { owner: "0ad", repo: "0ad", platform: "steam", label: "0 A.D. (RTS)", channelId: process.env.STEAM_EPIC_CHANNEL_ID || "", color: 0x1b2838, emoji: "🎮" },
];

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

      // Auto-traduction FR forcée
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
        // Traduction échouée — texte original
      }

      const totalDownloads = release.assets.reduce((sum, a) => sum + a.download_count, 0);
      const timestamp = release.published_at ? Math.floor(new Date(release.published_at).getTime() / 1000) : Math.floor(Date.now() / 1000);

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
        .setFooter({ text: `GitHub Releases • ${repo.owner}/${repo.repo}${release.prerelease ? " • PRE-RELEASE" : ""}` })
        .setTimestamp(release.published_at ? new Date(release.published_at) : new Date());

      if (totalDownloads > 0) {
        embed.addFields({ name: "📥 Téléchargements", value: totalDownloads.toLocaleString("fr-FR"), inline: true });
      }

      if (release.assets.length > 0) {
        const assetsList = release.assets.slice(0, 5).map(a => `• [${a.name}](${a.browser_download_url}) (${a.download_count.toLocaleString("fr-FR")} DL)`).join("\n");
        embed.addFields({ name: "📎 Assets", value: assetsList.slice(0, 1024), inline: false });
      }

      try {
        await channel.send({ embeds: [embed] });
        await dedupCache.markAsProcessed("game_updates", dedupKey);
        logger.info(`[GitHubReleases] Release postée: ${repo.owner}/${repo.repo} ${release.tag_name}`);
        await new Promise((resolve) => setTimeout(resolve, 800));
      } catch (err) {
        logger.error(`[GitHubReleases] Erreur envoi: ${err instanceof Error ? err.message : String(err)}`);
      }
    }
  } catch (err) {
    logger.debug(`[GitHubReleases] Erreur fetch ${repo.owner}/${repo.repo}: ${err instanceof Error ? err.message : String(err)}`);
  }
}

async function checkAllRepos(client: Client): Promise<void> {
  logger.info(`[GitHubReleases] Vérification de ${TRACKED_REPOS.length} repos...`);
  for (const repo of TRACKED_REPOS) {
    await checkRepoReleases(client, repo);
  }
}

export function startGitHubReleasesMonitor(client: Client): void {
  if (releasesInterval) return;
  logger.info(`[GitHubReleases] Monitoring ${TRACKED_REPOS.length} repos (intervalle: ${CHECK_INTERVAL_MS / 60000}min)`);

  // Premier check après 30s (laisser le bot se connecter)
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
