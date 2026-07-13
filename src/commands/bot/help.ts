import { delegateSub } from "../router/delegate.js";

export default delegateSub("help", "Affiche l'aide", "help", async (interaction, client) => {
  const { handleCommand: handleMain } = await import("../main.js");
  await handleMain(interaction, client);
});
