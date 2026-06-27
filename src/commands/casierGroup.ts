import { ChatInputCommandInteraction, SlashCommandBuilder } from "discord.js";
import { handleCommand as handleCasier } from "./casier.js";

export const commands = [
  new SlashCommandBuilder()
    .setName("casier")
    .setDescription("Casier judiciaire d'un membre")
    .addSubcommand((sc) =>
      sc
        .setName("view")
        .setDescription("Affiche le casier judiciaire d'un membre")
        .addUserOption((o) =>
          o.setName("cible").setDescription("Le membre à consulter").setRequired(true),
        ),
    )
    .addSubcommand((sc) =>
      sc
        .setName("clear")
        .setDescription("Supprime une sanction ou tout le casier (admin)")
        .addIntegerOption((o) =>
          o.setName("id").setDescription("ID de la sanction").setRequired(false),
        )
        .addUserOption((o) =>
          o.setName("membre").setDescription("Membre à effacer").setRequired(false),
        ),
    )
    .toJSON(),
];

const NAME_MAP: Record<string, string> = {
  view: "casier",
  clear: "casier-clear",
};

export async function handleCommand(interaction: ChatInputCommandInteraction) {
  const action = interaction.options.getSubcommand();
  const mappedName = NAME_MAP[action] || action;
  Object.defineProperty(interaction, "commandName", { value: mappedName, writable: true });
  await handleCasier(interaction);
}
