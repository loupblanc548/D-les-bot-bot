import { delegateSub } from "../router/delegate.js";

export default delegateSub("start", "Démarre le bot", "start", async (interaction, client) => {
  const { handleCommand: handleMain } = await import("../main.js");
  await handleMain(interaction, client);
});
