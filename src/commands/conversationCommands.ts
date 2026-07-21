/**
 * conversationCommands.ts — Commande /conversation
 *
 * /conversation new    — Démarre une nouvelle session nommée
 * /conversation list   — Liste les conversations passées
 * /conversation end    — Termine la session active
 */

import { SlashCommandBuilder, ChatInputCommandInteraction } from "discord.js";
import {
  handleConversationNew,
  handleConversationList,
  handleConversationEnd,
} from "../services/conversationSessions.js";

export const commands = [
  new SlashCommandBuilder()
    .setName("conversation")
    .setDescription("Gère tes conversations IA persistantes")
    .addSubcommand((sub) =>
      sub
        .setName("new")
        .setDescription("Démarre une nouvelle conversation nommée")
        .addStringOption((opt) =>
          opt.setName("nom").setDescription("Nom de la conversation").setRequired(true),
        ),
    )
    .addSubcommand((sub) => sub.setName("list").setDescription("Liste tes conversations passées"))
    .addSubcommand((sub) => sub.setName("end").setDescription("Termine la conversation active"))
    .toJSON(),
];

export async function handleCommand(interaction: ChatInputCommandInteraction) {
  const sub = interaction.options.getSubcommand();

  switch (sub) {
    case "new":
      await handleConversationNew(interaction);
      break;
    case "list":
      await handleConversationList(interaction);
      break;
    case "end":
      await handleConversationEnd(interaction);
      break;
  }
}
