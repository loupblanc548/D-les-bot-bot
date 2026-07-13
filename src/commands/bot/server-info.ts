import { delegateSub } from "../router/delegate.js";

export default delegateSub(
  "server-info",
  "Infos du serveur",
  "server-info",
  async (interaction, client) => {
    const { handleCommand: handleExtraCmd } = await import("../extraCommands.js");
    await handleExtraCmd(interaction, client);
  },
);
