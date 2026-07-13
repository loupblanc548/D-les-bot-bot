import { delegateSub } from "../router/delegate.js";

export default delegateSub(
  "commands-list",
  "Liste toutes les commandes disponibles",
  "commands-list",
  async (interaction, client) => {
    const { handleBotExtra } = await import("../stubHandlers.js");
    await handleBotExtra(interaction, client);
  },
);
