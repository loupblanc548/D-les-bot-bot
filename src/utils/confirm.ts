import {
  MessageFlags,
  CommandInteraction,
  ButtonStyle,
  ActionRowBuilder,
  ButtonBuilder,
  MessageComponentInteraction,
  ComponentType,
} from "discord.js";

export async function requestConfirmation(
  interaction: CommandInteraction,
  message: string,
  timeoutMs: number = 30000
): Promise<boolean> {
  const confirmButton = new ButtonBuilder()
    .setCustomId("confirm")
    .setLabel("✅ Confirmer")
    .setStyle(ButtonStyle.Success);

  const cancelButton = new ButtonBuilder()
    .setCustomId("cancel")
    .setLabel("❌ Annuler")
    .setStyle(ButtonStyle.Danger);

  const row = new ActionRowBuilder<ButtonBuilder>().addComponents(
    confirmButton,
    cancelButton
  );

  const response = await interaction.reply({
    content: `⚠️ **Confirmation requise**\n${message}`,
    components: [row],
    flags: [MessageFlags.Ephemeral],
    fetchReply: true,
  });

  try {
    const collected =
      await response.awaitMessageComponent<ComponentType.Button>({
        filter: (i: MessageComponentInteraction) =>
          i.user.id === interaction.user.id,
        time: timeoutMs,
      });

    if (collected.customId === "confirm") {
      await collected.update({ content: "✅ Action confirmee.", components: [] }).catch(() => {});
      return true;
    } else {
      await collected.update({ content: "❌ Action annulee.", components: [] }).catch(() => {});
      return false;
    }
  } catch {
    await interaction.editReply({
      content: "⏰ Temps ecoule. Action annulee.",
      components: [],
    });
    return false;
  }
}
