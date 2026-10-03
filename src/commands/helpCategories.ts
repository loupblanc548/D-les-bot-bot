/**
 * helpCategories.ts — Contenu du menu /bot help, séparé de main.ts
 * pour permettre des tests de non-régression légers (sans mocker
 * prisma/config/discord.js).
 *
 * IMPORTANT: si tu ajoutes/retires une commande top-level dans
 * commandRouter.ts, mets à jour TOP_LEVEL_COMMANDS ci-dessous et
 * vérifie que src/commands/helpCategories.test.ts passe toujours.
 */

export interface Category {
  id: string;
  name: string;
  emoji: string;
  description: string;
  commands: string;
}

// ─── Liste de référence des commandes top-level réellement enregistrées ───
// Doit être tenue à jour manuellement en même temps que commandRouter.ts.
export const TOP_LEVEL_COMMANDS = ["bot", "mc", "admin", "wishlist"] as const;

export const CATEGORIES: Category[] = [
  {
    id: "bot",
    name: "Bot",
    emoji: "🛠️",
    description: "Diagnostic et redémarrage",
    commands:
      "`/bot restart - Redémarre le bot (admin)`\n" +
      "`/bot diagnostic - Auto-diagnostic erreurs + santé (admin)`",
  },
  {
    id: "mc",
    name: "Minecraft",
    emoji: "⛏️",
    description: "Bot Minecraft Bedrock",
    commands:
      "`/mc connect [ip] - Connecte le bot au serveur`\n" +
      "`/mc disconnect - Déconnecte le bot`\n" +
      "`/mc status - Statut du bot Minecraft`\n" +
      "`/mc mine - Démarre le mining automatique`\n" +
      "`/mc stop - Arrête le mining`\n" +
      "`/mc chat [message] - Envoie un message dans le chat`\n" +
      "`/mc follow [joueur] - Le bot suit un joueur`\n" +
      "`/mc farm - Démarre l'agriculture automatique`\n" +
      "`/mc stop-farm - Arrête l'agriculture`",
  },
  {
    id: "admin",
    name: "Administration",
    emoji: "👑",
    description: "Maintenance et sauvegarde",
    commands:
      "`/admin maintenance - Active/désactive le mode maintenance`\n" +
      "`/admin backup - Backup manuel de la DB`",
  },
  {
    id: "wishlist",
    name: "Wishlist",
    emoji: "🎮",
    description: "Wishlist jeux",
    commands: "`/wishlist - Wishlist Fortnite et multi-plateforme`",
  },
];
