import type { ChatInputCommandInteraction, Client } from "discord.js";
import type { SubcommandDef } from "../router/types.js";

export default {
  name: "restart",
  build: (sc) => sc.setDescription("Redémarre le bot (admin / owner)"),
  execute: async (interaction: ChatInputCommandInteraction, client: Client) => {
    const { handleRestart } = await import("../main.js");
    await handleRestart(interaction, client);
  },
} as SubcommandDef;
