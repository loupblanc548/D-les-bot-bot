import { delegateSub } from "../router/delegate.js";

export default delegateSub("help", "Affiche l'aide", "help", async (interaction, client) => {
  const { handleCommand: handleHelpSystem } = await import("../helpSystem.js");
  await handleHelpSystem(interaction, client);
});
