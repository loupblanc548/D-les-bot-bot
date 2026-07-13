import { delegateSub } from "../router/delegate.js";

export default delegateSub(
  "vote",
  "Vote pour le bot sur les listes",
  "vote",
  async (interaction, client) => {
    const { handleBotExtra } = await import("../stubHandlers.js");
    await handleBotExtra(interaction, client);
  },
);
