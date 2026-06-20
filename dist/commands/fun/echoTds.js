import logger from "../../utils/logger.js";
import { MessageFlags, SlashCommandBuilder, } from "discord.js";
// --- Cooldown anti-spam (30 secondes) ---
const COOLDOWN_MS = 30_000;
const cooldowns = new Map();
function getCooldownRemaining(userId) {
    const lastUsed = cooldowns.get(userId);
    if (!lastUsed)
        return 0;
    const elapsed = Date.now() - lastUsed;
    if (elapsed >= COOLDOWN_MS) {
        cooldowns.delete(userId);
        return 0;
    }
    return COOLDOWN_MS - elapsed;
}
// --- Definition de la commande slash ---
export const commands = [
    new SlashCommandBuilder()
        .setName("echo-tds")
        .setDescription("Fait lire un message à haute voix par la synthèse vocale du bot.")
        .addStringOption((option) => option.setName("message").setDescription("Le texte que le bot doit lire à haute voix").setRequired(true).setMaxLength(1000)).toJSON(),
];
// --- Handler de la commande ---
export async function handleCommand(interaction, _client) {
    const messageText = interaction.options.getString("message", true);
    const userId = interaction.user.id;
    const remaining = getCooldownRemaining(userId);
    if (remaining > 0) {
        const seconds = Math.ceil(remaining / 1000);
        await interaction.reply({ content: `⏳ **Cooldown actif** \u2014 Réessaie dans **${seconds}** seconde${seconds > 1 ? "s" : ""}.`, flags: [MessageFlags.Ephemeral] });
        return;
    }
    try {
        await interaction.reply({ content: `🗣️ **${interaction.user.displayName} dit :** ${messageText}`, tts: true });
        cooldowns.set(userId, Date.now());
        scheduleCooldownCleanup();
    }
    catch (error) {
        logger.error(`[echo-tds] Erreur TTS par ${interaction.user.tag}:`, String(error));
        await interaction.reply({ content: `❌ **Échec de la synthèse vocale.** Vérifie que le bot a la permission \`Envoyer des messages TTS\` dans ce salon.`, flags: [MessageFlags.Ephemeral] });
    }
}
// --- Nettoyage periodique des cooldowns expires ---
let cleanupInterval = null;
function scheduleCooldownCleanup() {
    if (cleanupInterval)
        return;
    cleanupInterval = setInterval(() => {
        const now = Date.now();
        for (const [userId, timestamp] of cooldowns.entries()) {
            if (now - timestamp >= COOLDOWN_MS)
                cooldowns.delete(userId);
        }
        if (cooldowns.size === 0 && cleanupInterval) {
            clearInterval(cleanupInterval);
            cleanupInterval = null;
        }
    }, 5 * 60 * 1000);
}
//# sourceMappingURL=echoTds.js.map