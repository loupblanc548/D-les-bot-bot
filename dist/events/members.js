"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.handleMemberEvents = handleMemberEvents;
const logger_1 = __importDefault(require("../utils/logger"));
const prisma_1 = __importDefault(require("../prisma"));
const logs_1 = require("../services/logs");
const security_1 = require("../commands/security");
function handleMemberEvents(client) {
    client.on("guildMemberAdd", async (member) => {
        try {
            // Anti-raid : timeout automatique des comptes trop recents (en premier)
            const antiRaid = await (0, security_1.isAntiRaidActive)(member.guild.id);
            if (antiRaid?.active) {
                const accountAgeHeures = (Date.now() - member.user.createdTimestamp) / (1000 * 60 * 60);
                if (accountAgeHeures < antiRaid.seuilHeures) {
                    try {
                        logger_1.default.info("🛡️ [Anti-Raid]", "Compte de", Math.round(accountAgeHeures) + "h", "detecte |", member.user.tag, "(" + member.user.id + ")", "| Seuil :", antiRaid.seuilHeures + "h");
                        await member.timeout(60 * 60 * 1000, `Anti-raid : compte cree il y a ${Math.round(accountAgeHeures)}h (seuil: ${antiRaid.seuilHeures}h)`);
                        logger_1.default.info("✅ [Anti-Raid]", member.user.tag, "timeout 1h (compte de", Math.round(accountAgeHeures) + "h)");
                        return;
                    }
                    catch (err) {
                        logger_1.default.error("[Anti-Raid] Erreur timeout:", err);
                    }
                }
            }
            await (0, logs_1.createLog)({
                type: "member_join",
                action: `${member.user.tag} a rejoint le serveur`,
                userId: member.id,
            });
            const autoRoles = await prisma_1.default.autoRole.findMany({
                where: { guildId: member.guild.id },
            });
            for (const autoRole of autoRoles) {
                const role = member.guild.roles.cache.get(autoRole.roleId);
                if (role && role.editable) {
                    try {
                        await member.roles.add(role);
                        await (0, logs_1.createLog)({
                            type: "role_add",
                            action: `Auto-role ${role.name} attribue a ${member.user.tag}`,
                            userId: member.id,
                            targetId: role.id,
                        });
                    }
                    catch (error) {
                        logger_1.default.error("Auto-role error:", String(error));
                    }
                }
            }
            logger_1.default.info(`+ ${member.user.tag} a rejoint`);
        }
        catch (error) {
            logger_1.default.error("[MemberEvents] Erreur lors du traitement guildMemberAdd:", error);
        }
    });
    client.on("guildMemberRemove", async (member) => {
        try {
            const tag = member.user?.tag || member.id;
            await (0, logs_1.createLog)({
                type: "member_leave",
                action: `${tag} a quitte le serveur`,
                userId: member.id,
            });
            logger_1.default.info(`- ${tag} a quitte`);
        }
        catch (error) {
            logger_1.default.error("[MemberEvents] Erreur lors du traitement guildMemberRemove:", error);
        }
    });
    // Historique des changements de pseudo et d'avatar
    client.on("guildMemberUpdate", async (oldMember, newMember) => {
        try {
            // Detection changement de pseudo
            if (oldMember.displayName !== newMember.displayName) {
                try {
                    await prisma_1.default.nameHistory.create({
                        data: {
                            userId: newMember.id,
                            guildId: newMember.guild.id,
                            oldName: oldMember.displayName,
                            newName: newMember.displayName,
                        },
                    });
                    logger_1.default.info(`[NAME] ${newMember.user.tag} : "${oldMember.displayName}" → "${newMember.displayName}"`);
                    await (0, logs_1.createLog)({
                        type: "name_change",
                        action: `${newMember.user.tag} a change de pseudo : "${oldMember.displayName}" → "${newMember.displayName}"`,
                        userId: newMember.id,
                        details: `Ancien: ${oldMember.displayName} | Nouveau: ${newMember.displayName}`,
                    });
                }
                catch (err) {
                    logger_1.default.error("[MemberUpdate/Name] Erreur:", err);
                }
            }
            // Detection changement d'avatar
            if (oldMember.user.avatar !== newMember.user.avatar) {
                try {
                    const oldHash = oldMember.user.avatar || "(aucun)";
                    const newHash = newMember.user.avatar || "(aucun)";
                    await prisma_1.default.avatarHistory.create({
                        data: {
                            userId: newMember.id,
                            guildId: newMember.guild.id,
                            oldHash,
                            newHash,
                        },
                    });
                    logger_1.default.info(`[AVATAR] ${newMember.user.tag} a change d'avatar (${oldHash.slice(0, 8)}... → ${newHash.slice(0, 8)}...)`);
                    await (0, logs_1.createLog)({
                        type: "avatar_change",
                        action: `${newMember.user.tag} a change d'avatar`,
                        userId: newMember.id,
                        details: `Ancien hash: ${oldHash} | Nouveau hash: ${newHash}`,
                    });
                }
                catch (err) {
                    logger_1.default.error("[MemberUpdate/Avatar] Erreur:", err);
                }
            }
        }
        catch (error) {
            logger_1.default.error("[MemberEvents] Erreur lors du traitement guildMemberUpdate:", error);
        }
    });
}
//# sourceMappingURL=members.js.map