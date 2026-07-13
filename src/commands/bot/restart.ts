import { delegateSub } from "../router/delegate.js";

export default delegateSub(
  "restart",
  "Redémarre le bot (admin)",
  "restart",
  async (interaction, client) => {
    const { handleCommand: handleMain } = await import("../main.js");
    await handleMain(interaction, client);
  },
);
