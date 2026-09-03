import { MessageFlags } from "discord.js";
import type { SubcommandDef } from "../router/types.js";

export default {
  name: "agentaction",
  build: (sc) =>
    sc
      .setDescription("⚡ Envoie une action directe au bot (sans LLM)")
      .addStringOption((o) =>
        o
          .setName("action")
          .setDescription("Action rapide (bois, pierre, fer, maison, manger, dormir, stop…)")
          .setRequired(true)
          .addChoices(
            { name: "🪵 Collect wood (10 logs)", value: "collectWood" },
            { name: "🪨 Collect stone (20)", value: "collectStone" },
            { name: "⛏️ Collect iron (10)", value: "collectIron" },
            { name: "💎 Collect diamonds (5)", value: "collectDiamonds" },
            { name: "🏠 Build house (5x5)", value: "buildHouse" },
            { name: "🍖 Eat food", value: "eat" },
            { name: "😴 Sleep", value: "sleep" },
            { name: "🛡️ Defend (attack hostile)", value: "defend" },
            { name: "🏹 Hunt animals", value: "hunt" },
            { name: "🧹 Sort inventory (equip best armor)", value: "sortInventory" },
            { name: "🧭 Explore (50 blocks)", value: "explore" },
            { name: "⏹️ Stop all movement", value: "stop" },
          ),
      ),
  execute: async (interaction) => {
    const { QUICK_ACTIONS, isAgentAvailable } = await import("../../services/mineflayerAgent.js");
    if (!isAgentAvailable()) {
      await interaction.reply({
        content: "❌ Agent non disponible",
        flags: [MessageFlags.Ephemeral],
      });
      return;
    }
    const actionName = interaction.options.getString("action", true) as keyof typeof QUICK_ACTIONS;
    await interaction.deferReply();
    const actionFn = QUICK_ACTIONS[actionName];
    if (!actionFn) {
      await interaction.editReply({ content: `❌ Action inconnue: ${actionName}` });
      return;
    }
    const result = await actionFn();
    await interaction.editReply({
      content: result ? `⚡ ${actionName}: ${result.message}` : `❌ ${actionName} a échoué`,
    });
  },
} as SubcommandDef;
