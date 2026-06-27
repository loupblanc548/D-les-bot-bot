import logger from "../utils/logger.js";
import {
  MessageFlags,
  ChatInputCommandInteraction,
  EmbedBuilder,
  Client,
  ActionRowBuilder,
  StringSelectMenuBuilder,
  StringSelectMenuInteraction,
} from "discord.js";
import prisma from "../prisma.js";
import { config } from "../config.js";
import { requireAdmin } from "../services/permissions.js";
import { getLogs } from "../services/logs.js";
import { runStartupRetrospective } from "../services/feeds.js";
import { runDbSourcesRetrospective } from "../services/monitor.js";

const FOOTER = { text: "Shadow Broker • Intelligence System" };

export interface Category {
  id: string;
  name: string;
  emoji: string;
  description: string;
  commands: string;
}

export const CATEGORIES: Category[] = [
  {
    id: "main",
    name: "Principales",
    emoji: "🛠️",
    description: "Commandes principales du bot",
    commands:
      "`/start - Initialise le bot`\n" +
      "`/help - Cette aide`\n" +
      "`/restart - Redémarre (admin)`\n" +
      "`/status - Statut système`\n" +
      "`/uptime - Uptime du bot`\n" +
      "`/userinfo [@user] - Infos enregistrées sur un utilisateur`\n" +
      "`/server-info - Infos détaillées du serveur`\n" +
      "`/dashboard - Dashboard de gestion`\n" +
      "`/debug - Debug info (admin)`\n" +
      "`/hotreload - Hot reload (admin)`",
  },
  {
    id: "surveillance",
    name: "Surveillance",
    emoji: "📡",
    description: "Gestion des sources de surveillance",
    commands:
      "`/sources add [type] [handle] [salon] - Ajoute une source (admin)`\n" +
      "`/sources remove [handle] - Supprime une source (admin)`\n" +
      "`/sources list - Liste les sources (admin)`\n" +
      "`/sources pause [handle] - Met en pause une source (admin)`\n" +
      "`/sources reddit-track [subreddit] - Suit un subreddit`\n" +
      "`/sources rss-custom [url] - Flux RSS personnalisé`\n" +
      "`/add-source - Ajoute une source rapidement`\n" +
      "`/remove-source - Supprime une source rapidement`\n" +
      "`/pause-source - Met en pause une source`\n" +
      "`/list-sources - Liste les sources`\n" +
      "`/source-stats - Statistiques des sources`\n" +
      "`/rss-test - Teste un flux RSS`\n" +
      "`/reddit-track - Suit un subreddit`\n" +
      "`/rss-custom - Flux RSS personnalisé`\n" +
      "`/twitch - Gère les streamers suivis (add/list/remove)`\n" +
      "`/psn - Profil, trophées et jeux PlayStation`\n" +
      "`/scraper-status - Statut des scrapers`\n" +
      "`/search-notifications - Recherche dans les notifications`\n" +
      "`/test-freegames - Teste les jeux gratuits`\n" +
      "`/test-rss - Teste un flux RSS`",
  },
  {
    id: "admin",
    name: "Administration",
    emoji: "👑",
    description: "Commandes d'administration",
    commands:
      "`/broadcast [message] - Message à tous (admin)`\n" +
      "`/dm [@user] [message] - DM (admin)`\n" +
      "`/deletehistory - Supprime l'historique`\n" +
      "`/maintenance - Active/désactive le mode maintenance`\n" +
      "`/clean-duplicates - Nettoie les doublons DB`\n" +
      "`/backup - Backup manuel de la DB`\n" +
      "`/permission-audit - Audit des permissions (admin)`\n" +
      "`/guild-config - Configuration du serveur (admin)`\n" +
      "`/cooldown-config - Configuration des cooldowns (admin)`\n" +
      "`/channel-routing - Routage des salons (admin)`\n" +
      "`/purge-content - Purge de contenu (admin)`\n" +
      "`/api-status - Statut des APIs externes`\n" +
      "`/bot-health - Health check du bot`\n" +
      "`/healthz - Endpoint health`\n" +
      "`/create-workflow - Crée un workflow (admin)`\n" +
      "`/list-workflows - Liste les workflows`\n" +
      "`/toggle-workflow - Active/désactive un workflow`",
  },
  {
    id: "ai",
    name: "IA",
    emoji: "🤖",
    description: "Commandes d'intelligence artificielle",
    commands:
      "`/ai chat [message] - Discute avec l'IA`\n" +
      "`/ai mention [message] - Réponse personnalisée`\n" +
      "`/ai aichat - Active/désactive l'IA contextuelle`\n" +
      "`/ai smartpoll [question] - Sondage intelligent par IA`\n" +
      "`/ai translate [texte] [langue] - Traduit avec un ton`\n" +
      "`/ai-config - Configuration de l'IA (admin)`\n" +
      "`/ai-profile - Profil IA personnalisé`\n" +
      "`/ai-suggest - Suggestions par IA`\n" +
      "`/ai-mood - Analyse d'humeur par IA`\n" +
      "`/ai-fun - Commandes fun IA`\n" +
      "`/ai-channel-summary - Résumé d'un salon par IA`\n" +
      "`/ai-translate-custom - Traduction personnalisée`\n" +
      "`/aichat - Chat IA direct`\n" +
      "`/smartpoll - Sondage intelligent rapide`\n" +
      "`/mention - Mention IA`\n" +
      "`/chat - Chat IA`\n" +
      "`/translate-auto - Traduction automatique`\n" +
      "`/summarize - Résumé de texte`\n" +
      "`/explain - Explication par IA`",
  },
  {
    id: "alertcenter",
    name: "AlertCenter",
    emoji: "🚨",
    description: "Centre d'alertes et risques",
    commands:
      "`/alert pending - Alertes en attente`\n" +
      "`/alert history - Historique des alertes`\n" +
      "`/alert user [@user] - Alertes d'un utilisateur`\n" +
      "`/alert channel [salon] - Définit le salon des alertes`\n" +
      "`/alert threshold [score] - Seuil de score`\n" +
      "`/alert reset [@user] - Réinitialise le profil de risque`\n" +
      "`/alert view - Configuration actuelle`\n" +
      "`/alert smart [action] - Alertes groupées intelligentes`\n" +
      "`/alertcenter - Centre d'alertes complet`\n" +
      "`/alertconfig - Configuration des alertes`\n" +
      "`/alert-rules - Règles d'alerte personnalisées (admin)`\n" +
      "`/smart-alerts - Alertes intelligentes`\n" +
      "`/security-audit - Audit sécurité des sanctions`\n" +
      "`/riskscore [@user] - Score de risque d'un utilisateur`\n" +
      "`/riskyusers - Liste des utilisateurs à risque`\n" +
      "`/spam-analysis - Analyse de spam`\n" +
      "`/auto-report - Rapport automatique`\n" +
      "`/viral-alert - Alerte virale`\n" +
      "`/trend-report - Rapport de tendances`",
  },
  {
    id: "moderation",
    name: "Modération",
    emoji: "🛡️",
    description: "Commandes de modération",
    commands:
      "`/mod ban [@user] - Bannir (admin)`\n" +
      "`/mod kick [@user] - Expulser`\n" +
      "`/mod mute [@user] [durée] - Mute temporaire`\n" +
      "`/mod unmute [@user] - Démute`\n" +
      "`/mod warn [@user] [raison] - Avertir`\n" +
      "`/mod clear [nombre] - Supprimer messages`\n" +
      "`/mod timeout [@user] [durée] - Timeout court terme`\n" +
      "`/mod unlock - Déverrouiller le salon`\n" +
      "`/mod purge [@user] [nombre] - Supprime messages d'un utilisateur`\n" +
      "`/mod history [@user] - Historique des messages`\n" +
      "`/mod slowmode [durée] - Slowmode du salon`\n" +
      "`/mod lock - Verrouiller le salon`\n" +
      "`/mod softban [@user] - Soft ban (ban+unban)`\n" +
      "`/mod tempban [@user] [durée] - Ban temporaire`\n" +
      "`/report [@user] [raison] - Signale un membre au staff`\n" +
      "`/ban [@user] - Bannir directement`\n" +
      "`/kick [@user] - Expulser directement`\n" +
      "`/mute [@user] - Mute directement`\n" +
      "`/unmute [@user] - Démute directement`\n" +
      "`/warn [@user] - Avertir directement`\n" +
      "`/clear [nombre] - Supprimer messages`\n" +
      "`/timeout [@user] - Timeout directement`\n" +
      "`/unlock - Déverrouiller le salon`\n" +
      "`/lock - Verrouiller le salon`\n" +
      "`/slowmode [durée] - Slowmode du salon`\n" +
      "`/softban [@user] - Soft ban`\n" +
      "`/tempban [@user] - Ban temporaire`\n" +
      "`/purge [@user] [nombre] - Purge messages`\n" +
      "`/purgeuser [@user] - Purge messages d'un user`\n" +
      "`/snipe - Dernier message supprimé`\n" +
      "`/mass-move - Déplace tous les membres vocaux`\n" +
      "`/voice-kick - Expulse du vocal`",
  },
  {
    id: "security",
    name: "Sécurité",
    emoji: "🔒",
    description: "Commandes de sécurité avancée",
    commands:
      "`/security nuke - Clone et nettoie un salon`\n" +
      "`/security check-alt - Liste les comptes récents`\n" +
      "`/security blacklist - Gère la liste noire (owner)`\n" +
      "`/security role-mass - Ajoute/retire un rôle à tous (admin)`\n" +
      "`/security antiraid - Protection anti-raid (comptes récents)`\n" +
      "`/security verif - Système de vérification par bouton`\n" +
      "`/security namehistory [@user] - Historique des pseudos`\n" +
      "`/security avatarhistory [@user] - Historique des avatars`\n" +
      "`/security linkcheck [url] - Vérifie un lien suspect`\n" +
      "`/security alt-link [@user] - Lie ton compte main et alt`\n" +
      "`/security ban-log [membre] - Historique cross-serveurs des bans`\n" +
      "`/security behavior-timeline [membre] - Timeline des events d'un user`\n" +
      "`/security alert-rules [action] - Builder de règles d'alerte (admin)`\n" +
      "`/security word-filter [action] - Filtre de mots interdits (admin)`\n" +
      "`/security permission-audit - Audit des permissions`\n" +
      "`/raid-shield - Bouclier anti-raid`\n" +
      "`/ban-log [membre] - Historique des bans cross-serveur`\n" +
      "`/behavior-timeline [membre] - Timeline comportementale`\n" +
      "`/alt-link [@user] - Lier compte main/alt`\n" +
      "`/namehistory [@user] - Historique des pseudos`\n" +
      "`/avatarhistory [@user] - Historique des avatars`\n" +
      "`/linkcheck [url] - Vérifie un lien`",
  },
  {
    id: "osint",
    name: "OSINT / Shadow",
    emoji: "🕵️",
    description: "Commandes OSINT et renseignement (modérateur minimum)",
    commands:
      "`/shadow intel [@user] - Profil d'intelligence d'un membre`\n" +
      "`/shadow network [@user] - Réseau d'un membre`\n" +
      "`/shadow patterns - Patterns suspects détectés`\n" +
      "`/shadow report - Rapport d'intelligence serveur (owner)`\n" +
      "`/shadow stealth - Mode furtif (owner)`\n" +
      "`/shadow watch - Surveillance (owner)`\n" +
      "`/shadow search [type] [query] - Recherche OSINT`\n" +
      "`/shadow sherlock [pseudo] - Sherlock (480+ sites)`\n" +
      "`/shadow maigret [pseudo] - Maigret (2500+ sites)`\n" +
      "`/shadow email [email] - Holehe (120+ sites)`\n" +
      "`/shadow breach [email] - h8mail (data breaches)`\n" +
      "`/shadow phone [numero] - PhoneInfoga`\n" +
      "`/shadow domain [domaine] - crt.sh + WHOIS + DNS + Sublist3r`\n" +
      "`/shadow whois [domaine] - WHOIS lookup`\n" +
      "`/shadow dns [domaine] - DNS records`\n" +
      "`/shadow instagram [pseudo] - Instaloader`\n" +
      "`/shadow insta-deep [pseudo] - Osintgram (deep intel)`\n" +
      "`/shadow crawl [url] - Photon crawl`\n" +
      "`/shadow social [query] - socialscan multi-plateformes`\n" +
      "`/shadow harvester [domaine] - theHarvester (emails, hosts)`\n" +
      "`/shadow wmn [pseudo] - WhatsMyName (600+ sites)`\n" +
      "`/shadow exif [url] - EXIF metadata extraction`\n" +
      "`/shadow cms [url] - CMSeeK (CMS detection)`",
  },
  {
    id: "gaming",
    name: "Gaming",
    emoji: "🎮",
    description: "Commandes liées aux jeux vidéo",
    commands:
      "`/game-status [jeu] - Statut des serveurs de jeu`\n" +
      "`/game-info [jeu] - Infos détaillées d'un jeu`\n" +
      "`/free-games - Jeux gratuits (Epic Games)`\n" +
      "`/free-game-reminder - Rappels jeux gratuits`\n" +
      "`/patch_notes [jeu] - Patch notes de jeux`\n" +
      "`/deal [jeu] - Comparateur de prix`\n" +
      "`/deals-history [jeu] - Historique des prix`\n" +
      "`/track add [jeu] - Surveille les actus Steam d'un jeu`\n" +
      "`/track remove [jeu] - Arrête la surveillance d'un jeu`\n" +
      "`/track list - Liste les jeux surveillés`\n" +
      "`/track-game [jeu] - Track un jeu`\n" +
      "`/untrack-game [jeu] - Arrête le tracking`\n" +
      "`/list-tracked - Liste les jeux trackés`\n" +
      "`/steam - Profil Steam, wishlist, nowplaying`\n" +
      "`/steam-deals - Deals Steam`\n" +
      "`/wishlist [action] [plateforme] [nom] - Wishlist multi-plateforme`\n" +
      "`/wishlist-stats - Stats de ta wishlist`\n" +
      "`/wishlist-notify - Notifs wishlist`\n" +
      "`/boutique [section] - Boutique Fortnite (FR)`\n" +
      "`/fortnite-wishlist [action] [identifiant] - Wishlist Fortnite (DM)`\n" +
      "`/fortnite-shop-preview - Aperçu boutique Fortnite`\n" +
      "`/xbox [gamertag] - Profil Xbox/Game Pass`\n" +
      "`/price-compare [jeu] - Compare prix multi-plateforme`\n" +
      "`/price-history [jeu] - Historique des prix`\n" +
      "`/price-track [jeu] - Suivi de prix`\n" +
      "`/release-calendar [periode] - Calendrier des sorties`\n" +
      "`/gaming-news - News gaming`\n" +
      "`/epic-calendar - Calendrier Epic Games`",
  },
  {
    id: "community",
    name: "Communauté",
    emoji: "👥",
    description: "Fonctionnalités communautaires",
    commands:
      "`/ticket-setup - Configure le système de tickets`\n" +
      "`/self-role [action] - Rôles auto-attribuables (admin)`\n" +
      "`/profile [action] - Profil personnalisé (bio, couleur, badges, titre)`\n" +
      "`/reaction-roles [action] - Rôles par réaction (admin)`\n" +
      "`/welcome-config [action] - Message de bienvenue (admin)`\n" +
      "`/goodbye-config [action] - Message de départ (admin)`\n" +
      "`/poll [question] [options] - Créer un sondage`\n" +
      "`/reminder [action] - Rappels personnels`\n" +
      "`/lfg [action] - Looking For Group`\n" +
      "`/lfg-list - Liste des groupes LFG`\n" +
      "`/retrospective [type] - Rétrospective`\n" +
      "`/retro-config - Config rétrospective`\n" +
      "`/memory-profile - Profil mémoire`\n" +
      "`/dictee - Dictée interactive`\n" +
      "`/hangman - Pendu`\n" +
      "`/quiz - Quiz`\n" +
      "`/debate - Débat`\n" +
      "`/two-truths - Two Truths and a Lie`\n" +
      "`/fortune - Fortune cookie`\n" +
      "`/compliment - Compliment`\n" +
      "`/roast - Roast`\n" +
      "`/pickup-line - Pickup line`\n" +
      "`/vibe-check - Vibe check`\n" +
      "`/therapy - Therapy IA`\n" +
      "`/timecapsule - Capsule temporelle`",
  },
  {
    id: "utility",
    name: "Utilitaires",
    emoji: "🔧",
    description: "Outils et utilitaires",
    commands:
      "`/embed-builder - Crée un embed personnalisé`\n" +
      "`/say [salon] [message] - Fait parler le bot`\n" +
      "`/vocal [action] - Gère la connexion vocale (rejoindre/quitter)`\n" +
      "`/mp3 [nom] - Joue un son en vocal`\n" +
      "`/tts [texte] [langue] - Lit du texte à voix haute en vocal`\n" +
      "`/recherche [sujet] - Recherche sur Internet`\n" +
      "`/qr-code [url] - Génère un QR code`\n" +
      "`/screenshot [url] - Capture d'écran d'un site`\n" +
      "`/spotify-search [query] - Recherche Spotify`\n" +
      "`/yt-search [query] - Recherche YouTube`\n" +
      "`/lastfm [action] - Last.fm`\n" +
      "`/timer [durée] - Minuteur`\n" +
      "`/play [query] - Joue de la musique`\n" +
      "`/stop - Arrête la musique`\n" +
      "`/pause - Pause`\n" +
      "`/resume - Reprend`\n" +
      "`/skip - Passe à la suivante`\n" +
      "`/previous - Précédente`\n" +
      "`/shuffle - Aléatoire`\n" +
      "`/loop - Boucle`\n" +
      "`/seek [temps] - Seek`\n" +
      "`/volume [niveau] - Volume`\n" +
      "`/queue-status - Statut de la queue`\n" +
      "`/nowplaying - Titre en cours`\n" +
      "`/audio-effects - Effets audio`\n" +
      "`/radio-stop - Arrête la radio`",
  },
  {
    id: "casier",
    name: "Casier",
    emoji: "📋",
    description: "Gestion du casier judiciaire",
    commands:
      "`/casier view [@user] - Affiche le casier d'un membre`\n" +
      "`/casier clear [id] - Efface une sanction ou un casier (admin)`\n" +
      "`/casier-clear - Efface un casier (admin)`",
  },
];

async function handleStart(interaction: ChatInputCommandInteraction, client: Client) {
  await interaction.deferReply({ ephemeral: true });
  try {
    const sourcesCount = (await prisma.source.count()) || 0;
    await interaction.editReply({
      content:
        "🟢 **Bot opérationnel**\n" +
        "• Version : **1.0.0**\n" +
        "• Latence : **" +
        client.ws.ping +
        "ms**\n" +
        "• Sources : **" +
        sourcesCount +
        "** surveillée(s)\n" +
        "• Services : Discord.js + Prisma + OpenRouter IA\n" +
        "• " +
        (config.adminRoles.length > 0
          ? "🟢 Rôles admin configurés"
          : "🟡 Rôles admin non configurés"),
    });
  } catch (error) {
    logger.error("[CRASH COMMANDE START]:", error);
    try {
      await interaction.editReply({ content: "❌ Erreur lors de l'initialisation." });
    } catch (err) {
      logger.warn("[Main] Erreur followUp:", String(err));
    }
  }
}

async function handleHelp(interaction: ChatInputCommandInteraction) {
  await interaction.deferReply({ ephemeral: true });
  try {
    const categoryOptions = CATEGORIES.map((cat) => ({
      label: `${cat.emoji} ${cat.name}`,
      description: cat.description,
      value: cat.id,
    }));

    const selectMenu = new StringSelectMenuBuilder()
      .setCustomId("help_category_select")
      .setPlaceholder("Sélectionnez une catégorie...")
      .addOptions(categoryOptions);

    const row = new ActionRowBuilder<StringSelectMenuBuilder>().addComponents(selectMenu);

    const embed = new EmbedBuilder()
      .setTitle("📚 Commandes du Bot")
      .setColor(0x00ff41)
      .setDescription("Sélectionnez une catégorie ci-dessous pour voir les commandes disponibles.")
      .addFields({
        name: "📊 Statistiques",
        value: `**${CATEGORIES.length} catégories** • **${CATEGORIES.reduce((acc, cat) => acc + cat.commands.split("\n").length, 0)} commandes**`,
        inline: false,
      })
      .setFooter(FOOTER)
      .setTimestamp();

    await interaction.editReply({ embeds: [embed], components: [row] });
  } catch (error) {
    logger.error("[CRASH COMMANDE HELP]:", error);
    try {
      await interaction.editReply({ content: "❌ Erreur lors de l'affichage de l'aide." });
    } catch (err) {
      logger.warn("[Main] Erreur followUp:", String(err));
    }
  }
}

async function handleCategorySelect(interaction: StringSelectMenuInteraction) {
  const categoryId = interaction.values[0];
  const category = CATEGORIES.find((cat) => cat.id === categoryId);

  if (!category) {
    await interaction.update({ content: "Catégorie introuvable.", components: [] });
    return;
  }

  const embed = new EmbedBuilder()
    .setTitle(`${category.emoji} ${category.name}`)
    .setColor(0x00ff41)
    .setDescription(category.description)
    .addFields({
      name: "Commandes",
      value: category.commands,
      inline: false,
    })
    .setFooter(FOOTER)
    .setTimestamp();

  const selectMenu = new StringSelectMenuBuilder()
    .setCustomId("help_category_select")
    .setPlaceholder("Sélectionnez une catégorie...")
    .addOptions(
      CATEGORIES.map((cat) => ({
        label: `${cat.emoji} ${cat.name}`,
        description: cat.description,
        value: cat.id,
      })),
    );

  const row = new ActionRowBuilder<StringSelectMenuBuilder>().addComponents(selectMenu);

  await interaction.update({ embeds: [embed], components: [row] });
}

async function handleStatus(interaction: ChatInputCommandInteraction, client: Client) {
  await interaction.deferReply({ ephemeral: true });
  try {
    const sourcesCount = await prisma.source.count();
    const logsCount = await prisma.log.count();
    const warningsCount = await prisma.sanction.count({ where: { type: "WARN" } });
    const lastLogs = await getLogs(5);
    const lastScans =
      lastLogs.map((l) => "• " + l.type + " — " + l.action).join("\n") || "Aucune activité récente";
    const uptimeMin = Math.floor(process.uptime() / 60);
    const uptimeStr =
      uptimeMin < 60
        ? uptimeMin + " min"
        : Math.floor(uptimeMin / 60) + "h " + (uptimeMin % 60) + "min";

    const embed = new EmbedBuilder()
      .setTitle("📡 Statut Système")
      .setColor(0x53fc18)
      .addFields(
        { name: "🟢 Statut", value: "En ligne", inline: true },
        { name: "📡 Latence", value: client.ws.ping + "ms", inline: true },
        { name: "⏰ Uptime", value: uptimeStr, inline: true },
        { name: "📅 Sources", value: sourcesCount.toString(), inline: true },
        { name: "📋 Logs", value: logsCount.toString(), inline: true },
        { name: "⚠️ Warns", value: warningsCount.toString(), inline: true },
        { name: "📝 Dernières actions", value: lastScans, inline: false },
      )
      .setFooter(FOOTER)
      .setTimestamp();

    await interaction.editReply({ embeds: [embed] });
  } catch (error) {
    logger.error("[CRASH COMMANDE STATUS]:", error);
    try {
      await interaction.editReply({ content: "❌ Erreur lors de l'affichage du statut." });
    } catch (err) {
      logger.warn("[Main] Erreur followUp:", String(err));
    }
  }
}

async function handleRestart(interaction: ChatInputCommandInteraction, _client: Client) {
  if (!(await requireAdmin(interaction))) return;
  await interaction.deferReply({ ephemeral: true });
  try {
    logger.info("Redémarrage demandé par", interaction.user.tag);
    await interaction.editReply({ content: "🔄 Redémarrage du bot en cours..." });
    setTimeout(() => {
      process.exit(0);
    }, 1000);
  } catch (error) {
    logger.error("[CRASH COMMANDE RESTART]:", error);
    try {
      await interaction.editReply({ content: "❌ Erreur lors du redémarrage." });
    } catch (err) {
      logger.warn("[Main] Erreur followUp:", String(err));
    }
  }
}

async function handleRetro(interaction: ChatInputCommandInteraction, client: Client) {
  if (!(await requireAdmin(interaction))) return;
  await interaction.deferReply({ flags: [MessageFlags.Ephemeral] });

  const yesterday = new Date();
  yesterday.setDate(yesterday.getDate() - 1);

  const recentLogs = await prisma.log.findMany({
    where: { createdAt: { gte: yesterday } },
    orderBy: { createdAt: "desc" },
  });

  const memberJoins = recentLogs.filter((l) => l.type === "member_join").length;
  const memberLeaves = recentLogs.filter((l) => l.type === "member_leave").length;
  const bans = recentLogs.filter((l) => l.type === "ban").length;
  const messagesDeleted = recentLogs.filter((l) => l.type === "message_delete").length;
  const sources = await prisma.source.count();
  const notifications = await prisma.notification.count({ where: { sentAt: { gte: yesterday } } });

  const embed = new EmbedBuilder()
    .setTitle("📊 Rétrospective 24h")
    .setColor(0xffaa00)
    .setDescription("• Du " + yesterday.toLocaleString() + " à maintenant")
    .addFields(
      { name: "👋 Arrivées", value: memberJoins.toString(), inline: true },
      { name: "🚪 Départs", value: memberLeaves.toString(), inline: true },
      { name: "🔨 Bans", value: bans.toString(), inline: true },
      { name: "🗑️ Msg supprimés", value: messagesDeleted.toString(), inline: true },
      { name: "📡 Sources", value: sources + " (" + notifications + " notifs)", inline: true },
      { name: "📋 Actions", value: recentLogs.length.toString(), inline: true },
    )
    .setFooter(FOOTER)
    .setTimestamp();

  await interaction.editReply({ embeds: [embed] });
  await interaction.followUp({
    content: "🔄 Rattrapage des actualités en cours... Patientez.",
    flags: [MessageFlags.Ephemeral],
  });

  try {
    await runStartupRetrospective(client);
    await runDbSourcesRetrospective(client);
    await interaction.followUp({
      content:
        "✅ Rétrospective de contenu terminée ! Les actualités manquées ont été publiées dans les salons dédiés.",
      flags: [MessageFlags.Ephemeral],
    });
  } catch (err) {
    logger.error("[Retro] Erreur lors de la rétrospective manuelle:", String(err));
    await interaction.followUp({
      content: "❌ Erreur lors du rattrapage : " + String(err).slice(0, 500),
      flags: [MessageFlags.Ephemeral],
    });
  }
}

// ─── Exports pour le routeur de commandes ───

export const commands: unknown[] = [];

export async function handleCommand(
  interaction: ChatInputCommandInteraction,
  client: Client,
): Promise<void> {
  const { commandName } = interaction;
  switch (commandName) {
    case "start":
      return handleStart(interaction, client);
    case "help":
      return handleHelp(interaction);
    case "status":
      return handleStatus(interaction, client);
    case "restart":
      return handleRestart(interaction, client);
    case "retro":
      return handleRetro(interaction, client);
    default:
      logger.warn(`Commande main inconnue: /${commandName}`);
      await interaction.reply({
        content: `❌ Commande /${commandName} non reconnue.`,
        flags: [MessageFlags.Ephemeral],
      });
  }
}

export { handleCategorySelect as handleSelectMenu };
