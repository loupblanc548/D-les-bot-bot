/**
 * interactionHandler.ts — Gestionnaires d'interactions Discord
 *
 * Extrait de index.ts pour réduire sa complexité.
 * Regroupe les 3 events InteractionCreate : commandes, boutons+select, autocomplete.
 */

import { Client, Events, Interaction, MessageFlags } from "discord.js";
import * as Sentry from "@sentry/node";
import logger from "./utils/logger.js";
import prisma from "./prisma.js";
import { commandRouter } from "./commandRouter.js";
import {
  tryRemoteExecution,
  applyRemoteResult,
  notifyRemoteProcessing,
} from "./infrastructure/bridge/remoteRouter.js";
import { evaluateOffload, recordExecution } from "./infrastructure/monitors/offloadController.js";
import { isOffloadableCommand } from "./infrastructure/bridge/bridgeTypes.js";
import { handleMainSelectMenu } from "./commandRouter.js";
import { handleVerifButton } from "./commands/security.js";
import { handleAutocomplete } from "./commands/trackGame.js";
import { createTicket, closeTicket, claimTicket, getPanel } from "./services/ticketService.js";
import { handleTriviaButton } from "./services/triviaService.js";
import { handleAutocomplete as handleMp3Autocomplete } from "./commands/mp3.js";
import { handleAutocomplete as handleWishlistAutocomplete } from "./commands/fun/wishlist.js";
import { handleAutocomplete as handleTwitchAutocomplete } from "./commands/twitch.js";
import { handleAutocomplete as handleFortnitePartyAutocomplete } from "./commands/fun/fortniteParty.js";
import { handleAutocomplete as handleProfileAutocomplete } from "./commands/profile.js";

export function attachInteractionHandlers(client: Client): void {
  // ── 0. Context Menus (clic droit) ──────────────────────────────────
  client.on(Events.InteractionCreate, async (interaction: Interaction) => {
    if (!interaction.isContextMenuCommand()) return;
    const handler = commandRouter[interaction.commandName];
    if (handler) {
      try {
        await handler(interaction, client);
      } catch (error) {
        logger.error(
          `[ContextMenu] /${interaction.commandName}: ${error instanceof Error ? error.message : String(error)}`,
        );
        const reply =
          interaction.replied || interaction.deferred
            ? interaction.followUp.bind(interaction)
            : interaction.reply.bind(interaction);
        await reply({
          content: "❌ Une erreur est survenue.",
          flags: [MessageFlags.Ephemeral],
        }).catch(() => {});
      }
    }
  });

  // ── 1. Commandes slash ──────────────────────────────────────────────
  client.on(Events.InteractionCreate, async (interaction: Interaction) => {
    if (!interaction.isChatInputCommand()) return;
    const handler = commandRouter[interaction.commandName];
    if (handler) {
      try {
        // Defer reply on ALL slash commands to prevent Discord 3s timeout
        if (!interaction.deferred && !interaction.replied) {
          await interaction.deferReply().catch(() => {});
        }

        // ─── HYBRID OFFLOAD: Check if command should be sent to worker ───
        if (isOffloadableCommand(interaction.commandName)) {
          const decision = evaluateOffload();
          if (decision.target === "remote") {
            // Notify user and attempt remote execution
            await notifyRemoteProcessing(interaction);
            const remoteResult = await tryRemoteExecution(interaction);
            if (remoteResult && remoteResult.success) {
              await applyRemoteResult(interaction, remoteResult);
              recordExecution("remote");
              return;
            }
            // Remote failed or unavailable — fall through to local execution
            if (remoteResult && !remoteResult.success) {
              logger.warn(
                `[Interaction] Remote execution failed, falling back to local: ${remoteResult.error}`,
              );
            }
          } else if (decision.target === "local_degraded") {
            recordExecution("local_degraded");
            logger.warn(`[Interaction] Degraded mode: ${decision.reason}`);
          } else {
            recordExecution("local");
          }
        }

        // Timeout fallback: if handler doesn't complete in 15s, send a message
        const timeout = setTimeout(() => {
          if (!interaction.replied && !interaction.deferred) return;
          if (interaction.deferred && !interaction.replied) {
            interaction
              .editReply({
                content: "⏱️ La commande prend plus de temps que prévu. Réessaie dans un instant.",
              })
              .catch(() => {});
          }
        }, 15_000);

        await handler(interaction, client);
        clearTimeout(timeout);
      } catch (error) {
        logger.error(
          `Erreur commande /${interaction.commandName}: ${error instanceof Error ? error.message : String(error)}`,
          { stack: error instanceof Error ? error.stack : undefined },
        );
        await Sentry.captureException(error, { tags: { command: interaction.commandName } });
        const reply =
          interaction.replied || interaction.deferred
            ? interaction.followUp.bind(interaction)
            : interaction.reply.bind(interaction);
        await reply({
          content: "❌ Une erreur est survenue lors de l'execution de la commande.",
          flags: [MessageFlags.Ephemeral],
        }).catch(() => {});
      }
    } else {
      // Commande non trouvée — probablement une ancienne commande standalone migrée en sous-commande
      logger.warn(`[Interaction] Commande /${interaction.commandName} non trouvée dans le router`);
      await interaction
        .reply({
          content: `⚠️ La commande \`/${interaction.commandName}\` n'existe plus. Elle a été regroupée — essaie \`/bot help\` pour voir les commandes disponibles.`,
          flags: [MessageFlags.Ephemeral],
        })
        .catch(() => {});
    }
  });

  // ── 2. Boutons + Select menus ───────────────────────────────────────
  client.on(Events.InteractionCreate, async (interaction: Interaction) => {
    if (interaction.isButton()) {
      try {
        const handled = handleVerifButton(interaction);
        if (handled) return;

        // ── Ticket buttons ──
        if (interaction.customId === "ticket_create") {
          if (!interaction.guild) return;
          const member = await interaction.guild.members.fetch(interaction.user.id);

          // Check if this came from a panel
          const panel = await getPanel(
            interaction.guild.id,
            interaction.channelId,
            interaction.message.id,
          ).catch(() => null);

          const ticketChannel = await createTicket(interaction.guild, member, panel?.id ?? null);

          if (ticketChannel) {
            await interaction.reply({
              content: `✅ Ticket créé : ${ticketChannel.toString()}`,
              flags: [MessageFlags.Ephemeral],
            });
          } else {
            await interaction.reply({
              content: "❌ Tu as déjà un ticket ouvert ou une erreur est survenue.",
              flags: [MessageFlags.Ephemeral],
            });
          }
          return;
        }

        if (interaction.customId === "ticket_close") {
          const closed = await closeTicket(interaction, interaction.user.id);
          if (!closed) {
            await interaction.reply({
              content: "❌ Ce salon n'est pas un ticket ou une erreur est survenue.",
              flags: [MessageFlags.Ephemeral],
            });
          }
          return;
        }

        if (interaction.customId === "ticket_claim") {
          const claimed = await claimTicket(
            interaction,
            interaction.channelId,
            interaction.user.id,
          );
          if (claimed) {
            await interaction.reply({
              content: `✋ ${interaction.user.toString()} a pris en charge ce ticket.`,
            });
          } else {
            await interaction.reply({
              content:
                "❌ Impossible de prendre en charge ce ticket (déjà pris en charge ou erreur).",
              flags: [MessageFlags.Ephemeral],
            });
          }
          return;
        }

        // ── Trivia buttons ──
        if (interaction.customId.startsWith("trivia_")) {
          await handleTriviaButton(interaction);
          return;
        }
      } catch (err) {
        logger.error(`[Bouton] Erreur: ${err instanceof Error ? err.message : String(err)}`, {
          stack: err instanceof Error ? err.stack : undefined,
        });
      }
    }

    if (!interaction.isStringSelectMenu()) return;
    if (interaction.customId === "help_category_select") {
      try {
        await handleMainSelectMenu(interaction);
      } catch (error) {
        logger.error(
          `Erreur select menu ${interaction.customId}: ${error instanceof Error ? error.message : String(error)}`,
          { stack: error instanceof Error ? error.stack : undefined },
        );
        const reply =
          interaction.replied || interaction.deferred
            ? interaction.followUp.bind(interaction)
            : interaction.reply.bind(interaction);
        await reply({
          content: "❌ Une erreur est survenue lors de la sélection.",
          flags: [MessageFlags.Ephemeral],
        }).catch(() => {});
      }
    }
  });

  // ── 3. Autocomplete ─────────────────────────────────────────────────
  client.on(Events.InteractionCreate, async (interaction: Interaction) => {
    if (!interaction.isAutocomplete()) return;

    switch (interaction.commandName) {
      case "removesource": {
        const focused = interaction.options.getFocused();
        const sources = await prisma.source.findMany({
          where: { urlOrHandle: { contains: focused.replace("@", "") } },
          take: 25,
        });
        await interaction.respond(
          sources.map((s) => ({ name: `@${s.urlOrHandle} (${s.type})`, value: s.urlOrHandle })),
        );
        break;
      }
      case "untrack-game":
        await handleAutocomplete(interaction);
        break;
      case "mp3":
        await handleMp3Autocomplete(interaction);
        break;
      case "wishlist":
        await handleWishlistAutocomplete(interaction);
        break;
      case "twitch":
        await handleTwitchAutocomplete(interaction);
        break;
      case "game": {
        const sub = interaction.options.getSubcommand();
        if (sub === "wishlist") {
          await handleWishlistAutocomplete(interaction);
        }
        break;
      }
      case "fnbot": {
        const sub = interaction.options.getSubcommand();
        if (["skin", "emote", "backbling", "pickaxe"].includes(sub)) {
          await handleFortnitePartyAutocomplete(interaction);
        }
        break;
      }
      case "profile": {
        await handleProfileAutocomplete(interaction);
        break;
      }
    }
  });
}
