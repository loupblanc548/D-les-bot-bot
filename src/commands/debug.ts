import { SlashCommandBuilder, ChatInputCommandInteraction, EmbedBuilder, Client } from "discord.js";
import prisma from "../prisma.js";
import { config } from "../config.js";
import { requireAdmin } from "../services/permissions.js";

export const data = new SlashCommandBuilder()
  .setName("debug")
  .setDescription("Outil de diagnostic du bot (admin only)")
  .addSubcommand((subcommand) =>
    subcommand.setName("status").setDescription("Affiche le statut complet du bot"),
  )
  .addSubcommand((subcommand) =>
    subcommand.setName("services").setDescription("Vérifie l'état des services externes"),
  )
  .addSubcommand((subcommand) =>
    subcommand.setName("database").setDescription("Teste la connexion à la base de données"),
  )
  .addSubcommand((subcommand) =>
    subcommand.setName("memory").setDescription("Affiche l'utilisation mémoire"),
  );

export async function execute(interaction: ChatInputCommandInteraction, client: Client) {
  await requireAdmin(interaction);
  const subcommand = interaction.options.getSubcommand();

  switch (subcommand) {
    case "status":
      await debugStatus(interaction, client);
      break;
    case "services":
      await debugServices(interaction);
      break;
    case "database":
      await debugDatabase(interaction);
      break;
    case "memory":
      await debugMemory(interaction);
      break;
  }
}

async function debugStatus(interaction: ChatInputCommandInteraction, client: Client) {
  const embed = new EmbedBuilder()
    .setTitle("🔍 Diagnostic - Statut du Bot")
    .setColor(0x00ff00)
    .setTimestamp();

  // Informations générales
  embed.addFields({
    name: "📊 Informations Générales",
    value: `
**Uptime**: ${Math.floor(process.uptime() / 60)} minutes
**Version**: v1.0.0
**Node.js**: ${process.version}
**Plateforme**: ${process.platform}
**Memory**: ${(process.memoryUsage().heapUsed / 1024 / 1024).toFixed(2)} MB / ${(process.memoryUsage().heapTotal / 1024 / 1024).toFixed(2)} MB
    `.trim(),
    inline: false,
  });

  // Statut Discord
  embed.addFields({
    name: "🤖 Discord",
    value: `
**Statut**: ${client.isReady() ? "✅ Connecté" : "❌ Déconnecté"}
**Guilds**: ${client.guilds.cache.size}
**Users**: ${client.users.cache.size}
**Channels**: ${client.channels.cache.size}
**Ping**: ${client.ws.ping}ms
    `.trim(),
    inline: false,
  });

  // Configuration
  embed.addFields({
    name: "⚙️ Configuration",
    value: `
**Env**: ${process.env.NODE_ENV || "development"}
**Log Channel**: ${config.logChannel ? "✅ Configuré" : "❌ Non configuré"}
**Free Games Channel**: ${config.freeGamesChannel ? "✅ Configuré" : "❌ Non configuré"}
**Twitter Channel**: ${config.twitterChannel ? "✅ Configuré" : "❌ Non configuré"}
    `.trim(),
    inline: false,
  });

  await interaction.reply({ embeds: [embed], ephemeral: true });
}

async function debugServices(interaction: ChatInputCommandInteraction) {
  const embed = new EmbedBuilder()
    .setTitle("🔍 Diagnostic - Services Externes")
    .setColor(0x00ff00)
    .setTimestamp();

  const results: { name: string; status: string; latency?: number }[] = [];

  // Test Prisma
  try {
    const start = Date.now();
    await prisma.$queryRaw`SELECT 1`;
    const latency = Date.now() - start;
    results.push({ name: "Prisma (SQLite)", status: "✅ OK", latency });
  } catch (_error) {
    results.push({ name: "Prisma (SQLite)", status: "❌ Erreur" });
  }

  // Test OpenRouter API
  try {
    const start = Date.now();
    // Simple test - vérifier si la clé est configurée
    if (process.env.OPENROUTER_API_KEY) {
      const latency = Date.now() - start;
      results.push({ name: "OpenRouter API", status: "✅ Configuré", latency });
    } else {
      results.push({ name: "OpenRouter API", status: "⚠️ Non configuré" });
    }
  } catch (_error) {
    results.push({ name: "OpenRouter API", status: "❌ Erreur" });
  }

  // Affichage des résultats
  const statusText = results
    .map((r) => `**${r.name}**: ${r.status}${r.latency ? ` (${r.latency}ms)` : ""}`)
    .join("\n");

  embed.addFields({
    name: "📡 Services",
    value: statusText || "Aucun service testé",
    inline: false,
  });

  await interaction.reply({ embeds: [embed], ephemeral: true });
}

async function debugDatabase(interaction: ChatInputCommandInteraction) {
  const embed = new EmbedBuilder()
    .setTitle("🔍 Diagnostic - Base de Données")
    .setColor(0x00ff00)
    .setTimestamp();

  try {
    // Test de connexion
    const start = Date.now();
    await prisma.$queryRaw`SELECT 1`;
    const latency = Date.now() - start;

    embed.addFields({
      name: "✅ Connexion",
      value: `Latence: ${latency}ms`,
      inline: false,
    });

    // Statistiques
    const [sourcesCount, notificationsCount, logsCount] = await Promise.all([
      prisma.source.count(),
      prisma.notification.count(),
      prisma.log.count(),
    ]);

    embed.addFields({
      name: "📊 Statistiques",
      value: `
**Sources**: ${sourcesCount}
**Notifications**: ${notificationsCount}
**Logs**: ${logsCount}
      `.trim(),
      inline: false,
    });
  } catch (error) {
    embed.setColor(0xff0000);
    embed.addFields({
      name: "❌ Erreur",
      value: String(error),
      inline: false,
    });
  }

  await interaction.reply({ embeds: [embed], ephemeral: true });
}

async function debugMemory(interaction: ChatInputCommandInteraction) {
  const usage = process.memoryUsage();
  const embed = new EmbedBuilder()
    .setTitle("🔍 Diagnostic - Utilisation Mémoire")
    .setColor(0x00ff00)
    .setTimestamp();

  embed.addFields({
    name: "💾 Mémoire Heap",
    value: `
**RSS**: ${(usage.rss / 1024 / 1024).toFixed(2)} MB
**Heap Total**: ${(usage.heapTotal / 1024 / 1024).toFixed(2)} MB
**Heap Used**: ${(usage.heapUsed / 1024 / 1024).toFixed(2)} MB
**External**: ${(usage.external / 1024 / 1024).toFixed(2)} MB
**Array Buffers**: ${(usage.arrayBuffers / 1024 / 1024).toFixed(2)} MB
    `.trim(),
    inline: false,
  });

  embed.addFields({
    name: "📊 Pourcentage",
    value: `${((usage.heapUsed / usage.heapTotal) * 100).toFixed(2)}% du heap utilisé`,
    inline: false,
  });

  await interaction.reply({ embeds: [embed], ephemeral: true });
}
