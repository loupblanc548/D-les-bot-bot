import { delegateSub } from "../router/delegate.js";

export default delegateSub(
  "uptime",
  "Statistiques d'exécution",
  "uptime",
  async (interaction, _client) => {
    const { handleCommand: handleUptime } = await import("../uptime.js");
    await handleUptime(interaction);
  },
);
