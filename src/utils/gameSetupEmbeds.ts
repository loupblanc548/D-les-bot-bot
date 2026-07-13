/**
 * gameSetupEmbeds.ts — Embeds de notification pour la configuration des bots de jeu
 *
 * Génère de belles notifications expliquant toutes les étapes
 * pour configurer et utiliser le bot Fortnite et le bot Minecraft.
 */

import { EmbedBuilder } from "discord.js";

// ─── Fortnite ─────────────────────────────────────────────────────────────────

export function buildFortniteSetupEmbed(botDisplayName?: string): EmbedBuilder {
  const isReady = !!botDisplayName;

  const embed = new EmbedBuilder()
    .setTitle("🎮 Configuration du Bot Fortnite")
    .setColor(isReady ? 0x00ff00 : 0x9146ff)
    .setThumbnail(
      "https://cdn2.unrealengine.com/Fortnite%2Fblog%2Fbattle-royale-news-row%2Ffortnite-1920x1080-1920x1080-09d28c2a2a8a4fcaa55d67f67a8a0c7a8c0c4e4a.jpg",
    )
    .setDescription(
      isReady
        ? `✅ **Le bot Fortnite est connecté et prêt !**\nPseudo du bot : **\`${botDisplayName}\`**`
        : "⚠️ **Le bot Fortnite n'est pas encore connecté.**\nSuis les étapes ci-dessous pour le configurer.",
    )
    .addFields(
      {
        name: "📋 Étape 1 — Obtenir un code d'autorisation",
        value:
          "1. Connecte-toi sur [Epic Games](https://www.epicgames.com)\n" +
          "2. Ouvre ce lien dans ton navigateur :\n" +
          "👉 [Obtenir le code](https://www.epicgames.com/id/api/redirect?clientId=3446cd72694c4a4485d81b77adbb2141&responseType=code)\n" +
          "3. Copie le code qui s'affiche",
      },
      {
        name: "🔑 Étape 2 — Connecter le bot",
        value:
          "Utilise la commande :\n" +
          "```\n/game bot-login code:<ton-code>\n```\n" +
          "Le bot se connectera automatiquement à Fortnite.",
      },
      {
        name: "👥 Étape 3 — Ajouter le bot en ami",
        value: isReady
          ? `1. Ouvre **Fortnite**\n2. Va dans **Amis** → **Ajouter un ami**\n3. Tape **\`${botDisplayName}\`**\n4. Envoie la demande — le bot l'acceptera automatiquement !`
          : "Une fois le bot connecté, utilise `/game bot-friend` pour voir le pseudo du bot et l'ajouter en ami sur Fortnite.",
      },
      {
        name: "🎉 Étape 4 — Profiter !",
        value:
          "Une fois ami avec le bot :\n" +
          "• Invite-le dans ta **party** Fortnite\n" +
          "• Utilise `/game bot-skin <nom>` pour changer son skin\n" +
          "• Utilise `/game bot-emote <nom>` pour faire danser le bot\n" +
          "• Utilise `/game bot-backbling <nom>` pour changer le sac à dos\n" +
          "• Utilise `/game bot-pickaxe <nom>` pour changer la pioche\n" +
          "• Utilise `/game bot-ready` pour ready/unready le bot",
      },
      {
        name: "📊 Commandes disponibles",
        value:
          "• `/game bot-status` — Statut du bot\n" +
          "• `/game bot-login` — Connecter le bot\n" +
          "• `/game bot-logout` — Déconnecter le bot\n" +
          "• `/game bot-friend` — Voir le pseudo pour ajouter en ami\n" +
          "• `/game bot-ready` — Ready/unready\n" +
          "• `/game bot-level` — Changer le niveau\n" +
          "• `/game bot-emote-stop` — Arrêter l'emote",
      },
    )
    .setFooter({
      text: isReady
        ? `Bot connecté : ${botDisplayName} • Profite du jeu !`
        : "Bot non connecté • Suis les étapes ci-dessus",
    })
    .setTimestamp();

  return embed;
}

// ─── Minecraft ────────────────────────────────────────────────────────────────

export function buildMinecraftLinkEmbed(gamertag: string, code: string): EmbedBuilder {
  return new EmbedBuilder()
    .setTitle("⛏️ Liaison Minecraft — Configuration du compte")
    .setColor(0x4a9b4a)
    .setThumbnail(
      "https://www.minecraft.net/etc.clientlibs/minecraftnet/clientlibs/main/resources/favicon-96x96.png",
    )
    .setDescription(
      `**Liaison démarrée pour \`${gamertag}\`**\n\n` +
        "Suis les étapes ci-dessous pour vérifier ton compte Minecraft et le lier à ton Discord.",
    )
    .addFields(
      {
        name: "📋 Étape 1 — Code de vérification",
        value:
          `Ton code de vérification est :\n` +
          `\`\`\`\n${code}\n\`\`\`\n` +
          "⏱️ **Ce code expire dans 10 minutes.**",
      },
      {
        name: "🎮 Étape 2 — Rejoindre le serveur Minecraft",
        value:
          "1. Lance **Minecraft** (Java ou Bedrock)\n" +
          "2. Rejoins un serveur où le bot Discord est connecté\n" +
          "   (utilise `/mc connect` sur Discord pour connecter le bot à ton serveur)\n" +
          `3. Assure-toi que ton pseudo Minecraft correspond à **\`${gamertag}\`**`,
      },
      {
        name: "✅ Étape 3 — Vérifier ton compte",
        value:
          "Dans le chat Minecraft, tape :\n" +
          "```\n/verify " +
          code +
          "\n```\n" +
          "Le bot confirmera la liaison dans le chat Minecraft !",
      },
      {
        name: "🎉 Étape 4 — Profiter !",
        value:
          "Une fois ton compte vérifié, tu peux :\n" +
          "• `/mc profile` — Voir ton profil Minecraft lié\n" +
          "• `/mc stats` — Voir tes stats (UUID, skin, historique de pseudos)\n" +
          "• Mentionner le bot avec `@BotName` dans le chat Minecraft pour interagir\n" +
          "• Le bot peut miner, suivre des joueurs, donner des items, et plus !",
      },
      {
        name: "📊 Toutes les commandes Minecraft",
        value:
          "• `/mc connect <ip>` — Connecter le bot à un serveur\n" +
          "• `/mc mine` — Démarrer l'auto-mining\n" +
          "• `/mc stop` — Arrêter le mining\n" +
          "• `/mc status` — Statut du bot\n" +
          "• `/mc chat <message>` — Parler dans le chat\n" +
          "• `/mc follow <joueur>` — Suivre un joueur\n" +
          "• `/mc give <item>` — Donner un item\n" +
          "• `/mc equip <outil>` — Équiper un outil\n" +
          "• `/mc farm <mode>` — Agriculture auto\n" +
          "• `/mc solo` — Serveur + bot + mining (tout-en-un)\n" +
          "• `/mc link <gamertag>` — Lier ton compte\n" +
          "• `/mc unlink` — Détacher ton compte\n" +
          "• `/mc profile` — Ton profil lié\n" +
          "• `/mc stats [pseudo]` — Stats d'un joueur",
      },
    )
    .setFooter({
      text: `Code: ${code} • Expire dans 10 min • Gamertag: ${gamertag}`,
    })
    .setTimestamp();
}

export function buildMinecraftConnectEmbed(
  host: string,
  port: number,
  username: string,
): EmbedBuilder {
  return new EmbedBuilder()
    .setTitle("⛏️ Bot Minecraft — Connexion au serveur")
    .setColor(0x4a9b4a)
    .setThumbnail(
      "https://www.minecraft.net/etc.clientlibs/minecraftnet/clientlibs/main/resources/favicon-96x96.png",
    )
    .setDescription(`**Le bot rejoint le serveur Minecraft !** 🎮`)
    .addFields(
      {
        name: "🌐 Informations de connexion",
        value:
          `• **Serveur :** \`${host}:${port}\`\n` +
          `• **Pseudo du bot :** \`${username}\`\n` +
          `• **Mode :** Offline (pas besoin de compte Xbox)`,
      },
      {
        name: "📋 Étape 1 — Vérifier la connexion",
        value:
          "Le bot devrait apparaître dans le jeu dans quelques secondes.\n" +
          "Utilise `/mc status` pour voir sa position, sa santé et son statut.",
      },
      {
        name: "⛏️ Étape 2 — Démarrer le mining",
        value:
          "Utilise les commandes :\n" +
          "• `/mc mine mode:strip` — Strip mining (tunnel droit)\n" +
          "• `/mc mine mode:branch` — Branch mining (branches)\n" +
          "• `/mc mine mode:tunnel` — Tunnel 1×2",
      },
      {
        name: "💬 Étape 3 — Interagir avec le bot",
        value:
          "• `/mc chat <message>` — Envoyer un message dans le chat\n" +
          "• `/mc follow <joueur>` — Le bot suit un joueur\n" +
          "• `/mc give <item>` — Donner un item\n" +
          "• Tape `@BotName` dans le chat Minecraft pour parler au bot !\n" +
          "• Le bot répond aux salutations, blagues, statut, et plus !",
      },
      {
        name: "🔗 Étape 4 — Lier ton compte",
        value:
          "Pour lier ton compte Minecraft à ton Discord :\n" +
          "1. Tape `/mc link <ton-gamertag>` sur Discord\n" +
          "2. Tape `/verify <code>` dans le chat Minecraft\n" +
          "3. Profite de `/mc stats` et `/mc profile` !",
      },
      {
        name: "📊 Commandes utiles",
        value:
          "• `/mc stop` — Arrêter le mining\n" +
          "• `/mc disconnect` — Déconnecter le bot\n" +
          "• `/mc solo` — Serveur + bot + mining (tout-en-un)\n" +
          "• `/mc seed <graine>` — Démarrer un serveur dédié",
      },
    )
    .setFooter({ text: `Connecté à ${host}:${port} • Bot: ${username}` })
    .setTimestamp();
}
