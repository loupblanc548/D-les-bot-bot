import { delegateSub } from "../router/delegate.js";

export default delegateSub("ping", "Latence du bot", "ping", async (interaction, client) => {
  const { handleBotExtra } = await import("../stubHandlers.js");
  await handleBotExtra(interaction, client);
});
