import { delegateSub } from "../router/delegate.js";

export default delegateSub(
  "stats",
  "Statistiques détaillées du bot",
  "stats",
  async (interaction, client) => {
    const { handleBotExtra } = await import("../stubHandlers.js");
    await handleBotExtra(interaction, client);
  },
);
