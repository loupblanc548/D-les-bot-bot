import { delegateSub } from "../router/delegate.js";

export default delegateSub(
  "changelog",
  "Derniers changements du bot",
  "changelog",
  async (interaction, client) => {
    const { handleBotExtra } = await import("../stubHandlers.js");
    await handleBotExtra(interaction, client);
  },
);
