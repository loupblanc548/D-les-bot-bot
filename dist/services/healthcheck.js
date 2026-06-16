"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.runHealthCheck = runHealthCheck;
exports.sendHealthReport = sendHealthReport;
const logger_1 = __importDefault(require("../utils/logger"));
const fs_1 = __importDefault(require("fs"));
const path_1 = __importDefault(require("path"));
const discord_js_1 = require("discord.js");
const config_1 = require("../config");
const prisma_1 = __importDefault(require("../prisma"));
// ── Helpers ────────────────────────────────────────────────────────────────
function ok(name, module, detail = "OK") {
    return { module, name, passed: true, detail };
}
function fail(name, module, detail) {
    return { module, name, passed: false, detail };
}
function isValidSnowflake(val) {
    return /^\d{17,20}$/.test(val);
}
function fileCheck(filePath, module, label) {
    const fullPath = path_1.default.resolve(process.cwd(), filePath);
    const exists = fs_1.default.existsSync(fullPath);
    return exists ? ok(label, module) : fail(label, module, "FICHIER MANQUANT");
}
// ── Module 1 : BASE (5 checks) ────────────────────────────────────────────
function checkBase() {
    const m = "BASE";
    const r = [];
    const token = process.env.DISCORD_TOKEN || "";
    r.push(token.length > 50
        ? ok("DISCORD_TOKEN", m, `${token.length} caracteres`)
        : fail("DISCORD_TOKEN", m, token.length === 0 ? "MANQUANT" : `Trop court (${token.length} car.)`));
    const cid = process.env.DISCORD_CLIENT_ID || "";
    r.push(isValidSnowflake(cid) ? ok("DISCORD_CLIENT_ID", m) : fail("DISCORD_CLIENT_ID", m, cid ? "Format invalide" : "MANQUANT"));
    const gid = process.env.DISCORD_GUILD_ID || "";
    r.push(isValidSnowflake(gid) ? ok("DISCORD_GUILD_ID", m) : fail("DISCORD_GUILD_ID", m, gid ? "Format invalide" : "MANQUANT"));
    const oid = process.env.OWNER_ID || "";
    r.push(isValidSnowflake(oid) ? ok("OWNER_ID", m) : fail("OWNER_ID", m, oid ? "Format invalide" : "MANQUANT"));
    const env = process.env.NODE_ENV || "development";
    r.push(ok("NODE_ENV", m, env));
    return r;
}
// ── Module 2 : BASE DE DONNEES (4 checks) ─────────────────────────────────
async function checkDatabase() {
    const m = "BASE DE DONNEES";
    const r = [];
    const dbUrl = process.env.DATABASE_URL || "";
    r.push(dbUrl.length > 0 ? ok("DATABASE_URL", m, dbUrl) : fail("DATABASE_URL", m, "MANQUANTE"));
    r.push(fileCheck("src/prisma.ts", m, "prisma.ts"));
    r.push(fileCheck("prisma/schema.prisma", m, "schema.prisma"));
    // Vrai ping DB
    try {
        await prisma_1.default.$queryRaw `SELECT 1`;
        r.push(ok("Connexion DB", m, "SQLite operationnelle"));
    }
    catch (e) {
        r.push(fail("Connexion DB", m, `Echec ping: ${String(e).slice(0, 80)}`));
    }
    return r;
}
// ── Module 3 : SALONS DISCORD (8 checks) ──────────────────────────────────
function checkChannels() {
    const m = "SALONS DISCORD";
    const channels = [
        ["STEAM_EPIC_CHANNEL_ID", "Steam/Epic"],
        ["PLAYSTATION_CHANNEL_ID", "PlayStation"],
        ["FORTNITE_CHANNEL_ID", "Fortnite"],
        ["XBOX_CHANNEL_ID", "Xbox"],
        ["NINTENDO_CHANNEL_ID", "Nintendo"],
        ["INSTANT_GAMING_CHANNEL_ID", "Instant Gaming"],
        ["LOG_CHANNEL_ID", "Logs"],
    ];
    return channels.map(([envVar, label]) => {
        const val = process.env[envVar] || "";
        if (val.length === 0)
            return fail(label, m, "MANQUANT");
        if (!isValidSnowflake(val))
            return fail(label, m, `Format invalide (${val.length} chiffres)`);
        return ok(label, m);
    });
}
// ── Module 4 : IA (2 checks) ──────────────────────────────────────────────
function checkAI() {
    const m = "IA";
    const r = [];
    const key = process.env.OPENROUTER_API_KEY || "";
    r.push(key.length > 20
        ? ok("OPENROUTER_API_KEY", m, `${key.length} caracteres`)
        : fail("OPENROUTER_API_KEY", m, key.length === 0 ? "MANQUANTE" : `Trop courte (${key.length} car.)`));
    r.push(fileCheck("src/services/ai.ts", m, "ai.ts"));
    return r;
}
// ── Module 5 : SURVEILLANCE (6 checks) ────────────────────────────────────
function checkSurveillance() {
    const m = "SURVEILLANCE";
    return [
        fileCheck("src/services/monitor.ts", m, "monitor.ts"),
        fileCheck("src/services/feeds.ts", m, "feeds.ts"),
        fileCheck("src/services/epicgames.ts", m, "epicgames.ts"),
        fileCheck("src/services/youtube.ts", m, "youtube.ts"),
        fileCheck("src/commands/sources.ts", m, "sources.ts"),
    ];
}
// ── Module 6 : COMMANDES (6 checks) ───────────────────────────────────────
function checkCommandes() {
    const m = "COMMANDES";
    return [
        fileCheck("src/commands/main.ts", m, "main.ts"),
        fileCheck("src/commands/moderation.ts", m, "moderation.ts"),
        fileCheck("src/commands/admin.ts", m, "admin.ts"),
        fileCheck("src/commands/security.ts", m, "security.ts"),
        fileCheck("src/commands/community.ts", m, "community.ts"),
        fileCheck("src/commands/gaming.ts", m, "gaming.ts"),
    ];
}
// ── Module 7 : SERVICES (3 checks) ────────────────────────────────────────
function checkServices() {
    const m = "SERVICES";
    return [
        fileCheck("src/services/logs.ts", m, "logs.ts"),
        fileCheck("src/services/permissions.ts", m, "permissions.ts"),
        fileCheck("src/services/healthcheck.ts", m, "healthcheck.ts"),
    ];
}
// ── Module 8 : EVENEMENTS (3 checks) ──────────────────────────────────────
function checkEvenements() {
    const m = "EVENEMENTS";
    return [
        fileCheck("src/events/members.ts", m, "members.ts"),
        fileCheck("src/events/messages.ts", m, "messages.ts"),
        fileCheck("src/events/channels.ts", m, "channels.ts"),
    ];
}
// ── Runner principal ──────────────────────────────────────────────────────
async function runHealthCheck() {
    logger_1.default.info("");
    logger_1.default.info("=".repeat(55));
    logger_1.default.info("  🔍 HEALTH CHECK — Verification systeme");
    logger_1.default.info("=".repeat(55));
    // Modules synchrones + DB asynchrone en parallèle
    const [dbResults] = await Promise.all([
        checkDatabase(),
    ]);
    const moduleGroups = [
        { module: "BASE", emoji: "⚙️", results: checkBase() },
        { module: "BASE DE DONNEES", emoji: "🗄️", results: dbResults },
        { module: "SALONS DISCORD", emoji: "📡", results: checkChannels() },
        { module: "IA", emoji: "🤖", results: checkAI() },
        { module: "SURVEILLANCE", emoji: "👁️", results: checkSurveillance() },
        { module: "COMMANDES", emoji: "⚡", results: checkCommandes() },
        { module: "SERVICES", emoji: "🔧", results: checkServices() },
        { module: "EVENEMENTS", emoji: "📢", results: checkEvenements() },
    ];
    let totalPassed = 0;
    let totalFailed = 0;
    let totalChecks = 0;
    for (const group of moduleGroups) {
        logger_1.default.info(`\n  ${group.emoji} ${group.module}`);
        for (const r of group.results) {
            totalChecks++;
            if (r.passed) {
                totalPassed++;
                logger_1.default.info(`    [OK]   ${r.name}`);
            }
            else {
                totalFailed++;
                logger_1.default.info(`    [FAIL] ${r.name} → ${r.detail}`);
            }
        }
    }
    logger_1.default.info("");
    logger_1.default.info("=".repeat(55));
    if (totalFailed === 0) {
        logger_1.default.info(`  ✅ RESULTAT : ${totalPassed}/${totalChecks} OK — Tous les modules sont operationnels`);
    }
    else {
        logger_1.default.info(`  ⚠️  RESULTAT : ${totalPassed}/${totalChecks} OK (${totalFailed} echec(s))`);
    }
    logger_1.default.info("=".repeat(55));
    logger_1.default.info("");
    // Flat array pour compatibilité avec l'existant
    return moduleGroups.flatMap((g) => g.results);
}
// ── Rapport Discord ───────────────────────────────────────────────────────
async function sendHealthReport(client, results) {
    if (!config_1.config.logChannel)
        return;
    const failed = results.filter((r) => !r.passed);
    const passed = results.filter((r) => r.passed);
    // Grouper les échecs par module
    const failuresByModule = new Map();
    for (const f of failed) {
        const list = failuresByModule.get(f.module) || [];
        list.push(f);
        failuresByModule.set(f.module, list);
    }
    try {
        const embed = new discord_js_1.EmbedBuilder()
            .setTitle(failed.length === 0
            ? `✅ Health Check — ${passed.length}/${results.length} OK`
            : `⚠️ Health Check — ${passed.length}/${results.length} OK (${failed.length} echec(s))`)
            .setColor(failed.length === 0 ? 0x00ff00 : 0xff3344)
            .setTimestamp();
        // Résumé global
        embed.addFields({
            name: "📊 Résumé",
            value: `✅ **${passed.length}** OK\n❌ **${failed.length}** Échec(s)\n📋 **${results.length}** Total`,
            inline: false,
        });
        // Détail des modules avec échecs
        if (failed.length > 0) {
            for (const [mod, items] of failuresByModule) {
                embed.addFields({
                    name: `❌ ${mod} (${items.length})`,
                    value: items.map((r) => `• **${r.name}**: ${r.detail}`).join("\n").slice(0, 1024),
                    inline: false,
                });
            }
        }
        else {
            embed.addFields({
                name: "🟢 Statut",
                value: "Tous les modules sont operationnels. Le bot est pret a demarrer.",
                inline: false,
            });
        }
        const channel = client.channels.cache.get(config_1.config.logChannel);
        if (channel?.isTextBased()) {
            await channel.send({ embeds: [embed] });
        }
    }
    catch {
        logger_1.default.error("[HealthCheck] Impossible d'envoyer le rapport dans LOG_CHANNEL_ID");
    }
}
//# sourceMappingURL=healthcheck.js.map