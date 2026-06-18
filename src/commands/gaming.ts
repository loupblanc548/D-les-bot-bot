import logger from "../utils/logger.js";
import { getDeals, buildDealEmbed } from "../services/itad.js";
import {
  MessageFlags,
  ChatInputCommandInteraction,
  SlashCommandBuilder,
  EmbedBuilder,
} from "discord.js";

const FOOTER = { text: "Système de Surveillance • v1.0.0" };

export const commands = [
  new SlashCommandBuilder()
    .setName("game-status")
    .setDescription("Vérifier le statut d'un serveur de jeu")
    .addStringOption((o) =>
      o
        .setName("jeu")
        .setDescription("Le jeu à vérifier")
        .setRequired(true)
        .addChoices(
          { name: "Fortnite", value: "fortnite" },
          { name: "Epic Games", value: "epic" },
          { name: "Steam", value: "steam" },
          { name: "PlayStation", value: "psn" },
          { name: "Xbox Live", value: "xbox" },
          { name: "Nintendo", value: "nintendo" },
          { name: "Roblox", value: "roblox" },
          { name: "EA App", value: "ea" },
          { name: "Ubisoft Connect", value: "ubisoft" },
          { name: "Riot Games", value: "riot" },
          { name: "Helldivers 2", value: "helldivers2" },
          { name: "GTA Online", value: "gta" },
          { name: "Call of Duty", value: "cod" },
        )
    )
    .toJSON(),

  new SlashCommandBuilder()
    .setName("free-games")
    .setDescription("Affiche les jeux gratuits du moment (Epic Games)")
    .toJSON(),

  new SlashCommandBuilder()
    .setName("patch_notes")
    .setDescription("Liens vers les derniers patch notes d'un jeu")
    .addStringOption((o) => o.setName("jeu").setDescription("Le jeu").setRequired(true).addChoices({ name: "Fortnite", value: "fortnite" },{ name: "Helldivers 2", value: "helldivers2" },{ name: "Call of Duty", value: "cod" },{ name: "GTA Online", value: "gta" }))
    .toJSON(),

  new SlashCommandBuilder()
    .setName("deal")
    .setDescription("Comparateur de prix pour un jeu")
    .addStringOption((o) => o.setName("jeu").setDescription("Nom du jeu à rechercher").setRequired(true))
    .toJSON(),
];

export async function handleCommand(interaction: ChatInputCommandInteraction) {
  const { commandName } = interaction;
  try {
    switch (commandName) {
      case "game-status": await handleGameStatus(interaction); break;
      case "free-games": await handleFreeGames(interaction); break;
      case "patch_notes": await handlePatchNotes(interaction); break;
      case "deal": await handleDeal(interaction); break;
    }
  } catch (err) {
    logger.error("[Gaming] Erreur:", err);
    const embed = new EmbedBuilder().setDescription("❌ Une erreur est survenue.").setColor(0xff3344).setFooter(FOOTER).setTimestamp();
    try { if (interaction.replied || interaction.deferred) await interaction.editReply({ embeds: [embed] }); else await interaction.reply({ embeds: [embed], flags: [MessageFlags.Ephemeral] }); } catch (e) { logger.error("[Gaming] Erreur reply:", String(e)) }
  }
}

async function handleGameStatus(interaction: ChatInputCommandInteraction) {
  const jeu = interaction.options.getString("jeu", true);
  await interaction.deferReply();
  const statuses: Record<string, { emoji: string; name: string; url: string; statusUrl: string }> = {
    fortnite: { emoji: "🎮", name: "Fortnite", url: "https://status.epicgames.com/", statusUrl: "https://status.epicgames.com/api/v2/status.json" },
    epic: { emoji: "🎮", name: "Epic Games Store", url: "https://status.epicgames.com/", statusUrl: "https://status.epicgames.com/api/v2/status.json" },
    roblox: { emoji: "🎮", name: "Roblox", url: "https://status.roblox.com/", statusUrl: "https://status.roblox.com/api/v2/status.json" },
    nintendo: { emoji: "🎮", name: "Nintendo", url: "https://www.nintendo.com/fr-fr/", statusUrl: "https://www.nintendo.com/fr-fr/" },
    steam: { emoji: "🎮", name: "Steam", url: "https://steamstat.us/", statusUrl: "https://crowbar.steamstat.us/" },
    psn: { emoji: "🎮", name: "PlayStation Network", url: "https://status.playstation.com/", statusUrl: "https://status.playstation.com/" },
    xbox: { emoji: "🎮", name: "Xbox Live", url: "https://support.xbox.com/fr-FR/xbox-live-status", statusUrl: "https://support.xbox.com/fr-FR/xbox-live-status" },
    ea: { emoji: "🎮", name: "EA App", url: "https://www.ea.com/fr-fr/ea-app", statusUrl: "https://www.ea.com/fr-fr/ea-app" },
    ubisoft: { emoji: "🎮", name: "Ubisoft Connect", url: "https://www.ubisoft.com/fr-fr/", statusUrl: "https://www.ubisoft.com/fr-fr/" },
    riot: { emoji: "🎮", name: "Riot Games", url: "https://status.riotgames.com/", statusUrl: "https://status.riotgames.com/" },
    helldivers2: { emoji: "🎮", name: "Helldivers 2", url: "https://www.playstation.com/fr-fr/games/helldivers-2/", statusUrl: "https://www.playstation.com/fr-fr/games/helldivers-2/" },
    gta: { emoji: "🎮", name: "GTA Online", url: "https://support.rockstargames.com/fr/", statusUrl: "https://support.rockstargames.com/fr/" },
    cod: { emoji: "🎮", name: "Call of Duty", url: "https://support.activision.com/fr/call-of-duty", statusUrl: "https://support.activision.com/fr/call-of-duty" },
  };
  const game = statuses[jeu];
  if (!game) { await interaction.editReply({ embeds: [new EmbedBuilder().setDescription("❌ Jeu/service non reconnu.").setColor(0xff3344).setFooter(FOOTER).setTimestamp()] }); return; }
  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 8000);
    const res = await fetch(game.statusUrl, { signal: controller.signal });
    clearTimeout(timeout);
    const isUp = res.ok || res.status === 200;
    const color = isUp ? 0x53fc18 : 0xffaa00;
    const desc = isUp ? "• **Opérationnel**\n• Aucun problème signalé" : "• **Perturbations possibles**\n• Le service ne répond pas correctement";
    await interaction.editReply({ embeds: [new EmbedBuilder().setTitle(game.emoji + " — " + game.name).setDescription(desc).setColor(color).addFields({ name: "🔗 Page statut", value: game.url, inline: false }).setFooter(FOOTER).setTimestamp()] });
  } catch {
    await interaction.editReply({ embeds: [new EmbedBuilder().setTitle(game.emoji + " — " + game.name).setDescription("• **Statut inconnu**\n• Impossible de contacter le service").setColor(0xffaa00).addFields({ name: "🔗 Page statut", value: game.url, inline: false }).setFooter(FOOTER).setTimestamp()] });
  }
}

async function handleFreeGames(interaction: ChatInputCommandInteraction) {
  await interaction.deferReply();
  try {
    const res = await fetch("https://store-site-backend-static-ipv4.ak.epicgames.com/freeGamesPromotions?locale=fr-FR&country=FR&allowCountries=FR", { headers: { "User-Agent": "DiscordSurveillanceBot/1.0" } });
    if (!res.ok) throw new Error("HTTP " + res.status);
    const data = await res.json() as Record<string, unknown>;
    const elements = (data as any)?.data?.Catalog?.searchStore?.elements || [];
    const freeGames = elements.filter((e: any) => { const promos = e?.promotions?.promotionalOffers; return promos && promos.length > 0; });
    if (freeGames.length === 0) { await interaction.editReply({ embeds: [new EmbedBuilder().setTitle("🎮 Jeux gratuits").setDescription("• Aucun jeu gratuit disponible pour le moment.\n• Consulte le [Epic Games Store](https://store.epicgames.com/fr/free-games) !").setColor(0xffaa00).setFooter(FOOTER).setTimestamp()] }); return; }
    const game = freeGames[0];
    const title = game.title || "Jeu gratuit";
    const desc = game.description || "Fonce le récupérer avant qu'il ne soit trop tard !";
    const originalPrice = game?.price?.totalPrice?.fmtPrice?.originalPrice || "Gratuit";
    const endDate = game?.promotions?.promotionalOffers?.[0]?.promotionalOffers?.[0]?.endDate ? new Date(game.promotions.promotionalOffers[0].promotionalOffers[0].endDate).toLocaleDateString("fr-FR") : "Limite";
    const embed = new EmbedBuilder().setAuthor({ name: "JEUX GRATUITS DU MOMENT" }).setTitle("🎮 " + title + " — GRATUIT").setDescription(desc.slice(0, 1024) || "Fonce le récupérer !").setColor(0x00f0ff).addFields({ name: "💰 Prix original", value: originalPrice, inline: true },{ name: "⏰ Fin de l'offre", value: endDate, inline: true },{ name: "🔗 Lien", value: "[Epic Games Store](https://store.epicgames.com/fr/free-games)", inline: true }).setFooter(FOOTER).setTimestamp();
    if (freeGames.length > 1) embed.addFields({ name: "📦 Autres", value: (freeGames.length - 1) + " autre(s) jeu(x) gratuit(s)", inline: true });
    await interaction.editReply({ embeds: [embed] });
  } catch (err) { await interaction.editReply({ embeds: [new EmbedBuilder().setTitle("🎮 Jeux gratuits").setDescription("• Impossible de récupérer les jeux gratuits.\n• Consulte [Epic Games Store](https://store.epicgames.com/fr/free-games)").setColor(0xff3344).setFooter(FOOTER).setTimestamp()] }); }
}

async function handlePatchNotes(interaction: ChatInputCommandInteraction) {
  const jeu = interaction.options.getString("jeu", true);
  await interaction.deferReply();
  const patchUrls: Record<string, { emoji: string; name: string; url: string }> = {
    fortnite: { emoji: "🎮", name: "Fortnite", url: "https://www.fortnite.com/news" },
    helldivers2: { emoji: "🎮", name: "Helldivers 2", url: "https://store.steampowered.com/news/app/553850" },
    cod: { emoji: "🎮", name: "Call of Duty", url: "https://www.callofduty.com/fr/patchnotes" },
    gta: { emoji: "🎮", name: "GTA Online", url: "https://support.rockstargames.com/fr/categories/200013106" },
  };
  const game = patchUrls[jeu];
  if (!game) { await interaction.editReply({ embeds: [new EmbedBuilder().setDescription("❌ Jeu non reconnu.").setColor(0xff3344).setFooter(FOOTER).setTimestamp()] }); return; }
  await interaction.editReply({ embeds: [new EmbedBuilder().setTitle(game.emoji + " Patch Notes — " + game.name).setDescription("• Consulte les derniers patch notes de **" + game.name + "** :\n• " + game.url).setColor(0x2f3136).setFooter(FOOTER).setTimestamp()] });
}

async function handleDeal(interaction: ChatInputCommandInteraction) {
  const gameName = interaction.options.getString("jeu", true);
  await interaction.deferReply();
  try {
    const result = await getDeals(gameName);
    if (!result || result.prices.length === 0) {
      const notFound = (!result) ? "• Aucun résultat trouvé pour **" + gameName + "**." : "• Jeu trouvé mais aucun prix disponible pour le moment.";
      await interaction.editReply({ embeds: [new EmbedBuilder().setAuthor({ name: "Comparateur de prix" }).setTitle("💰 " + gameName).setDescription(notFound + "\n" + "• Consultez [IsThereAnyDeal](https://isthereanydeal.com/)").setColor(0xffaa00).setFooter(FOOTER).setTimestamp()] });
      return;
    }
    const embed = buildDealEmbed(result);
    embed.setFooter(FOOTER);
    await interaction.editReply({ embeds: [embed] });
  } catch (err) {
    logger.error("[Gaming] deal error:", err);
    await interaction.editReply({ embeds: [new EmbedBuilder().setAuthor({ name: "Comparateur de prix" }).setTitle("💰 " + gameName).setDescription("• Impossible de récupérer les prix pour le moment.\n" + "• Consultez [IsThereAnyDeal](https://isthereanydeal.com/)").setColor(0xff3344).setFooter(FOOTER).setTimestamp()] });
  }
}
