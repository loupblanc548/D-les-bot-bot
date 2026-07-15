import { ChatInputCommandInteraction, SlashCommandBuilder, Client } from "discord.js";
import { handleCommand as handleGaming } from "./gaming.js";
import { handleCommand as handleSteam } from "./steam.js";
import { handleCommand as handleTwitch } from "./twitch.js";
import { handleCommand as handlePsn } from "./psn.js";
import { handleCommand as handleWishlist } from "./fun/wishlist.js";
import { handleCommand as handleBoutique } from "./fun/boutique.js";
import { handleCommand as handleExtraCmd } from "./extraCommands.js";
import { handleCommand as handleAdvanced } from "./advanced.js";
import { handleCommand as handleUtilityGaming } from "./utilityCommands.js";
import { handleCommand as handleApiCmd } from "./apiCommands.js";
import { handleCommand as handleFortniteParty } from "./fun/fortniteParty.js";

export const commands = [
  new SlashCommandBuilder()
    .setName("game")
    .setDescription("Commandes gaming (jeux, deals, tracking, plateformes)")
    .addSubcommand((sc) =>
      sc
        .setName("status")
        .setDescription("Statut des serveurs de jeu")
        .addStringOption((o) => o.setName("jeu").setDescription("Le jeu").setRequired(true)),
    )
    .addSubcommand((sc) =>
      sc
        .setName("info")
        .setDescription("Infos détaillées d'un jeu")
        .addStringOption((o) => o.setName("jeu").setDescription("Le jeu").setRequired(true)),
    )
    .addSubcommand((sc) => sc.setName("free-games").setDescription("Jeux gratuits (Epic Games)"))
    .addSubcommand((sc) => sc.setName("free-game-reminder").setDescription("Rappels jeux gratuits"))
    .addSubcommand((sc) =>
      sc
        .setName("patch-notes")
        .setDescription("Patch notes de jeux")
        .addStringOption((o) => o.setName("jeu").setDescription("Le jeu").setRequired(true)),
    )
    .addSubcommand((sc) =>
      sc
        .setName("deal")
        .setDescription("Comparateur de prix")
        .addStringOption((o) => o.setName("jeu").setDescription("Le jeu").setRequired(true)),
    )
    .addSubcommand((sc) =>
      sc
        .setName("deals-history")
        .setDescription("Historique des prix")
        .addStringOption((o) => o.setName("jeu").setDescription("Le jeu").setRequired(true)),
    )
    .addSubcommand((sc) =>
      sc
        .setName("price-compare")
        .setDescription("Compare prix multi-plateforme")
        .addStringOption((o) => o.setName("jeu").setDescription("Le jeu").setRequired(true)),
    )
    .addSubcommand((sc) =>
      sc
        .setName("price-history")
        .setDescription("Historique des prix")
        .addStringOption((o) => o.setName("jeu").setDescription("Le jeu").setRequired(true)),
    )
    .addSubcommand((sc) =>
      sc
        .setName("price-track")
        .setDescription("Suivi de prix")
        .addStringOption((o) => o.setName("jeu").setDescription("Le jeu").setRequired(true)),
    )
    .addSubcommand((sc) =>
      sc
        .setName("release-calendar")
        .setDescription("Calendrier des sorties")
        .addStringOption((o) => o.setName("periode").setDescription("Période").setRequired(false)),
    )
    .addSubcommand((sc) => sc.setName("gaming-news").setDescription("News gaming"))
    .addSubcommand((sc) => sc.setName("epic-calendar").setDescription("Calendrier Epic Games"))
    .addSubcommand((sc) => sc.setName("steam").setDescription("Profil Steam, wishlist, nowplaying"))
    .addSubcommand((sc) => sc.setName("steam-deals").setDescription("Deals Steam"))
    .addSubcommand((sc) =>
      sc
        .setName("wishlist")
        .setDescription("Wishlist multi-plateforme")
        .addStringOption((o) => o.setName("action").setDescription("Action").setRequired(true))
        .addStringOption((o) =>
          o.setName("plateforme").setDescription("Plateforme").setRequired(false),
        )
        .addStringOption((o) => o.setName("nom").setDescription("Nom du jeu").setRequired(false)),
    )
    .addSubcommand((sc) => sc.setName("wishlist-stats").setDescription("Stats de ta wishlist"))
    .addSubcommand((sc) => sc.setName("wishlist-notify").setDescription("Notifs wishlist"))
    .addSubcommand((sc) =>
      sc
        .setName("boutique")
        .setDescription("Boutique Fortnite (FR)")
        .addStringOption((o) => o.setName("section").setDescription("Section").setRequired(false)),
    )
    .addSubcommand((sc) =>
      sc
        .setName("fortnite-wishlist")
        .setDescription("Wishlist Fortnite (DM)")
        .addStringOption((o) => o.setName("action").setDescription("Action").setRequired(true))
        .addStringOption((o) =>
          o.setName("identifiant").setDescription("Identifiant").setRequired(false),
        ),
    )
    .addSubcommand((sc) =>
      sc.setName("fortnite-shop-preview").setDescription("Aperçu boutique Fortnite"),
    )
    .addSubcommand((sc) =>
      sc
        .setName("xbox")
        .setDescription("Profil Xbox/Game Pass")
        .addStringOption((o) => o.setName("gamertag").setDescription("Gamertag").setRequired(true)),
    )
    .addSubcommand((sc) => sc.setName("twitch").setDescription("Gère les streamers suivis"))
    .addSubcommand((sc) => sc.setName("psn").setDescription("Profil, trophées et jeux PlayStation"))
    .toJSON(),

  // ─── Commande fnbot (Fortnite Party Bot) ───
  new SlashCommandBuilder()
    .setName("fnbot")
    .setDescription("Bot Fortnite Party (skin, emote, backbling, pickaxe, level, ready, status)")
    .addSubcommand((sc) =>
      sc
        .setName("skin")
        .setDescription("Change le skin du bot Fortnite")
        .addStringOption((o) =>
          o.setName("nom").setDescription("Nom du skin").setRequired(true).setAutocomplete(true),
        ),
    )
    .addSubcommand((sc) =>
      sc
        .setName("emote")
        .setDescription("Fait faire une emote au bot Fortnite")
        .addStringOption((o) =>
          o.setName("nom").setDescription("Nom de l'emote").setRequired(true).setAutocomplete(true),
        ),
    )
    .addSubcommand((sc) =>
      sc.setName("emote-stop").setDescription("Arrête l'emote en cours du bot Fortnite"),
    )
    .addSubcommand((sc) =>
      sc
        .setName("backbling")
        .setDescription("Change le backbling du bot Fortnite")
        .addStringOption((o) =>
          o
            .setName("nom")
            .setDescription("Nom du backbling")
            .setRequired(true)
            .setAutocomplete(true),
        ),
    )
    .addSubcommand((sc) =>
      sc
        .setName("pickaxe")
        .setDescription("Change le pickaxe du bot Fortnite")
        .addStringOption((o) =>
          o.setName("nom").setDescription("Nom du pickaxe").setRequired(true).setAutocomplete(true),
        ),
    )
    .addSubcommand((sc) =>
      sc
        .setName("level")
        .setDescription("Définit le niveau du bot Fortnite")
        .addIntegerOption((o) =>
          o
            .setName("niveau")
            .setDescription("Niveau (1 — 2147483647)")
            .setRequired(true)
            .setMinValue(1)
            .setMaxValue(2147483647),
        ),
    )
    .addSubcommand((sc) =>
      sc
        .setName("ready")
        .setDescription("Ready/unready le bot Fortnite")
        .addBooleanOption((o) =>
          o.setName("etat").setDescription("true = prêt, false = en attente").setRequired(true),
        ),
    )
    .addSubcommand((sc) => sc.setName("status").setDescription("Statut du party bot Fortnite"))
    .addSubcommand((sc) =>
      sc
        .setName("login")
        .setDescription("Connecte le bot à un compte Fortnite avec un code d'autorisation")
        .addStringOption((o) =>
          o.setName("code").setDescription("Code d'autorisation Epic Games").setRequired(true),
        ),
    )
    .addSubcommand((sc) => sc.setName("logout").setDescription("Déconnecte le bot Fortnite"))
    .addSubcommand((sc) =>
      sc.setName("friend").setDescription("Affiche le pseudo du bot Fortnite à ajouter en ami"),
    )
    .toJSON(),
];

export const fnbotCommands: unknown[] = [];

const GAMING_SUBS = ["game-status", "patch_notes", "deal"];
const _TRACKGAME_SUBS = ["track-game", "untrack-game", "list-tracked"];

export async function handleCommand(interaction: ChatInputCommandInteraction, client: unknown) {
  const dc = client as Client;
  const action = interaction.options.getSubcommand();

  if (GAMING_SUBS.includes(action)) {
    const mapped = action === "game-status" ? "game-status" : action;
    Object.defineProperty(interaction, "commandName", { value: mapped, writable: true });
    await handleGaming(interaction);
  } else if (action === "steam") {
    Object.defineProperty(interaction, "commandName", { value: "steam", writable: true });
    await handleSteam(interaction);
  } else if (action === "twitch") {
    Object.defineProperty(interaction, "commandName", { value: "twitch", writable: true });
    await handleTwitch(interaction);
  } else if (action === "psn") {
    Object.defineProperty(interaction, "commandName", { value: "psn", writable: true });
    await handlePsn(interaction);
  } else if (action === "wishlist") {
    Object.defineProperty(interaction, "commandName", { value: "wishlist", writable: true });
    await handleWishlist(interaction);
  } else if (action === "boutique") {
    Object.defineProperty(interaction, "commandName", { value: "boutique", writable: true });
    await handleBoutique(interaction, dc);
  } else if (action === "fortnite-wishlist") {
    Object.defineProperty(interaction, "commandName", {
      value: "fortnite-wishlist",
      writable: true,
    });
    await handleAdvanced(interaction, dc);
  } else if (action === "free-games") {
    Object.defineProperty(interaction, "commandName", { value: "free-games", writable: true });
    await handleGaming(interaction);
  } else if (action === "deals-history" || action === "price-track") {
    Object.defineProperty(interaction, "commandName", { value: action, writable: true });
    await handleAdvanced(interaction, dc);
  } else if (action === "xbox" || action === "price-compare" || action === "release-calendar") {
    Object.defineProperty(interaction, "commandName", { value: action, writable: true });
    await handleExtraCmd(interaction, dc);
  } else if (
    action === "steam-deals" ||
    action === "price-history" ||
    action === "game-info" ||
    action === "gaming-news"
  ) {
    Object.defineProperty(interaction, "commandName", { value: action, writable: true });
    await handleApiCmd(interaction);
  } else if (
    ["free-game-reminder", "fortnite-shop-preview", "epic-calendar", "wishlist-stats"].includes(
      action,
    )
  ) {
    Object.defineProperty(interaction, "commandName", { value: action, writable: true });
    await handleUtilityGaming(interaction);
  } else if (action === "wishlist-notify") {
    Object.defineProperty(interaction, "commandName", { value: "wishlist-notify", writable: true });
    await handleWishlist(interaction);
  }
}

// ─── Handler fnbot (Fortnite Party Bot) ────────────────────────────────────────

export async function handleFnbotCommand(
  interaction: ChatInputCommandInteraction,
  _client: unknown,
) {
  await handleFortniteParty(interaction);
}
