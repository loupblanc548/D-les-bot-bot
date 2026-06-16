"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.calculateLevel = calculateLevel;
exports.getXPForLevel = getXPForLevel;
exports.getUserLevelData = getUserLevelData;
exports.addXP = addXP;
exports.canGainXP = canGainXP;
exports.assignLevelRoles = assignLevelRoles;
exports.getGuildLeaderboard = getGuildLeaderboard;
exports.configureLevelRoles = configureLevelRoles;
const logger_1 = __importDefault(require("../utils/logger"));
const prisma_1 = __importDefault(require("../prisma"));
const LEVEL_CONFIGS = [
    { level: 1, xpRequired: 0, roleName: "Novice" },
    { level: 2, xpRequired: 100, roleName: "Apprenti" },
    { level: 3, xpRequired: 300, roleName: "Initié" },
    { level: 4, xpRequired: 600, roleName: "Adepte" },
    { level: 5, xpRequired: 1000, roleName: "Expert" },
    { level: 6, xpRequired: 1500, roleName: "Maître" },
    { level: 7, xpRequired: 2500, roleName: "Grand Maître" },
    { level: 8, xpRequired: 4000, roleName: "Légende" },
    { level: 9, xpRequired: 6000, roleName: "Héros" },
    { level: 10, xpRequired: 10000, roleName: "Champion" },
];
const XP_PER_MESSAGE = 10;
const XP_COOLDOWN_MS = 60 * 1000; // 1 minute entre les messages pour gagner de l'XP
/**
 * Calcule le niveau à partir de l'XP
 */
function calculateLevel(xp) {
    for (let i = LEVEL_CONFIGS.length - 1; i >= 0; i--) {
        if (xp >= LEVEL_CONFIGS[i].xpRequired) {
            return LEVEL_CONFIGS[i].level;
        }
    }
    return 1;
}
/**
 * Calcule l'XP requis pour un niveau
 */
function getXPForLevel(level) {
    const config = LEVEL_CONFIGS.find(c => c.level === level);
    return config ? config.xpRequired : 0;
}
/**
 * Récupère les données de niveau d'un utilisateur
 */
async function getUserLevelData(userId, guildId) {
    try {
        let user = await prisma_1.default.user.findUnique({
            where: { discordId: userId }
        });
        if (!user) {
            user = await prisma_1.default.user.create({
                data: {
                    discordId: userId,
                    guildId,
                    xp: 0,
                    level: 1
                }
            });
        }
        // Recalculer le niveau si nécessaire
        const calculatedLevel = calculateLevel(user.xp);
        if (calculatedLevel !== user.level) {
            user = await prisma_1.default.user.update({
                where: { id: user.id },
                data: { level: calculatedLevel }
            });
        }
        return {
            userId: user.discordId,
            guildId: user.guildId || guildId,
            xp: user.xp,
            level: user.level,
            lastMessageDate: user.lastMessageDate || new Date()
        };
    }
    catch (error) {
        logger_1.default.error(`[LevelSystem] Erreur récupération niveau ${userId}: ${error instanceof Error ? error.message : String(error)}`);
        return {
            userId,
            guildId,
            xp: 0,
            level: 1,
            lastMessageDate: new Date()
        };
    }
}
/**
 * Ajoute de l'XP à un utilisateur
 */
async function addXP(userId, guildId, amount) {
    try {
        const user = await prisma_1.default.user.findUnique({
            where: { discordId: userId }
        });
        if (!user) {
            await prisma_1.default.user.create({
                data: {
                    discordId: userId,
                    guildId,
                    xp: amount,
                    level: 1
                }
            });
            return { newLevel: 1, leveledUp: false };
        }
        const oldLevel = user.level;
        const newXP = user.xp + amount;
        const newLevel = calculateLevel(newXP);
        const updatedUser = await prisma_1.default.user.update({
            where: { id: user.id },
            data: {
                xp: newXP,
                level: newLevel,
                lastMessageDate: new Date()
            }
        });
        const leveledUp = newLevel > oldLevel;
        if (leveledUp) {
            logger_1.default.info(`[LevelSystem] ${userId} est passé niveau ${newLevel} !`);
        }
        return { newLevel, leveledUp };
    }
    catch (error) {
        logger_1.default.error(`[LevelSystem] Erreur ajout XP ${userId}: ${error instanceof Error ? error.message : String(error)}`);
        return { newLevel: 1, leveledUp: false };
    }
}
/**
 * Vérifie si un utilisateur peut gagner de l'XP (cooldown)
 */
function canGainXP(userId, guildId) {
    // Cette fonction devrait vérifier un cache en mémoire pour le cooldown
    // Pour l'instant, retourne true (à implémenter avec un Map)
    return true;
}
/**
 * Attribue automatiquement les rôles basés sur le niveau
 */
async function assignLevelRoles(userId, guildId, client) {
    try {
        const userLevelData = await getUserLevelData(userId, guildId);
        const levelConfig = LEVEL_CONFIGS.find(c => c.level === userLevelData.level);
        if (!levelConfig || !levelConfig.roleId) {
            return;
        }
        const guild = await client.guilds.fetch(guildId);
        const member = await guild.members.fetch(userId);
        // Vérifier si le rôle existe
        const role = guild.roles.cache.get(levelConfig.roleId);
        if (!role) {
            logger_1.default.warn(`[LevelSystem] Rôle ${levelConfig.roleId} non trouvé pour le niveau ${levelConfig.level}`);
            return;
        }
        // Ajouter le rôle si l'utilisateur ne l'a pas déjà
        if (!member.roles.cache.has(levelConfig.roleId)) {
            await member.roles.add(role);
            logger_1.default.info(`[LevelSystem] Rôle ${role.name} attribué à ${userId} (niveau ${levelConfig.level})`);
        }
    }
    catch (error) {
        logger_1.default.error(`[LevelSystem] Erreur attribution rôle ${userId}: ${error instanceof Error ? error.message : String(error)}`);
    }
}
/**
 * Récupère le classement du serveur
 */
async function getGuildLeaderboard(guildId, limit = 10) {
    try {
        const users = await prisma_1.default.user.findMany({
            where: { guildId },
            orderBy: { xp: "desc" },
            take: limit
        });
        return users.map(user => ({
            userId: user.discordId,
            guildId: user.guildId || guildId,
            xp: user.xp,
            level: user.level,
            lastMessageDate: user.lastMessageDate || new Date()
        }));
    }
    catch (error) {
        logger_1.default.error(`[LevelSystem] Erreur classement ${guildId}: ${error instanceof Error ? error.message : String(error)}`);
        return [];
    }
}
/**
 * Configure les rôles pour les niveaux
 */
function configureLevelRoles(guildId, roleConfigs) {
    // Cette fonction devrait stocker la configuration dans la base de données
    // Pour l'instant, mettre à jour LEVEL_CONFIGS
    for (const config of roleConfigs) {
        const levelConfig = LEVEL_CONFIGS.find(c => c.level === config.level);
        if (levelConfig) {
            levelConfig.roleId = config.roleId;
        }
    }
    logger_1.default.info(`[LevelSystem] ${roleConfigs.length} rôles configurés pour ${guildId}`);
}
//# sourceMappingURL=levelSystem.js.map