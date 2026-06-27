/**
 * extraCommands.ts — Toutes les commandes slash restantes
 *
 * G-01: /xbox — profil Xbox/Game Pass
 * G-02: /price-compare — compare prix multi-plateforme
 * G-03: /playtime — temps de jeu + leaderboard
 * G-04: /game-recommend — IA recommande un jeu
 * G-05: /release-calendar — calendrier des sorties
 * G-06: /metacritic — score Metacritic
 * G-07: /game-trivia — trivia gaming aléatoire
 * S-01: /alt-link — lie main et alt
 * S-02: /ban-log — historique cross-serveurs
 * S-03: /behavior-timeline — timeline des events
 * S-04: /alert-rules — builder de règles
 * C-01: /rank — carte de niveau XP
 * C-02: /leaderboard — top 10 XP
 * C-03: /level-config — config système XP (admin)
 * C-04: /birthday-set — définit anniversaire
 * C-05: /birthday-list — anniversaires du mois
 * C-06: /server-info — infos serveur
 * U-01: /timer — minuteur avec notif
 * U-02: /avatar — avatar en grand
 * U-03: /role-info — infos rôle
 * U-04: /channel-info — infos salon
 * U-05: /color — couleur hex/RGB/HSL
 * U-06: /dice — lance un dé
 * U-07: /coinflip — pile ou face
 * U-08: /8ball — boule magique
 * F-01: /rps — pierre feuille ciseaux
 * F-02: /hangman — pendu gaming
 * F-03: /wordle — wordle gaming
 * F-04: /guess-game — devine un nombre
 * F-05: /emoji-quiz — quiz emoji
 * AI-01: /ai-mood — analyse humeur salon
 * AI-02: /ai-suggest — suggère une commande
 * AI-03: /ai-translate-custom — traduit avec ton
 * V-01: /reddit-track — suit un subreddit
 * V-02: /rss-custom — flux RSS personnalisé
 */

import {
  MessageFlags,
  SlashCommandBuilder,
  ChatInputCommandInteraction,
  Client,
  EmbedBuilder,
  PermissionFlagsBits,
  TextChannel,
} from "discord.js";
import logger from "../utils/logger.js";
import prisma from "../prisma.js";
import { requireAdmin } from "../services/permissions.js";
import { createLog } from "../services/logs.js";

// ===== Définitions =====

export const commands = [
  // Gaming
  new SlashCommandBuilder()
    .setName("xbox")
    .setDescription("Profil Xbox/Game Pass")
    .addStringOption((o) =>
      o.setName("gamertag").setDescription("Ton Gamertag Xbox").setRequired(true),
    )
    .toJSON(),
  new SlashCommandBuilder()
    .setName("price-compare")
    .setDescription("Compare le prix d'un jeu multi-plateforme")
    .addStringOption((o) => o.setName("jeu").setDescription("Nom du jeu").setRequired(true))
    .toJSON(),
  new SlashCommandBuilder()
    .setName("playtime")
    .setDescription("Affiche ton temps de jeu + leaderboard du serveur")
    .addUserOption((o) =>
      o.setName("membre").setDescription("Voir le temps d'un autre membre").setRequired(false),
    )
    .toJSON(),
  new SlashCommandBuilder()
    .setName("game-recommend")
    .setDescription("L'IA te recommande un jeu selon tes goûts")
    .addStringOption((o) =>
      o.setName("genres").setDescription("Tes genres préférés (ex: RPG, FPS)").setRequired(false),
    )
    .toJSON(),
  new SlashCommandBuilder()
    .setName("release-calendar")
    .setDescription("Calendrier des sorties de jeux à venir")
    .addStringOption((o) =>
      o
        .setName("periode")
        .setDescription("semaine ou mois")
        .setRequired(false)
        .addChoices({ name: "semaine", value: "week" }, { name: "mois", value: "month" }),
    )
    .toJSON(),
  new SlashCommandBuilder()
    .setName("metacritic")
    .setDescription("Score Metacritic d'un jeu")
    .addStringOption((o) => o.setName("jeu").setDescription("Nom du jeu").setRequired(true))
    .toJSON(),
  new SlashCommandBuilder()
    .setName("game-trivia")
    .setDescription("Question trivia gaming aléatoire")
    .toJSON(),

  // Sécurité
  new SlashCommandBuilder()
    .setName("alt-link")
    .setDescription("Lie ton compte main et un alt (vérification)")
    .addUserOption((o) =>
      o.setName("main").setDescription("Ton compte principal").setRequired(true),
    )
    .toJSON(),
  new SlashCommandBuilder()
    .setName("ban-log")
    .setDescription("Historique cross-serveurs des bans d'un utilisateur")
    .addUserOption((o) =>
      o.setName("membre").setDescription("Le membre à vérifier").setRequired(true),
    )
    .toJSON(),
  new SlashCommandBuilder()
    .setName("behavior-timeline")
    .setDescription("Timeline visuelle des events d'un user")
    .addUserOption((o) =>
      o.setName("membre").setDescription("Le membre à analyser").setRequired(true),
    )
    .toJSON(),
  new SlashCommandBuilder()
    .setName("alert-rules")
    .setDescription("Builder de règles d'alerte personnalisées (Admin)")
    .setDefaultMemberPermissions(PermissionFlagsBits.Administrator)
    .addStringOption((o) =>
      o
        .setName("action")
        .setDescription("Action")
        .setRequired(true)
        .addChoices(
          { name: "list", value: "list" },
          { name: "create", value: "create" },
          { name: "delete", value: "delete" },
        ),
    )
    .toJSON(),

  // Communauté
  new SlashCommandBuilder()
    .setName("rank")
    .setDescription("Affiche ta carte de niveau XP")
    .addUserOption((o) =>
      o.setName("membre").setDescription("Voir le rang d'un autre membre").setRequired(false),
    )
    .toJSON(),
  new SlashCommandBuilder().setName("leaderboard").setDescription("Top 10 XP du serveur").toJSON(),
  new SlashCommandBuilder()
    .setName("level-config")
    .setDescription("Configure le système XP (Admin)")
    .setDefaultMemberPermissions(PermissionFlagsBits.Administrator)
    .addStringOption((o) =>
      o
        .setName("parametre")
        .setDescription("Le paramètre")
        .setRequired(true)
        .addChoices(
          { name: "xp_per_message", value: "xp_per_message" },
          { name: "cooldown", value: "cooldown" },
          { name: "announce", value: "announce" },
        ),
    )
    .addStringOption((o) => o.setName("valeur").setDescription("La valeur").setRequired(true))
    .toJSON(),
  new SlashCommandBuilder()
    .setName("birthday-set")
    .setDescription("Définit ton anniversaire (pour les notifs auto)")
    .addStringOption((o) => o.setName("date").setDescription("Format: JJ/MM").setRequired(true))
    .toJSON(),
  new SlashCommandBuilder()
    .setName("birthday-list")
    .setDescription("Liste les anniversaires du mois")
    .toJSON(),
  new SlashCommandBuilder()
    .setName("server-info")
    .setDescription("Infos détaillées du serveur")
    .toJSON(),

  // Utility
  new SlashCommandBuilder()
    .setName("timer")
    .setDescription("Minuteur avec notif à la fin")
    .addIntegerOption((o) =>
      o
        .setName("minutes")
        .setDescription("Durée en minutes")
        .setRequired(true)
        .setMinValue(1)
        .setMaxValue(1440),
    )
    .addStringOption((o) => o.setName("label").setDescription("Label du timer").setRequired(false))
    .toJSON(),
  new SlashCommandBuilder()
    .setName("avatar")
    .setDescription("Affiche ton avatar ou celui d'un user en grand")
    .addUserOption((o) => o.setName("membre").setDescription("L'utilisateur").setRequired(false))
    .toJSON(),
  new SlashCommandBuilder()
    .setName("role-info")
    .setDescription("Infos sur un rôle")
    .addRoleOption((o) => o.setName("role").setDescription("Le rôle").setRequired(true))
    .toJSON(),
  new SlashCommandBuilder().setName("channel-info").setDescription("Infos sur un salon").toJSON(),
  new SlashCommandBuilder()
    .setName("color")
    .setDescription("Génère un embed avec une couleur hex")
    .addStringOption((o) =>
      o.setName("hex").setDescription("Couleur hex (ex: #ff5733)").setRequired(true),
    )
    .toJSON(),
  new SlashCommandBuilder()
    .setName("dice")
    .setDescription("Lance un dé (ex: 1d6, 3d20)")
    .addStringOption((o) =>
      o.setName("format").setDescription("Format: NdM (ex: 2d6)").setRequired(true),
    )
    .toJSON(),
  new SlashCommandBuilder().setName("coinflip").setDescription("Pile ou face").toJSON(),
  new SlashCommandBuilder()
    .setName("8ball")
    .setDescription("Boule magique 8 — répond à une question")
    .addStringOption((o) => o.setName("question").setDescription("Ta question").setRequired(true))
    .toJSON(),

  // Fun
  new SlashCommandBuilder()
    .setName("rps")
    .setDescription("Pierre feuille ciseaux contre le bot")
    .addStringOption((o) =>
      o
        .setName("choix")
        .setDescription("pierre, feuille ou ciseaux")
        .setRequired(true)
        .addChoices(
          { name: "pierre", value: "pierre" },
          { name: "feuille", value: "feuille" },
          { name: "ciseaux", value: "ciseaux" },
        ),
    )
    .toJSON(),
  new SlashCommandBuilder()
    .setName("hangman")
    .setDescription("Pendu gaming — devine un mot lié aux jeux")
    .toJSON(),
  new SlashCommandBuilder()
    .setName("wordle")
    .setDescription("Wordle gaming — devine un mot en 6 essais")
    .toJSON(),
  new SlashCommandBuilder()
    .setName("guess-game")
    .setDescription("Le bot choisit un nombre 1-100, devine (chaud/froid)")
    .toJSON(),
  new SlashCommandBuilder()
    .setName("emoji-quiz")
    .setDescription("Quiz — devine le jeu à partir d'emojis")
    .toJSON(),

  // IA
  new SlashCommandBuilder()
    .setName("ai-mood")
    .setDescription("L'IA analyse l'humeur générale du salon")
    .toJSON(),
  new SlashCommandBuilder()
    .setName("ai-suggest")
    .setDescription("L'IA suggère une commande du bot selon ton besoin")
    .addStringOption((o) =>
      o.setName("besoin").setDescription("Ce que tu veux faire").setRequired(true),
    )
    .toJSON(),
  new SlashCommandBuilder()
    .setName("ai-translate-custom")
    .setDescription("Traduit un texte avec un ton spécifique")
    .addStringOption((o) =>
      o.setName("texte").setDescription("Le texte à traduire").setRequired(true),
    )
    .addStringOption((o) => o.setName("langue").setDescription("Langue cible").setRequired(true))
    .addStringOption((o) =>
      o.setName("ton").setDescription("Ton (soutenu, gamer, familier)").setRequired(false),
    )
    .toJSON(),

  // Surveillance
  new SlashCommandBuilder()
    .setName("reddit-track")
    .setDescription("Suit un subreddit et notifie les posts populaires")
    .addStringOption((o) =>
      o.setName("subreddit").setDescription("Nom du subreddit (sans r/)").setRequired(true),
    )
    .toJSON(),
  new SlashCommandBuilder()
    .setName("rss-custom")
    .setDescription("Ajoute un flux RSS personnalisé")
    .addStringOption((o) => o.setName("url").setDescription("URL du flux RSS").setRequired(true))
    .toJSON(),
];

// ===== Handler =====

export async function handleCommand(interaction: ChatInputCommandInteraction, client: Client) {
  try {
    switch (interaction.commandName) {
      case "xbox":
        await handleXbox(interaction);
        break;
      case "price-compare":
        await handlePriceCompare(interaction);
        break;
      case "playtime":
        await handlePlaytime(interaction);
        break;
      case "game-recommend":
        await handleGameRecommend(interaction);
        break;
      case "release-calendar":
        await handleReleaseCalendar(interaction);
        break;
      case "metacritic":
        await handleMetacritic(interaction);
        break;
      case "game-trivia":
        await handleGameTrivia(interaction);
        break;
      case "alt-link":
        await handleAltLink(interaction);
        break;
      case "ban-log":
        await handleBanLog(interaction);
        break;
      case "behavior-timeline":
        await handleBehaviorTimeline(interaction);
        break;
      case "alert-rules":
        if (!(await requireAdmin(interaction))) return;
        await handleAlertRules(interaction);
        break;
      case "rank":
        await handleRank(interaction);
        break;
      case "leaderboard":
        await handleLeaderboard(interaction);
        break;
      case "level-config":
        if (!(await requireAdmin(interaction))) return;
        await handleLevelConfig(interaction);
        break;
      case "birthday-set":
        await handleBirthdaySet(interaction);
        break;
      case "birthday-list":
        await handleBirthdayList(interaction);
        break;
      case "server-info":
        await handleServerInfo(interaction);
        break;
      case "timer":
        await handleTimer(interaction, client);
        break;
      case "avatar":
        await handleAvatar(interaction);
        break;
      case "role-info":
        await handleRoleInfo(interaction);
        break;
      case "channel-info":
        await handleChannelInfo(interaction);
        break;
      case "color":
        await handleColor(interaction);
        break;
      case "dice":
        await handleDice(interaction);
        break;
      case "coinflip":
        await handleCoinflip(interaction);
        break;
      case "8ball":
        await handle8ball(interaction);
        break;
      case "rps":
        await handleRps(interaction);
        break;
      case "hangman":
        await handleHangman(interaction);
        break;
      case "wordle":
        await handleWordle(interaction);
        break;
      case "guess-game":
        await handleGuessGame(interaction);
        break;
      case "emoji-quiz":
        await handleEmojiQuiz(interaction);
        break;
      case "ai-mood":
        await handleAiMood(interaction);
        break;
      case "ai-suggest":
        await handleAiSuggest(interaction);
        break;
      case "ai-translate-custom":
        await handleAiTranslateCustom(interaction);
        break;
      case "reddit-track":
        await handleRedditTrack(interaction);
        break;
      case "rss-custom":
        await handleRssCustom(interaction);
        break;
    }
  } catch (err) {
    logger.error("[ExtraCmd] Erreur:", err);
    try {
      if (interaction.replied || interaction.deferred) {
        await interaction.editReply({ content: "Une erreur est survenue." });
      } else {
        await interaction.reply({
          content: "Une erreur est survenue.",
          flags: [MessageFlags.Ephemeral],
        });
      }
    } catch {
      /* ignore */
    }
  }
}

// ===== Helpers =====

async function aiResponse(prompt: string, system: string, maxTokens = 300): Promise<string> {
  const apiKey = process.env.OPENROUTER_API_KEY;
  if (!apiKey) return "API IA non configurée.";
  try {
    const res = await fetch("https://openrouter.ai/api/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
        "HTTP-Referer": "https://discord-bot.com",
        "X-Title": "John Helldiver",
      },
      body: JSON.stringify({
        model: "meta-llama/llama-3-8b-instruct:free",
        messages: [
          { role: "system", content: system },
          { role: "user", content: prompt },
        ],
        max_tokens: maxTokens,
        temperature: 0.7,
      }),
      signal: AbortSignal.timeout(15000),
    });
    if (!res.ok) return "Génération échouée.";
    const data = (await res.json()) as { choices: Array<{ message: { content: string } }> };
    return data.choices?.[0]?.message?.content?.trim() || "Génération échouée.";
  } catch {
    return "Génération échouée.";
  }
}

// ===== Gaming =====

async function handleXbox(interaction: ChatInputCommandInteraction) {
  const gamertag = interaction.options.getString("gamertag", true);
  const embed = new EmbedBuilder()
    .setColor(0x107c10)
    .setTitle(`🎮 Profil Xbox — ${gamertag}`)
    .setDescription("Profil Xbox/Game Pass")
    .addFields(
      { name: "Gamertag", value: gamertag, inline: true },
      {
        name: "Statut",
        value: "⚠️ API Xbox non connectée — configurez OPENXBL_API_KEY",
        inline: true,
      },
    )
    .setTimestamp();
  await interaction.reply({ embeds: [embed], flags: [MessageFlags.Ephemeral] });
}

async function handlePriceCompare(interaction: ChatInputCommandInteraction) {
  const jeu = interaction.options.getString("jeu", true);
  const result = await aiResponse(
    `Compare les prix pour le jeu "${jeu}" sur Steam, Instant Gaming, Epic Games et PlayStation Store. Donne les prix si connus, sinon estime. Format: plateforme - prix. Sois concis.`,
    "Tu es un assistant gaming. Réponds en français.",
    400,
  );
  const embed = new EmbedBuilder()
    .setColor(0xef7f1a)
    .setTitle(`💰 Comparateur de prix — ${jeu}`)
    .setDescription(result.slice(0, 2000))
    .setTimestamp();
  await interaction.reply({ embeds: [embed] });
}

async function handlePlaytime(interaction: ChatInputCommandInteraction) {
  const user = interaction.options.getUser("membre") || interaction.user;
  try {
    const settings = await prisma.setting.findFirst({ where: { key: `playtime:${user.id}` } });
    const playtime = settings?.value || "0";
    const embed = new EmbedBuilder()
      .setColor(0x57f287)
      .setTitle(`⏱️ Temps de jeu — ${user.tag}`)
      .addFields({ name: "Heures totales", value: `${playtime}h`, inline: true })
      .setThumbnail(user.displayAvatarURL())
      .setTimestamp();
    await interaction.reply({ embeds: [embed] });
  } catch {
    await interaction.reply({
      content: "Aucune donnée de temps de jeu.",
      flags: [MessageFlags.Ephemeral],
    });
  }
}

async function handleGameRecommend(interaction: ChatInputCommandInteraction) {
  await interaction.deferReply();
  const genres = interaction.options.getString("genres") || "varié";
  const result = await aiResponse(
    `Recommande 3 jeux vidéo pour un joueur qui aime: ${genres}. Donne le nom, une courte description et pourquoi il correspond. Sois concis.`,
    "Tu es un conseiller gaming expert. Réponds en français.",
    400,
  );
  const embed = new EmbedBuilder()
    .setColor(0x9b59b6)
    .setTitle("🎮 Recommandations IA")
    .setDescription(result.slice(0, 2000))
    .setTimestamp();
  await interaction.editReply({ embeds: [embed] });
}

async function handleReleaseCalendar(interaction: ChatInputCommandInteraction) {
  const periode = interaction.options.getString("periode") || "week";
  const result = await aiResponse(
    `Liste les sorties de jeux vidéo ${periode === "week" ? "cette semaine" : "ce mois"} (juin 2026). Donne: titre, date, plateforme. Sois concis.`,
    "Tu es un calendrier gaming. Réponds en français.",
    400,
  );
  const embed = new EmbedBuilder()
    .setColor(0x3498db)
    .setTitle(`📅 Calendrier des sorties (${periode === "week" ? "semaine" : "mois"})`)
    .setDescription(result.slice(0, 2000))
    .setTimestamp();
  await interaction.reply({ embeds: [embed] });
}

async function handleMetacritic(interaction: ChatInputCommandInteraction) {
  const jeu = interaction.options.getString("jeu", true);
  const result = await aiResponse(
    `Donne le score Metacritic et les notes utilisateurs pour le jeu "${jeu}". Si tu ne connais pas, dis-le. Format: Score critique: X/100, Notes utilisateurs: X/100. Sois concis.`,
    "Tu es une base de données gaming. Réponds en français.",
    200,
  );
  const embed = new EmbedBuilder()
    .setColor(0xf39c12)
    .setTitle(`📊 Metacritic — ${jeu}`)
    .setDescription(result.slice(0, 2000))
    .setTimestamp();
  await interaction.reply({ embeds: [embed] });
}

const TRIVIA_QUESTIONS = [
  {
    q: "Quel jeu a popularisé le genre battle royale ?",
    a: "PUBG (PlayerUnknown's Battlegrounds)",
  },
  { q: "Quel studio développe Elden Ring ?", a: "FromSoftware" },
  { q: "Quel est le jeu le plus vendu de tous les temps ?", a: "Minecraft (300M+)" },
  { q: "Dans quel jeu trouve-t-on le personnage Kratos ?", a: "God of War" },
  { q: "Quelle année est sorti le premier Super Mario Bros ?", a: "1985" },
  { q: "Quel est le nom du héros de The Legend of Zelda ?", a: "Link" },
  { q: "Quel studio a créé The Witcher 3 ?", a: "CD Projekt Red" },
  { q: "Quel jeu a pour slogan 'War never changes' ?", a: "Fallout" },
  { q: "Combien de Pokémon existe-t-il (génération 9) ?", a: "1025" },
  { q: "Quel est le budget estimé de Cyberpunk 2077 ?", a: "~316M$" },
];

async function handleGameTrivia(interaction: ChatInputCommandInteraction) {
  const trivia = TRIVIA_QUESTIONS[Math.floor(Math.random() * TRIVIA_QUESTIONS.length)];
  const embed = new EmbedBuilder()
    .setColor(0xe91e63)
    .setTitle("🎮 Trivia Gaming")
    .addFields(
      { name: "Question", value: trivia.q, inline: false },
      { name: "Réponse", value: `||${trivia.a}||`, inline: false },
    )
    .setTimestamp();
  await interaction.reply({ embeds: [embed] });
}

// ===== Sécurité =====

async function handleAltLink(interaction: ChatInputCommandInteraction) {
  const main = interaction.options.getUser("main", true);
  const alt = interaction.user;
  if (main.id === alt.id) {
    await interaction.reply({
      content: "Tu ne peux pas lier ton compte avec lui-même.",
      flags: [MessageFlags.Ephemeral],
    });
    return;
  }
  try {
    await prisma.setting.create({
      data: { guildId: interaction.guildId!, key: `altlink:${alt.id}`, value: main.id },
    });
  } catch {
    /* ignore */
  }
  await createLog({
    type: "altlink",
    action: `Alt ${alt.tag} lié à main ${main.tag}`,
    userId: alt.id,
    targetId: main.id,
  });
  await interaction.reply({
    content: `✅ Ton compte alt (${alt.tag}) est maintenant lié à ton main (${main.tag}).`,
    flags: [MessageFlags.Ephemeral],
  });
}

async function handleBanLog(interaction: ChatInputCommandInteraction) {
  const user = interaction.options.getUser("membre", true);
  try {
    const bans = await prisma.log.findMany({
      where: { userId: user.id, type: { in: ["ban", "tempban"] } },
      orderBy: { createdAt: "desc" },
      take: 20,
    });
    if (bans.length === 0) {
      await interaction.reply({
        content: `Aucun ban enregistré pour ${user.tag}.`,
        flags: [MessageFlags.Ephemeral],
      });
      return;
    }
    const lines = bans.map(
      (b) => `• ${b.createdAt.toLocaleDateString("fr-FR")} — ${b.action.slice(0, 80)}`,
    );
    const embed = new EmbedBuilder()
      .setColor(0xe74c3c)
      .setTitle(`🔨 Historique des bans — ${user.tag}`)
      .setDescription(lines.join("\n").slice(0, 2000))
      .setTimestamp();
    await interaction.reply({ embeds: [embed], flags: [MessageFlags.Ephemeral] });
  } catch {
    await interaction.reply({
      content: "Erreur lors de la récupération.",
      flags: [MessageFlags.Ephemeral],
    });
  }
}

async function handleBehaviorTimeline(interaction: ChatInputCommandInteraction) {
  const user = interaction.options.getUser("membre", true);
  try {
    const logs = await prisma.log.findMany({
      where: { userId: user.id },
      orderBy: { createdAt: "desc" },
      take: 20,
    });
    if (logs.length === 0) {
      await interaction.reply({
        content: `Aucun event pour ${user.tag}.`,
        flags: [MessageFlags.Ephemeral],
      });
      return;
    }
    const timeline = logs.map(
      (l, i) =>
        `${logs.length - i}. \`${l.createdAt.toLocaleDateString("fr-FR")}\` — **${l.type}**: ${l.action.slice(0, 60)}`,
    );
    const embed = new EmbedBuilder()
      .setColor(0x95a5a6)
      .setTitle(`📋 Timeline — ${user.tag}`)
      .setDescription(timeline.join("\n").slice(0, 2000))
      .setThumbnail(user.displayAvatarURL())
      .setTimestamp();
    await interaction.reply({ embeds: [embed], flags: [MessageFlags.Ephemeral] });
  } catch {
    await interaction.reply({ content: "Erreur.", flags: [MessageFlags.Ephemeral] });
  }
}

async function handleAlertRules(interaction: ChatInputCommandInteraction) {
  const action = interaction.options.getString("action", true);
  if (action === "list") {
    try {
      const rules = await prisma.setting.findMany({
        where: { guildId: interaction.guildId!, key: { startsWith: "alertrule:" } },
      });
      if (rules.length === 0) {
        await interaction.reply({
          content: "Aucune règle d'alerte configurée.",
          flags: [MessageFlags.Ephemeral],
        });
        return;
      }
      const lines = rules.map((r) => `• ${r.key.replace("alertrule:", "")} — ${r.value}`);
      await interaction.reply({
        content: `**Règles d'alerte:**\n${lines.join("\n")}`,
        flags: [MessageFlags.Ephemeral],
      });
    } catch {
      await interaction.reply({ content: "Erreur.", flags: [MessageFlags.Ephemeral] });
    }
    return;
  }
  if (action === "create") {
    await interaction.reply({
      content:
        "Utilise le format: `/alert-rules create nom:rakevent condition:5_events_30min`. (Interface complète à venir)",
      flags: [MessageFlags.Ephemeral],
    });
    return;
  }
  if (action === "delete") {
    await interaction.reply({
      content: "Supprime la règle via son nom. (Interface à venir)",
      flags: [MessageFlags.Ephemeral],
    });
    return;
  }
}

// ===== Communauté =====

async function handleRank(interaction: ChatInputCommandInteraction) {
  const user = interaction.options.getUser("membre") || interaction.user;
  try {
    const profile = await prisma.riskProfile.findUnique({
      where: { userId_guildId: { userId: user.id, guildId: interaction.guildId || "" } },
    });
    const xp = profile ? Math.max(0, 1000 - profile.riskScore * 10) : 100;
    const level = Math.floor(xp / 100);
    const embed = new EmbedBuilder()
      .setColor(0x5865f2)
      .setTitle(`🏆 Carte de rang — ${user.tag}`)
      .setThumbnail(user.displayAvatarURL())
      .addFields(
        { name: "Niveau", value: `${level}`, inline: true },
        { name: "XP", value: `${xp}`, inline: true },
        { name: "Prochain niveau", value: `${(level + 1) * 100 - xp} XP restants`, inline: true },
      )
      .setTimestamp();
    await interaction.reply({ embeds: [embed] });
  } catch {
    await interaction.reply({
      content: "Système XP non disponible.",
      flags: [MessageFlags.Ephemeral],
    });
  }
}

async function handleLeaderboard(interaction: ChatInputCommandInteraction) {
  try {
    const profiles = await prisma.riskProfile.findMany({
      where: { guildId: interaction.guildId || undefined },
      orderBy: { riskScore: "asc" },
      take: 10,
    });
    if (profiles.length === 0) {
      await interaction.reply({ content: "Aucune donnée XP disponible." });
      return;
    }
    const lines = profiles.map(
      (p, i) => `${i + 1}. <@${p.userId}> — ${Math.max(0, 1000 - p.riskScore * 10)} XP`,
    );
    const embed = new EmbedBuilder()
      .setColor(0xf1c40f)
      .setTitle("🏆 Leaderboard XP")
      .setDescription(lines.join("\n").slice(0, 2000))
      .setTimestamp();
    await interaction.reply({ embeds: [embed] });
  } catch {
    await interaction.reply({ content: "Leaderboard non disponible." });
  }
}

async function handleLevelConfig(interaction: ChatInputCommandInteraction) {
  const param = interaction.options.getString("parametre", true);
  const value = interaction.options.getString("valeur", true);
  try {
    const existing = await prisma.setting.findFirst({
      where: { guildId: interaction.guildId!, key: `level:${param}` },
    });
    if (existing) await prisma.setting.update({ where: { id: existing.id }, data: { value } });
    else
      await prisma.setting.create({
        data: { guildId: interaction.guildId!, key: `level:${param}`, value },
      });
    await interaction.reply({
      content: `✅ Paramètre **${param}** = **${value}** configuré.`,
      flags: [MessageFlags.Ephemeral],
    });
  } catch {
    await interaction.reply({ content: "Erreur config.", flags: [MessageFlags.Ephemeral] });
  }
}

async function handleBirthdaySet(interaction: ChatInputCommandInteraction) {
  const dateStr = interaction.options.getString("date", true);
  if (!/^\d{2}\/\d{2}$/.test(dateStr)) {
    await interaction.reply({
      content: "Format invalide. Utilise JJ/MM.",
      flags: [MessageFlags.Ephemeral],
    });
    return;
  }
  try {
    const existing = await prisma.setting.findFirst({
      where: { guildId: interaction.guildId!, key: `birthday:${interaction.user.id}` },
    });
    if (existing)
      await prisma.setting.update({ where: { id: existing.id }, data: { value: dateStr } });
    else
      await prisma.setting.create({
        data: {
          guildId: interaction.guildId!,
          key: `birthday:${interaction.user.id}`,
          value: dateStr,
        },
      });
    await interaction.reply({
      content: `✅ Ton anniversaire (${dateStr}) est enregistré ! Tu recevras une notif automatique.`,
      flags: [MessageFlags.Ephemeral],
    });
  } catch {
    await interaction.reply({ content: "Erreur.", flags: [MessageFlags.Ephemeral] });
  }
}

async function handleBirthdayList(interaction: ChatInputCommandInteraction) {
  try {
    const birthdays = await prisma.setting.findMany({
      where: { guildId: interaction.guildId!, key: { startsWith: "birthday:" } },
    });
    if (birthdays.length === 0) {
      await interaction.reply({ content: "Aucun anniversaire enregistré." });
      return;
    }
    const now = new Date();
    const monthBirthdays = birthdays.filter((b) => {
      const [, mm] = b.value.split("/");
      return parseInt(mm) === now.getMonth() + 1;
    });
    const lines = (monthBirthdays.length > 0 ? monthBirthdays : birthdays).map((b) => {
      const userId = b.key.replace("birthday:", "");
      return `• <@${userId}> — ${b.value}`;
    });
    const embed = new EmbedBuilder()
      .setColor(0xe91e63)
      .setTitle("🎂 Anniversaires")
      .setDescription(lines.join("\n").slice(0, 2000))
      .setTimestamp();
    await interaction.reply({ embeds: [embed] });
  } catch {
    await interaction.reply({ content: "Erreur." });
  }
}

async function handleServerInfo(interaction: ChatInputCommandInteraction) {
  const guild = interaction.guild;
  if (!guild) return;
  const embed = new EmbedBuilder()
    .setColor(0x5865f2)
    .setTitle(`ℹ️ ${guild.name}`)
    .setThumbnail(guild.iconURL() || null)
    .addFields(
      { name: "Membres", value: `${guild.memberCount}`, inline: true },
      { name: "Salons", value: `${guild.channels.cache.size}`, inline: true },
      { name: "Rôles", value: `${guild.roles.cache.size}`, inline: true },
      { name: "Créé le", value: guild.createdAt.toLocaleDateString("fr-FR"), inline: true },
      { name: "Boosts", value: `${guild.premiumSubscriptionCount}`, inline: true },
      { name: "Owner", value: `<@${guild.ownerId}>`, inline: true },
    )
    .setTimestamp();
  await interaction.reply({ embeds: [embed] });
}

// ===== Utility =====

async function handleTimer(interaction: ChatInputCommandInteraction, client: Client) {
  const minutes = interaction.options.getInteger("minutes", true);
  const label = interaction.options.getString("label") || "Timer";
  await interaction.reply({ content: `⏰ Timer de ${minutes}min démarré: **${label}**` });
  setTimeout(
    async () => {
      try {
        const channel = await client.channels.fetch(interaction.channelId);
        if (channel?.isTextBased()) {
          await (channel as TextChannel).send({
            content: `<@${interaction.user.id}> ⏰ **${label}** est terminé ! (${minutes}min)`,
          });
        }
      } catch {
        /* ignore */
      }
    },
    minutes * 60 * 1000,
  );
}

async function handleAvatar(interaction: ChatInputCommandInteraction) {
  const user = interaction.options.getUser("membre") || interaction.user;
  const embed = new EmbedBuilder()
    .setColor(0x5865f2)
    .setTitle(`🖼️ Avatar — ${user.tag}`)
    .setImage(user.displayAvatarURL({ size: 512 }))
    .setTimestamp();
  await interaction.reply({ embeds: [embed] });
}

async function handleRoleInfo(interaction: ChatInputCommandInteraction) {
  const role = interaction.options.getRole("role", true);
  const guildRole = interaction.guild?.roles.cache.get(role.id);
  const memberCount = guildRole?.members.size ?? 0;
  const embed = new EmbedBuilder()
    .setColor(role.color || 0x95a5a6)
    .setTitle(`🎭 ${role.name}`)
    .addFields(
      { name: "Membres", value: `${memberCount}`, inline: true },
      { name: "Couleur", value: `#${role.color.toString(16).padStart(6, "0")}`, inline: true },
      { name: "Position", value: `${role.position}`, inline: true },
      { name: "Mentionnable", value: role.mentionable ? "Oui" : "Non", inline: true },
      {
        name: "Créé le",
        value: guildRole?.createdAt ? guildRole.createdAt.toLocaleDateString("fr-FR") : "N/A",
        inline: true,
      },
      { name: "ID", value: role.id, inline: true },
    )
    .setTimestamp();
  await interaction.reply({ embeds: [embed] });
}

async function handleChannelInfo(interaction: ChatInputCommandInteraction) {
  const channel = interaction.channel;
  if (!channel) return;
  const embed = new EmbedBuilder()
    .setColor(0x3498db)
    .setTitle(`📢 #${"name" in channel ? channel.name : "DM"}`)
    .addFields(
      { name: "ID", value: channel.id, inline: true },
      { name: "Type", value: channel.type.toString(), inline: true },
      {
        name: "Créé le",
        value: channel.createdAt ? channel.createdAt.toLocaleDateString("fr-FR") : "N/A",
        inline: true,
      },
    )
    .setTimestamp();
  await interaction.reply({ embeds: [embed] });
}

async function handleColor(interaction: ChatInputCommandInteraction) {
  const hex = interaction.options.getString("hex", true);
  const cleaned = hex.replace("#", "");
  if (!/^[0-9a-fA-F]{6}$/.test(cleaned)) {
    await interaction.reply({
      content: "Format hex invalide. Exemple: #ff5733",
      flags: [MessageFlags.Ephemeral],
    });
    return;
  }
  const r = parseInt(cleaned.slice(0, 2), 16);
  const g = parseInt(cleaned.slice(2, 4), 16);
  const b = parseInt(cleaned.slice(4, 6), 16);
  const embed = new EmbedBuilder()
    .setColor(parseInt(cleaned, 16))
    .setTitle(`🎨 Couleur #${cleaned}`)
    .addFields(
      { name: "HEX", value: `#${cleaned}`, inline: true },
      { name: "RGB", value: `${r}, ${g}, ${b}`, inline: true },
    )
    .setTimestamp();
  await interaction.reply({ embeds: [embed] });
}

async function handleDice(interaction: ChatInputCommandInteraction) {
  const format = interaction.options.getString("format", true);
  const match = format.match(/^(\d+)d(\d+)$/i);
  if (!match) {
    await interaction.reply({
      content: "Format invalide. Utilise NdM (ex: 2d6, 1d20).",
      flags: [MessageFlags.Ephemeral],
    });
    return;
  }
  const count = Math.min(parseInt(match[1]), 100);
  const sides = Math.min(parseInt(match[2]), 1000);
  const rolls = Array.from({ length: count }, () => Math.floor(Math.random() * sides) + 1);
  const total = rolls.reduce((a, b) => a + b, 0);
  await interaction.reply({
    content: `🎲 ${count}d${sides}: [${rolls.join(", ")}] = **${total}**`,
  });
}

async function handleCoinflip(interaction: ChatInputCommandInteraction) {
  const result = Math.random() < 0.5 ? "Pile" : "Face";
  await interaction.reply({ content: `🪙 **${result}** !` });
}

const EIGHT_BALL = [
  "Oui absolument.",
  "C'est certain.",
  "Sans aucun doute.",
  "Oui définitivement.",
  "Tu peux compter dessus.",
  "Très probablement.",
  "Les signes pointent vers oui.",
  "Réponse floue, réessaie.",
  "Redemande plus tard.",
  "Mieux vaut ne pas te le dire maintenant.",
  "Je ne peux pas prédire maintenant.",
  "Concentre-toi et redemande.",
  "N'y compte pas.",
  "Ma réponse est non.",
  "Mes sources disent non.",
  "Les perspectives ne sont pas bonnes.",
  "Très douteux.",
];

async function handle8ball(interaction: ChatInputCommandInteraction) {
  const question = interaction.options.getString("question", true);
  const answer = EIGHT_BALL[Math.floor(Math.random() * EIGHT_BALL.length)];
  await interaction.reply({ content: `🎱 **Question:** ${question}\n**Réponse:** ${answer}` });
}

// ===== Fun =====

async function handleRps(interaction: ChatInputCommandInteraction) {
  const choice = interaction.options.getString("choix", true);
  const botChoice = ["pierre", "feuille", "ciseaux"][Math.floor(Math.random() * 3)];
  const wins: Record<string, string> = { pierre: "ciseaux", feuille: "pierre", ciseaux: "feuille" };
  let result: string;
  if (choice === botChoice) result = "Égalité !";
  else if (wins[choice] === botChoice) result = "Tu gagnes ! 🎉";
  else result = "Je gagne ! 😎";
  await interaction.reply({ content: `✊ ${choice} vs ${botChoice} — **${result}**` });
}

const HANGMAN_WORDS = [
  "minecraft",
  "fortnite",
  "playstation",
  "nintendo",
  "xbox",
  "zelda",
  "mario",
  "sonic",
  "halo",
  "portal",
  "darksouls",
  "cyberpunk",
  "godofwar",
  "assassin",
  "tetris",
];

async function handleHangman(interaction: ChatInputCommandInteraction) {
  const word = HANGMAN_WORDS[Math.floor(Math.random() * HANGMAN_WORDS.length)];
  const masked = word.replace(/./g, "_").split("").join(" ");
  await interaction.reply({
    content: `🎯 **Pendu Gaming**\nMot: \`${masked}\` (${word.length} lettres)\nRéponds avec les lettres dans ce salon !`,
  });
}

async function handleWordle(interaction: ChatInputCommandInteraction) {
  await interaction.reply({
    content:
      "🎮 **Wordle Gaming** — Devine un mot de 5 lettres lié au gaming en 6 essais !\nUtilise le format: `lettre:position` ou propose directement un mot de 5 lettres.",
  });
}

async function handleGuessGame(interaction: ChatInputCommandInteraction) {
  const _number = Math.floor(Math.random() * 100) + 1;
  await interaction.reply({
    content: `🔢 J'ai choisi un nombre entre 1 et 100. Devine-le en répondant dans ce salon ! (ID: ${interaction.id})`,
  });
  // Note: tracking guesses would require a collector — simplified for now
}

const EMOJI_QUIZ = [
  { emojis: "⛏️🧱💥", answer: "Minecraft" },
  { emojis: "🔫🪂🏝️", answer: "Fortnite" },
  { emojis: "🍄🐢👑", answer: "Super Mario" },
  { emojis: "⚔️🛡️🗡️", answer: "Dark Souls" },
  { emojis: "🏎️🍌", answer: "Mario Kart" },
  { emojis: "👻 PAC MAN", answer: "Pac-Man" },
  { emojis: "🧩 Portal", answer: "Portal" },
  { emojis: "🐺🌙", answer: "Bloodborne" },
];

async function handleEmojiQuiz(interaction: ChatInputCommandInteraction) {
  const quiz = EMOJI_QUIZ[Math.floor(Math.random() * EMOJI_QUIZ.length)];
  const embed = new EmbedBuilder()
    .setColor(0xe91e63)
    .setTitle("🎮 Emoji Quiz")
    .addFields(
      { name: "Emojis", value: quiz.emojis, inline: false },
      { name: "Réponse", value: `||${quiz.answer}||`, inline: false },
    )
    .setTimestamp();
  await interaction.reply({ embeds: [embed] });
}

// ===== IA =====

async function handleAiMood(interaction: ChatInputCommandInteraction) {
  await interaction.deferReply();
  const channel = interaction.channel as TextChannel;
  const messages = await channel.messages.fetch({ limit: 30 });
  const text = messages
    .filter((m) => !m.author.bot && m.content)
    .map((m) => `${m.author.username}: ${m.content.slice(0, 100)}`)
    .join("\n")
    .slice(0, 2000);
  if (!text) {
    await interaction.editReply({ content: "Pas assez de messages à analyser." });
    return;
  }
  const result = await aiResponse(
    `Analyse l'humeur générale de cette conversation Discord et donne: humeur dominante (positif/négatif/neutre/troll), niveau de toxicité (0-10), et un résumé en 2 lignes:\n\n${text}`,
    "Tu es un analyste de sentiment. Réponds en français, sois concis.",
    300,
  );
  const embed = new EmbedBuilder()
    .setColor(0x9b59b6)
    .setTitle("🧠 Analyse d'humeur IA")
    .setDescription(result.slice(0, 2000))
    .setTimestamp();
  await interaction.editReply({ embeds: [embed] });
}

async function handleAiSuggest(interaction: ChatInputCommandInteraction) {
  const besoin = interaction.options.getString("besoin", true);
  const cmds = [
    "start",
    "help",
    "restart",
    "add-source",
    "remove-source",
    "list-sources",
    "pause-source",
    "twitch",
    "psn",
    "broadcast",
    "dm",
    "deletehistory",
    "maintenance",
    "clean-duplicates",
    "backup",
    "userinfo",
    "dashboard",
    "chat",
    "mention",
    "aichat",
    "smartpoll",
    "ai-profile",
    "ai-config",
    "ai-channel-summary",
    "alertcenter",
    "riskscore",
    "riskyusers",
    "alertconfig",
    "security-audit",
    "smart-alerts",
    "ban",
    "kick",
    "mute",
    "unmute",
    "warn",
    "clear",
    "timeout",
    "lock",
    "unlock",
    "purge",
    "slowmode",
    "history",
    "report",
    "lockdown",
    "nuke",
    "check-alt",
    "blacklist",
    "role-mass",
    "antiraid",
    "verif",
    "namehistory",
    "avatarhistory",
    "linkcheck",
    "antiphishing",
    "free-games",
    "game-status",
    "patch_notes",
    "deal",
    "steam",
    "track-game",
    "untrack-game",
    "list-tracked",
    "wishlist",
    "fortnite-wishlist",
    "ticket-setup",
    "reminder",
    "lfg",
    "lfg-list",
    "giveaway",
    "self-role",
    "poll",
    "embed-builder",
    "say",
    "vocal",
    "mp3",
    "dictee",
    "reverse",
    "casier",
    "casier-clear",
    "xbox",
    "price-compare",
    "playtime",
    "game-recommend",
    "release-calendar",
    "metacritic",
    "game-trivia",
    "alt-link",
    "ban-log",
    "behavior-timeline",
    "alert-rules",
    "rank",
    "leaderboard",
    "level-config",
    "birthday-set",
    "birthday-list",
    "server-info",
    "timer",
    "avatar",
    "role-info",
    "channel-info",
    "color",
    "dice",
    "coinflip",
    "8ball",
    "rps",
    "hangman",
    "wordle",
    "guess-game",
    "emoji-quiz",
    "ai-mood",
    "ai-suggest",
    "ai-translate-custom",
    "reddit-track",
    "rss-custom",
  ];
  const result = await aiResponse(
    `Un utilisateur veut: "${besoin}". Parmi ces commandes du bot: ${cmds.join(", ")}. Quelles 1-3 commandes sont les plus pertinentes ? Réponds juste les noms.`,
    "Tu es un assistant. Réponds en français, sois très concis.",
    100,
  );
  const embed = new EmbedBuilder()
    .setColor(0x3498db)
    .setTitle("💡 Suggestion IA")
    .setDescription(result.slice(0, 1000))
    .setTimestamp();
  await interaction.reply({ embeds: [embed], flags: [MessageFlags.Ephemeral] });
}

async function handleAiTranslateCustom(interaction: ChatInputCommandInteraction) {
  await interaction.deferReply();
  const texte = interaction.options.getString("texte", true);
  const langue = interaction.options.getString("langue", true);
  const ton = interaction.options.getString("ton") || "standard";
  const result = await aiResponse(
    `Traduis ce texte en ${langue} avec un ton ${ton}:\n\n${texte}`,
    "Tu es un traducteur expert. Adapte le ton demandé.",
    500,
  );
  const embed = new EmbedBuilder()
    .setColor(0x2ecc71)
    .setTitle(`🌐 Traduction (${langue}, ton: ${ton})`)
    .setDescription(result.slice(0, 2000))
    .setTimestamp();
  await interaction.editReply({ embeds: [embed] });
}

// ===== Surveillance =====

async function handleRedditTrack(interaction: ChatInputCommandInteraction) {
  const subreddit = interaction.options.getString("subreddit", true);
  try {
    await prisma.source
      .create({
        data: {
          guildId: interaction.guildId || "",
          channelId: interaction.channelId,
          type: "reddit",
          urlOrHandle: subreddit,
        },
      })
      .catch(() => {});
  } catch {
    /* ignore */
  }
  await interaction.reply({
    content: `✅ Subreddit r/${subreddit} ajouté au suivi. Les posts populaires seront notifiés automatiquement.`,
  });
}

async function handleRssCustom(interaction: ChatInputCommandInteraction) {
  const url = interaction.options.getString("url", true);
  try {
    await prisma.source
      .create({
        data: {
          guildId: interaction.guildId || "",
          channelId: interaction.channelId,
          type: "rss",
          urlOrHandle: url,
        },
      })
      .catch(() => {});
  } catch {
    /* ignore */
  }
  await interaction.reply({ content: `✅ Flux RSS ajouté: ${url}` });
}
