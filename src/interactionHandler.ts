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
import { handleMainSelectMenu } from "./commandRouter.js";
import { handleVerifButton } from "./commands/security.js";
import { handleAutocomplete } from "./commands/trackGame.js";
import { handleAutocomplete as handleMp3Autocomplete } from "./commands/mp3.js";
import { handleAutocomplete as handleWishlistAutocomplete } from "./commands/fun/wishlist.js";
import { handleTranslateAutocomplete } from "./commands/utility.js";

export function attachInteractionHandlers(client: Client): void {
  // ── 1. Commandes slash ──────────────────────────────────────────────
  client.on(Events.InteractionCreate, async (interaction: Interaction) => {
    if (!interaction.isChatInputCommand()) return;
    const handler = commandRouter[interaction.commandName];
    if (handler) {
      try {
        await handler(interaction, client);
      } catch (error) {
        logger.error(`Erreur commande /${interaction.commandName}: ${error instanceof Error ? error.message : String(error)}`, { stack: error instanceof Error ? error.stack : undefined });
        await Sentry.captureException(error, { tags: { command: interaction.commandName } });
        const reply = interaction.replied || interaction.deferred
          ? interaction.followUp.bind(interaction)
          : interaction.reply.bind(interaction);
        await reply({ content: "❌ Une erreur est survenue lors de l'execution de la commande.", flags: [MessageFlags.Ephemeral] }).catch(() => {});
      }
    }
  });

  // ── 2. Boutons + Select menus ───────────────────────────────────────
  client.on(Events.InteractionCreate, async (interaction: Interaction) => {
    if (interaction.isButton()) {
      try {
        const handled = handleVerifButton(interaction);
        if (handled) return;
      } catch (err) {
        logger.error(`[Bouton] Erreur: ${err instanceof Error ? err.message : String(err)}`, { stack: err instanceof Error ? err.stack : undefined });
      }
    }

    if (!interaction.isStringSelectMenu()) return;
    if (interaction.customId === "help_category_select") {
      try {
        await handleMainSelectMenu(interaction);
      } catch (error) {
        logger.error(`Erreur select menu ${interaction.customId}: ${error instanceof Error ? error.message : String(error)}`, { stack: error instanceof Error ? error.stack : undefined });
        const reply = interaction.replied || interaction.deferred
          ? interaction.followUp.bind(interaction)
          : interaction.reply.bind(interaction);
        await reply({ content: "❌ Une erreur est survenue lors de la sélection.", flags: [MessageFlags.Ephemeral] }).catch(() => {});
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
          sources.map((s) => ({ name: `@${s.urlOrHandle} (${s.type})`, value: s.urlOrHandle }))
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
      case "translate":
        await handleTranslateAutocomplete(interaction);
        break;
    }
  });
}
