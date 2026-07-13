import { delegateSub } from "../router/delegate.js";

export default delegateSub(
  "invite",
  "Génère un lien d'invitation du bot",
  "invite",
  async (interaction, client) => {
    const { handleBotExtra } = await import("../stubHandlers.js");
    await handleBotExtra(interaction, client);
  },
  {
    build: (sc) =>
      sc
        .setDescription("Génère un lien d'invitation du bot")
        .addStringOption((o) =>
          o
            .setName("permissions")
            .setDescription("Niveau de permissions (bitfield)")
            .setRequired(false),
        ),
  },
);
