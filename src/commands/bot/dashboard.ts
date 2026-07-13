import { delegateSub } from "../router/delegate.js";

export default delegateSub(
  "dashboard",
  "Dashboard de gestion (admin)",
  "dashboard",
  async (interaction, client) => {
    const { handleCommand: handleDashboard } = await import("../dashboard.js");
    await handleDashboard(interaction, client);
  },
);
