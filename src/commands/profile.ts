/**
 * profile.ts — Commande /profile (profil personnalisé : bio, couleurs, badges, titre)
 *
 * Subcommands : view, bio, color, title, badges, reset
 */

import {
  ChatInputCommandInteraction,
  SlashCommandBuilder,
  EmbedBuilder,
  MessageFlags,
  User,
} from "discord.js";
import prisma from "../prisma.js";
import logger from "../utils/logger.js";

// ─── Badges disponibles ────────────────────────────────────────────────────────

const AVAILABLE_BADGES: Record<string, { emoji: string; label: string; description: string }> = {
  gamer: { emoji: "🎮", label: "Gamer", description: "Joueur passionné" },
  dev: { emoji: "💻", label: "Développeur", description: "Codeur de talent" },
  artist: { emoji: "🎨", label: "Artiste", description: "Âme créative" },
  music: { emoji: "🎵", label: "Melomane", description: "Amoureux de la musique" },
  veteran: { emoji: "🎖️", label: "Vétéran", description: "Membre de longue date" },
  helper: { emoji: "🤝", label: "Helper", description: "Toujours prêt à aider" },
  meme: { emoji: "😂", label: "Meme Lord", description: "Le roi des memes" },
  chill: { emoji: "🌴", label: "Chill", description: "Détendu et cool" },
  otaku: { emoji: "🌸", label: "Otaku", description: "Fan d'anime/manga" },
  sport: { emoji: "⚽", label: "Sportif", description: "Actif et énergique" },
  foodie: { emoji: "🍕", label: "Foodie", description: "Passionné de cuisine" },
  traveler: { emoji: "✈️", label: "Voyageur", description: "Explorateur du monde" },
};

const MAX_BADGES = 5;
const MAX_BIO_LENGTH = 500;
const MAX_TITLE_LENGTH = 50;

// ─── Commande ──────────────────────────────────────────────────────────────────

export const commands = [
  new SlashCommandBuilder()
    .setName("profile")
    .setDescription("Gère ton profil personnalisé (bio, couleur, badges, titre)")
    .addSubcommand((sc) =>
      sc
        .setName("view")
        .setDescription("Affiche ton profil ou celui d'un autre membre")
        .addUserOption((o) =>
          o.setName("utilisateur").setDescription("Profil à afficher").setRequired(false),
        ),
    )
    .addSubcommand((sc) =>
      sc
        .setName("bio")
        .setDescription("Définis ta biographie")
        .addStringOption((o) =>
          o
            .setName("texte")
            .setDescription("Ta bio (max 500 caractères)")
            .setRequired(true)
            .setMaxLength(MAX_BIO_LENGTH),
        ),
    )
    .addSubcommand((sc) =>
      sc
        .setName("color")
        .setDescription("Définis la couleur de ton profil")
        .addStringOption((o) =>
          o
            .setName("couleur")
            .setDescription("Code hex sans # (ex: 5865f2) ou couleur prédéfinie")
            .setRequired(true)
            .addChoices(
              { name: "🔵 Bleu Discord", value: "5865f2" },
              { name: "🟢 Vert", value: "57f287" },
              { name: "🔴 Rouge", value: "ed4245" },
              { name: "🟡 Jaune", value: "fee75c" },
              { name: "🟣 Violet", value: "9b59b6" },
              { name: "🟠 Orange", value: "e67e22" },
              { name: "🌸 Rose", value: "eb459e" },
              { name: "⚪ Blanc", value: "ffffff" },
              { name: "⚫ Noir", value: "2f3136" },
              { name: "🟤 Marron", value: "8b4513" },
              { name: "🩵 Cyan", value: "1abc9c" },
              { name: "🩷 Magenta", value: "e91e63" },
            ),
        ),
    )
    .addSubcommand((sc) =>
      sc
        .setName("title")
        .setDescription("Définis ton titre personnalisé")
        .addStringOption((o) =>
          o
            .setName("titre")
            .setDescription("Ton titre (max 50 caractères)")
            .setRequired(true)
            .setMaxLength(MAX_TITLE_LENGTH),
        ),
    )
    .addSubcommand((sc) =>
      sc
        .setName("badges")
        .setDescription("Gère tes badges")
        .addStringOption((o) =>
          o
            .setName("action")
            .setDescription("Action sur les badges")
            .setRequired(true)
            .addChoices(
              { name: "📋 Lister les badges disponibles", value: "list" },
              { name: "➕ Ajouter un badge", value: "add" },
              { name: "➖ Retirer un badge", value: "remove" },
              { name: "🗑️ Réinitialiser mes badges", value: "clear" },
            ),
        )
        .addStringOption((o) =>
          o
            .setName("badge")
            .setDescription("Badge à ajouter/retirer")
            .setRequired(false)
            .addChoices(
              ...Object.entries(AVAILABLE_BADGES).map(([value, b]) => ({
                name: `${b.emoji} ${b.label}`,
                value,
              })),
            ),
        ),
    )
    .addSubcommand((sc) =>
      sc.setName("reset").setDescription("Réinitialise entièrement ton profil"),
    )
    .toJSON(),
];

// ─── Handler ───────────────────────────────────────────────────────────────────

export async function handleCommand(interaction: ChatInputCommandInteraction) {
  const sub = interaction.options.getSubcommand();
  const userId = interaction.user.id;

  try {
    switch (sub) {
      case "view":
        await handleView(interaction);
        break;
      case "bio":
        await handleBio(interaction, userId);
        break;
      case "color":
        await handleColor(interaction, userId);
        break;
      case "title":
        await handleTitle(interaction, userId);
        break;
      case "badges":
        await handleBadges(interaction, userId);
        break;
      case "reset":
        await handleReset(interaction, userId);
        break;
    }
  } catch (error) {
    logger.error("[Profile] Erreur:", error);
    try {
      if (interaction.deferred) {
        await interaction.editReply({ content: "❌ Une erreur est survenue." });
      } else {
        await interaction.reply({
          content: "❌ Une erreur est survenue.",
          flags: [MessageFlags.Ephemeral],
        });
      }
    } catch {}
  }
}

// ─── View ──────────────────────────────────────────────────────────────────────

async function handleView(interaction: ChatInputCommandInteraction) {
  const targetUser = interaction.options.getUser("utilisateur");
  const user: User = targetUser || interaction.user;
  const userId = user.id;

  const profile = await prisma.memberProfile.findUnique({ where: { userId } });

  const badges: string[] = profile?.badges ? JSON.parse(profile.badges) : [];
  const badgeDisplay =
    badges.length > 0
      ? badges
          .map((b) => AVAILABLE_BADGES[b]?.emoji || "")
          .filter(Boolean)
          .join(" ")
      : "Aucun badge";

  const color = parseInt(profile?.color || "2f3136", 16);

  const member = await interaction.guild?.members.fetch(userId).catch(() => null);
  const displayName = member?.displayName || user.username;
  const title = profile?.title || "Membre";

  const embed = new EmbedBuilder()
    .setColor(color)
    .setTitle(`${displayName}`)
    .setThumbnail(user.displayAvatarURL({ size: 256 }))
    .addFields(
      { name: "🏷️ Titre", value: title, inline: true },
      { name: "🎖️ Badges", value: badgeDisplay, inline: true },
    );

  if (profile?.bio) {
    embed.setDescription(profile.bio);
  } else {
    embed.setDescription("*Aucune bio définie. Utilise `/profile bio` pour en ajouter une.*");
  }

  embed.addFields({
    name: "📅 Compte créé le",
    value: `<t:${Math.floor(user.createdTimestamp / 1000)}:R>`,
    inline: true,
  });

  if (member?.joinedTimestamp) {
    embed.addFields({
      name: "📥 A rejoint le",
      value: `<t:${Math.floor(member.joinedTimestamp / 1000)}:R>`,
      inline: true,
    });
  }

  embed.setFooter({ text: `Profil de ${user.tag}` }).setTimestamp();

  await interaction.reply({ embeds: [embed] });
}

// ─── Bio ───────────────────────────────────────────────────────────────────────

async function handleBio(interaction: ChatInputCommandInteraction, userId: string) {
  const bio = interaction.options.getString("texte", true);

  await prisma.memberProfile.upsert({
    where: { userId },
    update: { bio },
    create: { userId, bio },
  });

  await interaction.reply({
    content: `✅ Bio mise à jour ! (${bio.length} caractères)`,
    flags: [MessageFlags.Ephemeral],
  });
  logger.info(`[Profile] Bio updated by ${interaction.user.tag}`);
}

// ─── Color ─────────────────────────────────────────────────────────────────────

async function handleColor(interaction: ChatInputCommandInteraction, userId: string) {
  const color = interaction.options.getString("couleur", true);

  // Valider le format hex
  if (!/^[0-9a-fA-F]{6}$/.test(color)) {
    await interaction.reply({
      content: "❌ Couleur invalide. Utilise un code hex à 6 chiffres (ex: 5865f2).",
      flags: [MessageFlags.Ephemeral],
    });
    return;
  }

  await prisma.memberProfile.upsert({
    where: { userId },
    update: { color },
    create: { userId, color },
  });

  await interaction.reply({
    content: `✅ Couleur du profil définie sur **#${color}** !`,
    flags: [MessageFlags.Ephemeral],
  });
  logger.info(`[Profile] Color updated by ${interaction.user.tag} → #${color}`);
}

// ─── Title ──────────────────────────────────────────────────────────────────────

async function handleTitle(interaction: ChatInputCommandInteraction, userId: string) {
  const title = interaction.options.getString("titre", true);

  await prisma.memberProfile.upsert({
    where: { userId },
    update: { title },
    create: { userId, title },
  });

  await interaction.reply({
    content: `✅ Titre défini sur **${title}** !`,
    flags: [MessageFlags.Ephemeral],
  });
  logger.info(`[Profile] Title updated by ${interaction.user.tag} → "${title}"`);
}

// ─── Badges ────────────────────────────────────────────────────────────────────

async function handleBadges(interaction: ChatInputCommandInteraction, userId: string) {
  const action = interaction.options.getString("action", true);
  const badgeKey = interaction.options.getString("badge");

  if (action === "list") {
    const profile = await prisma.memberProfile.findUnique({ where: { userId } });
    const currentBadges: string[] = profile?.badges ? JSON.parse(profile.badges) : [];

    const embed = new EmbedBuilder()
      .setTitle("🎖️ Badges disponibles")
      .setColor(0x5865f2)
      .setDescription(
        Object.entries(AVAILABLE_BADGES)
          .map(([key, b]) => {
            const owned = currentBadges.includes(key);
            return `${b.emoji} **${b.label}** — ${b.description} ${owned ? "✅" : ""}`;
          })
          .join("\n"),
      )
      .addFields(
        {
          name: "Tes badges",
          value:
            currentBadges.length > 0
              ? currentBadges.map((b) => AVAILABLE_BADGES[b]?.emoji || "").join(" ")
              : "Aucun",
          inline: true,
        },
        { name: "Maximum", value: `${MAX_BADGES} badges`, inline: true },
      )
      .setFooter({ text: "Utilise /profile badges add/remove pour gérer tes badges" });

    await interaction.reply({ embeds: [embed], flags: [MessageFlags.Ephemeral] });
    return;
  }

  if (action === "clear") {
    await prisma.memberProfile.upsert({
      where: { userId },
      update: { badges: "[]" },
      create: { userId, badges: "[]" },
    });

    await interaction.reply({
      content: "✅ Tous tes badges ont été retirés.",
      flags: [MessageFlags.Ephemeral],
    });
    return;
  }

  if (!badgeKey) {
    await interaction.reply({
      content: "❌ Spécifie un badge à ajouter/retirer.",
      flags: [MessageFlags.Ephemeral],
    });
    return;
  }

  const profile = await prisma.memberProfile.findUnique({ where: { userId } });
  let badges: string[] = profile?.badges ? JSON.parse(profile.badges) : [];

  if (action === "add") {
    if (badges.includes(badgeKey)) {
      await interaction.reply({
        content: "❌ Tu as déjà ce badge.",
        flags: [MessageFlags.Ephemeral],
      });
      return;
    }
    if (badges.length >= MAX_BADGES) {
      await interaction.reply({
        content: `❌ Tu as déjà ${MAX_BADGES} badges (maximum). Retire-en un d'abord.`,
        flags: [MessageFlags.Ephemeral],
      });
      return;
    }
    badges.push(badgeKey);
    await prisma.memberProfile.upsert({
      where: { userId },
      update: { badges: JSON.stringify(badges) },
      create: { userId, badges: JSON.stringify(badges) },
    });

    const badge = AVAILABLE_BADGES[badgeKey];
    await interaction.reply({
      content: `✅ Badge ${badge.emoji} **${badge.label}** ajouté !`,
      flags: [MessageFlags.Ephemeral],
    });
  } else if (action === "remove") {
    if (!badges.includes(badgeKey)) {
      await interaction.reply({
        content: "❌ Tu n'as pas ce badge.",
        flags: [MessageFlags.Ephemeral],
      });
      return;
    }
    badges = badges.filter((b) => b !== badgeKey);
    await prisma.memberProfile.upsert({
      where: { userId },
      update: { badges: JSON.stringify(badges) },
      create: { userId, badges: JSON.stringify(badges) },
    });

    const badge = AVAILABLE_BADGES[badgeKey];
    await interaction.reply({
      content: `✅ Badge ${badge.emoji} **${badge.label}** retiré.`,
      flags: [MessageFlags.Ephemeral],
    });
  }
}

// ─── Reset ──────────────────────────────────────────────────────────────────────

async function handleReset(interaction: ChatInputCommandInteraction, userId: string) {
  await prisma.memberProfile.deleteMany({ where: { userId } });

  await interaction.reply({
    content: "✅ Ton profil a été entièrement réinitialisé.",
    flags: [MessageFlags.Ephemeral],
  });
  logger.info(`[Profile] Reset by ${interaction.user.tag}`);
}
