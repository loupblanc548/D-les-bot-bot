import { ChatInputCommandInteraction, SlashCommandBuilder, Client } from "discord.js";
import { handleCommand as handleCommunity } from "./community.js";
import { handleCommand as handleCommunityExtra } from "./communityExtra.js";
import { handleCommand as handleProfile } from "./profile.js";

export const commands = [
  new SlashCommandBuilder()
    .setName("community")
    .setDescription("Fonctionnalités communautaires")
    .addSubcommand((sc) =>
      sc.setName("ticket-setup").setDescription("Configure le système de tickets"),
    )
    .addSubcommand((sc) =>
      sc
        .setName("self-role")
        .setDescription("Rôles auto-attribuables (admin)")
        .addStringOption((o) => o.setName("action").setDescription("Action").setRequired(true)),
    )
    .addSubcommand((sc) =>
      sc
        .setName("profile")
        .setDescription("Profil personnalisé (bio, couleur, badges, titre)")
        .addStringOption((o) => o.setName("action").setDescription("Action").setRequired(true)),
    )
    .toJSON(),
];

export async function handleCommand(interaction: ChatInputCommandInteraction, client: unknown) {
  const dc = client as Client;
  const action = interaction.options.getSubcommand();
  Object.defineProperty(interaction, "commandName", { value: action, writable: true });

  if (action === "ticket-setup") {
    await handleCommunity(interaction, dc);
  } else if (action === "self-role") {
    await handleCommunityExtra(interaction, dc);
  } else if (action === "profile") {
    await handleProfile(interaction);
  }
}
