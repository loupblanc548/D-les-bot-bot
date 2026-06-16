import {
  MessageFlags,
  ChatInputCommandInteraction,
  Client,
  EmbedBuilder,
  PermissionFlagsBits,
  TextChannel,
  GuildMember,
  Role,
  ChannelType,
  ButtonBuilder,
  ButtonStyle,
  ActionRowBuilder,
} from "discord.js";
import prisma from "../../prisma";
import { config } from "../../config";
import { createLog } from "../../services/logs";
import { checkSuspiciousLinksDetailed } from "./utils";
import logger from "../../utils/logger";
import { antiPhishingCache, ANTI_PHISHING_CACHE_TTL_MS } from "./cache";
import { isAntiPhishingActive } from "./utils";

const FOOTER = { text: "Surveillance System • Securite" };


export async function handleLockdown(interaction: ChatInputCommandInteraction) {
  const action = interaction.options.getString("action", true);
  const guild = interaction.guild!;
  const isLocking = action === "on";

  await interaction.deferReply();

  const textChannels = guild.channels.cache.filter(
    (ch): ch is TextChannel =>
      ch.type === ChannelType.GuildText &&
      ch.permissionsFor(guild.roles.everyone)?.has(PermissionFlagsBits.ViewChannel) === true
  );

  let modified = 0;
  const failed: string[] = [];

  for (const channel of textChannels.values()) {
    try {
      await channel.permissionOverwrites.edit(guild.roles.everyone, {
        SendMessages: isLocking ? false : null,
      });
      modified++;
    } catch {
      failed.push(channel.name);
    }
  }

  const embed = new EmbedBuilder()
    .setColor(isLocking ? 0xff3344 : 0x53fc18)
    .setTitle(isLocking ? "🔒 Lockdown activé" : "🔓 Lockdown désactivé")
    .setDescription(
      isLocking
        ? "Les membres ne peuvent plus envoyer de messages dans **" + modified + "** salons."
        : "Les permissions ont été rétablies sur **" + modified + "** salons."
    )
    .setTimestamp();

  if (failed.length > 0) {
    embed.addFields({
      name: "⚠️ Échecs",
      value: failed.map((n) => "#" + n).join(", ").slice(0, 1024),
    });
  }

  await interaction.editReply({ embeds: [embed] });

  await createLog({
    type: "moderation",
    action: isLocking ? "lockdown_on" : "lockdown_off",
    userId: interaction.user.id,
    details: modified + " salons modifiés",
  });
}

// ===== /nuke =====

export async function handleNuke(interaction: ChatInputCommandInteraction) {
  await interaction.deferReply({ flags: [MessageFlags.Ephemeral] });

  const channel = interaction.channel as TextChannel;
  if (!channel || channel.type !== ChannelType.GuildText) {
    await interaction.editReply("Cette commande ne fonctionne que dans un salon textuel.");
    return;
  }

  const channelName = channel.name;
  const channelPosition = channel.position;
  const parentId = channel.parentId;

  // Cloner le salon (garde permissions, categorie, etc.)
  const newChannel = await channel.clone({
    name: channelName,
    parent: parentId,
    position: channelPosition,
    reason: "Nuke par " + interaction.user.tag,
  });

  // Supprimer l'ancien salon
  await interaction.editReply({ content: "☢️ Salon regénéré avec succès." });
  await channel.delete("Nuke par " + interaction.user.tag);

  // Envoyer la confirmation dans le nouveau salon
  const embed = new EmbedBuilder()
    .setColor(0xffaa00)
    .setTitle("☢️ Salon nuké")
    .setDescription(
      "Ce salon a été régénéré par **" + interaction.user.tag + "**.\nL'historique a été effacé."
    )
    .setTimestamp();

  await newChannel.send({ embeds: [embed] });
}

// ===== /check-alt =====

export async function handleCheckAlt(interaction: ChatInputCommandInteraction) {
  const hours = interaction.options.getInteger("heures") || 24;
  const guild = interaction.guild!;

  await interaction.deferReply({ flags: [MessageFlags.Ephemeral] });

  // Récupérer tous les membres
  await guild.members.fetch();

  const cutoff = Date.now() - hours * 60 * 60 * 1000;
  const suspicious: GuildMember[] = [];

  for (const member of guild.members.cache.values()) {
    if (member.user.createdTimestamp > cutoff) {
      suspicious.push(member);
    }
  }

  // Trier par date de création (plus récent d'abord)
  suspicious.sort((a, b) => b.user.createdTimestamp - a.user.createdTimestamp);

  if (suspicious.length === 0) {
    await interaction.editReply({
      embeds: [
        new EmbedBuilder()
          .setColor(0x53fc18)
          .setDescription("Aucun compte créé il y a moins de **" + hours + "h** détecté."),
      ],
    });
    return;
  }

  // Pagination simple (max 10 par page)
  const itemsPerPage = 10;
  const pages: EmbedBuilder[] = [];
  const totalPages = Math.ceil(suspicious.length / itemsPerPage);

  for (let i = 0; i < suspicious.length; i += itemsPerPage) {
    const pageItems = suspicious.slice(i, i + itemsPerPage);
    const embed = new EmbedBuilder()
      .setColor(0xff3344)
      .setTitle("🚨 Comptes suspects (< " + hours + "h)")
      .setDescription(
        "**" + suspicious.length + "** membres ont un compte créé il y a moins de **" + hours + " heures**.\n\n" +
          pageItems
            .map(
              (m, idx) =>
                "**" + (i + idx + 1) + ".** " + m.user.tag + " (`" + m.user.id + "`)\n" +
                "    Compte créé le " + m.user.createdAt.toLocaleDateString("fr-FR")
           )
            .join("\n")
      )
      .setFooter({ text: "Page " + (Math.floor(i / itemsPerPage) + 1) + "/" + totalPages })
      .setTimestamp();

    pages.push(embed);
  }

  await interaction.editReply({ embeds: [pages[0]] });
}

// ===== /blacklist =====

export async function handleBlacklist(
  interaction: ChatInputCommandInteraction,
  _client: Client
) {
  await interaction.deferReply({ ephemeral: true });

  try {
    // Vérification owner
    if (interaction.user.id !== config.ownerId) {
      await interaction.editReply({
        embeds: [
          new EmbedBuilder()
            .setColor(0xff3344)
            .setDescription("🔒 Cette commande est réservée au créateur du bot."),
        ],
      });
      return;
    }

    const action = interaction.options.getString("action", true);
    const cible = interaction.options.getString("cible", true);
    const id = interaction.options.getString("id", true);

    logger.info(
      "🔒 [Blacklist] Action demandée par",
      interaction.user.displayName,
      "(" + interaction.user.id + ")",
      "| Action :",
      action,
      "| Cible :",
      cible,
      "| ID :",
      id
    );

    const isAdd = action === "add";

    if (isAdd) {
      const exists = await prisma.blacklist.findUnique({ where: { targetId: id } });
      if (exists) {
        await interaction.editReply({
          embeds: [
            new EmbedBuilder()
              .setColor(0xffaa00)
              .setDescription("`" + id + "` est déjà dans la liste noire."),
          ],
        });
        return;
      }

      await prisma.blacklist.create({
        data: {
          targetId: id,
          type: cible,
          reason: "Ajouté par " + interaction.user.tag,
        },
      });

      logger.info("🚫 [Blacklist] Entrée ajoutée :", id, "(" + cible + ")");

      await interaction.editReply({
        embeds: [
          new EmbedBuilder()
            .setColor(0xff3344)
            .setTitle("🚫 Ajouté à la liste noire")
            .setDescription(
              "**Type :** " + (cible === "user" ? "Utilisateur" : "Serveur") + "\n" +
              "**ID :** `" + id + "`\n" +
              "Le bot ignorera désormais les commandes de cette entité."
            ),
        ],
      });
    } else {
      const removed = await prisma.blacklist.deleteMany({ where: { targetId: id } });

      if (removed.count === 0) {
        await interaction.editReply({
          embeds: [
            new EmbedBuilder()
              .setColor(0xffaa00)
              .setDescription("`" + id + "` n'est pas dans la liste noire."),
          ],
        });
        return;
      }

      logger.info("✅ [Blacklist] Entrée retirée :", id);

      await interaction.editReply({
        embeds: [
          new EmbedBuilder()
            .setColor(0x53fc18)
            .setTitle("✅ Retiré de la liste noire")
            .setDescription("`" + id + "` peut de nouveau interagir avec le bot."),
        ],
      });
    }

    await createLog({
      type: "moderation",
      action: isAdd ? "blacklist_add" : "blacklist_remove",
      userId: interaction.user.id,
      targetId: id,
      details: "Type: " + cible,
    });
  } catch (error) {
    logger.error("[CRASH CRITIQUE BLACKLIST]:", error);
    await interaction.editReply({
      content: "❌ Impossible d'exécuter la commande blacklist. Une erreur a été logguée dans la console.",
    }).catch(() => {});
  }
}
export async function handleRoleMass(interaction: ChatInputCommandInteraction) {
  const action = interaction.options.getString("action", true);
  const role = interaction.options.getRole("rôle", true);
  const guild = interaction.guild!;
  const isAdding = action === "add";

  await interaction.deferReply({ flags: [MessageFlags.Ephemeral] });

  // Vérifier que le rôle est gérable
  if (!(role as Role).editable) {
    await interaction.editReply({
      embeds: [
        new EmbedBuilder()
          .setColor(0xff3344)
          .setDescription(
            "Je ne peux pas gérer ce rôle (il est peut-être au-dessus du mien dans la hiérarchie)."
          ),
      ],
    });
    return;
  }

  // Récupérer tous les membres
  await guild.members.fetch();
  const members = [...guild.members.cache.values()];

  let success = 0;
  let skipped = 0;
  const failed: string[] = [];

  await interaction.editReply({
    embeds: [
      new EmbedBuilder()
        .setColor(0x2f3136)
        .setDescription(
          (isAdding ? "➕ Ajout" : "➖ Retrait") + " du rôle " + role.toString() + " en cours... (0/" + members.length + ")"
        ),
    ],
  });

  for (let i = 0; i < members.length; i++) {
    const member = members[i];
    try {
      const hasRole = member.roles.cache.has(role.id);

      if (isAdding && !hasRole) {
        await member.roles.add(role as Role);
        success++;
      } else if (!isAdding && hasRole) {
        await member.roles.remove(role as Role);
        success++;
      } else {
        skipped++;
      }

      // Feedback toutes les 50 itérations
      if ((i + 1) % 50 === 0 || i === members.length - 1) {
        await interaction.editReply({
          embeds: [
            new EmbedBuilder()
              .setColor(0x2f3136)
              .setDescription(
                (isAdding ? "➕ Ajout" : "➖ Retrait") + " du rôle " + role.toString() + " en cours... (" + (i + 1) + "/" + members.length + ")"
              ),
          ],
        });
      }

      // Pause anti rate-limit Discord (200ms entre chaque)
      await new Promise((r) => setTimeout(r, 200));
    } catch {
      failed.push(member.user.tag);
    }
  }

  const embed = new EmbedBuilder()
    .setColor(isAdding ? 0x53fc18 : 0xffaa00)
    .setTitle(isAdding ? "✅ Rôle ajouté en masse" : "✅ Rôle retiré en masse")
    .setDescription(
      "**Rôle :** " + role.toString() + "\n" +
      "**Succès :** " + success + " membres\n" +
      "**Ignorés :** " + skipped + " (déjà " + (isAdding ? "eu" : "sans") + " le rôle)\n" +
      (failed.length > 0 ? "**Échecs :** " + failed.length : "")
    )
    .setTimestamp();

  if (failed.length > 0 && failed.length <= 20) {
    embed.addFields({
      name: "⚠️ Membres en échec",
      value: failed.map((t) => "- " + t).join("\n").slice(0, 1024),
    });
  }

  await interaction.editReply({ embeds: [embed] });

  await createLog({
    type: "moderation",
    action: isAdding ? "role_mass_add" : "role_mass_remove",
    userId: interaction.user.id,
    details: "Rôle: " + role.name + " (" + role.id + ") | " + success + " membres",
  });
}

// ===== /antiraid =====
export async function handleAntiraid(interaction: ChatInputCommandInteraction) {
  // 1. Differer TOUT DE SUITE pour eviter le timeout Discord
  await interaction.deferReply({ ephemeral: true });

  try {
    // 2. Recuperation des options (une fois le defer fait)
    const action = interaction.options.getString("action", true);
    const seuilHeures = interaction.options.getInteger("seuil_heures") || 24;
    const guildId = interaction.guildId;
    if (!guildId) {
      await interaction.editReply({ content: "\u274C Cette commande doit etre executee dans un serveur." });
      return;
    }

    // 3. Log de securite
    logger.info(
      "\u{1F6E1}\uFE0F [Anti-Raid] Activation/Desactivation demandee par",
      interaction.user.displayName,
      "(" + interaction.user.id + ")",
      "| Action :",
      action,
      "| Seuil :",
      seuilHeures + "h"
    );

    // 4. Execution (persistee dans GuildConfig via Prisma)
    if (action === "on") {
      logger.info("\u2699\uFE0F [Anti-Raid] Mise a jour des permissions ou de la DB en cours...");
      await prisma.guildConfig.upsert({
        where: { guildId },
        update: { antiRaidEnabled: true, antiRaidSeuilHeures: seuilHeures },
        create: { guildId, antiRaidEnabled: true, antiRaidSeuilHeures: seuilHeures },
      });
      const embed = new EmbedBuilder()
        .setTitle("\u{1F6E1}\uFE0F Mode Anti-Raid Active")
        .setColor(0xff3344)
        .setDescription(
          "Tout nouveau membre avec un compte de **moins de " +
            seuilHeures +
            "h** sera automatiquement timeout 1h."
       )
        .setFooter(FOOTER);
      await interaction.editReply({ embeds: [embed] });
      logger.info("\u2705 [Anti-Raid] Systeme configure avec succes et persiste en base.");
    } else if (action === "off") {
      logger.info("\u2699\uFE0F [Anti-Raid] Mise a jour des permissions ou de la DB en cours...");
      await prisma.guildConfig.upsert({
        where: { guildId },
        update: { antiRaidEnabled: false },
        create: { guildId, antiRaidEnabled: false },
      });
      const embed = new EmbedBuilder()
        .setTitle("\u2705 Mode Anti-Raid Desactive")
        .setColor(0x00ff66)
        .setDescription(
          "Les nouveaux membres ne seront plus filtres automatiquement."
       )
        .setFooter(FOOTER);
      await interaction.editReply({ embeds: [embed] });
      logger.info("\u2705 [Anti-Raid] Systeme configure avec succes et persiste en base.");
    } else if (action === "status") {
      const config = await prisma.guildConfig.findUnique({ where: { guildId } });
      const active = config?.antiRaidEnabled === true;
      const seuil = config?.antiRaidSeuilHeures ?? 24;
      const embed = new EmbedBuilder()
        .setTitle("\u{1F6E1}\uFE0F Statut Anti-Raid")
        .setColor(active ? 0xff3344 : 0x666666)
        .setDescription(
          active
            ? "**ACTIF** \u2014 Seuil : " + seuil + "h de creation de compte"
            : "**INACTIF**"
       )
        .setFooter(FOOTER);
      await interaction.editReply({ embeds: [embed] });
    }
  } catch (error) {
    logger.error("[CRASH CRITIQUE ANTIRAID]:", error);
    await interaction.editReply({
      content:
        "\u274C Impossible d'executer la commande anti-raid. Une erreur a ete logguee dans la console.",
    }).catch(() => {});
  }
}
export async function handleVerif(interaction: ChatInputCommandInteraction) {
  await interaction.deferReply();

  try {
    const guildId = interaction.guildId;
    if (!guildId) {
      await interaction.editReply({ content: "❌ Cette commande doit être exécutée dans un serveur." });
      return;
    }

    const role = interaction.options.getRole("role", true);

    logger.info(
      "✅ [Verif] Panneau de verification demande par",
      interaction.user.displayName,
      "(" + interaction.user.id + ")",
      "| Role :",
      role.name
    );

    const embed = new EmbedBuilder()
      .setTitle("✅ Vérification")
      .setColor(0x3498db)
      .setDescription(
        "Cliquez sur le bouton ci-dessous pour obtenir le rôle **" +
          role.name +
          "** et accéder au serveur."
      )
      .setFooter(FOOTER);

    const button = new ButtonBuilder()
      .setCustomId("verif_" + role.id)
      .setLabel("✅ Vérifier")
      .setStyle(ButtonStyle.Success);

    const row = new ActionRowBuilder<ButtonBuilder>().addComponents(button);

    await interaction.editReply({ embeds: [embed], components: [row] });
  } catch (error) {
    logger.error("[CRASH CRITIQUE VERIF]:", error);
    await interaction.editReply({
      content: "❌ Impossible d'executer la commande de verification. Une erreur a ete logguee dans la console.",
    }).catch(() => {});
  }
}

// ===== /namehistory =====
export async function handleNameHistory(interaction: ChatInputCommandInteraction) {
  const user = interaction.options.getUser("utilisateur", true);
  const guildId = interaction.guildId!;

  await interaction.deferReply({ flags: [MessageFlags.Ephemeral] });

  const history = await prisma.nameHistory.findMany({
    where: { userId: user.id, guildId },
    orderBy: { changedAt: "desc" },
    take: 25,
  });

  if (history.length === 0) {
    await interaction.editReply({
      embeds: [
        new EmbedBuilder()
          .setColor(0x2f3136)
          .setDescription(
            "Aucun changement de pseudo enregistré pour **" + user.tag + "**."
          ),
      ],
    });
    return;
  }

  const items = history.map(
    (h) =>
      "**" +
      h.changedAt.toLocaleDateString("fr-FR") +
      " " +
      h.changedAt.toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit" }) +
      "**\n> \"" +
      h.oldName +
      "\" → **\"" +
      h.newName +
      "\"**"
  );

  const embed = new EmbedBuilder()
    .setColor(0x3498db)
    .setTitle("Historique des pseudos — " + user.tag)
    .setThumbnail(user.displayAvatarURL())
    .setDescription(items.join("\n\n"))
    .setFooter({ text: history.length + " changement(s) enregistré(s)" })
    .setTimestamp();

  await interaction.editReply({ embeds: [embed] });
}

// ===== /avatarhistory =====
export async function handleAvatarHistory(interaction: ChatInputCommandInteraction) {
  const user = interaction.options.getUser("utilisateur", true);
  const guildId = interaction.guildId!;

  await interaction.deferReply({ flags: [MessageFlags.Ephemeral] });

  const history = await prisma.avatarHistory.findMany({
    where: { userId: user.id, guildId },
    orderBy: { changedAt: "desc" },
    take: 10,
  });

  if (history.length === 0) {
    await interaction.editReply({
      embeds: [
        new EmbedBuilder()
          .setColor(0x2f3136)
          .setDescription(
            "Aucun changement d'avatar enregistré pour **" + user.tag + "**."
          ),
      ],
    });
    return;
  }

  const items = history.map(
    (h, i) =>
      "**" +
      h.changedAt.toLocaleDateString("fr-FR") +
      " " +
      h.changedAt.toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit" }) +
      "**\n> Hash: `" +
      h.oldHash.slice(0, 12) +
      "...` → `" +
      h.newHash.slice(0, 12) +
      "...`"
  );

  const embed = new EmbedBuilder()
    .setColor(0x9b59b6)
    .setTitle("Historique des avatars — " + user.tag)
    .setThumbnail(user.displayAvatarURL())
    .setDescription(items.join("\n\n"))
    .setFooter({ text: history.length + " changement(s) enregistré(s)" })
    .setTimestamp();

  await interaction.editReply({ embeds: [embed] });
}

// ===== /linkcheck =====
export async function handleLinkCheck(interaction: ChatInputCommandInteraction) {
  const url = interaction.options.getString("url", true);

  await interaction.deferReply({ flags: [MessageFlags.Ephemeral] });

  const allFlags = checkSuspiciousLinksDetailed(url);

  let riskLevel: string;
  let color: number;

  if (allFlags.length >= 3) {
    riskLevel = "CRITIQUE";
    color = 0xff0000;
  } else if (allFlags.length >= 2) {
    riskLevel = "🟠 Suspect";
    color = 0xffaa00;
  } else if (allFlags.length === 1) {
    riskLevel = "🟡 Faible";
    color = 0xffcc00;
  } else {
    riskLevel = "🟢 Aucun risque détecté";
    color = 0x53fc18;
  }

  const embed = new EmbedBuilder()
    .setColor(color)
    .setTitle("🔍 Analyse de lien")
    .setDescription(
      "**URL :** " +
        url +
        "\n**Niveau de risque :** " +
        riskLevel +
        (allFlags.length > 0
          ? "\n\n**Drapeaux détectés :**\n" +
            allFlags.map((f) => "• " + f).join("\n")
          : "")
    )
    .setFooter({ text: "Surveillance System • LinkCheck" })
    .setTimestamp();

  await interaction.editReply({ embeds: [embed] });
}

// ===== /antiphishing =====
export async function handleAntiphishing(interaction: ChatInputCommandInteraction) {
  await interaction.deferReply({ ephemeral: true });

  try {
    const action = interaction.options.getString("action", true);
    const guildId = interaction.guildId;
    if (!guildId) {
      await interaction.editReply({ content: "❌ Cette commande doit être exécutée dans un serveur." });
      return;
    }

    logger.info(
      "🛡️ [Anti-Phishing] Activation/Désactivation demandée par",
      interaction.user.displayName,
      "(" + interaction.user.id + ")",
      "| Action :",
      action
    );

    if (action === "on") {
      logger.info("⚙️ [Anti-Phishing] Mise à jour de la configuration en cours...");
      await prisma.guildConfig.upsert({ where: { guildId }, create: { guildId, antiPhishing: true }, update: { antiPhishing: true } });
      antiPhishingCache.set(guildId, { active: true, cachedAt: Date.now() });
      const embed = new EmbedBuilder()
        .setTitle("🛡️ Anti-Phishing Activé")
        .setColor(0xff3344)
        .setDescription(
          "Les messages contenant des liens suspects seront automatiquement supprimés.\n" +
            "**Types détectés :** phishing Discord, IP directes, TLDs suspects, raccourcisseurs d'URL"
       )
        .setFooter(FOOTER);
      await interaction.editReply({ embeds: [embed] });
      logger.info("✅ [Anti-Phishing] Système configuré avec succès.");
    } else if (action === "off") {
      logger.info("⚙️ [Anti-Phishing] Mise à jour de la configuration en cours...");
      await prisma.guildConfig.upsert({ where: { guildId }, create: { guildId, antiPhishing: false }, update: { antiPhishing: false } });
      antiPhishingCache.set(guildId, { active: false, cachedAt: Date.now() });
      const embed = new EmbedBuilder()
        .setTitle("✅ Anti-Phishing Désactivé")
        .setColor(0x53fc18)
        .setDescription(
          "Les liens suspects ne seront plus filtrés automatiquement."
       )
        .setFooter(FOOTER);
      await interaction.editReply({ embeds: [embed] });
      logger.info("✅ [Anti-Phishing] Système configuré avec succès.");
    } else if (action === "status") {
      const active = await isAntiPhishingActive(guildId);
      const embed = new EmbedBuilder()
        .setTitle("🛡️ Statut Anti-Phishing")
        .setColor(active ? 0xff3344 : 0x666666)
        .setDescription(active ? "**ACTIF**" : "**INACTIF**")
        .setFooter(FOOTER);
      await interaction.editReply({ embeds: [embed] });
    }
  } catch (error) {
    logger.error("[CRASH CRITIQUE ANTIPHISHING]:", error);
    await interaction.editReply({ content: "❌ Impossible d'exécuter la commande anti-phishing. Une erreur a été logguée dans la console." }).catch(() => {});
  }
}
// ===== Fonctions anti-phishing =====

const SUSPICIOUS_TLDS = [
  ".tk",
  ".ml",
  ".ga",
  ".cf",
  ".gq",
  ".xyz",
  ".top",
  ".club",
  ".work",
  ".date",
  ".gdn",
  ".men",
  ".loan",
  ".click",
];

const SUSPICIOUS_PATTERNS = [
  "discord-nitro",
  "discord-gift",
  "steam-community",
  "steam-gift",
  "free-nitro",
  "claim-nitro",
  "discord.com-gift",
  "discord.com-nitro",
  "steamcommunity.com-gift",
  "dlscord",
  "discrod",
  "disord",
  "steamcommunitty",
  "steamcomunity",
];

const URL_SHORTENERS = [
  "bit.ly",
  "tinyurl.com",
  "shorturl.at",
  "rb.gy",
  "cutt.ly",
  "is.gd",
  "ow.ly",
  "buff.ly",
  "t.co",
  "shrtco.de",
];
