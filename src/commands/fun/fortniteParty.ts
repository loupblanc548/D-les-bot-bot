/**
 * fortniteParty.ts — Commandes slash pour le Fortnite Party Bot
 *
 * Subcommands ajoutés au groupe /game:
 * - /game skin <nom>      — Change le skin du bot Fortnite
 * - /game emote <nom>     — Fait faire une emote au bot Fortnite
 * - /game backbling <nom> — Change le backbling du bot
 * - /game pickaxe <nom>   — Change le pickaxe du bot
 * - /game bot-status       — Statut du party bot
 * - /game bot-ready <bool> — Ready/unready le bot
 *
 * L'autocomplétion utilise l'API fortnite-api.com/v2/cosmetics/br déjà intégrée.
 */

import {
  ChatInputCommandInteraction,
  EmbedBuilder,
  AutocompleteInteraction,
  MessageFlags,
  AttachmentBuilder,
} from "discord.js";
import { fetchCosmetics, getCosmeticByName } from "../../services/fortnite-cosmetics.js";
import {
  isFortniteBotReady,
  setBotSkin,
  setBotEmote,
  setBotBackbling,
  setBotPickaxe,
  clearBotEmote,
  setBotReady,
  setBotLevel,
  connectFortniteBot,
  disconnectFortniteBot,
  getBotDisplayName,
} from "../../services/fortnitePartyBot.js";
import { generateCardAttachment } from "../../utils/notificationCards.js";
import { isValidEmbedImageUrl } from "../../utils/image-helpers.js";
import logger from "../../utils/logger.js";

// Types de cosmétiques supportés par le party bot
type CosmeticType = "outfit" | "emote" | "backpack" | "pickaxe";

// Mapping type → préfixe ID Fortnite
const _TYPE_PREFIX: Record<CosmeticType, string> = {
  outfit: "CID_",
  emote: "EID_",
  backpack: "BID_",
  pickaxe: "PICKAXE_",
};

// Mapping type → champ type.value dans l'API cosmetics
const TYPE_API_VALUE: Record<CosmeticType, string> = {
  outfit: "outfit",
  emote: "emote",
  backpack: "backpack",
  pickaxe: "pickaxe",
};

/**
 * Filtre les cosmétiques par type et recherche par nom.
 */
async function searchByType(
  query: string,
  type: CosmeticType,
  limit: number = 25,
): Promise<string[]> {
  const cosmetics = await fetchCosmetics();
  const normalizedQuery = query.toLowerCase().trim();
  const apiType = TYPE_API_VALUE[type];

  return cosmetics
    .filter((item) => {
      // Filtrer par type
      if (item.type.value !== apiType) return false;
      // Filtrer par nom si query non vide
      if (normalizedQuery && !item.name.toLowerCase().includes(normalizedQuery)) return false;
      return true;
    })
    .slice(0, limit)
    .map((item) => item.name);
}

/**
 * Récupère l'ID (CID/EID/BID/PICKAXE_ID) d'un cosmétique par son nom.
 */
async function getCosmeticIdByName(name: string, type: CosmeticType): Promise<string | null> {
  const cosmetics = await fetchCosmetics();
  const normalized = name.toLowerCase().trim();
  const apiType = TYPE_API_VALUE[type];

  const found = cosmetics.find(
    (item) => item.type.value === apiType && item.name.toLowerCase() === normalized,
  );

  return found?.id || null;
}

/**
 * Gère l'autocomplétion pour les subcommands skin/emote/backbling/pickaxe.
 */
export async function handleAutocomplete(interaction: AutocompleteInteraction): Promise<void> {
  const subcommand = interaction.options.getSubcommand();
  const focused = interaction.options.getFocused(true);
  const query = focused.value as string;

  let type: CosmeticType;
  switch (subcommand) {
    case "bot-skin":
    case "skin":
      type = "outfit";
      break;
    case "bot-emote":
    case "emote":
      type = "emote";
      break;
    case "bot-backbling":
    case "backbling":
      type = "backpack";
      break;
    case "bot-pickaxe":
    case "pickaxe":
      type = "pickaxe";
      break;
    default:
      await interaction.respond([]);
      return;
  }

  try {
    const results = await searchByType(query, type, 25);
    await interaction.respond(results.map((name) => ({ name: name.slice(0, 100), value: name })));
  } catch (err) {
    logger.warn(`[FortniteParty] Autocomplete error: ${err}`);
    await interaction.respond([]);
  }
}

/**
 * Gère les subcommands du party bot.
 */
export async function handleCommand(interaction: ChatInputCommandInteraction): Promise<void> {
  const subcommand = interaction.options.getSubcommand();

  // ─── bot-status ──────────────────────────────────────────────
  if (subcommand === "bot-status" || subcommand === "status") {
    const ready = isFortniteBotReady();
    const embed = new EmbedBuilder()
      .setTitle("🎮 Fortnite Party Bot — Statut")
      .setColor(ready ? 0x00ff00 : 0xff6600)
      .setDescription(
        ready
          ? "✅ Le bot Fortnite est connecté et prêt !"
          : "❌ Le bot Fortnite n'est pas connecté.",
      )
      .addFields({
        name: "Configuration",
        value: ready
          ? "Le bot accepte automatiquement les demandes d'amis et les invitations de party."
          : "Utilisez `/game bot-login` avec un code d'autorisation pour connecter un compte.\nObtenez un code sur: https://www.epicgames.com/id/api/redirect?clientId=3446cd72694c4a4485d81b77adbb2141&responseType=code",
      })
      .setTimestamp();
    await interaction.reply({ embeds: [embed], flags: [MessageFlags.Ephemeral] });
    return;
  }

  // ─── bot-ready ───────────────────────────────────────────────
  if (subcommand === "bot-ready" || subcommand === "ready") {
    if (!isFortniteBotReady()) {
      await interaction.reply({
        content: "❌ Le bot Fortnite n'est pas connecté. Configurez `FORTNITE_AUTH_CODE`.",
        flags: [MessageFlags.Ephemeral],
      });
      return;
    }
    const ready = interaction.options.getBoolean("etat", true);
    try {
      await setBotReady(ready);
      await interaction.reply({
        content: `✅ Bot ${ready ? "prêt" : "en attente"} !`,
        flags: [MessageFlags.Ephemeral],
      });
    } catch (err) {
      await interaction.reply({
        content: `❌ Erreur: ${err instanceof Error ? err.message : String(err)}`,
        flags: [MessageFlags.Ephemeral],
      });
    }
    return;
  }

  // ─── bot-level ───────────────────────────────────────────────
  if (subcommand === "bot-level" || subcommand === "level") {
    if (!isFortniteBotReady()) {
      await interaction.reply({
        content: "❌ Le bot Fortnite n'est pas connecté.",
        flags: [MessageFlags.Ephemeral],
      });
      return;
    }
    const level = interaction.options.getInteger("niveau", true);
    try {
      await setBotLevel(level);
      await interaction.reply({
        content: `✅ Niveau du bot défini sur ${level} !`,
        flags: [MessageFlags.Ephemeral],
      });
    } catch (err) {
      await interaction.reply({
        content: `❌ Erreur: ${err instanceof Error ? err.message : String(err)}`,
        flags: [MessageFlags.Ephemeral],
      });
    }
    return;
  }

  // ─── bot-emote-stop ──────────────────────────────────────────
  if (subcommand === "bot-emote-stop" || subcommand === "emote-stop") {
    if (!isFortniteBotReady()) {
      await interaction.reply({
        content: "❌ Le bot Fortnite n'est pas connecté.",
        flags: [MessageFlags.Ephemeral],
      });
      return;
    }
    try {
      await clearBotEmote();
      await interaction.reply({
        content: "✅ Emote arrêtée !",
        flags: [MessageFlags.Ephemeral],
      });
    } catch (err) {
      await interaction.reply({
        content: `❌ Erreur: ${err instanceof Error ? err.message : String(err)}`,
        flags: [MessageFlags.Ephemeral],
      });
    }
    return;
  }

  // ─── bot-login ───────────────────────────────────────────────
  if (subcommand === "bot-login" || subcommand === "login") {
    const authCode = interaction.options.getString("code", true);
    await interaction.deferReply({ flags: [MessageFlags.Ephemeral] });
    try {
      await connectFortniteBot(authCode);
      await interaction.editReply({
        content:
          "✅ Connexion au compte Fortnite en cours... Le bot sera prêt dans quelques secondes.\nIl acceptera automatiquement les demandes d'amis et les invitations de party.",
      });
      logger.info(`[FortniteParty] Bot-login initié par ${interaction.user.tag}`);
    } catch (err) {
      await interaction.editReply({
        content: `❌ Échec de connexion: ${err instanceof Error ? err.message : String(err)}\n\nObtenez un nouveau code sur:\nhttps://www.epicgames.com/id/api/redirect?clientId=3446cd72694c4a4485d81b77adbb2141&responseType=code`,
      });
    }
    return;
  }

  // ─── bot-logout ──────────────────────────────────────────────
  if (subcommand === "bot-logout" || subcommand === "logout") {
    await disconnectFortniteBot();
    await interaction.reply({
      content: "✅ Bot Fortnite déconnecté.",
      flags: [MessageFlags.Ephemeral],
    });
    return;
  }

  // ─── bot-friend ──────────────────────────────────────────────
  if (subcommand === "bot-friend" || subcommand === "friend") {
    const displayName = getBotDisplayName();
    if (!displayName) {
      await interaction.reply({
        content:
          "❌ Le bot Fortnite n'est pas connecté. Un admin doit utiliser `/game bot-login` d'abord.",
        flags: [MessageFlags.Ephemeral],
      });
      return;
    }
    const embed = new EmbedBuilder()
      .setTitle("🎮 Ajoute le bot Fortnite en ami !")
      .setColor(0x9146ff)
      .setDescription(
        `Ajoute **\`${displayName}\`** en ami sur Fortnite.\n` +
          "Le bot acceptera automatiquement ta demande d'ami !",
      )
      .addFields(
        {
          name: "📝 Comment faire ?",
          value:
            "1. Ouvre Fortnite\n" +
            "2. Va dans **Amis** → **Ajouter un ami**\n" +
            `3. Tape **\`${displayName}\`**\n` +
            "4. Envoie la demande — le bot l'acceptera dans quelques secondes",
        },
        {
          name: "🎉 Ensuite",
          value:
            "Une fois ami, invite le bot dans ta party.\n" +
            "Il rejoindra automatiquement et tu pourras utiliser `/game bot-skin` et `/game bot-emote` pour le contrôler !",
        },
      )
      .setFooter({ text: `Compte connecté: ${displayName}` })
      .setTimestamp();
    // Public (pas éphémère) — tout le monde peut voir le pseudo
    await interaction.reply({ embeds: [embed] });
    return;
  }

  // ─── bot-skin / bot-emote / bot-backbling / bot-pickaxe ─────
  const cosmeticName = interaction.options.getString("nom", true);
  let type: CosmeticType;
  let setter: (id: string) => Promise<void>;
  let label: string;
  let emoji: string;

  switch (subcommand) {
    case "bot-skin":
    case "skin":
      type = "outfit";
      setter = setBotSkin;
      label = "Skin";
      emoji = "👕";
      break;
    case "bot-emote":
    case "emote":
      type = "emote";
      setter = setBotEmote;
      label = "Emote";
      emoji = "💃";
      break;
    case "bot-backbling":
    case "backbling":
      type = "backpack";
      setter = setBotBackbling;
      label = "Backbling";
      emoji = "🎒";
      break;
    case "bot-pickaxe":
    case "pickaxe":
      type = "pickaxe";
      setter = setBotPickaxe;
      label = "Pickaxe";
      emoji = "⛏️";
      break;
    default:
      await interaction.reply({
        content: "❌ Subcommand inconnue",
        flags: [MessageFlags.Ephemeral],
      });
      return;
  }

  if (!isFortniteBotReady()) {
    await interaction.reply({
      content:
        "❌ Le bot Fortnite n'est pas connecté. Configurez `FORTNITE_AUTH_CODE` dans le `.env`.\nObtenez un code sur: https://www.epicgames.com/id/api/redirect?clientId=3446cd72694c4a4485d81b77adbb2141&responseType=code",
      flags: [MessageFlags.Ephemeral],
    });
    return;
  }

  await interaction.deferReply({ flags: [MessageFlags.Ephemeral] });

  try {
    // Récupérer l'ID du cosmétique
    const cosmeticId = await getCosmeticIdByName(cosmeticName, type);
    if (!cosmeticId) {
      await interaction.editReply({
        content: `❌ "${cosmeticName}" n'est pas un ${label} Fortnite valide.`,
      });
      return;
    }

    // Récupérer les infos pour l'embed
    const cosmetic = await getCosmeticByName(cosmeticName);
    await setter(cosmeticId);

    const embed = new EmbedBuilder()
      .setTitle(`${emoji} ${label} changé !`)
      .setColor(0x9146ff)
      .setDescription(`Le bot porte maintenant **${cosmeticName}**`)
      .addFields(
        { name: "ID", value: cosmeticId, inline: true },
        { name: "Type", value: label, inline: true },
      )
      .setTimestamp();

    if (cosmetic?.images?.icon && isValidEmbedImageUrl(cosmetic.images.icon)) {
      embed.setThumbnail(cosmetic.images.icon);
    }

    // Générer une carte visuelle si une image est disponible
    const iconUrl = cosmetic?.images?.icon;
    if (iconUrl && isValidEmbedImageUrl(iconUrl)) {
      const cardAttachment = await generateCardAttachment(
        {
          type: "fortnite",
          title: cosmeticName,
          description: cosmetic?.description,
          imageUrl: iconUrl,
          cosmeticType: label,
          cosmeticRarity: cosmetic?.rarity?.displayValue || "",
          cosmeticId: cosmeticId,
          badge: emoji,
        },
        `fortnite-${type}-${cosmeticId}`,
      );

      if (cardAttachment) {
        embed.setImage(`attachment://${cardAttachment.name}`);
        await interaction.editReply({
          embeds: [embed],
          files: [new AttachmentBuilder(cardAttachment.attachment, { name: cardAttachment.name })],
        });
      } else {
        await interaction.editReply({ embeds: [embed] });
      }
    } else {
      await interaction.editReply({ embeds: [embed] });
    }

    logger.info(
      `[FortniteParty] ${label} "${cosmeticName}" (${cosmeticId}) appliqué par ${interaction.user.tag}`,
    );
  } catch (err) {
    await interaction.editReply({
      content: `❌ Erreur lors du changement de ${label}: ${err instanceof Error ? err.message : String(err)}`,
    });
    logger.error(`[FortniteParty] Erreur ${label}: ${err}`);
  }
}

// Les subcommands sont définis directement dans gameGroup.ts
// car SlashCommandBuilder ne supporte pas l'export de subcommands en callback.
