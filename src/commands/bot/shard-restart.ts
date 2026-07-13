import { defineSub } from "../router/helpers.js";

export default defineSub({
  name: "shard-restart",
  build: (sc) =>
    sc
      .setDescription("Redémarre un shard spécifique (admin)")
      .addIntegerOption((o) =>
        o
          .setName("shard_id")
          .setDescription("ID du shard à redémarrer")
          .setRequired(true)
          .setMinValue(0),
      ),
  execute: async (interaction) => {
    const { requireAdmin } = await import("../../services/permissions.js");
    const { restartShard, isSharded } = await import("../../shardManager.js");

    if (!(await requireAdmin(interaction))) return;

    const shardId = interaction.options.getInteger("shard_id", true);

    if (!isSharded()) {
      await interaction.reply({
        content: "❌ Le bot n'est pas en mode sharded. Impossible de redémarrer un shard.",
        ephemeral: true,
      });
      return;
    }

    await interaction.deferReply({ ephemeral: true });

    const restarted = await restartShard(shardId);
    await interaction.editReply(
      restarted
        ? `✅ Shard ${shardId} redémarré avec succès.`
        : `❌ Impossible de redémarrer le shard ${shardId} (introuvable ou erreur).`,
    );
  },
});
