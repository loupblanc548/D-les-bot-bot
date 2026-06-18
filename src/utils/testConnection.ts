import { PrismaClient } from "@prisma/client";
import logger from "./logger.js";

async function testConnection(): Promise<void> {
  logger.info("=== Test de connexion PostgreSQL via Prisma ===");
  
  const prisma = new PrismaClient({
    log: ["error", "warn"],
  });

  try {
    logger.info("Tentative de connexion à PostgreSQL...");
    await prisma.$connect();
    
    logger.info("✅ Connexion à PostgreSQL réussie avec Prisma !");
    logger.info("La configuration DATABASE_URL est correcte.");
    
    // Test simple de requête
    logger.info("Test de requête simple...");
    const result = await prisma.$queryRaw`SELECT 1 as test`;
    logger.info("✅ Requête test réussie :", result);
    
    await prisma.$disconnect();
    logger.info("✅ Déconnexion réussie.");
    
  } catch (error) {
    logger.error("❌ Erreur de connexion à PostgreSQL :");
    
    if (error instanceof Error) {
      logger.error(`Message: ${error.message}`);
      
      // Analyse détaillée de l'erreur
      if (error.message.includes("password authentication failed")) {
        logger.error("CAUSE IDENTIFIÉE: Mot de passe incorrect dans DATABASE_URL");
        logger.error("Vérifiez que le mot de passe dans votre .env est correct.");
      } else if (error.message.includes("authentication failed")) {
        logger.error("CAUSE IDENTIFIÉE: Identifiants incorrects (utilisateur ou mot de passe)");
        logger.error("Vérifiez votre utilisateur et mot de passe dans DATABASE_URL.");
      } else if (error.message.includes("connect ECONNREFUSED")) {
        logger.error("CAUSE IDENTIFIÉE: Connexion refusée par le serveur");
        logger.error("Vérifiez que:");
        logger.error("  - L'hôte/IP dans DATABASE_URL est correct");
        logger.error("  - PostgreSQL est en cours d'exécution");
        logger.error("  - Le port (5432 par défaut) est correct");
        logger.error("  - Le pare-feu autorise les connexions");
      } else if (error.message.includes("getaddrinfo ENOTFOUND")) {
        logger.error("CAUSE IDENTIFIÉE: Hôte introuvable");
        logger.error("Vérifiez que l'hôte dans DATABASE_URL existe et est accessible.");
        logger.error("Sur un panel d'hébergement, n'utilisez PAS 'localhost' !");
      } else if (error.message.includes("timeout")) {
        logger.error("CAUSE IDENTIFIÉE: Timeout de connexion");
        logger.error("Le serveur ne répond pas. Vérifiez:");
        logger.error("  - L'hôte/IP est correct");
        logger.error("  - Le serveur PostgreSQL est en cours d'exécution");
        logger.error("  - La latence réseau est acceptable");
      } else if (error.message.includes("database") && error.message.includes("does not exist")) {
        logger.error("CAUSE IDENTIFIÉE: Base de données n'existe pas");
        logger.error("La base de données spécifiée dans DATABASE_URL n'existe pas.");
        logger.error("Créez la base de données ou vérifiez le nom dans l'URL.");
      } else {
        logger.error("CAUSE INCONNUE: Erreur non identifiée");
        logger.error(`Détails complets: ${error.stack}`);
      }
      
      // Afficher la DATABASE_URL (masquée) pour vérification
      const dbUrl = process.env.DATABASE_URL;
      if (dbUrl) {
        const maskedUrl = dbUrl.replace(/:[^:@]+@/, ":****@");
        logger.error(`DATABASE_URL actuelle (masquée): ${maskedUrl}`);
        
        // Vérifier le format
        if (!dbUrl.startsWith("postgresql://")) {
          logger.error("ERREUR DE FORMAT: DATABASE_URL doit commencer par 'postgresql://'");
        }
      } else {
        logger.error("ERREUR CRITIQUE: DATABASE_URL n'est pas définie dans .env");
      }
    } else {
      logger.error("Erreur inconnue:", error);
    }
    
    process.exit(1);
  }
}

testConnection();
