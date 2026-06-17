/**
 * commandRouter.ts — Routeur de commandes slash
 *
 * Extrait de index.ts pour réduire sa complexité.
 * Contient : buildCommandRouter, applyCommandMiddleware, registerCommands
 */

import { REST, Routes, Interaction, ChatInputCommandInteraction, Client } from "discord.js";
import { config } from "./config";
import logger from "./utils/logger";
import { createLoggingMiddleware, createRateLimitMiddleware, withMiddleware } from "./middleware";

import {
  commands as mainCommands,
  handleCommand as handleMain,
  handleSelectMenu as handleMainSelectMenu,
} from "./commands/main";
import { commands as sourceCommands, handleCommand as handleSource } from "./commands/sources";
import { commands as adminCommands, handleCommand as handleAdmin } from "./commands/admin";
import { commands as aiCommands, handleCommand as handleAI } from "./commands/ai";
import { commands as modCommands, handleCommand as handleModeration } from "./commands/moderation";
import { commands as casierCommands, handleCommand as handleCasier } from "./commands/casier";
import {
  commands as securityCommands,
  handleCommand as handleSecurity,
} from "./commands/security/core";
import { commands as gamingCommands, handleCommand as handleGaming } from "./commands/gaming";
import {
  commands as communityCommands,
  handleCommand as handleCommunity,
} from "./commands/community";
import { commands as utilityCommands, handleCommand as handleUtility } from "./commands/utility";
import { commands as vocalCommands, handleCommand as handleVocal } from "./commands/vocal";
import {
  commands as retrospectiveCommands,
  handleCommand as handleRetrospective,
} from "./commands/retrospective";
import { commands as twitchCommands, handleCommand as handleTwitch } from "./commands/twitch";
import { commands as steamCommands, handleCommand as handleSteam } from "./commands/steam";
import {
  commands as trackGameCommands,
  handleCommand as handleTrackGame,
} from "./commands/trackGame";
import { commands as psnCommands, handleCommand as handlePsn } from "./commands/psn";
import {
  commands as echoTdsCommands,
  handleCommand as handleEchoTds,
} from "./commands/fun/echoTds";
import { commands as askBotCommands, handleCommand as handleAskBot } from "./commands/fun/askBot";
import {
  commands as wishlistCommands,
  handleCommand as handleWishlist,
} from "./commands/fun/wishlist";
import { commands as shopCommands, handleCommand as handleShop } from "./commands/fun/shop";
import { commands as dicteeCommands, handleCommand as handleDictee } from "./commands/dictee";
import {
  commands as alertcenterCommands,
  handleCommand as handleAlertcenter,
} from "./commands/alertcenter";
import { commands as mp3Commands, handleCommand as handleMp3 } from "./commands/mp3";
import {
  commands as cleanDuplicatesCommands,
  handleCommand as handleCleanDuplicates,
} from "./commands/clean-duplicates";
import { commands as aiExtraCommands, handleCommand as handleAIExtra } from "./commands/ai-extra";
import {
  commands as maintenanceCommands,
  handleCommand as handleMaintenance,
} from "./commands/maintenance";

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
  ...retrospectiveCommands,
  ...twitchCommands,
  ...steamCommands,
  ...psnCommands,
  ...trackGameCommands,
  ...echoTdsCommands,
  ...askBotCommands,
  ...wishlistCommands,
  ...shopCommands,
  ...aiExtraCommands,
  ...dicteeCommands,
  ...alertcenterCommands,
  ...mp3Commands,
  ...cleanDuplicatesCommands,
  ...maintenanceCommands,
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
  registerGroup(["start", "help", "status", "restart", "retro"], handleMain);
  registerGroup(["addsource", "removesource", "listsources"], handleSource);
  registerGroup(["broadcast", "dm", "logs", "deletehistory", "test-freegames"], handleAdmin);
  registerGroup(["chat", "mention", "aichat", "smartpoll"], handleAI);
  registerGroup(["translate", "summarize"], handleAIExtra);
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
      "softban",
      "purge",
      "slowmode",
      "snipe",
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
      "guildconfig",
    ],
    handleSecurity,
  );
  registerGroup(["free-games", "game-status", "patch_notes", "deal"], handleGaming);
  registerGroup(["reminder", "ticket-setup", "wishlist-notify"], handleCommunity);
  registerGroup(["embed-builder", "say"], handleUtility);
  registerGroup(["vocal"], handleVocal);
  registerGroup(["retrospective"], handleRetrospective);
  registerGroup(["twitch"], handleTwitch);
  registerGroup(["steam"], handleSteam);
  registerGroup(["track-game", "untrack-game", "list-tracked"], handleTrackGame);
  registerGroup(["psn"], handlePsn);
  registerGroup(["mp3"], handleMp3);
  registerGroup(["dictee"], handleDictee);
  registerGroup(["alertcenter", "riskscore", "riskyusers", "alertconfig"], handleAlertcenter);
  registerGroup(["clean-duplicates"], handleCleanDuplicates);
  registerGroup(["maintenance"], handleMaintenance);

  // Commandes fun dispatchées via le handler main
  for (const name of ["echo-tds", "ask-bot", "wishlist", "shop"]) {
    commandRouter[name] = async (interaction, client) => {
      if (!interaction.isChatInputCommand()) return;
      const cmd = interaction as ChatInputCommandInteraction;
      if (name === "echo-tds") await handleEchoTds(cmd, client);
      else if (name === "ask-bot") await handleAskBot(cmd);
      else if (name === "wishlist") await handleWishlist(cmd);
      else if (name === "shop") await handleShop(cmd);
    };
  }
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
