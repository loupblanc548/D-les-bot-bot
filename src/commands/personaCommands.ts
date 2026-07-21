/**
 * personaCommands.ts — Commande /persona pour custom instructions per-user
 */

import { SlashCommandBuilder, ChatInputCommandInteraction } from "discord.js";
import {
  handlePersonaSet,
  handlePersonaList,
  handlePersonaClear,
} from "../services/customInstructions.js";

export const commands = [
  new SlashCommandBuilder()
    .setName("persona")
    .setDescription("Configure tes instructions personnalisées (ton, langue, détail)")
    .addSubcommand((sub) =>
      sub
        .setName("set")
        .setDescription("Définit une instruction personnalisée")
        .addStringOption((opt) =>
          opt
            .setName("parametre")
            .setDescription("Le paramètre à configurer")
            .setRequired(true)
            .addChoices(
              { name: "Ton (ex: amical, formel, humoristique)", value: "tone" },
              { name: "Langue (ex: français, english, español)", value: "language" },
              { name: "Niveau de détail (ex: concis, détaillé, exhaustif)", value: "detail" },
              { name: "Instructions custom (prompt libre)", value: "custom" },
            ),
        )
        .addStringOption((opt) =>
          opt.setName("valeur").setDescription("La valeur").setRequired(true),
        ),
    )
    .addSubcommand((sub) =>
      sub.setName("list").setDescription("Affiche tes instructions personnalisées"),
    )
    .addSubcommand((sub) =>
      sub
        .setName("clear")
        .setDescription("Supprime une instruction personnalisée")
        .addStringOption((opt) =>
          opt
            .setName("parametre")
            .setDescription("Le paramètre à supprimer (ou 'all')")
            .setRequired(true)
            .addChoices(
              { name: "Ton", value: "tone" },
              { name: "Langue", value: "language" },
              { name: "Niveau de détail", value: "detail" },
              { name: "Instructions custom", value: "custom" },
              { name: "Tout effacer", value: "all" },
            ),
        ),
    )
    .toJSON(),
];

export async function handleCommand(interaction: ChatInputCommandInteraction) {
  const sub = interaction.options.getSubcommand();

  switch (sub) {
    case "set":
      await handlePersonaSet(interaction);
      break;
    case "list":
      await handlePersonaList(interaction);
      break;
    case "clear":
      await handlePersonaClear(interaction);
      break;
  }
}
