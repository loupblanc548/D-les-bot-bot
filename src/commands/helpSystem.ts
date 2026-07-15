import {
  ChatInputCommandInteraction,
  SlashCommandBuilder,
  Client,
  EmbedBuilder,
  ActionRowBuilder,
  StringSelectMenuBuilder,
  StringSelectMenuInteraction,
} from "discord.js";

export const commands = [
  new SlashCommandBuilder()
    .setName("help")
    .setDescription("Affiche l'aide hiérarchique du bot")
    .addStringOption((o) =>
      o
        .setName("category")
        .setDescription("Catégorie spécifique à explorer")
        .setRequired(false)
        .addChoices(
          { name: "🛡️ Modération", value: "mod" },
          { name: "🔒 Sécurité & OSINT", value: "security" },
          { name: "🤖 IA", value: "ai" },
          { name: "🎮 Gaming", value: "gaming" },
          { name: "💰 Économie", value: "economy" },
          { name: "🛠️ Tools", value: "tools" },
          { name: "📢 Alertes", value: "alerts" },
          { name: "📰 Sources RSS", value: "sources" },
          { name: "🎫 Tickets", value: "ticket" },
          { name: "👤 Communauté", value: "community" },
          { name: "⚙️ Admin", value: "admin" },
          { name: "🔧 Bot & Debug", value: "bot" },
        ),
    )
    .toJSON(),
  new SlashCommandBuilder()
    .setName("commands")
    .setDescription("Liste et recherche de commandes")
    .addStringOption((o) =>
      o
        .setName("action")
        .setDescription("Action")
        .setRequired(false)
        .addChoices(
          { name: "🔥 Trending (top 10)", value: "trending" },
          { name: "📂 Par catégorie", value: "category" },
          { name: "🔍 Rechercher", value: "search" },
        ),
    )
    .addStringOption((o) =>
      o.setName("query").setDescription("Terme de recherche ou catégorie").setRequired(false),
    )
    .toJSON(),
];

interface HelpCategory {
  name: string;
  emoji: string;
  description: string;
  commands: { name: string; description: string }[];
}

const HELP_DATA: Record<string, HelpCategory> = {
  mod: {
    name: "Modération",
    emoji: "🛡️",
    description: "Gestion des sanctions et du salon",
    commands: [
      { name: "/mod warn", description: "Avertir un membre" },
      { name: "/mod kick", description: "Expulser un membre" },
      { name: "/mod ban", description: "Bannir un membre" },
      { name: "/mod mute", description: "Mute (timeout longue durée)" },
      { name: "/mod unmute", description: "Retirer le mute" },
      { name: "/mod timeout", description: "Timeout court (secondes)" },
      { name: "/mod clear", description: "Supprimer un lot de messages" },
      { name: "/mod purge", description: "Supprimer les messages d'un utilisateur" },
      { name: "/mod purgeuser", description: "Supprimer tous les messages d'un utilisateur" },
      { name: "/mod lock", description: "Verrouiller le salon" },
      { name: "/mod unlock", description: "Déverrouiller le salon" },
      { name: "/mod slowmode", description: "Activer le slowmode" },
      { name: "/mod softban", description: "Soft ban (ban+unban)" },
      { name: "/mod tempban", description: "Ban temporaire" },
      { name: "/mod snipe", description: "Voir le dernier message supprimé" },
      { name: "/mod history", description: "Historique des messages d'un utilisateur" },
      { name: "/mod report", description: "Signaler un membre au staff" },
      { name: "/modadmin", description: "Panel admin modération" },
    ],
  },
  security: {
    name: "Sécurité & OSINT",
    emoji: "🔒",
    description: "Audit, scan OSINT, anti-raid, vérifications",
    commands: [
      { name: "/security nuke", description: "Clone & supprime le salon (anti-spam)" },
      { name: "/security check-alt", description: "Liste les comptes récents" },
      { name: "/security blacklist", description: "Blacklist un utilisateur" },
      { name: "/security antiraid", description: "Active le mode anti-raid" },
      { name: "/security verif", description: "Configuration vérification" },
      { name: "/security namehistory", description: "Historique des pseudos" },
      { name: "/security avatarhistory", description: "Historique des avatars" },
      { name: "/security linkcheck", description: "Vérifie un lien" },
      { name: "/security alt-link", description: "Vérifie les comptes alternatifs" },
      { name: "/security ban-log", description: "Log des bannissements" },
      { name: "/security behavior-timeline", description: "Timeline comportement" },
      { name: "/security spam-analysis", description: "Analyse de spam" },
      { name: "/security riskscore", description: "Score de risque" },
      { name: "/security riskyusers", description: "Utilisateurs à risque" },
      { name: "/security auto-report", description: "Rapport auto" },
      { name: "/security raid-shield", description: "Bouclier anti-raid" },
      { name: "/security lockdown", description: "Verrouillage serveur" },
      { name: "/security word-filter", description: "Filtre de mots" },
      { name: "/security automod-config", description: "Config auto-mod" },
      { name: "/security automod-status", description: "Statut auto-mod" },
      { name: "/osint scan", description: "Scan OSINT (IP/domaine/email)" },
      { name: "/osint dns", description: "Résolution DNS" },
      { name: "/osint whois", description: "WHOIS domaine" },
      { name: "/osint port-scan", description: "Scan de ports" },
      { name: "/osint ssl-check", description: "Vérif SSL" },
      { name: "/osint breach", description: "Check data breach" },
      { name: "/osint sherlock", description: "Recherche pseudo" },
      { name: "/osint maigret", description: "OSINT personne" },
      { name: "/osint tech-detect", description: "Détection techno" },
      { name: "/osint threatreport", description: "Rapport de menace" },
      { name: "/osint intel", description: "Intelligence" },
      { name: "/osint screenshot", description: "Capture page web" },
      { name: "/security audit", description: "Audit sécurité serveur" },
      { name: "/security config", description: "Config sécurité" },
    ],
  },
  ai: {
    name: "IA",
    emoji: "🤖",
    description: "Chat, génération, traduction, sentiment, config",
    commands: [
      { name: "/ai chat", description: "Conversation IA" },
      { name: "/ai aichat", description: "Activer/désactiver le chat contextuel" },
      { name: "/ai ai-image", description: "Générer une image" },
      { name: "/ai translate-auto", description: "Traduction auto" },
      { name: "/ai ai-translate-custom", description: "Traduction avancée" },
      { name: "/ai summarize", description: "Résumer un salon" },
      { name: "/ai explain", description: "Expliquer un concept" },
      { name: "/ai ai-sentiment", description: "Analyse de sentiment" },
      { name: "/ai ai-mood", description: "Humeur du serveur" },
      { name: "/ai ai-fun", description: "Contenu fun (roast/compliment)" },
      { name: "/ai ai-profile", description: "Profil personnalité IA" },
      { name: "/ai ai-suggest", description: "Suggestions d'amélioration" },
      { name: "/ai ai-persona", description: "Changer de persona" },
      { name: "/ai ai-channel-summary", description: "Résumé complet salon" },
      { name: "/ai ai-summarize-user", description: "Résumé activité membre" },
      { name: "/ai config", description: "Config IA (modèle, prompt, température)" },
      { name: "/ai ai-moderation-config", description: "Config modération IA" },
      { name: "/ai ai-history", description: "Historique modération IA" },
      { name: "/ai ai-chat-export", description: "Export conversation" },
      { name: "/ai ai-prompt-templates", description: "Templates de prompts" },
      { name: "/ai ai-context", description: "Gestion contexte (clear/size)" },
      { name: "/ai ai-temperature", description: "Ajuster créativité" },
      { name: "/ai ai-model-select", description: "Changer modèle LLM" },
      { name: "/ai ai-token-usage", description: "Stats consommation tokens" },
      { name: "/ai smartpoll", description: "Sondage intelligent" },
    ],
  },
  gaming: {
    name: "Gaming",
    emoji: "🎮",
    description: "Tracking, deals, jeux gratuits, plateformes",
    commands: [
      { name: "/game status", description: "Statut serveurs de jeu" },
      { name: "/game info", description: "Infos détaillées d'un jeu" },
      { name: "/game free-games", description: "Jeux gratuits Epic" },
      { name: "/game free-game-reminder", description: "Rappels jeux gratuits" },
      { name: "/game epic-calendar", description: "Calendrier Epic" },
      { name: "/game patch-notes", description: "Patch notes" },
      { name: "/game deals", description: "Deals jeux" },
      { name: "/game deals-history", description: "Historique deals" },
      { name: "/game price-track", description: "Suivi de prix" },
      { name: "/game price-history", description: "Historique prix" },
      { name: "/game price-compare", description: "Comparaison prix" },
      { name: "/game release-calendar", description: "Calendrier sorties" },
      { name: "/game gaming-news", description: "News gaming" },
      { name: "/game steam", description: "Infos Steam" },
      { name: "/game steam-deals", description: "Deals Steam" },
      { name: "/game wishlist", description: "Wishlist" },
      { name: "/game wishlist-stats", description: "Stats wishlist" },
      { name: "/game wishlist-notify", description: "Notifications wishlist" },
      { name: "/game fortnite-wishlist", description: "Wishlist Fortnite" },
      { name: "/game fortnite-shop-preview", description: "Aperçu boutique Fortnite" },
      { name: "/game psn", description: "Infos PlayStation" },
      { name: "/game xbox", description: "Infos Xbox" },
      { name: "/game twitch", description: "Notifications Twitch" },
      { name: "/game speedrun", description: "Speedrun" },
    ],
  },
  economy: {
    name: "Économie",
    emoji: "💰",
    description: "Solde, boutique, daily, giveaways",
    commands: [
      { name: "/economy balance", description: "Voir ton solde" },
      { name: "/economy daily", description: "Récompense quotidienne" },
      { name: "/economy weekly", description: "Récompense hebdomadaire" },
      { name: "/economy shop", description: "Boutique" },
      { name: "/economy buy", description: "Acheter un item" },
      { name: "/economy sell", description: "Vendre un item" },
      { name: "/economy inventory", description: "Ton inventaire" },
      { name: "/economy gamble", description: "Jouer et gagner des coins" },
      { name: "/economy coinflip", description: "Pile ou face" },
      { name: "/economy dice", description: "Lancer de dés" },
      { name: "/economy leaderboard", description: "Classement des plus riches" },
      { name: "/economy level", description: "Ton niveau" },
      { name: "/economy rank", description: "Ton rang" },
      { name: "/economy giveaway", description: "Créer un giveaway" },
    ],
  },
  tools: {
    name: "Tools",
    emoji: "🛠️",
    description: "QR code, raccourcir URL, météo, traduction, fun",
    commands: [
      { name: "/tools qr-code", description: "Générer un QR code" },
      { name: "/tools url-shorten", description: "Raccourcir une URL" },
      { name: "/tools password-gen", description: "Générateur mot de passe" },
      { name: "/tools username-gen", description: "Générateur pseudo" },
      { name: "/tools weather", description: "Météo" },
      { name: "/tools translate", description: "Traduire un texte" },
      { name: "/tools timestamp", description: "Timestamp Discord" },
      { name: "/tools joke", description: "Blague aléatoire" },
      { name: "/tools quote", description: "Citation inspirante" },
      { name: "/tools advice", description: "Conseil aléatoire" },
      { name: "/tools meme", description: "Meme aléatoire" },
      { name: "/tools trivia", description: "Question trivia" },
      { name: "/tools dog", description: "Photo de chien" },
      { name: "/tools number-fact", description: "Fact sur un nombre" },
      { name: "/tools define", description: "Définition dictionnaire" },
      { name: "/tools country", description: "Infos sur un pays" },
      { name: "/tools hex", description: "Conversion hexadécimale" },
      { name: "/tools exif", description: "Métadonnées image" },
    ],
  },
  alerts: {
    name: "Alertes",
    emoji: "📢",
    description: "Règles, escalation, whitelist, tests",
    commands: [
      { name: "/alert rules", description: "Gérer les règles d'alerte" },
      { name: "/alert ack", description: "Acquitter une alerte" },
      { name: "/alert digest", description: "Digest des alertes" },
      { name: "/alert escalate", description: "Escalader une alerte" },
      { name: "/alert export", description: "Exporter les alertes" },
      { name: "/alert test", description: "Tester une alerte" },
      { name: "/alert whitelist", description: "Whitelist d'alertes" },
      { name: "/alertcenter", description: "Centre d'alertes" },
      { name: "/alertconfig", description: "Config alertes" },
      { name: "/alert smart-alerts", description: "Alertes intelligentes" },
      { name: "/alert viral-alert", description: "Alerte virale" },
    ],
  },
  sources: {
    name: "Sources RSS",
    emoji: "📰",
    description: "Gestion des sources RSS et scrapers",
    commands: [
      { name: "/sources add", description: "Ajouter une source" },
      { name: "/sources remove", description: "Retirer une source" },
      { name: "/sources list", description: "Lister les sources" },
      { name: "/sources pause", description: "Mettre en pause une source" },
      { name: "/sources edit", description: "Modifier une source" },
      { name: "/sources export", description: "Exporter les sources" },
      { name: "/sources import", description: "Importer des sources" },
      { name: "/sources health", description: "Health check des sources" },
      { name: "/sources logs", description: "Logs des sources" },
      { name: "/sources stats", description: "Statistiques des sources" },
      { name: "/sources test", description: "Tester une source" },
      { name: "/sources pause-all", description: "Pause toutes les sources" },
      { name: "/sources resume-all", description: "Reprendre toutes les sources" },
    ],
  },
  ticket: {
    name: "Tickets",
    emoji: "🎫",
    description: "Système de tickets de support",
    commands: [
      { name: "/ticket setup", description: "Configurer les tickets" },
      { name: "/ticket close", description: "Fermer un ticket" },
      { name: "/ticket transcript", description: "Transcript d'un ticket" },
    ],
  },
  community: {
    name: "Communauté",
    emoji: "👤",
    description: "Profil, rôles, anniversaires, réactions",
    commands: [
      { name: "/community profile", description: "Profil utilisateur" },
      { name: "/community userinfo", description: "Infos utilisateur" },
      { name: "/community bio", description: "Modifier sa bio" },
      { name: "/community avatar", description: "Voir un avatar" },
      { name: "/community member-count", description: "Compteur de membres" },
      { name: "/community server-info", description: "Infos serveur" },
      { name: "/community reaction-roles", description: "Rôles par réaction" },
      { name: "/community self-role", description: "Auto-rôle" },
      { name: "/community auto-react", description: "Auto-réactions" },
      { name: "/community birthday-set", description: "Définir anniversaire" },
      { name: "/community birthday-list", description: "Liste anniversaires" },
      { name: "/community welcome-config", description: "Config bienvenue" },
      { name: "/community goodbye-config", description: "Config au revoir" },
      { name: "/community poll", description: "Créer un sondage" },
    ],
  },
  admin: {
    name: "Admin",
    emoji: "⚙️",
    description: "Configuration, gestion, maintenance",
    commands: [
      { name: "/admin config", description: "Configuration serveur" },
      { name: "/admin guild-config", description: "Config guilde" },
      { name: "/admin logging-config", description: "Config logs" },
      { name: "/admin webhook-config", description: "Config webhooks" },
      { name: "/admin cooldown-config", description: "Config cooldowns" },
      { name: "/admin channel-routing", description: "Routing canaux" },
      { name: "/admin permission-audit", description: "Audit permissions" },
      { name: "/admin backup", description: "Backup serveur" },
      { name: "/admin migrate", description: "Migration" },
      { name: "/manage role-create", description: "Créer un rôle" },
      { name: "/manage role-delete", description: "Supprimer un rôle" },
      { name: "/manage role-edit", description: "Modifier un rôle" },
      { name: "/manage channel-create", description: "Créer un salon" },
      { name: "/manage channel-delete", description: "Supprimer un salon" },
      { name: "/manage emoji-add", description: "Ajouter un emoji" },
      { name: "/manage emoji-remove", description: "Retirer un emoji" },
      { name: "/autothread", description: "Config auto-thread" },
      { name: "/customcmd", description: "Commandes custom" },
    ],
  },
  bot: {
    name: "Bot & Debug",
    emoji: "🔧",
    description: "Statut, uptime, dashboard, debug, hotreload",
    commands: [
      { name: "/bot help", description: "Aide générale" },
      { name: "/bot start", description: "Démarrer le bot" },
      { name: "/bot restart", description: "Redémarrer (admin)" },
      { name: "/bot status", description: "Statut du bot" },
      { name: "/bot uptime", description: "Statistiques d'exécution" },
      { name: "/bot dashboard", description: "Dashboard web" },
      { name: "/bot server-info", description: "Infos serveur" },
      { name: "/bot userinfo", description: "Infos utilisateur" },
      { name: "/bot shadowbroker", description: "Dashboard Shadow Broker" },
      { name: "/bot broadcast", description: "Broadcast message" },
      { name: "/bot dm", description: "Envoyer un DM" },
      { name: "/bot maintenance", description: "Mode maintenance" },
      { name: "/bot clean-duplicates", description: "Nettoyer doublons" },
      { name: "/debug logs", description: "Voir les logs" },
      { name: "/debug hotreload", description: "Hot reload" },
      { name: "/debug hotreload-status", description: "Statut hot reload" },
      { name: "/debug api-status", description: "Statut des APIs" },
      { name: "/debug bot-health", description: "Santé du bot" },
      { name: "/debug database", description: "Stats base de données" },
      { name: "/debug deletehistory", description: "Historique suppressions" },
    ],
  },
};

export async function handleCommand(interaction: ChatInputCommandInteraction, client: Client) {
  if (interaction.commandName === "help") {
    await handleHelp(interaction);
  } else if (interaction.commandName === "commands") {
    await handleCommands(interaction, client);
  }
}

async function handleHelp(interaction: ChatInputCommandInteraction) {
  const category = interaction.options.getString("category");

  if (category && HELP_DATA[category]) {
    const cat = HELP_DATA[category];
    const fields = cat.commands.slice(0, 25).map((cmd) => ({
      name: cmd.name,
      value: cmd.description,
      inline: false,
    }));

    const embed = new EmbedBuilder()
      .setTitle(`${cat.emoji} ${cat.name}`)
      .setDescription(cat.description)
      .addFields(fields)
      .setColor(0x5865f2)
      .setFooter({
        text: `${cat.commands.length} commande(s) • /help pour voir toutes les catégories`,
      })
      .setTimestamp();

    await interaction.editReply({ embeds: [embed] });
  } else {
    const embed = new EmbedBuilder()
      .setTitle("🤖 Aide — Catégories")
      .setDescription("Sélectionne une catégorie pour voir ses commandes en détail.")
      .addFields(
        Object.entries(HELP_DATA)
          .slice(0, 25)
          .map(([key, cat]) => ({
            name: `${cat.emoji} ${cat.name}`,
            value: `${cat.description}\n**${cat.commands.length} commandes** — \`/help ${key}\``,
            inline: false,
          })),
      )
      .setColor(0x5865f2)
      .setFooter({ text: "Utilise /help <category> pour une catégorie spécifique" })
      .setTimestamp();

    const select = new StringSelectMenuBuilder()
      .setCustomId("help_category_select")
      .setPlaceholder("Choisis une catégorie...")
      .addOptions(
        Object.entries(HELP_DATA).map(([key, cat]) => ({
          label: `${cat.emoji} ${cat.name}`,
          value: key,
          description: cat.description.slice(0, 100),
        })),
      );

    const row = new ActionRowBuilder<StringSelectMenuBuilder>().addComponents(select);
    await interaction.editReply({ embeds: [embed], components: [row] });
  }
}

async function handleCommands(interaction: ChatInputCommandInteraction, _client: Client) {
  const action = interaction.options.getString("action") || "trending";
  const query = interaction.options.getString("query");

  if (action === "search" && query) {
    const results: { name: string; description: string; category: string }[] = [];
    for (const [_catKey, cat] of Object.entries(HELP_DATA)) {
      for (const cmd of cat.commands) {
        if (
          cmd.name.includes(query.toLowerCase()) ||
          cmd.description.toLowerCase().includes(query.toLowerCase())
        ) {
          results.push({ ...cmd, category: cat.name });
        }
      }
    }
    if (results.length === 0) {
      await interaction.editReply({ content: `❌ Aucune commande trouvée pour \`${query}\`` });
      return;
    }
    const embed = new EmbedBuilder()
      .setTitle(`🔍 Recherche: "${query}"`)
      .setColor(0x5865f2)
      .addFields(
        results.slice(0, 25).map((r) => ({
          name: r.name,
          value: `${r.description}\n*Catégorie: ${r.category}*`,
          inline: false,
        })),
      )
      .setFooter({ text: `${results.length} résultat(s)` });
    await interaction.editReply({ embeds: [embed] });
  } else if (action === "category" && query) {
    const cat = HELP_DATA[query];
    if (!cat) {
      await interaction.editReply({
        content: `❌ Catégorie inconnue. Utilise /help pour voir la liste.`,
      });
      return;
    }
    const embed = new EmbedBuilder()
      .setTitle(`${cat.emoji} ${cat.name} — Toutes les commandes`)
      .setColor(0x5865f2)
      .addFields(
        cat.commands.map((cmd) => ({ name: cmd.name, value: cmd.description, inline: false })),
      )
      .setFooter({ text: `${cat.commands.length} commande(s)` });
    await interaction.editReply({ embeds: [embed] });
  } else {
    const totalCmds = Object.values(HELP_DATA).reduce((acc, cat) => acc + cat.commands.length, 0);
    const embed = new EmbedBuilder()
      .setTitle("🔥 Commandes Trending & Stats")
      .setDescription(
        `**${totalCmds} commandes** réparties sur **${Object.keys(HELP_DATA).length} catégories**`,
      )
      .addFields(
        Object.entries(HELP_DATA).map(([key, cat]) => ({
          name: `${cat.emoji} ${cat.name}`,
          value: `${cat.commands.length} commandes — \`/commands category ${key}\``,
          inline: true,
        })),
      )
      .setColor(0x5865f2)
      .setFooter({ text: "Utilise /commands search <terme> pour rechercher" });
    await interaction.editReply({ embeds: [embed] });
  }
}

export async function handleHelpSelectMenu(
  interaction: StringSelectMenuInteraction,
): Promise<void> {
  const categoryId = interaction.values[0];
  const cat = HELP_DATA[categoryId];

  if (!cat) {
    await interaction.update({ content: "Catégorie introuvable.", components: [] });
    return;
  }

  const fields = cat.commands.slice(0, 25).map((cmd) => ({
    name: cmd.name,
    value: cmd.description,
    inline: false,
  }));

  const embed = new EmbedBuilder()
    .setTitle(`${cat.emoji} ${cat.name}`)
    .setDescription(cat.description)
    .addFields(fields)
    .setColor(0x5865f2)
    .setFooter({
      text: `${cat.commands.length} commande(s) • /help pour voir toutes les catégories`,
    })
    .setTimestamp();

  const select = new StringSelectMenuBuilder()
    .setCustomId("help_category_select")
    .setPlaceholder("Choisis une catégorie...")
    .addOptions(
      Object.entries(HELP_DATA).map(([key, c]) => ({
        label: `${c.emoji} ${c.name}`,
        value: key,
        description: c.description.slice(0, 100),
      })),
    );

  const row = new ActionRowBuilder<StringSelectMenuBuilder>().addComponents(select);
  await interaction.update({ embeds: [embed], components: [row] });
}
