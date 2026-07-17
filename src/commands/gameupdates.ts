/**
 * gameupdates.ts — Commande slash /gameupdates
 * Affiche les dernières mises à jour Steam d'un jeu via l'API Steam News
 */

import { SlashCommandBuilder, ChatInputCommandInteraction, EmbedBuilder } from "discord.js";

export const commands = [
  new SlashCommandBuilder()
    .setName("gameupdates")
    .setDescription("Affiche les dernières mises à jour d'un jeu Steam")
    .addStringOption((o) =>
      o
        .setName("appid")
        .setDescription("L'App ID Steam du jeu (ex: 553850 pour Helldivers 2)")
        .setRequired(true),
    )
    .addIntegerOption((o) =>
      o
        .setName("nombre")
        .setDescription("Nombre de mises à jour à afficher (1-5)")
        .setRequired(false)
        .setMinValue(1)
        .setMaxValue(5),
    )
    .toJSON(),
];

export async function handleGameUpdatesCommand(
  interaction: ChatInputCommandInteraction,
): Promise<void> {
  const appId = interaction.options.getString("appid", true);
  const count = interaction.options.getInteger("nombre") || 3;

  await interaction.deferReply();

  try {
    const res = await fetch(
      `https://api.steampowered.com/ISteamNews/GetNewsForApp/v0002/?appid=${appId}&count=${count}&maxlength=500&format=json`,
      { signal: AbortSignal.timeout(10_000) },
    );

    if (!res.ok) {
      await interaction.editReply({
        content: `❌ Impossible de récupérer les mises à jour pour l'App ID ${appId}.`,
      });
      return;
    }

    const data = (await res.json()) as {
      appnews: { newsitems: Array<{ title: string; url: string; contents: string; date: number; author: string }> };
    };

    const items = data.appnews?.newsitems || [];
    if (items.length === 0) {
      await interaction.editReply({
        content: `📭 Aucune mise à jour trouvée pour l'App ID ${appId}.`,
      });
      return;
    }

    const embed = new EmbedBuilder()
      .setTitle(`📰 Mises à jour Steam — App ${appId}`)
      .setColor(0x1b2838)
      .setDescription(
        items
          .map((item) => {
            const date = new Date(item.date * 1000).toLocaleDateString("fr-FR");
            const preview = item.contents.replace(/\\n/g, " ").slice(0, 200);
            return `**[${item.title}](${item.url})**\n📅 ${date} • 👤 ${item.author}\n${preview}...`;
          })
          .join("\n\n"),
      )
      .setFooter({ text: "Steam Web API • GetNewsForApp" })
      .setTimestamp();

    await interaction.editReply({ embeds: [embed] });
  } catch (err) {
    await interaction.editReply({
      content: `❌ Erreur: ${err instanceof Error ? err.message : String(err)}`,
    });
  }
}
