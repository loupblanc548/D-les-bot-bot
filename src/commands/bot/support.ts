import { delegateSub } from "../router/delegate.js";

export default delegateSub(
  "support",
  "Serveur support et documentation",
  "support",
  async (interaction, client) => {
    const { handleBotExtra } = await import("../stubHandlers.js");
    await handleBotExtra(interaction, client);
  },
);
