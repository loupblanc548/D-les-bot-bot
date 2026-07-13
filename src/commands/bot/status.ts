import { delegateSub } from "../router/delegate.js";

export default delegateSub("status", "Statut du bot", "status", async (interaction, client) => {
  const { handleCommand: handleMain } = await import("../main.js");
  await handleMain(interaction, client);
});
