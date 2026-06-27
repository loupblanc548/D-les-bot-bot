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
import { commands as dicteeCommands } from "./commands/dictee.js";
import {
  commands as alertcenterCommands,
  handleCommand as handleAlertcenter,
} from "./commands/alertcenter.js";
import { commands as mp3Commands, handleCommand as handleMp3 } from "./commands/mp3.js";
import { commands as ttsCommands, handleCommand as handleTts } from "./commands/tts.js";
import { commands as profileCommands, handleCommand as handleProfile } from "./commands/profile.js";
import {
  commands as reactionRolesCommands,
  handleCommand as handleReactionRoles,
} from "./commands/reactionRoles.js";
import {
  commands as welcomeConfigCommands,
  handleCommand as handleWelcomeConfig,
} from "./commands/welcomeConfig.js";
import {
  commands as goodbyeConfigCommands,
  handleCommand as handleGoodbyeConfig,
} from "./commands/goodbyeConfig.js";
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
  commands as playCommands,
  handlePlayCommand as handlePlay,
  handleStopCommand as handleStop,
  handlePauseCommand as handlePause,
  handleResumeCommand as handleResume,
  handleQueueStatusCommand as handleQueueStatus,
} from "./commands/play.js";
import {
  commands as modProCommands,
  handleCommand as handleModPro,
} from "./commands/moderationPro.js";
import {
  commands as translateAutoCommands,
  handleCommand as handleTranslateAuto,
} from "./commands/translateAuto.js";
import {
  commands as audioPanelCommands,
  handleCommand as handleAudioPanel,
} from "./commands/audioPanel.js";
import {
  commands as queueCtrlCommands,
  handleCommand as handleQueueCtrl,
} from "./commands/queueControls.js";
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

export type CmdHandler = (interaction: Interaction, client: Client) => Promise<void>;
export const commandRouter: Record<string, CmdHandler> = {};

const commandMiddlewares = [createLoggingMiddleware(), createRateLimitMiddleware()];

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
]);

export const allCommands = [
  ...mainCommands,
  ...sourceCommands,
  ...adminCommands,
  ...aiCommands,
  ...modCommands,
  ...casierCommands,
  ...securityCommands,
  ...gamingCommands,
  ...communityCommands,
  ...utilityCommands,
  ...vocalCommands,
  ...twitchCommands,
  ...steamCommands,
  ...psnCommands,
  ...trackGameCommands,
  ...wishlistCommands,
  ...boutiqueCommands,
  ...modGroupCommands,
  ...securityGroupCommands,
  ...sourcesGroupCommands,
  ...trackGroupCommands,
  ...casierGroupCommands,
  ...alertGroupCommands,
  ...aiGroupCommands,
  ...dicteeCommands,
  ...alertcenterCommands,
  ...mp3Commands,
  ...ttsCommands,
  ...profileCommands,
  ...reactionRolesCommands,
  ...welcomeConfigCommands,
  ...goodbyeConfigCommands,
  ...rechercheCommands,
  ...cleanDuplicatesCommands,
  ...maintenanceCommands,
  ...userinfoCommands,
  ...advancedCommands,
  ...communityExtraCommands,
  ...dashboardCommands,
  ...aiCmdCommands,
  ...modExtraCommands,
  ...extraCmdCommands,
  ...radioCommands,
  ...playCommands,
  ...modProCommands,
  ...translateAutoCommands,
  ...audioPanelCommands,
  ...queueCtrlCommands,
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
  registerGroup(["start", "help", "restart"], handleMain);
  registerGroup(
    [
      "broadcast",
      "dm",
      "deletehistory",
      "test-freegames",
      "add-source",
      "remove-source",
      "list-sources",
      "pause-source",
      "backup",
    ],
    handleAdmin,
  );
  registerGroup(["chat", "mention", "aichat", "smartpoll"], handleAI);
  registerGroup(
    ["ban", "kick", "mute", "unmute", "warn", "clear", "timeout", "unlock", "purge", "history"],
    handleModeration,
  );
  registerGroup(["casier", "casier-clear"], handleCasier);
  registerGroup(
    [
      "nuke",
      "check-alt",
      "blacklist",
      "role-mass",
      "antiraid",
      "verif",
      "namehistory",
      "avatarhistory",
      "linkcheck",
      "antiphishing",
    ],
    handleSecurity,
  );
  registerGroup(["free-games", "game-status", "patch_notes", "deal"], handleGaming);
  registerGroup(["ticket-setup"], handleCommunity);
  registerGroup(["embed-builder", "say"], handleUtility);
  registerGroup(["vocal"], handleVocal);
  registerGroup(["twitch"], handleTwitch);
  registerGroup(["steam"], handleSteam);
  registerGroup(["track-game", "untrack-game", "list-tracked"], handleTrackGame);
  registerGroup(["psn"], handlePsn);
  registerGroup(["mp3"], handleMp3);
  registerGroup(["tts"], handleTts);
  registerGroup(["profile"], handleProfile);
  registerGroup(["reaction-roles"], handleReactionRoles);
  registerGroup(["welcome-config"], handleWelcomeConfig);
  registerGroup(["goodbye-config"], handleGoodbyeConfig);
  registerGroup(["recherche"], handleRecherche);
  registerGroup(["alertcenter", "alertconfig"], handleAlertcenter);
  registerGroup(["clean-duplicates"], handleCleanDuplicates);
  registerGroup(["maintenance"], handleMaintenance);
  registerGroup(["smart-alerts", "fortnite-wishlist"], handleAdvanced);

  // ─── Commandes groupées (subcommands) ───
  registerGroup(["mod"], handleModGroup);
  registerGroup(["security"], handleSecurityGroup);
  registerGroup(["sources"], handleSourcesGroup);
  registerGroup(["track"], handleTrackGroup);
  registerGroup(["casier"], handleCasierGroup);
  registerGroup(["alert"], handleAlertGroup);
  registerGroup(["ai"], handleAiGroup);

  // Commandes fun dispatchées via le handler main
  for (const name of ["wishlist", "boutique"]) {
    commandRouter[name] = async (interaction, client) => {
      if (!interaction.isChatInputCommand()) return;
      const cmd = interaction as ChatInputCommandInteraction;
      if (name === "wishlist") await handleWishlist(cmd);
      if (name === "boutique") await handleBoutique(cmd, client);
    };
  }

  registerGroup(["self-role"], handleCommunityExtra);
  registerGroup(["report"], handleModExtra);
  registerGroup(
    [
      "xbox",
      "price-compare",
      "release-calendar",
      "alt-link",
      "ban-log",
      "behavior-timeline",
      "alert-rules",
      "server-info",
      "ai-translate-custom",
      "reddit-track",
      "rss-custom",
    ],
    handleExtraCmd,
  );
  registerGroup(["radio-gaming"], handleRadioGaming);
  registerGroup(["play"], handlePlay);
  registerGroup(["stop"], handleStop);
  registerGroup(["pause"], handlePause);
  registerGroup(["resume"], handleResume);
  registerGroup(["queue-status"], handleQueueStatus);
  registerGroup(["mass-move", "voice-kick", "raid-shield", "spam-analysis"], handleModPro);
  registerGroup(["translate-auto"], handleTranslateAuto);
  registerGroup(["volume", "seek", "audio-effects", "radio-stop"], handleAudioPanel);
  registerGroup(["loop", "shuffle", "skip", "previous"], handleQueueCtrl);
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
