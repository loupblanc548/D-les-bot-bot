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
    id: "bot",
    name: "Bot",
    emoji: "🛠️",
    description: "Commandes principales du bot",
    commands:
      "`/bot start - Initialise le bot`\n" +
      "`/bot help - Cette aide`\n" +
      "`/bot restart - Redémarre (admin)`\n" +
      "`/bot status - Statut système`\n" +
      "`/bot uptime - Uptime du bot`\n" +
      "`/bot userinfo [@user] - Infos d'un utilisateur`\n" +
      "`/bot server-info - Infos du serveur`\n" +
      "`/bot dashboard - Dashboard (admin)`\n" +
      "`/bot debug-status - Debug: statut (admin)`\n" +
      "`/bot debug-services - Debug: services (admin)`\n" +
      "`/bot debug-database - Debug: DB (admin)`\n" +
      "`/bot debug-memory - Debug: mémoire (admin)`\n" +
      "`/bot hotreload-reload - Recharge commandes (admin)`\n" +
      "`/bot hotreload-maintenance - Mode maintenance (admin)`\n" +
      "`/bot hotreload-auto - Auto-reload (admin)`\n" +
      "`/bot hotreload-status - Statut hot reload (admin)`",
  },
  {
    id: "surveillance",
    name: "Surveillance",
    emoji: "📡",
    description: "Gestion des sources de surveillance",
    commands:
      "`/sources add [type] [handle] [salon] - Ajoute une source`\n" +
      "`/sources remove [handle] - Supprime une source`\n" +
      "`/sources list - Liste les sources`\n" +
      "`/sources pause [handle] - Met en pause une source`\n" +
      "`/sources reddit-track [subreddit] - Suit un subreddit`\n" +
      "`/sources rss-custom [url] - Flux RSS personnalisé`\n" +
      "`/sources stats - Statistiques des sources`\n" +
      "`/sources rss-test [url] - Teste un flux RSS`\n" +
      "`/sources scraper-status - Statut des scrapers`\n" +
      "`/sources search-notifications [requete] - Recherche notifications`\n" +
      "`/sources test-freegames - Teste les jeux gratuits`\n" +
      "`/sources test-rss [url] - Teste un flux RSS`",
  },
  {
    id: "admin",
    name: "Administration",
    emoji: "👑",
    description: "Commandes d'administration",
    commands:
      "`/admin broadcast [message] - Message à tous`\n" +
      "`/admin dm [@user] [message] - DM à un utilisateur`\n" +
      "`/admin deletehistory - Supprime l'historique`\n" +
      "`/admin maintenance - Mode maintenance`\n" +
      "`/admin clean-duplicates - Nettoie les doublons DB`\n" +
      "`/admin backup - Backup manuel`\n" +
      "`/admin permission-audit - Audit permissions`\n" +
      "`/admin guild-config - Configuration serveur`\n" +
      "`/admin cooldown-config - Configuration cooldowns`\n" +
      "`/admin channel-routing - Routage des salons`\n" +
      "`/admin purge-content - Purge de contenu`\n" +
      "`/admin purge-range [de] [a] - Supprime entre 2 IDs de messages`\n" +
      "`/admin api-status - Statut des APIs`\n" +
      "`/admin bot-health - Health check`\n" +
      "`/admin healthz - Endpoint health`\n" +
      "`/admin create-workflow - Crée un workflow`\n" +
      "`/admin list-workflows - Liste les workflows`\n" +
      "`/admin toggle-workflow - Active/désactive un workflow`",
  },
  {
    id: "ai",
    name: "IA",
    emoji: "🤖",
    description: "Commandes d'intelligence artificielle",
    commands:
      "`/ai chat [message] - Discute avec l'IA`\n" +
      "`/ai aichat - Active/désactive l'IA contextuelle`\n" +
      "`/ai smartpoll [question] - Sondage intelligent par IA`\n" +
      "`/ai translate-auto [texte] - Traduction automatique`\n" +
      "`/ai config [parametre] [valeur] - Configuration IA (admin)`",
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
      "`/alert security-audit - Audit sécurité des sanctions`\n" +
      "`/alert riskscore [@user] - Score de risque`\n" +
      "`/alert riskyusers - Utilisateurs à risque`\n" +
      "`/alert spam-analysis - Analyse de spam`\n" +
      "`/alert auto-report - Rapport automatique`\n" +
      "`/alert viral-alert - Alerte virale`\n" +
      "`/alert trend-report - Rapport de tendances`\n" +
      "`/alert alert-rules [action] - Règles d'alerte (admin)`",
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
      "`/mod purgeuser [@user] - Purge messages d'un user`\n" +
      "`/mod snipe - Dernier message supprimé`\n" +
      "`/mod report [@user] [raison] - Signale un membre`\n" +
      "`/mod mass-move [destination] - Déplace tous les membres vocaux`\n" +
      "`/mod voice-kick [@user] - Expulse du vocal`",
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
      "`/security raid-shield - Bouclier anti-raid`",
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
      "`/game status [jeu] - Statut des serveurs de jeu`\n" +
      "`/game info [jeu] - Infos détaillées d'un jeu`\n" +
      "`/game free-games - Jeux gratuits (Epic Games)`\n" +
      "`/game free-game-reminder - Rappels jeux gratuits`\n" +
      "`/game patch-notes [jeu] - Patch notes de jeux`\n" +
      "`/game deal [jeu] - Comparateur de prix`\n" +
      "`/game deals-history [jeu] - Historique des prix`\n" +
      "`/game price-compare [jeu] - Compare prix multi-plateforme`\n" +
      "`/game price-history [jeu] - Historique des prix`\n" +
      "`/game price-track [jeu] - Suivi de prix`\n" +
      "`/game release-calendar [periode] - Calendrier des sorties`\n" +
      "`/game gaming-news - News gaming`\n" +
      "`/game epic-calendar - Calendrier Epic Games`\n" +
      "`/game steam - Profil Steam, wishlist, nowplaying`\n" +
      "`/game steam-deals - Deals Steam`\n" +
      "`/game wishlist [action] - Wishlist multi-plateforme`\n" +
      "`/game wishlist-stats - Stats de ta wishlist`\n" +
      "`/game wishlist-notify - Notifs wishlist`\n" +
      "`/game boutique [section] - Boutique Fortnite (FR)`\n" +
      "`/game fortnite-wishlist [action] - Wishlist Fortnite (DM)`\n" +
      "`/game fortnite-shop-preview - Aperçu boutique Fortnite`\n" +
      "`/game xbox [gamertag] - Profil Xbox/Game Pass`\n" +
      "`/game twitch - Gère les streamers suivis`\n" +
      "`/game psn - Profil, trophées et jeux PlayStation`\n" +
      "`/game track-add [jeu] - Surveille les actus Steam d'un jeu`\n" +
      "`/game track-remove [jeu] - Arrête la surveillance`\n" +
      "`/game track-list - Liste les jeux surveillés`",
  },
  {
    id: "community",
    name: "Communauté",
    emoji: "👥",
    description: "Fonctionnalités communautaires",
    commands:
      "`/community ticket-setup - Configure le système de tickets`\n" +
      "`/community self-role [action] - Rôles auto-attribuables (admin)`\n" +
      "`/community profile [action] - Profil personnalisé (bio, couleur, badges, titre)`",
  },
  {
    id: "utility",
    name: "Utilitaires",
    emoji: "🔧",
    description: "Outils et utilitaires",
    commands:
      "`/tools embed-builder - Crée un embed personnalisé`\n" +
      "`/tools say [salon] [message] - Fait parler le bot`\n" +
      "`/tools vocal [action] - Gère la connexion vocale (rejoindre/quitter)`\n" +
      "`/tools mp3 [nom] - Joue un son en vocal`\n" +
      "`/tools tts [texte] [langue] - Lit du texte à voix haute en vocal`\n" +
      "`/tools recherche [sujet] - Recherche sur Internet`\n" +
      "`/tools audio-effects - Effets audio`\n" +
      "`/tools radio-stop - Arrête la radio`",
  },
  {
    id: "casier",
    name: "Casier",
    emoji: "📋",
    description: "Gestion du casier judiciaire",
    commands:
      "`/casier view [@user] - Affiche le casier d'un membre`\n" +
      "`/casier clear [id] - Efface une sanction ou un casier (admin)`",
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
