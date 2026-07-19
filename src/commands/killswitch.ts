import {
  SlashCommandBuilder,
  ChatInputCommandInteraction,
  EmbedBuilder,
  Client,
  PermissionFlagsBits,
  MessageFlags,
} from "discord.js";
import { config } from "../config.js";
import { requireAdmin } from "../services/permissions.js";
import {
  isKilled,
  activateKillSwitch,
  deactivateKillSwitch,
  getKillInfo,
} from "../services/killSwitch.js";

export const data = new SlashCommandBuilder()
  .setName("killswitch")
  .setDescription("Active/désactive le kill switch global (admin only)")
  .addSubcommand((sub) =>
    sub.setName("activate").setDescription("Active le kill switch — coupe les boucles autonomes"),
  )
  .addSubcommand((sub) =>
    sub
      .setName("deactivate")
      .setDescription("Désactive le kill switch — reprend les boucles autonomes"),
  )
  .addSubcommand((sub) => sub.setName("status").setDescription("Affiche l'état du kill switch"))
  .setDefaultMemberPermissions(PermissionFlagsBits.Administrator);

export async function execute(interaction: ChatInputCommandInteraction, _client: Client) {
  await requireAdmin(interaction);

  const sub = interaction.options.getSubcommand();

  if (sub === "activate") {
    if (isKilled()) {
      await interaction.reply({
        content: "🔴 Le kill switch est **déjà activé**.",
        flags: [MessageFlags.Ephemeral],
      });
      return;
    }
    activateKillSwitch(interaction.user.tag);
    const embed = new EmbedBuilder()
      .setTitle("🔴 KILL SWITCH ACTIVÉ")
      .setColor(0xff0000)
      .setDescription(
        "Toutes les boucles autonomes sont coupées.\n" +
          "L'agent loop, l'agent brain et l'active defense sont désactivés.\n" +
          "Les commandes admin de base restent disponibles.",
      )
      .addFields({
        name: "Activé par",
        value: interaction.user.tag,
        inline: true,
      })
      .setTimestamp();
    await interaction.reply({ embeds: [embed], flags: [MessageFlags.Ephemeral] });
  } else if (sub === "deactivate") {
    if (!isKilled()) {
      await interaction.reply({
        content: "🟢 Le kill switch n'est **pas activé**.",
        flags: [MessageFlags.Ephemeral],
      });
      return;
    }
    deactivateKillSwitch(interaction.user.tag);
    const embed = new EmbedBuilder()
      .setTitle("🟢 KILL SWITCH DÉSACTIVÉ")
      .setColor(0x00ff00)
      .setDescription("Les boucles autonomes reprennent normalement.")
      .addFields({
        name: "Désactivé par",
        value: interaction.user.tag,
        inline: true,
      })
      .setTimestamp();
    await interaction.reply({ embeds: [embed], flags: [MessageFlags.Ephemeral] });
  } else if (sub === "status") {
    const info = getKillInfo();
    const embed = new EmbedBuilder()
      .setTitle("Kill Switch — Statut")
      .setColor(info.killed ? 0xff0000 : 0x00ff00)
      .addFields(
        {
          name: "État",
          value: info.killed ? "🔴 ACTIVÉ" : "🟢 Inactif",
          inline: true,
        },
        {
          name: "Activé par",
          value: info.killedBy || "N/A",
          inline: true,
        },
        {
          name: "Depuis",
          value: info.killedAt ? info.killedAt.toISOString() : "N/A",
          inline: true,
        },
      )
      .setTimestamp();
    await interaction.reply({ embeds: [embed], flags: [MessageFlags.Ephemeral] });
  }
}
