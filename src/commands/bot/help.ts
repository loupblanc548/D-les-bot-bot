import type { ChatInputCommandInteraction, Client } from "discord.js";
import type { SubcommandDef } from "../router/types.js";

export default {
  name: "help",
  build: (sc) =>
    sc
      .setDescription("Affiche l'aide du bot")
      .addStringOption((o) =>
        o
          .setName("category")
          .setDescription("Catégorie spécifique à explorer")
          .setRequired(false)
          .addChoices(
            { name: "🛡️ Modération", value: "mod" },
            { name: "🔒 Sécurité & OSINT", value: "security" },
            { name: "🤖 IA", value: "ai" },
            { name: "🎮 Gaming", value: "gaming" },
            { name: "📢 Alertes", value: "alerts" },
            { name: "📰 Sources RSS", value: "sources" },
            { name: "🎫 Tickets", value: "ticket" },
            { name: "👤 Communauté", value: "community" },
            { name: "⚙️ Admin", value: "admin" },
            { name: "🔧 Bot & Debug", value: "bot" },
          ),
      ),
  execute: async (interaction: ChatInputCommandInteraction, client: Client) => {
    const { handleCommand: handleHelpSystem } = await import("../helpSystem.js");
    await handleHelpSystem(interaction, client);
  },
} as SubcommandDef;
