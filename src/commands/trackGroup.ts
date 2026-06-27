import { ChatInputCommandInteraction, SlashCommandBuilder } from "discord.js";
import { handleCommand as handleTrackGame } from "./trackGame.js";

export const commands = [
  new SlashCommandBuilder()
    .setName("track")
    .setDescription("Surveillance de jeux Steam")
    .addSubcommand((sc) =>
      sc
        .setName("add")
        .setDescription("Surveiller les actualités d'un jeu Steam")
        .addStringOption((o) =>
          o
            .setName("jeu")
            .setDescription("Nom du jeu à suivre")
            .setRequired(true)
            .setMinLength(2)
            .setAutocomplete(true),
        ),
    )
    .addSubcommand((sc) =>
      sc
        .setName("remove")
        .setDescription("Retirer un jeu de la surveillance Steam")
        .addStringOption((o) =>
          o
            .setName("jeu")
            .setDescription("Nom du jeu à retirer")
            .setRequired(true)
            .setAutocomplete(true),
        ),
    )
    .addSubcommand((sc) => sc.setName("list").setDescription("Lister tous les jeux surveillés"))
    .toJSON(),
];

const NAME_MAP: Record<string, string> = {
  add: "track-game",
  remove: "untrack-game",
  list: "list-tracked",
};

export async function handleCommand(interaction: ChatInputCommandInteraction) {
  const action = interaction.options.getSubcommand();
  const mappedName = NAME_MAP[action] || action;
  Object.defineProperty(interaction, "commandName", { value: mappedName, writable: true });
  await handleTrackGame(interaction);
}
