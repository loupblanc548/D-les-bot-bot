import { delegateSub } from "../router/delegate.js";

export default delegateSub(
  "userinfo",
  "Infos d'un utilisateur",
  "userinfo",
  async (interaction, client) => {
    const { handleCommand: handleExtraCmd } = await import("../extraCommands.js");
    await handleExtraCmd(interaction, client);
  },
  {
    build: (sc) =>
      sc
        .setDescription("Infos d'un utilisateur")
        .addUserOption((o) =>
          o.setName("cible").setDescription("L'utilisateur").setRequired(false),
        ),
  },
);
