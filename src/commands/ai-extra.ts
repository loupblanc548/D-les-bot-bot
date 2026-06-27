// Module vidé — /summarize supprimé.
// La commande /chat gère désormais tout (traduction, résumé, questions gaming/tech).

export const commands: ReturnType<import("discord.js").SlashCommandBuilder["toJSON"]>[] = [];

export async function handleCommand(
  _interaction: import("discord.js").ChatInputCommandInteraction,
): Promise<void> {
  // Commandes migrées vers /chat
}
