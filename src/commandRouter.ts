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
import { commands as dicteeCommands, handleCommand as handleDictee } from "./commands/dictee.js";
import {
  commands as alertcenterCommands,
  handleCommand as handleAlertcenter,
} from "./commands/alertcenter.js";
import { commands as mp3Commands, handleCommand as handleMp3 } from "./commands/mp3.js";
import {
  commands as cleanDuplicatesCommands,
  handleCommand as handleCleanDuplicates,
} from "./commands/clean-duplicates.js";
import {
  commands as maintenanceCommands,
  handleCommand as handleMaintenance,
} from "./commands/maintenance.js";
import {
  commands as userinfoCommands,
  handleCommand as handleUserinfo,
} from "./commands/userinfo.js";
import {
  commands as advancedCommands,
  handleCommand as handleAdvanced,
} from "./commands/advanced.js";
import {
  commands as communityExtraCommands,
  handleCommand as handleCommunityExtra,
} from "./commands/communityExtra.js";
import {
  commands as dashboardCommands,
  handleCommand as handleDashboard,
} from "./commands/dashboard.js";
import { commands as aiCmdCommands, handleCommand as handleAiCmd } from "./commands/aiCommands.js";
import {
  commands as modExtraCommands,
  handleCommand as handleModExtra,
} from "./commands/modExtra.js";

export type CmdHandler = (interaction: Interaction, client: Client) => Promise<void>;
export const commandRouter: Record<string, CmdHandler> = {};

const commandMiddlewares = [createLoggingMiddleware(), createRateLimitMiddleware()];

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
  ...dicteeCommands,
  ...alertcenterCommands,
  ...mp3Commands,
  ...cleanDuplicatesCommands,
  ...maintenanceCommands,
  ...userinfoCommands,
  ...advancedCommands,
  ...communityExtraCommands,
  ...dashboardCommands,
  ...aiCmdCommands,
  ...modExtraCommands,
];

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
    [
      "ban",
      "kick",
      "mute",
      "unmute",
      "warn",
      "clear",
      "timeout",
      "lock",
      "unlock",
      "purge",
      "slowmode",
      "history",
    ],
    handleModeration,
  );
  registerGroup(["casier", "casier-clear"], handleCasier);
  registerGroup(
    [
      "lockdown",
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
  registerGroup(["embed-builder", "say", "poll"], handleUtility);
  registerGroup(["vocal"], handleVocal);
  registerGroup(["twitch"], handleTwitch);
  registerGroup(["steam"], handleSteam);
  registerGroup(["track-game", "untrack-game", "list-tracked"], handleTrackGame);
  registerGroup(["psn"], handlePsn);
  registerGroup(["mp3"], handleMp3);
  registerGroup(["dictee"], handleDictee);
  registerGroup(["alertcenter", "riskscore", "riskyusers", "alertconfig"], handleAlertcenter);
  registerGroup(["clean-duplicates"], handleCleanDuplicates);
  registerGroup(["maintenance"], handleMaintenance);
  registerGroup(["userinfo"], handleUserinfo);
  registerGroup(["smart-alerts", "fortnite-wishlist"], handleAdvanced);

  // Commandes fun dispatchées via le handler main
  for (const name of ["wishlist"]) {
    commandRouter[name] = async (interaction, _client) => {
      if (!interaction.isChatInputCommand()) return;
      const cmd = interaction as ChatInputCommandInteraction;
      if (name === "wishlist") await handleWishlist(cmd);
    };
  }

  registerGroup(["reminder", "lfg", "lfg-list", "giveaway", "self-role"], handleCommunityExtra);
  registerGroup(["dashboard"], handleDashboard);
  registerGroup(["ai-profile", "ai-config", "ai-channel-summary"], handleAiCmd);
  registerGroup(["report"], handleModExtra);
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
