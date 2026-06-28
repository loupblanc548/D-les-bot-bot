import { ChatInputCommandInteraction, SlashCommandBuilder, Client } from "discord.js";
import { handleCommand as handleCasier } from "./casier.js";
import { handleCasierExtra } from "./stubHandlers.js";

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
    // ─── Nouvelles sous-commandes casier ───
    .addSubcommand((sc) =>
      sc
        .setName("add")
        .setDescription("Ajouter une sanction au casier")
        .addUserOption((o) => o.setName("cible").setDescription("Le membre").setRequired(true))
        .addStringOption((o) => o.setName("type").setDescription("Type (warn/mute/kick/ban)").setRequired(true))
        .addStringOption((o) => o.setName("raison").setDescription("Raison").setRequired(true)),
    )
    .addSubcommand((sc) =>
      sc
        .setName("export")
        .setDescription("Exporter le casier d'un membre")
        .addUserOption((o) => o.setName("cible").setDescription("Le membre").setRequired(true)),
    )
    .addSubcommand((sc) => sc.setName("stats").setDescription("Statistiques des sanctions du serveur"))
    .addSubcommand((sc) => sc.setName("top-sanctioned").setDescription("Top des membres les plus sanctionn\u00e9s"))
    .addSubcommand((sc) => sc.setName("history").setDescription("Historique complet des sanctions"))
    .addSubcommand((sc) =>
      sc
        .setName("lock")
        .setDescription("Verrouiller le casier d'un membre (lecture seule)")
        .addUserOption((o) => o.setName("cible").setDescription("Le membre").setRequired(true)),
    )
    .addSubcommand((sc) =>
      sc
        .setName("unlock")
        .setDescription("D\u00e9verrouiller le casier d'un membre")
        .addUserOption((o) => o.setName("cible").setDescription("Le membre").setRequired(true)),
    )
    .addSubcommand((sc) => sc.setName("migrate").setDescription("Migrer les anciens warns vers le casier"))
    .toJSON(),
];

const NAME_MAP: Record<string, string> = {
  view: "casier",
  clear: "casier-clear",
};

export async function handleCommand(interaction: ChatInputCommandInteraction, client?: unknown) {
  const action = interaction.options.getSubcommand();
  const mappedName = NAME_MAP[action] || action;
  Object.defineProperty(interaction, "commandName", { value: mappedName, writable: true });

  if (action === "view" || action === "clear") {
    await handleCasier(interaction);
  } else {
    await handleCasierExtra(interaction, client as Client);
  }
}
