/**
 * commandRouter.ts — Routeur de commandes slash
 *
 * Extrait de index.ts pour réduire sa complexité.
 * Contient : buildCommandRouter, applyCommandMiddleware, registerCommands
 */

import { REST, Routes, Interaction, ChatInputCommandInteraction, Client } from "discord.js";
import { config } from "./config.js";
import logger from "./utils/logger.js";
import {
  createLoggingMiddleware,
  createRateLimitMiddleware,
  createPermissionGuardMiddleware,
  withMiddleware,
} from "./middleware/index.js";

import {
  commands as mainCommands,
  handleCommand as handleMain,
  handleSelectMenu as handleMainSelectMenu,
} from "./commands/main.js";
import { commands as sourceCommands } from "./commands/sources.js";
import { commands as adminCommands, handleCommand as handleAdmin } from "./commands/admin.js";
import { commands as aiCommands, handleCommand as handleAI } from "./commands/ai.js";
import {
  commands as modCommands,
  handleCommand as handleModeration,
} from "./commands/moderation.js";
import { commands as casierCommands, handleCommand as handleCasier } from "./commands/casier.js";
import {
  commands as securityCommands,
  handleCommand as handleSecurity,
} from "./commands/security/core.js";
import { commands as gamingCommands, handleCommand as handleGaming } from "./commands/gaming.js";
import {
  commands as communityCommands,
  handleCommand as handleCommunity,
} from "./commands/community.js";
import { commands as utilityCommands, handleCommand as handleUtility } from "./commands/utility.js";
import { commands as vocalCommands, handleCommand as handleVocal } from "./commands/vocal.js";
import { commands as twitchCommands, handleCommand as handleTwitch } from "./commands/twitch.js";
import { commands as steamCommands, handleCommand as handleSteam } from "./commands/steam.js";
import {
  commands as trackGameCommands,
  handleCommand as handleTrackGame,
} from "./commands/trackGame.js";
import { commands as psnCommands, handleCommand as handlePsn } from "./commands/psn.js";
import {
  commands as wishlistCommands,
  handleCommand as handleWishlist,
} from "./commands/fun/wishlist.js";
import {
  commands as boutiqueCommands,
  handleCommand as handleBoutique,
} from "./commands/fun/boutique.js";
import {
  commands as alertcenterCommands,
  handleCommand as handleAlertcenter,
} from "./commands/alertcenter.js";
import { commands as mp3Commands, handleCommand as handleMp3 } from "./commands/mp3.js";
import { commands as ttsCommands, handleCommand as handleTts } from "./commands/tts.js";
import { commands as profileCommands, handleCommand as handleProfile } from "./commands/profile.js";
import { handleReactionRoleAdd, handleReactionRoleRemove } from "./commands/reactionRoles.js";
import {
  commands as rechercheCommands,
  handleCommand as handleRecherche,
} from "./commands/recherche.js";
import {
  commands as cleanDuplicatesCommands,
  handleCommand as handleCleanDuplicates,
} from "./commands/clean-duplicates.js";
import {
  commands as maintenanceCommands,
  handleCommand as handleMaintenance,
} from "./commands/maintenance.js";
import { commands as userinfoCommands } from "./commands/userinfo.js";
import {
  commands as advancedCommands,
  handleCommand as handleAdvanced,
} from "./commands/advanced.js";
import {
  commands as communityExtraCommands,
  handleCommand as handleCommunityExtra,
} from "./commands/communityExtra.js";
import { commands as dashboardCommands } from "./commands/dashboard.js";
import { commands as aiCmdCommands } from "./commands/aiCommands.js";
import {
  commands as modExtraCommands,
  handleCommand as handleModExtra,
} from "./commands/modExtra.js";
import {
  commands as extraCmdCommands,
  handleCommand as handleExtraCmd,
} from "./commands/extraCommands.js";
import {
  radioGamingCommands as radioCommands,
  handleRadioGamingCommand as handleRadioGaming,
} from "./cron/radioGaming.js";
import {
  commands as modProCommands,
  handleCommand as handleModPro,
} from "./commands/moderationPro.js";
import {
  commands as audioPanelCommands,
  handleCommand as handleAudioPanel,
} from "./commands/audioPanel.js";
import {
  commands as utilityGamingCommands,
  handleCommand as handleUtilityGaming,
} from "./commands/utilityCommands.js";
import {
  commands as apiCmdCommands,
  handleCommand as handleApiCmd,
} from "./commands/apiCommands.js";
import {
  commands as channelRoutingCommands,
  handleCommand as handleChannelRouting,
} from "./commands/channelRouting.js";
import {
  commands as purgeContentCommands,
  handleCommand as handlePurgeContent,
} from "./commands/purgeContent.js";
import { commands as shadowCommands, handleCommand as handleShadow } from "./commands/shadow.js";
import { commands as osintCommands, handleCommand as handleOsint } from "./commands/osint.js";
// ─── Wrappers de regroupement (subcommands) ───
import { commands as modGroupCommands, handleCommand as handleModGroup } from "./commands/mod.js";
import {
  commands as securityGroupCommands,
  handleCommand as handleSecurityGroup,
} from "./commands/securityGroup.js";
import {
  commands as sourcesGroupCommands,
  handleCommand as handleSourcesGroup,
} from "./commands/sourcesGroup.js";
import {
  commands as trackGroupCommands,
  handleCommand as handleTrackGroup,
} from "./commands/trackGroup.js";
import {
  commands as casierGroupCommands,
  handleCommand as handleCasierGroup,
} from "./commands/casierGroup.js";
import {
  commands as alertGroupCommands,
  handleCommand as handleAlertGroup,
} from "./commands/alertGroup.js";
import { commands as aiGroupCommands, handleCommand as handleAiGroup } from "./commands/aiGroup.js";
import {
  commands as botGroupCommands,
  handleCommand as handleBotGroup,
} from "./commands/botGroup.js";
import {
  commands as adminGroupCommands,
  handleCommand as handleAdminGroup,
} from "./commands/adminGroup.js";
import {
  commands as gameGroupCommands,
  handleCommand as handleGameGroup,
} from "./commands/gameGroup.js";
import {
  commands as toolsGroupCommands,
  handleCommand as handleToolsGroup,
} from "./commands/toolsGroup.js";
import {
  commands as communityGroupCommands,
  handleCommand as handleCommunityGroup,
} from "./commands/communityGroup.js";
import {
  commands as funGroupCommands,
  handleCommand as handleFunGroup,
} from "./commands/funGroup.js";
import {
  commands as game2GroupCommands,
  handleCommand as handleGame2Group,
} from "./commands/game2Group.js";
import {
  commands as musicGroupCommands,
  handleCommand as handleMusicGroup,
} from "./commands/musicGroup.js";
import {
  commands as economyGroupCommands,
  handleCommand as handleEconomyGroup,
} from "./commands/economyGroup.js";
import {
  commands as ticketGroupCommands,
  handleCommand as handleTicketGroup,
} from "./commands/ticketGroup.js";

export type CmdHandler = (interaction: Interaction, client: Client) => Promise<void>;
export const commandRouter: Record<string, CmdHandler> = {};

const commandMiddlewares = [
  createLoggingMiddleware(),
  createPermissionGuardMiddleware(),
  createRateLimitMiddleware(),
];

const REMOVED_COMMANDS = new Set([
  "lockdown",
  "dashboard",
  "userinfo",
  "reverse",
  "poll",
  "reminder",
  "lfg",
  "lfg-list",
  "playtime",
  "game-recommend",
  "metacritic",
  "game-trivia",
  "rank",
  "leaderboard",
  "level-config",
  "birthday-set",
  "birthday-list",
  "avatar",
  "role-info",
  "channel-info",
  "color",
  "dice",
  "coinflip",
  "8ball",
  "rps",
  "wordle",
  "guess-game",
  "emoji-quiz",
  "ai-profile",
  "ai-config",
  "ai-channel-summary",
  "ai-suggest",
  "ai-mood",
  "riskscore",
  "riskyusers",
  "lock",
  "slowmode",
  "dictee",
  "timer",
  "hangman",
  // ─── Anciennes commandes regroupées en subcommands ───
  "warn",
  "mute",
  "unmute",
  "kick",
  "ban",
  "timeout",
  "clear",
  "unlock",
  "purge",
  "history",
  "nuke",
  "check-alt",
  "blacklist",
  "role-mass",
  "antiraid",
  "verif",
  "namehistory",
  "avatarhistory",
  "linkcheck",
  "alt-link",
  "ban-log",
  "behavior-timeline",
  "alert-rules",
  "add-source",
  "remove-source",
  "list-sources",
  "pause-source",
  "reddit-track",
  "rss-custom",
  "track-game",
  "untrack-game",
  "list-tracked",
  "casier-clear",
  "alertcenter",
  "alertconfig",
  "smart-alerts",
  "chat",
  "mention",
  "aichat",
  "smartpoll",
  "ai-translate-custom",
  "giveaway",
  // ─── Commandes supprimées (nettoyage) ───
  "qr-code",
  "screenshot",
  "spotify-search",
  "yt-search",
  "lastfm",
  "timer",
  "play",
  "stop",
  "pause",
  "resume",
  "skip",
  "previous",
  "shuffle",
  "loop",
  "seek",
  "volume",
  "queue-status",
  "nowplaying",
  "reaction-roles",
  "welcome-config",
  "goodbye-config",
  "poll",
  "reminder",
  "lfg",
  "lfg-list",
  "retrospective",
  "retro-config",
  "memory-profile",
  "dictee",
  "hangman",
  "quiz",
  "debate",
  "two-truths",
  "fortune",
  "compliment",
  "roast",
  "pickup-line",
  "vibe-check",
  "therapy",
  "timecapsule",
  // ─── Commandes IA supprimées (regroupées en sous-commandes /ai) ───
  "ai-profile",
  "ai-suggest",
  "ai-mood",
  "ai-fun",
  "ai-channel-summary",
  "ai-translate-custom",
  "aichat",
  "smartpoll",
  "mention",
  "chat",
  "translate-auto",
  "summarize",
  "explain",
  // ─── Commandes regroupées en sous-commandes (vague 2) ───
  "start",
  "help",
  "restart",
  "status",
  "uptime",
  "userinfo",
  "server-info",
  "dashboard",
  "debug",
  "hotreload",
  "broadcast",
  "dm",
  "deletehistory",
  "maintenance",
  "clean-duplicates",
  "backup",
  "permission-audit",
  "guild-config",
  "cooldown-config",
  "channel-routing",
  "purge-content",
  "api-status",
  "bot-health",
  "healthz",
  "create-workflow",
  "list-workflows",
  "toggle-workflow",
  "alertcenter",
  "alertconfig",
  "alert-rules",
  "security-audit",
  "riskscore",
  "riskyusers",
  "spam-analysis",
  "auto-report",
  "viral-alert",
  "trend-report",
  "report",
  "ban",
  "kick",
  "mute",
  "unmute",
  "warn",
  "clear",
  "timeout",
  "unlock",
  "lock",
  "slowmode",
  "softban",
  "tempban",
  "purge",
  "purgeuser",
  "snipe",
  "mass-move",
  "voice-kick",
  "raid-shield",
  "ban-log",
  "behavior-timeline",
  "alt-link",
  "namehistory",
  "avatarhistory",
  "linkcheck",
  "source-stats",
  "rss-test",
  "scraper-status",
  "search-notifications",
  "test-freegames",
  "test-rss",
  "game-status",
  "game-info",
  "free-games",
  "free-game-reminder",
  "patch_notes",
  "deal",
  "deals-history",
  "price-compare",
  "price-history",
  "price-track",
  "release-calendar",
  "gaming-news",
  "epic-calendar",
  "steam",
  "steam-deals",
  "wishlist",
  "wishlist-stats",
  "wishlist-notify",
  "boutique",
  "fortnite-wishlist",
  "fortnite-shop-preview",
  "xbox",
  "twitch",
  "psn",
  "track-game",
  "untrack-game",
  "list-tracked",
  "ticket-setup",
  "self-role",
  "profile",
  "embed-builder",
  "say",
  "vocal",
  "mp3",
  "tts",
  "recherche",
  "audio-effects",
  "radio-stop",
  "track",
]);

export const allCommands = [
  // Groupes (commandes avec sous-commandes)
  ...botGroupCommands,
  ...sourcesGroupCommands,
  ...adminGroupCommands,
  ...aiGroupCommands,
  ...alertGroupCommands,
  ...modGroupCommands,
  ...securityGroupCommands,
  ...shadowCommands,
  ...osintCommands,
  ...gameGroupCommands,
  ...communityGroupCommands,
  ...toolsGroupCommands,
  ...casierGroupCommands,
  ...funGroupCommands,
  ...game2GroupCommands,
  ...musicGroupCommands,
  ...economyGroupCommands,
  ...ticketGroupCommands,
].filter((cmd) => {
  const name = (cmd as { name?: string }).name;
  return name ? !REMOVED_COMMANDS.has(name) : true;
});

function registerGroup(
  groupNames: string[],
  handler: Function /* eslint-disable-line @typescript-eslint/no-unsafe-function-type */,
): void {
  const needsClient = handler.length > 1;
  for (const name of groupNames) {
    commandRouter[name] = async (interaction, client) => {
      if (!interaction.isChatInputCommand()) return;
      if (needsClient) {
        await handler(interaction as ChatInputCommandInteraction, client);
      } else {
        await handler(interaction as ChatInputCommandInteraction);
      }
    };
  }
}

export function buildCommandRouter(): void {
  // ─── Commandes groupées (subcommands) ───
  registerGroup(["bot"], handleBotGroup);
  registerGroup(["sources"], handleSourcesGroup);
  registerGroup(["admin"], handleAdminGroup);
  registerGroup(["ai"], handleAiGroup);
  registerGroup(["alert"], handleAlertGroup);
  registerGroup(["mod"], handleModGroup);
  registerGroup(["security"], handleSecurityGroup);
  registerGroup(["shadow"], handleShadow);
  registerGroup(["osint"], handleOsint);
  registerGroup(["game"], handleGameGroup);
  registerGroup(["community"], handleCommunityGroup);
  registerGroup(["tools"], handleToolsGroup);
  registerGroup(["casier"], handleCasierGroup);
  registerGroup(["fun"], handleFunGroup);
  registerGroup(["game2"], handleGame2Group);
  registerGroup(["music"], handleMusicGroup);
  registerGroup(["economy"], handleEconomyGroup);
  registerGroup(["ticket"], handleTicketGroup);
}

export function applyCommandMiddleware(): void {
  for (const name of Object.keys(commandRouter)) {
    const handler = commandRouter[name];
    if (handler) {
      commandRouter[name] = withMiddleware(handler, commandMiddlewares);
    }
  }
}

export async function registerCommands(): Promise<void> {
  try {
    const rest = new REST({ version: "10" }).setToken(config.token);
    logger.info("Enregistrement des commandes slash...");
    if (config.guildId) {
      await rest.put(Routes.applicationGuildCommands(config.clientId, config.guildId), {
        body: allCommands,
      });
      logger.info(
        `✓ ${allCommands.length} commandes enregistrees pour la guilde ${config.guildId}`,
      );
    } else {
      await rest.put(Routes.applicationCommands(config.clientId), { body: allCommands });
      logger.info(`✓ ${allCommands.length} commandes enregistrees globalement`);
    }
  } catch (error) {
    logger.error(
      `Erreur d'enregistrement des commandes: ${error instanceof Error ? error.message : String(error)}`,
      { stack: error instanceof Error ? error.stack : undefined },
    );
  }
}

// Réexport pour interactionHandler
export { handleMainSelectMenu };
