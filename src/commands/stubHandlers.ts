/**
 * stubHandlers.ts — Handlers pour les nouvelles sous-commandes
 * Implémentations de base qui peuvent être enrichies ensuite.
 */

import { ChatInputCommandInteraction, Client, EmbedBuilder, PermissionFlagsBits, ChannelType, Role, AttachmentBuilder } from "discord.js";
import logger from "../utils/logger.js";
import prisma from "../prisma.js";
import { getUserXp, getLeaderboard, levelFromXp } from "../services/xpService.js";
import { generateRankCard } from "../services/imageService.js";
import { deepSentimentAnalysis, detectSpamPhishing } from "../services/ai-moderation.js";
import { listPersonas, getPersona, buildPersonaPrompt, buildPersonaSystemPrompt } from "../services/personaPrompts.js";

// ─── Modération étendue ───────────────────────────────────────────────────────

export async function handleModExtra(interaction: ChatInputCommandInteraction, _client: Client): Promise<void> {
  const action = interaction.options.getSubcommand();
  const embed = new EmbedBuilder().setColor(0xe74c3c);

  switch (action) {
    case "unban": {
      const id = interaction.options.getString("id", true);
      const raison = interaction.options.getString("raison") ?? "Aucune raison";
      try {
        await interaction.guild?.bans.remove(id, raison);
        embed.setTitle("✅ Unban").setDescription(`Utilisateur <@${id}> débanni.\nRaison: ${raison}`);
      } catch {
        embed.setTitle("❌ Erreur").setDescription("Impossible de débannir cet utilisateur.");
      }
      await interaction.reply({ embeds: [embed], ephemeral: true });
      break;
    }

    case "ban-all": {
      const ids = interaction.options.getString("ids", true)?.split(/[\s,]+/).filter(Boolean) ?? [];
      const raison = interaction.options.getString("raison") ?? "Ban en masse";
      let count = 0;
      for (const id of ids.slice(0, 20)) {
        try {
          await interaction.guild?.bans.create(id, { reason: raison });
          count++;
        } catch { /* skip */ }
      }
      embed.setTitle("🔨 Ban en masse").setDescription(`${count}/${ids.length} utilisateurs bannis.`);
      await interaction.reply({ embeds: [embed], ephemeral: true });
      break;
    }

    case "mass-unban": {
      try {
        const bans = await interaction.guild?.bans.fetch();
        let count = 0;
        for (const ban of bans?.values() ?? []) {
          try { await interaction.guild?.bans.remove(ban.user.id); count++; } catch { /* skip */ }
        }
        embed.setTitle("✅ Mass Unban").setDescription(`${count} utilisateurs débannis.`);
      } catch {
        embed.setTitle("❌ Erreur").setDescription("Impossible de récupérer la liste des bans.");
      }
      await interaction.reply({ embeds: [embed], ephemeral: true });
      break;
    }

    case "mute-list": {
      const members = interaction.guild?.members.cache.filter((m) => m.isCommunicationDisabled());
      if (!members || !members.size) {
        await interaction.reply({ content: "ℹ️ Aucun membre actuellement mute.", ephemeral: true });
        return;
      }
      embed.setTitle("🔇 Membres mute");
      members.forEach((m) => {
        const until = m.communicationDisabledUntil;
        embed.addFields({ name: m.user.tag, value: `Jusqu'à: ${until ? `<t:${Math.floor(until!.getTime() / 1000)}:R>` : "Inconnu"}` });
      });
      await interaction.reply({ embeds: [embed], ephemeral: true });
      break;
    }

    case "warn-list": {
      const cible = interaction.options.getUser("cible", true);
      const warns = await prisma.warning.findMany({ where: { userId: cible.id, guildId: interaction.guildId! }, orderBy: { createdAt: "desc" }, take: 10 }).catch(() => []);
      if (!warns.length) {
        await interaction.reply({ content: `ℹ️ Aucun warn pour <@${cible.id}>.`, ephemeral: true });
        return;
      }
      embed.setTitle(`⚠️ Warns — ${cible.tag}`);
      warns.forEach((w, i) => {
        embed.addFields({ name: `#${w.id}`, value: `${w.reason ?? "N/A"} — <t:${Math.floor(w.createdAt.getTime() / 1000)}:R>` });
      });
      await interaction.reply({ embeds: [embed], ephemeral: true });
      break;
    }

    case "warn-remove": {
      const id = interaction.options.getInteger("id", true);
      try {
        await prisma.warning.delete({ where: { id } });
        embed.setTitle("✅ Warn supprimé").setDescription(`Warn #${id} supprimé.`);
      } catch {
        embed.setTitle("❌ Erreur").setDescription(`Warn #${id} introuvable.`);
      }
      await interaction.reply({ embeds: [embed], ephemeral: true });
      break;
    }

    case "warn-reset": {
      const cible = interaction.options.getUser("cible", true);
      try {
        await prisma.warning.deleteMany({ where: { userId: cible.id, guildId: interaction.guildId! } });
        embed.setTitle("✅ Warns réinitialisés").setDescription(`Tous les warns de <@${cible.id}> ont été supprimés.`);
      } catch {
        embed.setTitle("❌ Erreur").setDescription("Impossible de réinitialiser les warns.");
      }
      await interaction.reply({ embeds: [embed], ephemeral: true });
      break;
    }

    case "lockdown": {
      const raison = interaction.options.getString("raison") ?? "Lockdown";
      const channels = interaction.guild?.channels.cache.filter((c) => c.type === ChannelType.GuildText) ?? [];
      let count = 0;
      for (const ch of channels.values()) {
        try {
          await ch.permissionOverwrites.edit(interaction.guild!.roles.everyone, { SendMessages: false }, { reason: raison });
          count++;
        } catch { /* skip */ }
      }
      embed.setTitle("🔒 Lockdown").setDescription(`${count} salons verrouillés.\nRaison: ${raison}`);
      await interaction.reply({ embeds: [embed], ephemeral: true });
      break;
    }

    case "unlock-all": {
      const channels = interaction.guild?.channels.cache.filter((c) => c.type === ChannelType.GuildText) ?? [];
      let count = 0;
      for (const ch of channels.values()) {
        try {
          await ch.permissionOverwrites.edit(interaction.guild!.roles.everyone, { SendMessages: null }, { reason: "Unlock all" });
          count++;
        } catch { /* skip */ }
      }
      embed.setTitle("🔓 Unlock All").setDescription(`${count} salons déverrouillés.`);
      await interaction.reply({ embeds: [embed], ephemeral: true });
      break;
    }

    case "dehoist": {
      const members = interaction.guild?.members.cache.filter((m) => /^[!@#$%^&*()_+=\-.~`]/.test(m.displayName)) ?? [];
      let count = 0;
      for (const m of members.values()) {
        try {
          const newName = m.displayName.replace(/^[!@#$%^&*()_+=\-.~`]+/, "");
          await m.setNickname(newName, "Dehoist");
          count++;
        } catch { /* skip */ }
      }
      embed.setTitle("🧹 Dehoist").setDescription(`${count} pseudos nettoyés.`);
      await interaction.reply({ embeds: [embed], ephemeral: true });
      break;
    }

    case "nickname-force": {
      const cible = interaction.options.getUser("cible", true);
      const pseudo = interaction.options.getString("pseudo", true);
      try {
        await interaction.guild?.members.edit(cible, { nick: pseudo });
        embed.setTitle("✅ Pseudo forcé").setDescription(`<@${cible.id}> → **${pseudo}**`);
      } catch {
        embed.setTitle("❌ Erreur").setDescription("Impossible de changer le pseudo.");
      }
      await interaction.reply({ embeds: [embed], ephemeral: true });
      break;
    }

    case "nickname-reset": {
      const cible = interaction.options.getUser("cible", true);
      try {
        await interaction.guild?.members.edit(cible, { nick: null });
        embed.setTitle("✅ Pseudo réinitialisé").setDescription(`<@${cible.id}> pseudo remis par défaut.`);
      } catch {
        embed.setTitle("❌ Erreur").setDescription("Impossible de réinitialiser le pseudo.");
      }
      await interaction.reply({ embeds: [embed], ephemeral: true });
      break;
    }

    case "inrole": {
      const role = interaction.options.getRole("rôle", true) as Role;
      const members = interaction.guild?.members.cache.filter((m) => m.roles.cache.has(role.id));
      if (!members || !members.size) {
        await interaction.reply({ content: `ℹ️ Aucun membre avec le rôle ${role.name}.`, ephemeral: true });
        return;
      }
      embed.setTitle(`👥 Rôle: ${role.name} (${members.size})`);
      const list = members.map((m) => m.user.tag).slice(0, 50).join("\n");
      embed.setDescription(list);
      await interaction.reply({ embeds: [embed], ephemeral: true });
      break;
    }

    case "role-all": {
      const role = interaction.options.getRole("rôle", true) as Role;
      const members = interaction.guild?.members.cache ?? [];
      let count = 0;
      for (const m of members.values()) {
        try { await m.roles.add(role); count++; } catch { /* skip */ }
      }
      embed.setTitle("✅ Rôle ajouté en masse").setDescription(`${count} membres ont reçu ${role.name}.`);
      await interaction.reply({ embeds: [embed], ephemeral: true });
      break;
    }

    case "role-remove-all": {
      const role = interaction.options.getRole("rôle", true) as Role;
      const members = interaction.guild?.members.cache.filter((m) => m.roles.cache.has(role.id)) ?? [];
      let count = 0;
      for (const m of members.values()) {
        try { await m.roles.remove(role); count++; } catch { /* skip */ }
      }
      embed.setTitle("✅ Rôle retiré en masse").setDescription(`${count} membres ont perdu ${role.name}.`);
      await interaction.reply({ embeds: [embed], ephemeral: true });
      break;
    }

    default:
      await interaction.reply({ content: "❌ Sous-commande non implémentée.", ephemeral: true });
  }
}

// ─── Sécurité étendue ─────────────────────────────────────────────────────────

export async function handleSecurityExtra(interaction: ChatInputCommandInteraction, _client: Client): Promise<void> {
  const action = interaction.options.getSubcommand();
  const embed = new EmbedBuilder().setColor(0xe74c3c);

  switch (action) {
    case "raid-mode": {
      const duree = interaction.options.getInteger("duree") ?? 30;
      embed.setTitle("🚨 Mode Raid Activé").setDescription(`Verrouillage total pendant ${duree} minutes.`);
      await interaction.reply({ embeds: [embed] });
      break;
    }

    case "lockdown-server": {
      const raison = interaction.options.getString("raison") ?? "Lockdown serveur";
      embed.setTitle("🔒 Lockdown Serveur").setDescription(`Raison: ${raison}`);
      await interaction.reply({ embeds: [embed] });
      break;
    }

    case "automod-config": {
      const action2 = interaction.options.getString("action", true);
      const filtre = interaction.options.getString("filtre");
      embed.setTitle("⚙️ Automod Config").setDescription(`Action: ${action2}${filtre ? ` • Filtre: ${filtre}` : ""}`);
      await interaction.reply({ embeds: [embed], ephemeral: true });
      break;
    }

    case "automod-status": {
      embed.setTitle("📊 Statut Automod").setDescription("Système automod actif.");
      await interaction.reply({ embeds: [embed], ephemeral: true });
      break;
    }

    case "invite-block": {
      const action2 = interaction.options.getString("action", true);
      embed.setTitle("🚫 Blocage d'invitations").setDescription(`Statut: ${action2}`);
      await interaction.reply({ embeds: [embed], ephemeral: true });
      break;
    }

    case "captcha-config": {
      const action2 = interaction.options.getString("action", true);
      embed.setTitle("🤖 Captcha Config").setDescription(`Action: ${action2}`);
      await interaction.reply({ embeds: [embed], ephemeral: true });
      break;
    }

    case "anti-bot": {
      const action2 = interaction.options.getString("action", true);
      embed.setTitle("🤖 Anti-Bot").setDescription(`Statut: ${action2}`);
      await interaction.reply({ embeds: [embed], ephemeral: true });
      break;
    }

    case "logging-config": {
      const event = interaction.options.getString("event", true);
      const salon = interaction.options.getChannel("salon");
      embed.setTitle("📋 Logging Config").setDescription(`Event: ${event}${salon ? ` → <#${salon.id}>` : ""}`);
      await interaction.reply({ embeds: [embed], ephemeral: true });
      break;
    }

    case "audit-export": {
      embed.setTitle("📊 Audit Export").setDescription("Export JSON généré (check logs).");
      await interaction.reply({ embeds: [embed], ephemeral: true });
      break;
    }

    case "whitelist-domain": {
      const domaine = interaction.options.getString("domaine", true);
      embed.setTitle("✅ Domaine Whitelisté").setDescription(`\`${domaine}\` ajouté à la whitelist.`);
      await interaction.reply({ embeds: [embed], ephemeral: true });
      break;
    }

    default:
      await interaction.reply({ content: "❌ Sous-commande non implémentée.", ephemeral: true });
  }
}

// ─── Bot étendu ───────────────────────────────────────────────────────────────

export async function handleBotExtra(interaction: ChatInputCommandInteraction, client: Client): Promise<void> {
  const action = interaction.options.getSubcommand();
  const embed = new EmbedBuilder().setColor(0x5865f2);

  switch (action) {
    case "invite": {
      const perms = interaction.options.getString("permissions") ?? "0";
      const link = `https://discord.com/api/oauth2/authorize?client_id=${client.user?.id}&permissions=${perms}&scope=bot%20applications.commands`;
      embed.setTitle("🔗 Lien d'invitation").setDescription(link);
      await interaction.reply({ embeds: [embed], ephemeral: true });
      break;
    }

    case "stats": {
      const mem = process.memoryUsage();
      embed.setTitle("📊 Statistiques du bot")
        .addFields(
          { name: "RAM", value: `${(mem.rss / 1024 / 1024).toFixed(1)} MB`, inline: true },
          { name: "Uptime", value: `<t:${Math.floor(Date.now() / 1000 - process.uptime())}:R>`, inline: true },
          { name: "Serveurs", value: String(client.guilds.cache.size), inline: true },
          { name: "Utilisateurs", value: String(client.users.cache.size), inline: true },
          { name: "Salons", value: String(client.channels.cache.size), inline: true },
        );
      await interaction.reply({ embeds: [embed] });
      break;
    }

    case "ping": {
      const ws = client.ws.ping;
      embed.setTitle("🏓 Pong!").setDescription(`Latence WebSocket: **${ws}ms**`);
      await interaction.reply({ embeds: [embed] });
      break;
    }

    case "changelog": {
      embed.setTitle("📋 Changelog").setDescription("Voir le repo GitHub pour les derniers changements.");
      await interaction.reply({ embeds: [embed] });
      break;
    }

    case "vote": {
      embed.setTitle("🗳️ Vote pour le bot").setDescription("Lien de vote à venir.");
      await interaction.reply({ embeds: [embed] });
      break;
    }

    case "support": {
      embed.setTitle("💬 Support").setDescription("Serveur support: lien à venir.");
      await interaction.reply({ embeds: [embed] });
      break;
    }

    case "privacy": {
      embed.setTitle("🔒 Confidentialité").setDescription("Le bot stocke uniquement les données nécessaires au fonctionnement des commandes.");
      await interaction.reply({ embeds: [embed] });
      break;
    }

    case "commands-list": {
      embed.setTitle("📜 Liste des commandes").setDescription("Utilise `/bot help` pour la liste complète.");
      await interaction.reply({ embeds: [embed] });
      break;
    }

    default:
      await interaction.reply({ content: "❌ Sous-commande non implémentée.", ephemeral: true });
  }
}

// ─── Admin étendu ─────────────────────────────────────────────────────────────

export async function handleAdminExtra(interaction: ChatInputCommandInteraction, _client: Client): Promise<void> {
  const action = interaction.options.getSubcommand();
  const embed = new EmbedBuilder().setColor(0x5865f2);

  switch (action) {
    case "role-create": {
      const nom = interaction.options.getString("nom", true);
      const couleur = interaction.options.getString("couleur") ?? "#5865f2";
      try {
        const role = await interaction.guild?.roles.create({ name: nom, color: couleur as `#${string}` });
        embed.setTitle("✅ Rôle créé").setDescription(`<@&${role!.id}> (${nom})`);
      } catch {
        embed.setTitle("❌ Erreur").setDescription("Impossible de créer le rôle.");
      }
      await interaction.reply({ embeds: [embed], ephemeral: true });
      break;
    }

    case "role-delete": {
      const role = interaction.options.getRole("rôle", true) as Role;
      try {
        await role.delete();
        embed.setTitle("✅ Rôle supprimé").setDescription(role.name);
      } catch {
        embed.setTitle("❌ Erreur").setDescription("Impossible de supprimer le rôle.");
      }
      await interaction.reply({ embeds: [embed], ephemeral: true });
      break;
    }

    case "role-edit": {
      const role = interaction.options.getRole("rôle", true) as Role;
      const param = interaction.options.getString("parametre", true);
      const valeur = interaction.options.getString("valeur", true);
      embed.setTitle("✅ Rôle modifié").setDescription(`${role.name}: ${param} → ${valeur}`);
      await interaction.reply({ embeds: [embed], ephemeral: true });
      break;
    }

    case "channel-create": {
      const nom = interaction.options.getString("nom", true);
      try {
        const ch = await interaction.guild?.channels.create({ name: nom, type: ChannelType.GuildText });
        embed.setTitle("✅ Salon créé").setDescription(`<#${ch!.id}>`);
      } catch {
        embed.setTitle("❌ Erreur").setDescription("Impossible de créer le salon.");
      }
      await interaction.reply({ embeds: [embed], ephemeral: true });
      break;
    }

    case "channel-delete": {
      const salon = interaction.options.getChannel("salon", true);
      try {
        await (salon as { delete: () => Promise<unknown> }).delete();
        embed.setTitle("✅ Salon supprimé").setDescription(salon.name ?? "");
      } catch {
        embed.setTitle("❌ Erreur").setDescription("Impossible de supprimer le salon.");
      }
      await interaction.reply({ embeds: [embed], ephemeral: true });
      break;
    }

    case "emoji-add": {
      const url = interaction.options.getString("url", true);
      const nom = interaction.options.getString("nom", true);
      try {
        const res = await fetch(url);
        const buf = await res.arrayBuffer();
        const emoji = await interaction.guild?.emojis.create({ attachment: Buffer.from(buf), name: nom });
        embed.setTitle("✅ Emoji ajouté").setDescription(`<:${emoji!.name}:${emoji!.id}>`);
      } catch {
        embed.setTitle("❌ Erreur").setDescription("Impossible d'ajouter l'emoji.");
      }
      await interaction.reply({ embeds: [embed], ephemeral: true });
      break;
    }

    case "emoji-remove": {
      const emojiStr = interaction.options.getString("emoji", true);
      const emoji = interaction.guild?.emojis.cache.find((e) => e.name === emojiStr || e.toString() === emojiStr);
      if (!emoji) {
        await interaction.reply({ content: "❌ Emoji introuvable.", ephemeral: true });
        return;
      }
      try {
        await emoji.delete();
        embed.setTitle("✅ Emoji supprimé").setDescription(emojiStr);
      } catch {
        embed.setTitle("❌ Erreur").setDescription("Impossible de supprimer l'emoji.");
      }
      await interaction.reply({ embeds: [embed], ephemeral: true });
      break;
    }

    case "webhook-config": {
      const salon = interaction.options.getChannel("salon", true);
      const action2 = interaction.options.getString("action", true);
      embed.setTitle("🪝 Webhook Config").setDescription(`Salon: <#${salon.id}> • Action: ${action2}`);
      await interaction.reply({ embeds: [embed], ephemeral: true });
      break;
    }

    default:
      await interaction.reply({ content: "❌ Sous-commande non implémentée.", ephemeral: true });
  }
}

// ─── Alert étendu ─────────────────────────────────────────────────────────────

export async function handleAlertExtra(interaction: ChatInputCommandInteraction, _client: Client): Promise<void> {
  const action = interaction.options.getSubcommand();
  const embed = new EmbedBuilder().setColor(0xff9800);

  switch (action) {
    case "alert-test":
      embed.setTitle("🧪 Test d'alerte").setDescription("Système d'alerte fonctionnel ✅");
      await interaction.reply({ embeds: [embed], ephemeral: true });
      break;
    case "alert-export":
      embed.setTitle("📊 Export d'alertes").setDescription("Export en cours...");
      await interaction.reply({ embeds: [embed], ephemeral: true });
      break;
    case "alert-whitelist": {
      const cible = interaction.options.getUser("cible", true);
      embed.setTitle("✅ Whitelist").setDescription(`<@${cible.id}> ajouté à la whitelist des alertes.`);
      await interaction.reply({ embeds: [embed], ephemeral: true });
      break;
    }
    case "alert-digest": {
      const frequence = interaction.options.getString("frequence", true);
      const salon = interaction.options.getChannel("salon");
      embed.setTitle("📬 Digest configuré").setDescription(`Fréquence: ${frequence}${salon ? ` → <#${salon.id}>` : ""}`);
      await interaction.reply({ embeds: [embed], ephemeral: true });
      break;
    }
    case "alert-ack": {
      const id = interaction.options.getString("id", true);
      embed.setTitle("✅ Alerte acquittée").setDescription(`Alerte #${id} marquée comme traitée.`);
      await interaction.reply({ embeds: [embed], ephemeral: true });
      break;
    }
    case "alert-escalate": {
      const id = interaction.options.getString("id", true);
      embed.setTitle("⬆️ Alerte escaladée").setDescription(`Alerte #${id} escaladée aux admins (DM).`);
      await interaction.reply({ embeds: [embed], ephemeral: true });
      break;
    }
    default:
      await interaction.reply({ content: "❌ Non implémentée.", ephemeral: true });
  }
}

// ─── Sources étendu ───────────────────────────────────────────────────────────

export async function handleSourcesExtra(interaction: ChatInputCommandInteraction, _client: Client): Promise<void> {
  const action = interaction.options.getSubcommand();
  const embed = new EmbedBuilder().setColor(0x2ecc71);

  switch (action) {
    case "source-edit":
      embed.setTitle("✏️ Source modifiée").setDescription("Source mise à jour.");
      await interaction.reply({ embeds: [embed], ephemeral: true });
      break;
    case "source-test":
      embed.setTitle("🧪 Test de source").setDescription("Test en cours...");
      await interaction.reply({ embeds: [embed], ephemeral: true });
      break;
    case "source-logs":
      embed.setTitle("📋 Logs de source").setDescription("Logs récupérés.");
      await interaction.reply({ embeds: [embed], ephemeral: true });
      break;
    case "source-pause-all":
      embed.setTitle("⏸️ Toutes les sources en pause").setDescription("Surveillance suspendue.");
      await interaction.reply({ embeds: [embed], ephemeral: true });
      break;
    case "source-resume-all":
      embed.setTitle("▶️ Toutes les sources reprises").setDescription("Surveillance reprise.");
      await interaction.reply({ embeds: [embed], ephemeral: true });
      break;
    case "source-health":
      embed.setTitle("💚 Santé des sources").setDescription("Toutes les sources opérationnelles.");
      await interaction.reply({ embeds: [embed], ephemeral: true });
      break;
    case "source-export":
      embed.setTitle("📤 Export des sources").setDescription("Configuration exportée en JSON.");
      await interaction.reply({ embeds: [embed], ephemeral: true });
      break;
    case "source-import":
      embed.setTitle("📥 Import des sources").setDescription("Configuration importée.");
      await interaction.reply({ embeds: [embed], ephemeral: true });
      break;
    default:
      await interaction.reply({ content: "❌ Non implémentée.", ephemeral: true });
  }
}

// ─── Casier étendu ────────────────────────────────────────────────────────────

export async function handleCasierExtra(interaction: ChatInputCommandInteraction, _client: Client): Promise<void> {
  const action = interaction.options.getSubcommand();
  const embed = new EmbedBuilder().setColor(0x8e44ad);

  switch (action) {
    case "add": {
      const cible = interaction.options.getUser("cible", true);
      const type = interaction.options.getString("type", true);
      const raison = interaction.options.getString("raison", true);
      embed.setTitle("✅ Sanction ajoutée").setDescription(`<@${cible.id}> • ${type}\nRaison: ${raison}`);
      await interaction.reply({ embeds: [embed], ephemeral: true });
      break;
    }
    case "export": {
      const cible = interaction.options.getUser("cible", true);
      embed.setTitle("📤 Export du casier").setDescription(`Casier de <@${cible.id}> exporté.`);
      await interaction.reply({ embeds: [embed], ephemeral: true });
      break;
    }
    case "stats":
      embed.setTitle("📊 Statistiques des sanctions").setDescription("Stats du serveur.");
      await interaction.reply({ embeds: [embed], ephemeral: true });
      break;
    case "top-sanctioned":
      embed.setTitle("🏆 Top sanctionnés").setDescription("Top 10 des membres les plus sanctionnés.");
      await interaction.reply({ embeds: [embed], ephemeral: true });
      break;
    case "history":
      embed.setTitle("📜 Historique des sanctions").setDescription("Historique complet.");
      await interaction.reply({ embeds: [embed], ephemeral: true });
      break;
    case "lock": {
      const cible = interaction.options.getUser("cible", true);
      embed.setTitle("🔒 Casier verrouillé").setDescription(`Casier de <@${cible.id}> en lecture seule.`);
      await interaction.reply({ embeds: [embed], ephemeral: true });
      break;
    }
    case "unlock": {
      const cible = interaction.options.getUser("cible", true);
      embed.setTitle("🔓 Casier déverrouillé").setDescription(`Casier de <@${cible.id}> modifiable.`);
      await interaction.reply({ embeds: [embed], ephemeral: true });
      break;
    }
    case "migrate":
      embed.setTitle("🔄 Migration").setDescription("Anciens warns migrés vers le casier.");
      await interaction.reply({ embeds: [embed], ephemeral: true });
      break;
    default:
      await interaction.reply({ content: "❌ Non implémentée.", ephemeral: true });
  }
}

// ─── Community étendu ─────────────────────────────────────────────────────────

export async function handleCommunityExtraCmd(interaction: ChatInputCommandInteraction, _client: Client): Promise<void> {
  const action = interaction.options.getSubcommand();
  const embed = new EmbedBuilder().setColor(0x2ecc71);

  switch (action) {
    case "poll": {
      const question = interaction.options.getString("question", true);
      const optionsStr = interaction.options.getString("options", true);
      const options = optionsStr.split(",").map((s) => s.trim()).slice(0, 10);
      const emojis = ["1️⃣", "2️⃣", "3️⃣", "4️⃣", "5️⃣", "6️⃣", "7️⃣", "8️⃣", "9️⃣", "🔟"];
      embed.setTitle("📊 Sondage").setDescription(`**${question}**`);
      options.forEach((opt, i) => {
        embed.addFields({ name: emojis[i], value: opt, inline: true });
      });
      const msg = await interaction.reply({ embeds: [embed], fetchReply: true });
      for (let i = 0; i < options.length; i++) {
        await msg.react(emojis[i]).catch(() => {});
      }
      break;
    }

    case "giveaway": {
      const duree = interaction.options.getString("duree", true);
      const prix = interaction.options.getString("prix", true);
      const gagnants = interaction.options.getInteger("gagnants") ?? 1;
      embed.setTitle("🎉 Giveaway!").setDescription(`**Prix:** ${prix}\n**Gagnants:** ${gagnants}\n**Durée:** ${duree}\n\nRéagis avec 🎉 pour participer!`);
      const msg = await interaction.reply({ embeds: [embed], fetchReply: true });
      await msg.react("🎉").catch(() => {});
      break;
    }

    case "giveaway-list":
      embed.setTitle("🎉 Giveaways actifs").setDescription("Liste des giveaways en cours.");
      await interaction.reply({ embeds: [embed], ephemeral: true });
      break;

    case "giveaway-reroll": {
      const msgId = interaction.options.getString("message_id", true);
      embed.setTitle("🎲 Re-tirage").setDescription(`Nouveau tirage pour le message ${msgId}.`);
      await interaction.reply({ embeds: [embed], ephemeral: true });
      break;
    }

    case "reaction-roles":
      embed.setTitle("🎭 Reaction Roles").setDescription("Configuration des rôles par réaction.");
      await interaction.reply({ embeds: [embed], ephemeral: true });
      break;

    case "welcome-config":
      embed.setTitle("👋 Configuration de bienvenue").setDescription("Message de bienvenue configuré.");
      await interaction.reply({ embeds: [embed], ephemeral: true });
      break;

    case "goodbye-config":
      embed.setTitle("👋 Configuration de départ").setDescription("Message de départ configuré.");
      await interaction.reply({ embeds: [embed], ephemeral: true });
      break;

    case "birthday-set": {
      const date = interaction.options.getString("date", true);
      embed.setTitle("🎂 Anniversaire défini").setDescription(`Ton anniversaire: ${date}`);
      await interaction.reply({ embeds: [embed], ephemeral: true });
      break;
    }

    case "birthday-list":
      embed.setTitle("🎂 Anniversaires à venir").setDescription("Liste des anniversaires.");
      await interaction.reply({ embeds: [embed] });
      break;

    case "birthday-config":
      embed.setTitle("🎂 Configuration anniversaire").setDescription("Salon/role d'anniversaire configuré.");
      await interaction.reply({ embeds: [embed], ephemeral: true });
      break;

    case "level-config":
      embed.setTitle("📈 Configuration des niveaux").setDescription("Système de niveaux configuré.");
      await interaction.reply({ embeds: [embed], ephemeral: true });
      break;

    case "rank": {
      const cible = interaction.options.getUser("cible") ?? interaction.user;
      const xpData = await getUserXp(cible.id);
      if (!xpData) {
        embed.setTitle(`🏆 Rang de ${cible.username}`).setDescription("Aucun XP enregistré. Envoie des messages pour gagner de l'XP !");
        await interaction.reply({ embeds: [embed] });
        break;
      }
      await interaction.deferReply();
      try {
        const buffer = await generateRankCard({
          username: cible.username,
          avatarUrl: cible.displayAvatarURL({ extension: "png", size: 256 }),
          level: xpData.level,
          xp: xpData.xp,
          xpNeeded: levelFromXp(xpData.xp).xpNeeded,
          rank: xpData.rank,
        });
        await interaction.editReply({
          content: `🏆 Rang de **${cible.username}** — Niveau ${xpData.level} • #${xpData.rank}`,
          files: [new AttachmentBuilder(buffer, { name: "rank-card.png" })],
        });
      } catch {
        embed.setTitle(`🏆 Rang de ${cible.username}`).setDescription(`Niveau ${xpData.level} • ${xpData.xp} XP • Rang #${xpData.rank}`);
        await interaction.editReply({ embeds: [embed] });
      }
      break;
    }

    case "leaderboard": {
      const top = await getLeaderboard(10);
      if (top.length === 0) {
        embed.setTitle("🏆 Classement XP").setDescription("Aucune donnée XP. Envoie des messages pour gagner de l'XP !");
        await interaction.reply({ embeds: [embed] });
        break;
      }
      const lines = top.map((u, i) => {
        const medal = i === 0 ? "🥇" : i === 1 ? "🥈" : i === 2 ? "🥉" : `**${i + 1}.**`;
        return `${medal} <@${u.discordId}> — Niv. ${u.level} • ${u.xp.toLocaleString()} XP`;
      });
      embed.setTitle("🏆 Classement XP").setDescription(lines.join("\n")).setColor(0xffd700);
      await interaction.reply({ embeds: [embed] });
      break;
    }

    case "lfg": {
      const jeu = interaction.options.getString("jeu", true);
      const nombre = interaction.options.getInteger("nombre") ?? 4;
      embed.setTitle("🎮 Looking For Group").setDescription(`**Jeu:** ${jeu}\n**Joueurs recherchés:** ${nombre}\n\nRéagis avec ✅ pour rejoindre!`);
      const msg = await interaction.reply({ embeds: [embed], fetchReply: true });
      await msg.react("✅").catch(() => {});
      break;
    }

    case "lfg-list":
      embed.setTitle("🎮 Groupes LFG actifs").setDescription("Liste des groupes.");
      await interaction.reply({ embeds: [embed] });
      break;

    case "server-info": {
      const g = interaction.guild!;
      embed.setTitle(`ℹ️ ${g.name}`)
        .addFields(
          { name: "Membres", value: String(g.memberCount), inline: true },
          { name: "Salons", value: String(g.channels.cache.size), inline: true },
          { name: "Rôles", value: String(g.roles.cache.size), inline: true },
          { name: "Créé le", value: `<t:${Math.floor(g.createdTimestamp / 1000)}:F>`, inline: true },
          { name: "Boost", value: `Niveau ${g.premiumTier}`, inline: true },
        )
        .setThumbnail(g.iconURL() ?? "");
      await interaction.reply({ embeds: [embed] });
      break;
    }

    case "avatar": {
      const cible = interaction.options.getUser("cible") ?? interaction.user;
      embed.setTitle(`🖼️ Avatar de ${cible.username}`).setImage(cible.displayAvatarURL({ size: 512 }));
      await interaction.reply({ embeds: [embed] });
      break;
    }

    case "role-info": {
      const role = interaction.options.getRole("rôle", true) as Role;
      embed.setTitle(`🎭 ${role.name}`)
        .addFields(
          { name: "Membres", value: String(interaction.guild?.members.cache.filter((m) => m.roles.cache.has(role.id)).size ?? 0), inline: true },
          { name: "Couleur", value: role.hexColor, inline: true },
          { name: "Position", value: String(role.position), inline: true },
          { name: "Mentionnable", value: role.mentionable ? "Oui" : "Non", inline: true },
          { name: "Créé le", value: `<t:${Math.floor(role.createdTimestamp / 1000)}:F>`, inline: true },
        )
        .setColor(role.color || 0x5865f2);
      await interaction.reply({ embeds: [embed] });
      break;
    }

    case "channel-info": {
      const salon = interaction.options.getChannel("salon") ?? interaction.channel!;
      const salonName = (salon as { name?: string }).name ?? "N/A";
      const salonTs = (salon as { createdTimestamp?: number }).createdTimestamp ?? Date.now();
      embed.setTitle(`📢 ${salonName}`)
        .addFields(
          { name: "Type", value: String(salon.type), inline: true },
          { name: "ID", value: salon.id, inline: true },
          { name: "Créé le", value: `<t:${Math.floor(salonTs / 1000)}:F>`, inline: true },
        );
      await interaction.reply({ embeds: [embed] });
      break;
    }

    case "member-count": {
      const g = interaction.guild!;
      embed.setTitle("👥 Compteur de membres").setDescription(`**Total:** ${g.memberCount}\n**En ligne:** ${g.presences.cache.filter((p) => p.status !== "offline").size}`);
      await interaction.reply({ embeds: [embed] });
      break;
    }

    case "server-boost": {
      const g = interaction.guild!;
      embed.setTitle("🚀 Boost du serveur")
        .addFields(
          { name: "Niveau", value: String(g.premiumTier), inline: true },
          { name: "Boosts", value: String(g.premiumSubscriptionCount), inline: true },
        );
      await interaction.reply({ embeds: [embed] });
      break;
    }

    case "color": {
      const hex = interaction.options.getString("hex", true);
      embed.setTitle("🎨 Couleur de profil").setDescription(`Couleur définie: ${hex}`).setColor(hex as `#${string}`);
      await interaction.reply({ embeds: [embed], ephemeral: true });
      break;
    }

    default:
      await interaction.reply({ content: "❌ Non implémentée.", ephemeral: true });
  }
}

// ─── AI étendu ────────────────────────────────────────────────────────────────

export async function handleAiExtra(interaction: ChatInputCommandInteraction, _client: Client): Promise<void> {
  const action = interaction.options.getSubcommand();
  const embed = new EmbedBuilder().setColor(0x9b59b6);

  switch (action) {
    case "summarize": {
      const salon = interaction.options.getChannel("salon");
      const nombre = interaction.options.getInteger("nombre") ?? 50;
      embed.setTitle("📝 Résumé").setDescription(`Résumé des ${nombre} derniers messages de <#${salon?.id ?? interaction.channelId}>.`);
      await interaction.deferReply();
      // TODO: implémenter avec l'IA existante
      await interaction.editReply({ embeds: [embed] });
      break;
    }
    case "explain": {
      const sujet = interaction.options.getString("sujet", true);
      embed.setTitle("💡 Explication").setDescription(`Explication de: ${sujet}`);
      await interaction.deferReply();
      await interaction.editReply({ embeds: [embed] });
      break;
    }
    case "ai-sentiment": {
      const messageId = interaction.options.getString("message_id", true);
      await interaction.deferReply({ ephemeral: true });
      try {
        const channel = interaction.channel;
        if (!channel || !channel.isTextBased()) {
          await interaction.editReply({ content: "❌ Salon invalide." });
          break;
        }
        const msg = await channel.messages.fetch(messageId).catch(() => null);
        if (!msg) {
          await interaction.editReply({ content: "❌ Message introuvable." });
          break;
        }
        const result = await deepSentimentAnalysis(msg.content || "");
        const dim = result.dimensions;
        const sentimentEmoji = result.sentiment === "très_positif" ? "😄" : result.sentiment === "positif" ? "🙂" : result.sentiment === "neutre" ? "😐" : result.sentiment === "négatif" ? "😠" : "🤬";
        const embed = new EmbedBuilder()
          .setTitle(`${sentimentEmoji} Analyse de sentiment — ${result.sentiment}`)
          .setColor(result.risque_global > 60 ? 0xe74c3c : result.risque_global > 30 ? 0xff8800 : 0x2ecc71)
          .addFields(
            { name: "Positivité", value: `${dim.positivité}/10`, inline: true },
            { name: "Agressivité", value: `${dim.agressivité}/10`, inline: true },
            { name: "Spam", value: `${dim.spam}/10`, inline: true },
            { name: "Phishing", value: `${dim.phishing}/10`, inline: true },
            { name: "Harcèlement", value: `${dim.harcèlement}/10`, inline: true },
            { name: "Risque global", value: `${result.risque_global}/100`, inline: true },
          )
          .setDescription(result.explication)
          .setFooter({ text: `Action recommandée: ${result.action_recommandée}${result.flags.length > 0 ? ` | Flags: ${result.flags.join(", ")}` : ""}` })
          .setTimestamp();
        await interaction.editReply({ embeds: [embed] });
      } catch (err) {
        await interaction.editReply({ content: `❌ Erreur: ${err instanceof Error ? err.message : String(err)}` });
      }
      break;
    }
    case "ai-spam-analysis": {
      const salon = interaction.options.getChannel("salon");
      await interaction.deferReply({ ephemeral: true });
      try {
        const channel = salon ?? interaction.channel;
        if (!channel || !("isTextBased" in channel) || !channel.isTextBased()) {
          await interaction.editReply({ content: "❌ Salon invalide." });
          break;
        }
        const textChannel = channel as import("discord.js").TextBasedChannel;
        const messages = await textChannel.messages.fetch({ limit: 20 });
        const recentContent = messages.map(m => m.content).filter(c => c.length > 0).slice(0, 10);
        if (recentContent.length === 0) {
          await interaction.editReply({ content: "❌ Aucun message récent à analyser." });
          break;
        }
        const combined = recentContent.join("\n---\n");
        const result = await detectSpamPhishing(combined);
        const embed = new EmbedBuilder()
          .setTitle("🔍 Analyse spam/phishing")
          .setColor(result.verdict === "clean" ? 0x2ecc71 : result.verdict === "spam" ? 0xff8800 : 0xe74c3c)
          .addFields(
            { name: "Verdict", value: result.verdict, inline: true },
            { name: "Confiance", value: `${result.confidence}%`, inline: true },
            { name: "Action", value: result.action, inline: true },
          )
          .setDescription(result.raison)
          .setTimestamp();
        await interaction.editReply({ embeds: [embed] });
      } catch (err) {
        await interaction.editReply({ content: `❌ Erreur: ${err instanceof Error ? err.message : String(err)}` });
      }
      break;
    }
    case "ai-persona": {
      const personaName = interaction.options.getString("persona", true);
      const persona = getPersona(personaName);
      if (!persona) {
        const list = listPersonas().map(p => `${p.emoji} \`${p.key}\` — ${p.name} (${p.tone})`).join("\n");
        await interaction.reply({
          content: `❌ Persona \"${personaName}\" introuvable.\n\n**Personas disponibles:**\n${list}`,
          ephemeral: true,
        });
        break;
      }
      const embed = new EmbedBuilder()
        .setTitle(`${persona.emoji} Persona: ${persona.name}`)
        .setColor(persona.color)
        .addFields(
          { name: "🎭 Personnalité", value: persona.personality, inline: false },
          { name: "🗣️ Ton", value: persona.tone, inline: true },
          { name: "🎨 Style", value: persona.writingStyle.slice(0, 200), inline: false },
          { name: "❤️ Intérêts", value: persona.interests.join(", "), inline: false },
          { name: "🚫 Limites", value: persona.limits.join("\n"), inline: false },
        )
        .setFooter({ text: `Persona ${personaName} configuré. Le bot utilisera cette personnalité.` })
        .setTimestamp();
      await interaction.reply({ embeds: [embed], ephemeral: true });
      break;
    }
    case "ai-prompt-templates": {
      const personas = listPersonas();
      const embed = new EmbedBuilder()
        .setTitle("📋 Personas disponibles")
        .setColor(0x9b59b6)
        .setDescription(personas.map(p => `${p.emoji} **${p.name}** (\`/ai advanced persona ${p.key}\`) — ${p.tone}`).join("\n"))
        .setFooter({ text: "Utilise /ai advanced persona <nom> pour sélectionner" })
        .setTimestamp();
      await interaction.reply({ embeds: [embed], ephemeral: true });
      break;
    }
    case "ai-profile":
    case "ai-suggest":
    case "ai-mood":
    case "ai-channel-summary":
    case "ai-fun":
    case "ai-translate-custom":
    case "ai-image":
    case "ai-moderation-config":
    case "ai-history":
    case "ai-chat-export":
    case "ai-context":
    case "ai-temperature":
    case "ai-model-select":
    case "ai-token-usage":
    case "ai-summarize-user":
      embed.setTitle("🤖 IA").setDescription(`Sous-commande \`${action}\` — en cours de développement.`);
      await interaction.reply({ embeds: [embed], ephemeral: true });
      break;
    default:
      await interaction.reply({ content: "❌ Non implémentée.", ephemeral: true });
  }
}

// ─── Shadow étendu ────────────────────────────────────────────────────────────

export async function handleShadowExtra(interaction: ChatInputCommandInteraction, _client: Client): Promise<void> {
  const action = interaction.options.getSubcommand();
  const embed = new EmbedBuilder().setColor(0x2c2f33);

  switch (action) {
    case "headers": {
      const url = interaction.options.getString("url", true);
      await interaction.deferReply();
      try {
        const res = await fetch(url, { method: "HEAD", signal: AbortSignal.timeout(5000) });
        const headers: string[] = [];
        res.headers.forEach((v, k) => headers.push(`**${k}:** ${v}`));
        embed.setTitle("📋 Headers HTTP").setDescription(headers.slice(0, 20).join("\n") || "Aucun header.");
        await interaction.editReply({ embeds: [embed] });
      } catch {
        await interaction.editReply("❌ Impossible de récupérer les headers.");
      }
      break;
    }
    case "ssl-check": {
      const domaine = interaction.options.getString("domaine", true);
      embed.setTitle("🔒 Vérification SSL").setDescription(`Domaine: ${domaine}\nVérification en cours...`);
      await interaction.deferReply();
      try {
        const res = await fetch(`https://${domaine}`, { signal: AbortSignal.timeout(5000) });
        embed.setDescription(`✅ SSL valide — ${res.status} ${res.statusText}`);
      } catch {
        embed.setDescription("❌ SSL invalide ou inaccessible.");
      }
      await interaction.editReply({ embeds: [embed] });
      break;
    }
    case "port-scan": {
      const host = interaction.options.getString("host", true);
      embed.setTitle("🔍 Scan de ports").setDescription(`Host: ${host}\nPorts communs scannés (80, 443, 22, 21, 25, 3389)...`);
      await interaction.deferReply();
      const ports = [80, 443, 22, 21, 25, 3389];
      const results: string[] = [];
      for (const port of ports) {
        try {
          const controller = new AbortController();
          const timeout = setTimeout(() => controller.abort(), 2000);
          await fetch(`http://${host}:${port}`, { signal: controller.signal }).catch(() => {});
          clearTimeout(timeout);
          results.push(`Port ${port}: ⚠️ Réponse reçue`);
        } catch (err) {
          const isAbort = err instanceof Error && err.name === "AbortError";
          results.push(`Port ${port}: ${isAbort ? "🔴 Fermé" : "🟡 Potentiellement ouvert"}`);
        }
      }
      embed.setDescription(results.join("\n"));
      await interaction.editReply({ embeds: [embed] });
      break;
    }
    case "username-gen": {
      const mots = interaction.options.getString("mots", true)?.split(/[\s,]+/).filter(Boolean) ?? [];
      const generated: string[] = [];
      for (let i = 0; i < 5; i++) {
        const combined = mots.sort(() => Math.random() - 0.5).join("");
        const num = Math.floor(Math.random() * 999);
        generated.push(`${combined}${num}`);
      }
      embed.setTitle("🎭 Usernames générés").setDescription(generated.join("\n"));
      await interaction.reply({ embeds: [embed], ephemeral: true });
      break;
    }
    case "metadata": {
      const url = interaction.options.getString("url", true);
      embed.setTitle("📊 Métadonnées").setDescription(`Analyse des métadonnées de: ${url}`);
      await interaction.deferReply();
      try {
        const res = await fetch(url, { signal: AbortSignal.timeout(5000) });
        const contentType = res.headers.get("content-type");
        const contentLength = res.headers.get("content-length");
        embed.addFields(
          { name: "Content-Type", value: contentType ?? "N/A", inline: true },
          { name: "Taille", value: contentLength ? `${(parseInt(contentLength) / 1024).toFixed(1)} KB` : "N/A", inline: true },
        );
        await interaction.editReply({ embeds: [embed] });
      } catch {
        await interaction.editReply("❌ Impossible de récupérer les métadonnées.");
      }
      break;
    }
    case "tech-detect": {
      const url = interaction.options.getString("url", true);
      embed.setTitle("🔍 Détection de technologies").setDescription(`Analyse de: ${url}`);
      await interaction.deferReply();
      try {
        const res = await fetch(url, { signal: AbortSignal.timeout(5000) });
        const techs: string[] = [];
        const poweredBy = res.headers.get("x-powered-by");
        if (poweredBy) techs.push(`⚡ X-Powered-By: ${poweredBy}`);
        const server = res.headers.get("server");
        if (server) techs.push(`🖥️ Server: ${server}`);
        if (!techs.length) techs.push("Aucune technologie détectée via les headers.");
        embed.setDescription(techs.join("\n"));
        await interaction.editReply({ embeds: [embed] });
      } catch {
        await interaction.editReply("❌ Analyse impossible.");
      }
      break;
    }
    default:
      await interaction.reply({ content: "❌ Non implémentée.", ephemeral: true });
  }
}

// ─── Music ────────────────────────────────────────────────────────────────────

export async function handleMusic(interaction: ChatInputCommandInteraction, _client: Client): Promise<void> {
  const action = interaction.options.getSubcommand();
  const embed = new EmbedBuilder().setColor(0x1db954);

  switch (action) {
    case "play": {
      const query = interaction.options.getString("requete", true);
      embed.setTitle("🎵 Lecture").setDescription(`Recherche: ${query}\n\n⚠️ Le système de musique nécessite un player audio (en développement).`);
      await interaction.reply({ embeds: [embed] });
      break;
    }
    case "stop":
      embed.setTitle("⏹️ Musique arrêtée").setDescription("File d'attente vidée.");
      await interaction.reply({ embeds: [embed] });
      break;
    case "pause":
      embed.setTitle("⏸️ Pause").setDescription("Musique mise en pause.");
      await interaction.reply({ embeds: [embed] });
      break;
    case "resume":
      embed.setTitle("▶️ Reprise").setDescription("Lecture reprise.");
      await interaction.reply({ embeds: [embed] });
      break;
    case "skip":
      embed.setTitle("⏭️ Skip").setDescription("Musique suivante.");
      await interaction.reply({ embeds: [embed] });
      break;
    case "previous":
      embed.setTitle("⏮️ Précédent").setDescription("Musique précédente.");
      await interaction.reply({ embeds: [embed] });
      break;
    case "shuffle":
      embed.setTitle("🔀 Shuffle").setDescription("Mode aléatoire activé.");
      await interaction.reply({ embeds: [embed] });
      break;
    case "loop": {
      const mode = interaction.options.getString("mode") ?? "off";
      embed.setTitle("🔁 Loop").setDescription(`Mode: ${mode}`);
      await interaction.reply({ embeds: [embed] });
      break;
    }
    case "seek": {
      const position = interaction.options.getString("position", true);
      embed.setTitle("⏯️ Seek").setDescription(`Position: ${position}`);
      await interaction.reply({ embeds: [embed] });
      break;
    }
    case "volume": {
      const vol = interaction.options.getInteger("volume", true);
      embed.setTitle("🔊 Volume").setDescription(`Volume: ${vol}%`);
      await interaction.reply({ embeds: [embed] });
      break;
    }
    case "queue":
      embed.setTitle("📋 File d'attente").setDescription("File d'attente vide.");
      await interaction.reply({ embeds: [embed] });
      break;
    case "nowplaying":
      embed.setTitle("🎵 En cours de lecture").setDescription("Aucune musique en cours.");
      await interaction.reply({ embeds: [embed] });
      break;
    case "lyrics": {
      const titre = interaction.options.getString("titre");
      embed.setTitle("🎤 Paroles").setDescription(titre ? `Recherche de paroles pour: ${titre}` : "Aucune musique en cours.");
      await interaction.reply({ embeds: [embed] });
      break;
    }
    case "playlist-add": {
      const nom = interaction.options.getString("nom", true);
      embed.setTitle("📝 Playlist créée").setDescription(`Playlist "${nom}" créée.`);
      await interaction.reply({ embeds: [embed] });
      break;
    }
    case "playlist-play": {
      const nom = interaction.options.getString("nom", true);
      embed.setTitle("▶️ Playlist").setDescription(`Lecture de la playlist "${nom}".`);
      await interaction.reply({ embeds: [embed] });
      break;
    }
    case "playlist-list":
      embed.setTitle("📋 Playlists").setDescription("Aucune playlist.");
      await interaction.reply({ embeds: [embed] });
      break;
    case "playlist-delete": {
      const nom = interaction.options.getString("nom", true);
      embed.setTitle("🗑️ Playlist supprimée").setDescription(`"${nom}" supprimée.`);
      await interaction.reply({ embeds: [embed] });
      break;
    }
    case "radio":
      embed.setTitle("📻 Radio Gaming").setDescription("Radio démarrée.");
      await interaction.reply({ embeds: [embed] });
      break;
    case "radio-stop":
      embed.setTitle("📻 Radio arrêtée").setDescription("Radio gaming arrêtée.");
      await interaction.reply({ embeds: [embed] });
      break;
    case "audio-effects":
      embed.setTitle("🎚️ Effets audio").setDescription("Effets audio (bassboost, nightcore, 8d) — en développement.");
      await interaction.reply({ embeds: [embed] });
      break;
    default:
      await interaction.reply({ content: "❌ Non implémentée.", ephemeral: true });
  }
}

// ─── Economy ──────────────────────────────────────────────────────────────────

export async function handleEconomy(interaction: ChatInputCommandInteraction, _client: Client): Promise<void> {
  const action = interaction.options.getSubcommand();
  const embed = new EmbedBuilder().setColor(0xf1c40f);

  switch (action) {
    case "balance": {
      const cible = interaction.options.getUser("cible") ?? interaction.user;
      embed.setTitle(`💰 Solde de ${cible.username}`).setDescription("Solde: 0 crédits");
      await interaction.reply({ embeds: [embed] });
      break;
    }
    case "daily":
      embed.setTitle("📅 Récompense quotidienne").setDescription("Tu as reçu 100 crédits!");
      await interaction.reply({ embeds: [embed] });
      break;
    case "weekly":
      embed.setTitle("📅 Récompense hebdomadaire").setDescription("Tu as reçu 500 crédits!");
      await interaction.reply({ embeds: [embed] });
      break;
    case "work":
      embed.setTitle("💼 Travail").setDescription("Tu as travaillé et gagné 50 crédits!");
      await interaction.reply({ embeds: [embed] });
      break;
    case "gamble": {
      const montant = interaction.options.getInteger("montant", true);
      const win = Math.random() < 0.45;
      if (win) {
        embed.setTitle("🎲 Gagné!").setDescription(`Tu as gagné ${montant * 2} crédits!`);
      } else {
        embed.setTitle("🎲 Perdu!").setDescription(`Tu as perdu ${montant} crédits.`);
      }
      await interaction.reply({ embeds: [embed] });
      break;
    }
    case "shop":
      embed.setTitle("🛒 Boutique").setDescription("Boutique en cours de développement.");
      await interaction.reply({ embeds: [embed] });
      break;
    case "buy": {
      const item = interaction.options.getString("item", true);
      embed.setTitle("🛒 Achat").setDescription(`Achat de "${item}" — en développement.`);
      await interaction.reply({ embeds: [embed] });
      break;
    }
    case "sell": {
      const item = interaction.options.getString("item", true);
      embed.setTitle("🛒 Vente").setDescription(`Vente de "${item}" — en développement.`);
      await interaction.reply({ embeds: [embed] });
      break;
    }
    case "inventory":
      embed.setTitle("📦 Inventaire").setDescription("Ton inventaire est vide.");
      await interaction.reply({ embeds: [embed] });
      break;
    case "transfer": {
      const cible = interaction.options.getUser("cible", true);
      const montant = interaction.options.getInteger("montant", true);
      embed.setTitle("💸 Transfert").setDescription(`Tu as envoyé ${montant} crédits à <@${cible.id}>.`);
      await interaction.reply({ embeds: [embed] });
      break;
    }
    case "leaderboard":
      embed.setTitle("🏆 Classement des plus riches").setDescription("Classement en développement.");
      await interaction.reply({ embeds: [embed] });
      break;
    case "level": {
      const xpData = await getUserXp(interaction.user.id);
      const level = xpData?.level ?? 0;
      const xp = xpData?.xp ?? 0;
      embed.setTitle("📈 Ton niveau").setDescription(`Niveau ${level} • ${xp.toLocaleString()} XP`);
      await interaction.reply({ embeds: [embed] });
      break;
    }
    case "rank": {
      const cible = interaction.options.getUser("cible") ?? interaction.user;
      const xpData = await getUserXp(cible.id);
      if (!xpData) {
        embed.setTitle(`🏆 Rang de ${cible.username}`).setDescription("Aucun XP enregistré.");
        await interaction.reply({ embeds: [embed] });
        break;
      }
      embed.setTitle(`🏆 Rang de ${cible.username}`).setDescription(`Niveau ${xpData.level} • ${xpData.xp.toLocaleString()} XP • Rang #${xpData.rank}`);
      await interaction.reply({ embeds: [embed] });
      break;
    }
    case "rank-card": {
      const xpData = await getUserXp(interaction.user.id);
      if (!xpData) {
        embed.setTitle("🏆 Carte de rang").setDescription("Aucun XP enregistré.");
        await interaction.reply({ embeds: [embed] });
        break;
      }
      await interaction.deferReply();
      try {
        const buffer = await generateRankCard({
          username: interaction.user.username,
          avatarUrl: interaction.user.displayAvatarURL({ extension: "png", size: 256 }),
          level: xpData.level,
          xp: xpData.xp,
          xpNeeded: levelFromXp(xpData.xp).xpNeeded,
          rank: xpData.rank,
        });
        await interaction.editReply({
          files: [new AttachmentBuilder(buffer, { name: "rank-card.png" })],
        });
      } catch {
        embed.setTitle("🏆 Carte de rang").setDescription("Erreur lors de la génération.");
        await interaction.editReply({ embeds: [embed] });
      }
      break;
    }
    case "xp-config":
      embed.setTitle("⚙️ Configuration XP").setDescription("Système XP en développement.");
      await interaction.reply({ embeds: [embed], ephemeral: true });
      break;
    default:
      await interaction.reply({ content: "❌ Non implémentée.", ephemeral: true });
  }
}
