import { delegateSub } from "../router/delegate.js";

export default delegateSub(
  "privacy",
  "Politique de confidentialité",
  "privacy",
  async (interaction, client) => {
    const { handleBotExtra } = await import("../stubHandlers.js");
    await handleBotExtra(interaction, client);
  },
);
