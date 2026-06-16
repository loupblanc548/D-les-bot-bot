"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const logger_1 = __importDefault(require("./logger"));
/**
 * seed-fortnite.ts
 *
 * Script d'initialisation pour insérer les sources de surveillance
 * des comptes @levieuxpere (YouTube + Twitter) et @FortniteSoul (YouTube) dans le salon Fortnite.
 *
 * Usage : npx tsx src/utils/seed-fortnite.ts
 *
 * Sécurité : vérifie les doublons avant insertion (idempotent).
 * Pour YouTube, la résolution du handle est exécutée pour valider
 * que la chaîne existe, mais c'est bien @levieuxpere qui est stocké.
 */
const dotenv_1 = __importDefault(require("dotenv"));
dotenv_1.default.config();
const prisma_1 = __importDefault(require("../prisma"));
const youtube_1 = require("../services/youtube");
// ── Constantes (placeholders clairs, chargés depuis .env) ──────────────────
const GUILD_ID = process.env.DISCORD_GUILD_ID || "<GUILD_ID>";
const FORTNITE_CHANNEL_ID = process.env.FORTNITE_CHANNEL_ID || "<FORTNITE_CHANNEL_ID>";
// ── Validation des placeholders ─────────────────────────────────────────────
if (GUILD_ID === "<GUILD_ID>" ||
    FORTNITE_CHANNEL_ID === "<FORTNITE_CHANNEL_ID>") {
    logger_1.default.error("❌ GUILD_ID ou FORTNITE_CHANNEL_ID non configurés.\n" +
        "   Vérifie les variables DISCORD_GUILD_ID et FORTNITE_CHANNEL_ID dans .env");
    process.exit(1);
}
// ── Données à insérer ──────────────────────────────────────────────────────
const SEEDS = [
    { type: "YOUTUBE", urlOrHandle: "@levieuxpere" },
    { type: "TWITTER", urlOrHandle: "@levieuxpere" },
    { type: "YOUTUBE", urlOrHandle: "@FortniteSoul" },
];
// ── Main ────────────────────────────────────────────────────────────────────
async function main() {
    logger_1.default.info("🌱 Seed Fortnite — Initialisation des sources @levieuxpere + @FortniteSoul\n");
    let inserted = 0;
    let skipped = 0;
    let failed = 0;
    for (const { type, urlOrHandle } of SEEDS) {
        logger_1.default.info(`→ Traitement : ${type} ${urlOrHandle}`);
        // ── YouTube : vérification d'existence de la chaîne ──
        if (type === "YOUTUBE") {
            const resolved = await (0, youtube_1.resolveYouTubeChannelId)(urlOrHandle);
            if (!resolved) {
                logger_1.default.error(`   ❌ Chaîne YouTube ${urlOrHandle} introuvable. Source ignorée.`);
                failed++;
                continue;
            }
            logger_1.default.info(`   🔍 Chaîne vérifiée : ${urlOrHandle} → ${resolved}`);
        }
        // ── Vérification des doublons (couple urlOrHandle + type + salon + guild) ──
        const existing = await prisma_1.default.source.findFirst({
            where: {
                urlOrHandle,
                type,
                channelId: FORTNITE_CHANNEL_ID,
                guildId: GUILD_ID,
            },
        });
        if (existing) {
            logger_1.default.info(`   ⏭️  Déjà présent en base. Ignoré.`);
            skipped++;
            continue;
        }
        // ── Insertion ──
        try {
            await prisma_1.default.source.create({
                data: {
                    guildId: GUILD_ID,
                    channelId: FORTNITE_CHANNEL_ID,
                    type,
                    urlOrHandle,
                    lastProcessedId: null,
                },
            });
            logger_1.default.info(`   ✅ Inséré avec succès.`);
            inserted++;
        }
        catch (err) {
            logger_1.default.error(`   ❌ Erreur lors de l'insertion :`, String(err));
            failed++;
        }
    }
    logger_1.default.info(`\n📊 Résultat : ${inserted} inséré(s), ${skipped} ignoré(s)` +
        (failed > 0 ? `, ${failed} échec(s)` : "") +
        ".");
    await prisma_1.default.$disconnect();
    process.exit(0);
}
main().catch((err) => {
    logger_1.default.error("❌ Erreur fatale :", err);
    process.exit(1);
});
//# sourceMappingURL=seed-fortnite.js.map