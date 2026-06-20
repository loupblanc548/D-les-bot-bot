import logger from "../utils/logger.js";
import { MessageFlags, SlashCommandBuilder, EmbedBuilder, } from "discord.js";
import { requireAdmin } from "../services/permissions.js";
import { runStartupRetrospective } from "../services/feeds.js";
import { runDbSourcesRetrospective } from "../services/monitor.js";
import prisma from "../prisma.js";
const FOOTER = { text: "Système de Surveillance • v1.0.0" };
export const commands = [
    new SlashCommandBuilder()
        .setName("retrospective")
        .setDescription("Analyse les comptes surveillés et met à jour les salons de notifications (admin)")
        .addStringOption((opt) => opt
        .setName("type")
        .setDescription("Type de rétrospective")
        .setRequired(false)
        .addChoices({ name: "Tout (Feeds Gaming + Sources DB)", value: "all" }, { name: "Feeds Gaming uniquement", value: "gaming" }, { name: "Sources DB uniquement", value: "db" }))
        .addIntegerOption((opt) => opt
        .setName("limite")
        .setDescription("Nombre maximum de publications à rattraper (défaut: 25)")
        .setRequired(false)
        .setMinValue(1)
        .setMaxValue(100))
        .toJSON(),
];
export async function handleCommand(interaction, client) {
    if (!(await requireAdmin(interaction)))
        return;
    const type = interaction.options.getString("type") || "all";
    const limit = interaction.options.getInteger("limite") || 25;
    await interaction.deferReply({ flags: [MessageFlags.Ephemeral] });
    const startTime = Date.now();
    let totalPublished = 0;
    let errors = 0;
    const embed = new EmbedBuilder()
        .setTitle("🔄 Rétrospective en cours")
        .setColor(0xffaa00)
        .setDescription("Analyse des comptes surveillés et rattrapage des actualités manquées...")
        .addFields({ name: "Type", value: type === "all" ? "Tout" : type === "gaming" ? "Feeds Gaming" : "Sources DB", inline: true }, { name: "Limite", value: limit.toString(), inline: true }, { name: "Statut", value: "⏳ En cours...", inline: true })
        .setFooter(FOOTER)
        .setTimestamp();
    await interaction.editReply({ embeds: [embed] });
    try {
        // Récupérer les statistiques avant
        const sourcesCount = await prisma.source.count();
        const notificationsBefore = await prisma.notification.count();
        // Exécuter la rétrospective selon le type
        if (type === "all" || type === "gaming") {
            try {
                logger.info("[Retrospective] Exécution runStartupRetrospective...");
                await runStartupRetrospective(client);
            }
            catch (err) {
                logger.error("[Retrospective] Erreur runStartupRetrospective:", err);
                errors++;
            }
        }
        if (type === "all" || type === "db") {
            try {
                logger.info("[Retrospective] Exécution runDbSourcesRetrospective...");
                await runDbSourcesRetrospective(client);
            }
            catch (err) {
                logger.error("[Retrospective] Erreur runDbSourcesRetrospective:", err);
                errors++;
            }
        }
        // Récupérer les statistiques après
        const notificationsAfter = await prisma.notification.count();
        const newNotifications = notificationsAfter - notificationsBefore;
        const duration = ((Date.now() - startTime) / 1000).toFixed(2);
        const resultEmbed = new EmbedBuilder()
            .setTitle("✅ Rétrospective terminée")
            .setColor(0x53fc18)
            .setDescription("L'analyse des comptes surveillés est terminée.")
            .addFields({ name: "Type", value: type === "all" ? "Tout" : type === "gaming" ? "Feeds Gaming" : "Sources DB", inline: true }, { name: "Durée", value: `${duration}s`, inline: true }, { name: "Sources analysées", value: sourcesCount.toString(), inline: true }, { name: "Nouvelles notifications", value: newNotifications.toString(), inline: true }, { name: "Erreurs", value: errors.toString(), inline: true })
            .setFooter(FOOTER)
            .setTimestamp();
        await interaction.editReply({ embeds: [resultEmbed] });
        // Log de l'action
        logger.info(`[Retrospective] Terminée en ${duration}s - ${newNotifications} nouvelles notifications, ${errors} erreurs`);
    }
    catch (error) {
        logger.error("[Retrospective] Erreur globale:", error);
        const errorEmbed = new EmbedBuilder()
            .setTitle("❌ Erreur lors de la rétrospective")
            .setColor(0xff3344)
            .setDescription(`Une erreur est survenue : ${String(error).slice(0, 500)}`)
            .setFooter(FOOTER)
            .setTimestamp();
        await interaction.editReply({ embeds: [errorEmbed] });
    }
}
//# sourceMappingURL=retrospective.js.map