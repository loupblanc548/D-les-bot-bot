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
export const TOP_LEVEL_COMMANDS = ["bot", "mod", "security", "ai", "game", "mc", "admin"] as const;

export const CATEGORIES: Category[] = [
  {
    id: "bot",
    name: "Bot",
    emoji: "🛠️",
    description: "Commandes principales du bot",
    commands:
      "`/bot help - Cette aide`\n" +
      "`/bot status - Statut du bot`\n" +
      "`/bot restart - Redémarre le bot (admin)`",
  },
  {
    id: "moderation",
    name: "Modération",
    emoji: "🛡️",
    description: "Commandes de modération",
    commands:
      "`/mod warn [@user] - Avertir un membre`\n" +
      "`/mod mute [@user] - Rendre muet (timeout long)`\n" +
      "`/mod unmute [@user] - Retirer le timeout`\n" +
      "`/mod kick [@user] - Expulser`\n" +
      "`/mod ban [@user] - Bannir`\n" +
      "`/mod timeout [@user] - Timeout court terme`\n" +
      "`/mod clear [nombre] - Supprimer messages`\n" +
      "`/mod unlock - Déverrouiller le salon`\n" +
      "`/mod purge [@user] - Supprime messages d'un utilisateur`\n" +
      "`/mod history [@user] - Historique des messages`\n" +
      "`/mod slowmode [durée] - Slowmode du salon`\n" +
      "`/mod lock - Verrouiller le salon`\n" +
      "`/mod softban [@user] - Soft ban (ban+unban)`\n" +
      "`/mod tempban [@user] - Ban temporaire`\n" +
      "`/mod purgeuser [@user] - Supprime tous les messages d'un user`\n" +
      "`/mod snipe - Dernier message supprimé`\n" +
      "`/mod report [@user] - Signale un membre au staff`",
  },
  {
    id: "security",
    name: "Sécurité",
    emoji: "🔒",
    description: "OSINT, threat intel, config et défense",
    commands:
      "`/security osint scan [pseudo] - Scan 35+ plateformes`\n" +
      "`/security osint dns [domaine] - Résolution DNS`\n" +
      "`/security osint whois [domaine] - WHOIS complet`\n" +
      "`/security osint breach [email] - Data breach check`\n" +
      "`/security osint phone [numero] - PhoneInfoga`\n" +
      "`/security threat linkcheck [url] - Lien suspect ?`\n" +
      "`/security threat intel - Analyse globale serveur`\n" +
      "`/security threat namehistory [@user] - Historique pseudos`\n" +
      "`/security config antiraid [action] - Mode anti-raid`\n" +
      "`/security config word-filter [action] - Filtre mots interdits`\n" +
      "`/security defense raid-shield - Bouclier anti-raid`\n" +
      "`/security defense lockdown-server - Verrouillage serveur`",
  },
  {
    id: "ai",
    name: "IA",
    emoji: "🤖",
    description: "Chat, analyse et configuration IA",
    commands:
      "`/ai basic chat [message] - Pose une question à l'IA`\n" +
      "`/ai basic ask-bot - Active/désactive le chat IA contextuel`\n" +
      "`/ai basic image [prompt] - Génère une image via IA`\n" +
      "`/ai basic translate [texte] - Traduit un texte`\n" +
      "`/ai basic summarize - Résume les derniers messages`\n" +
      "`/ai analysis sentiment [message] - Analyse de sentiment`\n" +
      "`/ai analysis summarize-user [@user] - Résumé activité d'un membre`\n" +
      "`/ai analysis channel-summary - Résumé complet d'un salon`\n" +
      "`/ai analysis behavior-timeline [@user] - Timeline comportementale`\n" +
      "`/ai analysis spam-analysis - Analyse spam d'un salon`\n" +
      "`/ai advanced persona [style] - Change la personnalité de l'IA`\n" +
      "`/ai advanced mood - Humeur générale du serveur`\n" +
      "`/ai advanced prompt-templates - Liste/modifie templates`\n" +
      "`/ai advanced fine-tune - Fine-tune du modèle`\n" +
      "`/ai advanced context - Gère le contexte (clear/size)`\n" +
      "`/ai advanced history - Historique actions modération IA`\n" +
      "`/ai config model-select [modele] - Change le modèle LLM`\n" +
      "`/ai config temperature [valeur] - Ajuste la créativité (0-2)`\n" +
      "`/ai config token-usage - Stats consommation tokens`\n" +
      "`/ai config moderation-config - Config modération IA`\n" +
      "`/ai config fun-mode - Mode fun (roast, compliment...)`",
  },
  {
    id: "gaming",
    name: "Gaming",
    emoji: "🎮",
    description: "Commandes liées aux jeux vidéo",
    commands:
      "`/game status - Statut des serveurs de jeu`\n" +
      "`/game info [jeu] - Infos détaillées d'un jeu`\n" +
      "`/game free-games - Jeux gratuits (Epic Games)`\n" +
      "`/game free-game-reminder - Rappels jeux gratuits`\n" +
      "`/game patch-notes [jeu] - Patch notes de jeux`\n" +
      "`/game deal [jeu] - Comparateur de prix`\n" +
      "`/game deals-history [jeu] - Historique des prix`\n" +
      "`/game price-compare [jeu] - Compare prix multi-plateforme`\n" +
      "`/game price-history [jeu] - Historique des prix`\n" +
      "`/game price-track [jeu] - Suivi de prix`\n" +
      "`/game release-calendar - Calendrier des sorties`\n" +
      "`/game gaming-news - News gaming`\n" +
      "`/game epic-calendar - Calendrier Epic Games`\n" +
      "`/game steam - Profil Steam, wishlist, nowplaying`\n" +
      "`/game steam-deals - Deals Steam`\n" +
      "`/game wishlist [action] - Wishlist multi-plateforme`\n" +
      "`/game wishlist-stats - Stats de ta wishlist`\n" +
      "`/game wishlist-notify - Notifs wishlist`\n" +
      "`/game boutique - Boutique Fortnite (FR)`\n" +
      "`/game fortnite-wishlist [action] - Wishlist Fortnite (DM)`\n" +
      "`/game fortnite-shop-preview - Aperçu boutique Fortnite`\n" +
      "`/game xbox [gamertag] - Profil Xbox/Game Pass`\n" +
      "`/game twitch - Gère les streamers suivis`\n" +
      "`/game psn - Profil, trophées et jeux PlayStation`",
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
    description: "Commandes d'administration",
    commands:
      "`/admin dm [@user] [message] - DM à un utilisateur`\n" +
      "`/admin maintenance - Active/désactive le mode maintenance`\n" +
      "`/admin clean-duplicates - Nettoie les doublons DB`\n" +
      "`/admin backup - Backup manuel de la DB`\n" +
      "`/admin guild-config - Configuration du serveur`\n" +
      "`/admin channel-routing - Routage des salons`\n" +
      "`/admin purge-range [de] [a] - Supprime entre 2 IDs de messages`",
  },
];
