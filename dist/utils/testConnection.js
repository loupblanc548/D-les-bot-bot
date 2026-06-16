"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const client_1 = require("@prisma/client");
const logger_1 = __importDefault(require("./logger"));
async function testConnection() {
    logger_1.default.info("=== Test de connexion PostgreSQL via Prisma ===");
    const prisma = new client_1.PrismaClient({
        log: ["error", "warn"],
    });
    try {
        logger_1.default.info("Tentative de connexion à PostgreSQL...");
        await prisma.$connect();
        logger_1.default.info("✅ Connexion à PostgreSQL réussie avec Prisma !");
        logger_1.default.info("La configuration DATABASE_URL est correcte.");
        // Test simple de requête
        logger_1.default.info("Test de requête simple...");
        const result = await prisma.$queryRaw `SELECT 1 as test`;
        logger_1.default.info("✅ Requête test réussie :", result);
        await prisma.$disconnect();
        logger_1.default.info("✅ Déconnexion réussie.");
    }
    catch (error) {
        logger_1.default.error("❌ Erreur de connexion à PostgreSQL :");
        if (error instanceof Error) {
            logger_1.default.error(`Message: ${error.message}`);
            // Analyse détaillée de l'erreur
            if (error.message.includes("password authentication failed")) {
                logger_1.default.error("CAUSE IDENTIFIÉE: Mot de passe incorrect dans DATABASE_URL");
                logger_1.default.error("Vérifiez que le mot de passe dans votre .env est correct.");
            }
            else if (error.message.includes("authentication failed")) {
                logger_1.default.error("CAUSE IDENTIFIÉE: Identifiants incorrects (utilisateur ou mot de passe)");
                logger_1.default.error("Vérifiez votre utilisateur et mot de passe dans DATABASE_URL.");
            }
            else if (error.message.includes("connect ECONNREFUSED")) {
                logger_1.default.error("CAUSE IDENTIFIÉE: Connexion refusée par le serveur");
                logger_1.default.error("Vérifiez que:");
                logger_1.default.error("  - L'hôte/IP dans DATABASE_URL est correct");
                logger_1.default.error("  - PostgreSQL est en cours d'exécution");
                logger_1.default.error("  - Le port (5432 par défaut) est correct");
                logger_1.default.error("  - Le pare-feu autorise les connexions");
            }
            else if (error.message.includes("getaddrinfo ENOTFOUND")) {
                logger_1.default.error("CAUSE IDENTIFIÉE: Hôte introuvable");
                logger_1.default.error("Vérifiez que l'hôte dans DATABASE_URL existe et est accessible.");
                logger_1.default.error("Sur un panel d'hébergement, n'utilisez PAS 'localhost' !");
            }
            else if (error.message.includes("timeout")) {
                logger_1.default.error("CAUSE IDENTIFIÉE: Timeout de connexion");
                logger_1.default.error("Le serveur ne répond pas. Vérifiez:");
                logger_1.default.error("  - L'hôte/IP est correct");
                logger_1.default.error("  - Le serveur PostgreSQL est en cours d'exécution");
                logger_1.default.error("  - La latence réseau est acceptable");
            }
            else if (error.message.includes("database") && error.message.includes("does not exist")) {
                logger_1.default.error("CAUSE IDENTIFIÉE: Base de données n'existe pas");
                logger_1.default.error("La base de données spécifiée dans DATABASE_URL n'existe pas.");
                logger_1.default.error("Créez la base de données ou vérifiez le nom dans l'URL.");
            }
            else {
                logger_1.default.error("CAUSE INCONNUE: Erreur non identifiée");
                logger_1.default.error(`Détails complets: ${error.stack}`);
            }
            // Afficher la DATABASE_URL (masquée) pour vérification
            const dbUrl = process.env.DATABASE_URL;
            if (dbUrl) {
                const maskedUrl = dbUrl.replace(/:[^:@]+@/, ":****@");
                logger_1.default.error(`DATABASE_URL actuelle (masquée): ${maskedUrl}`);
                // Vérifier le format
                if (!dbUrl.startsWith("postgresql://")) {
                    logger_1.default.error("ERREUR DE FORMAT: DATABASE_URL doit commencer par 'postgresql://'");
                }
            }
            else {
                logger_1.default.error("ERREUR CRITIQUE: DATABASE_URL n'est pas définie dans .env");
            }
        }
        else {
            logger_1.default.error("Erreur inconnue:", error);
        }
        process.exit(1);
    }
}
testConnection();
//# sourceMappingURL=testConnection.js.map