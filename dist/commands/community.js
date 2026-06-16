"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.commands = void 0;
exports.handleCommand = handleCommand;
exports.handleTicketButton = handleTicketButton;
exports.handleTicketClose = handleTicketClose;
const logger_1 = __importDefault(require("../utils/logger"));
// Commandes Communauté & Automatisation
// reminder, ticket-setup (+ gestion des boutons de ticket)
const discord_js_1 = require("discord.js");
const prisma_1 = __importDefault(require("../prisma"));
const config_1 = require("../config");
const permissions_1 = require("../services/permissions");
const logs_1 = require("../services/logs");
// Rappels persistés via Prisma (table Reminder)
// ===== Définition des commandes =====
exports.commands = [
    new discord_js_1.SlashCommandBuilder()
        .setName("reminder")
        .setDescription("Définit un rappel qui te sera envoyé après le délai spécifié")
        .addStringOption((opt) => opt
        .setName("temps")
        .setDescription("Délai avant le rappel (ex: 2h, 30m, 1d)")
        .setRequired(true))
        .addStringOption((opt) => opt
        .setName("message")
        .setDescription("Le message du rappel")
        .setRequired(true))
        .toJSON(),
    new discord_js_1.SlashCommandBuilder()
        .setName("ticket-setup")
        .setDescription("Crée le panneau de tickets dans ce salon (Staff)")
        .setDefaultMemberPermissions(discord_js_1.PermissionFlagsBits.ManageGuild)
        .toJSON(),
    new discord_js_1.SlashCommandBuilder()
        .setName("wishlist-notify")
        .setDescription("Active ou désactive les DMs pour les notifications wishlist")
        .addBooleanOption((opt) => opt
        .setName("activer")
        .setDescription("Activer (true) ou désactiver (false) les DMs wishlist")
        .setRequired(true))
        .addUserOption((option) => option
        .setName("membre")
        .setDescription("Le membre à notifier (via @mention)")
        .setRequired(true))
        .toJSON(),
];
// ===== Handler principal =====
async function handleCommand(interaction, client) {
    try {
        switch (interaction.commandName) {
            case "reminder":
                await handleReminder(interaction);
                break;
            case "ticket-setup":
                await handleTicketSetup(interaction);
                break;
            case "wishlist-notify":
                if (!(await (0, permissions_1.requireAdmin)(interaction)))
                    return;
                await handleWishlistNotify(interaction);
                break;
        }
    }
    catch (err) {
        logger_1.default.error("[Community] Erreur:", err);
        const errorEmbed = new discord_js_1.EmbedBuilder()
            .setColor(0xff3344)
            .setDescription("Une erreur est survenue.");
        try {
            if (interaction.replied || interaction.deferred) {
                await interaction.editReply({ embeds: [errorEmbed] });
            }
            else {
                await interaction.reply({ embeds: [errorEmbed], flags: [discord_js_1.MessageFlags.Ephemeral] });
            }
        }
        catch {
            // silencieux
        }
    }
}
// ===== Gestion des boutons de ticket (exporté pour index.ts) =====
async function handleTicketButton(interaction, client) {
    if (interaction.customId !== "ticket_create")
        return;
    try {
        const guild = interaction.guild;
        const member = await guild.members.fetch(interaction.user.id);
        // Nom du salon ticket : ticket-{username}
        const channelName = "ticket-" + member.user.username.toLowerCase().replace(/[^a-z0-9]/g, "-");
        // Vérifier si un ticket existe déjà
        const existing = guild.channels.cache.find((ch) => ch.name === channelName && ch.type === discord_js_1.ChannelType.GuildText);
        if (existing) {
            await interaction.reply({
                content: "Tu as déjà un ticket ouvert : " + existing.toString(),
                flags: [discord_js_1.MessageFlags.Ephemeral],
            });
            return;
        }
        // Trouver ou créer une catégorie "Tickets"
        let ticketCategory = guild.channels.cache.find((ch) => ch.type === discord_js_1.ChannelType.GuildCategory && ch.name.toLowerCase() === "tickets");
        if (!ticketCategory) {
            ticketCategory = await guild.channels.create({
                name: "Tickets",
                type: discord_js_1.ChannelType.GuildCategory,
                permissionOverwrites: [
                    {
                        id: guild.roles.everyone.id,
                        deny: [discord_js_1.PermissionFlagsBits.ViewChannel],
                    },
                ],
            });
        }
        // Construire les permissions pour les rôles staff
        const staffOverwrites = [];
        for (const roleId of config_1.config.adminRoles) {
            if (roleId) {
                staffOverwrites.push({
                    id: roleId,
                    allow: [
                        discord_js_1.PermissionFlagsBits.ViewChannel,
                        discord_js_1.PermissionFlagsBits.SendMessages,
                        discord_js_1.PermissionFlagsBits.ReadMessageHistory,
                    ],
                });
            }
        }
        for (const roleId of config_1.config.modRoles) {
            if (roleId) {
                staffOverwrites.push({
                    id: roleId,
                    allow: [
                        discord_js_1.PermissionFlagsBits.ViewChannel,
                        discord_js_1.PermissionFlagsBits.SendMessages,
                        discord_js_1.PermissionFlagsBits.ReadMessageHistory,
                    ],
                });
            }
        }
        // Créer le salon privé
        const ticketChannel = await guild.channels.create({
            name: channelName,
            type: discord_js_1.ChannelType.GuildText,
            parent: ticketCategory.id,
            permissionOverwrites: [
                {
                    id: guild.roles.everyone.id,
                    deny: [discord_js_1.PermissionFlagsBits.ViewChannel],
                },
                {
                    id: member.id,
                    allow: [
                        discord_js_1.PermissionFlagsBits.ViewChannel,
                        discord_js_1.PermissionFlagsBits.SendMessages,
                        discord_js_1.PermissionFlagsBits.ReadMessageHistory,
                    ],
                },
                ...staffOverwrites,
            ],
        });
        // Message de bienvenue dans le ticket
        const welcomeEmbed = new discord_js_1.EmbedBuilder()
            .setColor(0x00f0ff)
            .setTitle("🎫 Ticket créé")
            .setDescription("Bienvenue " + member.toString() + " !\n\n" +
            "Le staff va prendre en charge ta demande rapidement.\n" +
            "Décris ton problème ou ta question en attendant.")
            .setFooter({ text: "Systeme de Surveillance • v1.0.0" })
            .setTimestamp();
        const closeButton = new discord_js_1.ActionRowBuilder().addComponents(new discord_js_1.ButtonBuilder()
            .setCustomId("ticket_close")
            .setLabel("Fermer le ticket")
            .setStyle(discord_js_1.ButtonStyle.Danger));
        await ticketChannel.send({
            content: member.toString(),
            embeds: [welcomeEmbed],
            components: [closeButton],
        });
        await interaction.reply({
            content: "✅ Ticket créé : " + ticketChannel.toString(),
            flags: [discord_js_1.MessageFlags.Ephemeral],
        });
        // Log
        await (0, logs_1.createLog)({
            type: "member",
            action: "ticket_created",
            userId: interaction.user.id,
            targetId: ticketChannel.id,
            details: "Salon: #" + channelName,
        });
    }
    catch (err) {
        logger_1.default.error("[Community] Erreur création ticket:", err);
        try {
            await interaction.reply({
                content: "Impossible de créer le ticket.",
                flags: [discord_js_1.MessageFlags.Ephemeral],
            });
        }
        catch {
            // silencieux
        }
    }
}
// ===== /reminder =====
async function handleReminder(interaction) {
    const timeStr = interaction.options.getString("temps", true).toLowerCase().trim();
    const message = interaction.options.getString("message", true);
    // Parser le temps (ex: 2h, 30m, 1d, 90s)
    const timeRegex = /^(\d+)\s*(s|m|h|d)$/;
    const match = timeStr.match(timeRegex);
    if (!match) {
        await interaction.reply({
            embeds: [
                new discord_js_1.EmbedBuilder()
                    .setColor(0xff3344)
                    .setDescription("Format de temps invalide.\n" +
                    "Utilise : `30m`, `2h`, `1d`, `90s`\n" +
                    "Exemple : `/reminder 30m Verifier les logs`"),
            ],
            flags: [discord_js_1.MessageFlags.Ephemeral],
        });
        return;
    }
    const value = parseInt(match[1], 10);
    const unit = match[2];
    let ms = 0;
    switch (unit) {
        case "s":
            ms = value * 1000;
            break;
        case "m":
            ms = value * 60 * 1000;
            break;
        case "h":
            ms = value * 60 * 60 * 1000;
            break;
        case "d":
            ms = value * 24 * 60 * 60 * 1000;
            break;
    }
    // Limite max : 30 jours
    if (ms > 30 * 24 * 60 * 60 * 1000) {
        await interaction.reply({
            embeds: [
                new discord_js_1.EmbedBuilder()
                    .setColor(0xff3344)
                    .setDescription("Le delai maximum est de 30 jours."),
            ],
            flags: [discord_js_1.MessageFlags.Ephemeral],
        });
        return;
    }
    const reminderId = interaction.user.id + "-" + Date.now();
    const endTime = new Date(Date.now() + ms);
    const embed = new discord_js_1.EmbedBuilder()
        .setColor(0x00f0ff)
        .setTitle("⏰ Rappel programmé")
        .setDescription("Je te rappellerai dans **" + value + unit + "**\n" +
        "Le " + endTime.toLocaleString("fr-FR") + "\n\n" +
        '"' + message + '"')
        .setFooter({ text: "Tu recevras une notification a l'echeance" });
    await interaction.reply({ embeds: [embed] });
    // Programmer le rappel
    // Persister le rappel en base (capturer l'ID genere par Prisma)
    const triggerAt = new Date(Date.now() + ms);
    const savedReminder = await prisma_1.default.reminder.create({
        data: {
            userId: interaction.user.id,
            channelId: interaction.channelId,
            message: message,
            triggerAt: triggerAt,
        },
    });
    // Programmer l'envoi
    const timeout = setTimeout(async () => {
        try {
            const channel = await interaction.client.channels.fetch(interaction.channelId);
            if (channel?.isTextBased()) {
                await channel.send({
                    content: "⏰ **Rappel** pour " + interaction.user.toString() + " !",
                    embeds: [
                        new discord_js_1.EmbedBuilder()
                            .setColor(0xffaa00)
                            .setTitle("⏰ Rappel")
                            .setDescription('"' + message + '"')
                            .setFooter({ text: "Rappel defini il y a " + value + unit })
                            .setTimestamp(),
                    ],
                });
            }
            // Nettoyer le rappel de la base apres envoi (avec l'UUID Prisma)
            await prisma_1.default.reminder.delete({ where: { id: savedReminder.id } }).catch(() => { });
        }
        catch (err) {
            logger_1.default.error("[Community] Erreur envoi rappel:", err);
        }
    }, ms);
    // Log
    await (0, logs_1.createLog)({
        type: "member",
        action: "reminder_set",
        userId: interaction.user.id,
        details: "Delai: " + timeStr + ' | "' + message + '"',
    });
}
// ===== /ticket-setup =====
async function handleTicketSetup(interaction) {
    const embed = new discord_js_1.EmbedBuilder()
        .setColor(0x00f0ff)
        .setTitle("🎫 Support - Tickets")
        .setDescription("Besoin d'aide ? Clique sur le bouton ci-dessous pour creer un ticket.\n" +
        "Le staff te repondra dans un salon prive des que possible.")
        .addFields({
        name: "📋 Regles",
        value: "- Sois precis dans ta demande\n" +
            "- Ne cree qu'un seul ticket a la fois\n" +
            "- Reste courtois avec le staff",
    })
        .setFooter({ text: interaction.guild.name });
    const button = new discord_js_1.ActionRowBuilder().addComponents(new discord_js_1.ButtonBuilder()
        .setCustomId("ticket_create")
        .setLabel("🎫 Créer un ticket")
        .setEmoji("🎫")
        .setStyle(discord_js_1.ButtonStyle.Primary));
    await interaction.channel.send({
        embeds: [embed],
        components: [button],
    });
    await interaction.reply({
        content: "✅ Panneau de tickets créé !",
        flags: [discord_js_1.MessageFlags.Ephemeral],
    });
}
// ===== Gestion de la fermeture des tickets (exporté pour index.ts) =====
async function handleTicketClose(interaction, client) {
    if (interaction.customId !== "ticket_close")
        return;
    try {
        const channel = interaction.channel;
        if (!channel || !channel.name.startsWith("ticket-")) {
            await interaction.reply({
                content: "Ce salon n'est pas un ticket.",
                flags: [discord_js_1.MessageFlags.Ephemeral],
            });
            return;
        }
        await interaction.reply({
            content: "Fermeture du ticket dans 5 secondes...",
            flags: [discord_js_1.MessageFlags.Ephemeral],
        });
        setTimeout(async () => {
            try {
                await channel.delete("Ticket fermé");
                await (0, logs_1.createLog)({
                    type: "member",
                    action: "ticket_closed",
                    userId: interaction.user.id,
                    targetId: channel.id,
                    details: "Salon: #" + channel.name,
                });
            }
            catch (err) {
                logger_1.default.error("[Community] Erreur fermeture ticket:", err);
            }
        }, 5000);
    }
    catch (err) {
        logger_1.default.error("[Community] Erreur handleTicketClose:", err);
        try {
            await interaction.reply({
                content: "Erreur lors de la fermeture du ticket.",
                flags: [discord_js_1.MessageFlags.Ephemeral],
            });
        }
        catch {
            // silencieux
        }
    }
}
// ===== /wishlist-notify =====
async function handleWishlistNotify(interaction) {
    await interaction.deferReply({ ephemeral: true });
    const activer = interaction.options.getBoolean("activer", true);
    const targetUser = interaction.options.getUser("membre", true);
    const targetUserId = targetUser.id;
    const targetDisplayName = targetUser.displayName;
    try {
        await prisma_1.default.userPreference.upsert({
            where: { userId: targetUserId },
            update: { wishlistDm: activer },
            create: { userId: targetUserId, wishlistDm: activer },
        });
        logger_1.default.info("✅ [WishlistNotify] DMs wishlist", activer ? "activés" : "désactivés", "pour", targetDisplayName, "(" + targetUserId + ")", "par", interaction.user.displayName, "(" + interaction.user.id + ")");
        const isSelf = targetUserId === interaction.user.id;
        const description = isSelf
            ? (activer
                ? "Vous recevrez désormais des DMs pour les notifications wishlist."
                : "Vous ne recevrez plus de DMs pour les notifications wishlist.")
            : (activer
                ? "Les DMs wishlist ont été activés pour **" + targetDisplayName + "**."
                : "Les DMs wishlist ont été désactivés pour **" + targetDisplayName + "**.");
        const embed = new discord_js_1.EmbedBuilder()
            .setTitle(activer ? "✅ DMs wishlist activés" : "🚫 DMs wishlist désactivés")
            .setDescription(description)
            .setColor(activer ? 0x53fc18 : 0xff3344)
            .setTimestamp();
        await interaction.editReply({ embeds: [embed] });
    }
    catch (err) {
        logger_1.default.error("💥 [CRASH WishlistNotify] Erreur Prisma :", err);
        await interaction.editReply({
            content: "❌ Une erreur interne est survenue lors de la modification des préférences. L'erreur a été logguée dans la console.",
        });
    }
}
//# sourceMappingURL=community.js.map