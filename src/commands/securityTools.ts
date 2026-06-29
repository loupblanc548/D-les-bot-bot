/**
 * securityTools.ts — Commandes slash pour les outils de sécurité
 *
 * /scan <url>           — Scan une URL via VirusTotal + PhishTank + Google Safe Browsing
 * /checkip <ip>         — Vérifie la réputation d'une IP (AbuseIPDB + géolocalisation + proxy/VPN)
 * /threatreport         — Génère un rapport de sécurité instantané
 * /autodefense          — Configure l'auto-défense (GeoBlock, Quarantine, Escalation)
 * /youtube-check <url>  — Vérifie si une vidéo YouTube est un scam
 * /translate <text>     — Traduit un texte via Google Translation API
 * /analyze-image <url>  — Analyse une image via Google Vision (labels, SafeSearch, OCR)
 * /analyze-text <text>  — Analyse le sentiment d'un texte via Google Natural Language
 * /security-config      — Configure les intégrations de sécurité
 */

import { SlashCommandBuilder, ChatInputCommandInteraction, EmbedBuilder, Client } from "discord.js";
import { scanURL, checkIPReputation, githubDorkSearch } from "../services/threatIntel.js";
import {
  getAutoDefenseConfig,
  updateAutoDefenseConfig,
  addGeoBlockRule,
  getGeoBlockRules,
  addToWhitelist,
  isWhitelisted,
  removeFromWhitelist,
  buildAutoDefenseEmbed,
} from "../services/autoDefense.js";
import { getIntegrationConfig, updateIntegrationConfig } from "../services/securityIntegration.js";
import {
  checkYouTubeVideoSafety,
  translateText,
  analyzeImage,
  analyzeText,
} from "../services/googleCloudServices.js";
import { generateSecurityReport, buildReportEmbed } from "../services/reportScheduler.js";
import { isGoogleCloudConfigured } from "../services/googleCloudServices.js";
import logger from "../utils/logger.js";

// ─── /scan ───────────────────────────────────────────────────────────────────

export const scanCommand = new SlashCommandBuilder()
  .setName("scan")
  .setDescription("Scan une URL via VirusTotal + PhishTank + Google Safe Browsing")
  .addStringOption((opt) => opt.setName("url").setDescription("L'URL à scanner").setRequired(true));

export async function handleScan(interaction: ChatInputCommandInteraction): Promise<void> {
  const url = interaction.options.getString("url", true);
  if (!url) return;

  await interaction.deferReply();

  try {
    const result = await scanURL(url);
    const embed = new EmbedBuilder()
      .setTitle("🔍 Scan d'URL")
      .setColor(result.overallMalicious ? 0xff0000 : 0x00ff00)
      .addFields(
        { name: "URL", value: url.slice(0, 200), inline: false },
        {
          name: "Malveillante",
          value: result.overallMalicious ? "⚠️ OUI" : "✅ NON",
          inline: true,
        },
        { name: "Confiance", value: `${result.overallConfidence}%`, inline: true },
        {
          name: "Sources",
          value:
            result.results
              .map((r) => `**${r.source}**: ${r.malicious ? "⚠️" : "✅"} (${r.confidence}%)`)
              .join("\n") || "Aucune",
          inline: false,
        },
      )
      .setTimestamp();

    await interaction.editReply({ embeds: [embed] });
  } catch (error) {
    await interaction.editReply({ content: "Erreur lors du scan." });
    logger.error("[ScanCommand] Error:", error);
  }
}

// ─── /checkip ────────────────────────────────────────────────────────────────

export const checkIpCommand = new SlashCommandBuilder()
  .setName("checkip")
  .setDescription("Vérifie la réputation d'une IP (AbuseIPDB + géolocalisation + proxy/VPN)")
  .addStringOption((opt) =>
    opt.setName("ip").setDescription("L'adresse IP à vérifier").setRequired(true),
  );

export async function handleCheckIp(interaction: ChatInputCommandInteraction): Promise<void> {
  const ip = interaction.options.getString("ip", true);
  if (!ip) return;

  await interaction.deferReply();

  try {
    const result = await checkIPReputation(ip);
    const embed = new EmbedBuilder()
      .setTitle("🌐 Réputation IP")
      .setColor(result.isMalicious ? 0xff0000 : 0x00ff00)
      .addFields(
        { name: "IP", value: ip, inline: true },
        { name: "Malveillante", value: result.isMalicious ? "⚠️ OUI" : "✅ NON", inline: true },
        { name: "Score Abuse", value: `${result.abuseScore}`, inline: true },
        { name: "Pays", value: result.country ?? "Inconnu", inline: true },
        { name: "ISP", value: result.isp ?? "Inconnu", inline: true },
        { name: "Ville", value: result.city ?? "Inconnue", inline: true },
        { name: "Proxy/VPN", value: result.isProxy ? "⚠️ OUI" : "✅ NON", inline: true },
        { name: "Datacenter", value: result.isHosting ? "⚠️ OUI" : "✅ NON", inline: true },
        { name: "Mobile", value: result.isMobile ? "Oui" : "Non", inline: true },
      )
      .setTimestamp();

    await interaction.editReply({ embeds: [embed] });
  } catch (error) {
    await interaction.editReply({ content: "Erreur lors de la vérification." });
    logger.error("[CheckIpCommand] Error:", error);
  }
}

// ─── /threatreport ───────────────────────────────────────────────────────────

export const threatReportCommand = new SlashCommandBuilder()
  .setName("threatreport")
  .setDescription("Génère un rapport de sécurité instantané");

export async function handleThreatReport(interaction: ChatInputCommandInteraction): Promise<void> {
  if (!interaction.guildId) return;
  await interaction.deferReply();

  try {
    const report = await generateSecurityReport(interaction.guildId, "DAILY");
    const embed = buildReportEmbed(report);
    await interaction.editReply({ embeds: [embed] });
  } catch (error) {
    await interaction.editReply({ content: "Erreur lors de la génération du rapport." });
    logger.error("[ThreatReportCommand] Error:", error);
  }
}

// ─── /autodefense ────────────────────────────────────────────────────────────

export const autoDefenseCommand = new SlashCommandBuilder()
  .setName("autodefense")
  .setDescription("Configure l'auto-défense")
  .addStringOption((opt) =>
    opt
      .setName("action")
      .setDescription("Action à effectuer")
      .setRequired(true)
      .addChoices(
        { name: "status", value: "status" },
        { name: "enable-geoblock", value: "enable-geoblock" },
        { name: "disable-geoblock", value: "disable-geoblock" },
        { name: "enable-quarantine", value: "enable-quarantine" },
        { name: "disable-quarantine", value: "disable-quarantine" },
        { name: "enable-escalation", value: "enable-escalation" },
        { name: "disable-escalation", value: "disable-escalation" },
      ),
  )
  .addStringOption((opt) =>
    opt
      .setName("country")
      .setDescription("Code pays pour GeoBlock (ex: CN, RU)")
      .setRequired(false),
  );

export async function handleAutoDefense(interaction: ChatInputCommandInteraction): Promise<void> {
  const action = interaction.options.getString("action", true);
  const country = interaction.options.getString("country") ?? undefined;

  if (action === "status") {
    const config = getAutoDefenseConfig();
    const embed = buildAutoDefenseEmbed(config);
    await interaction.reply({ embeds: [embed] });
    return;
  }

  const updates: Record<string, boolean> = {};
  if (action === "enable-geoblock") updates.geoBlockEnabled = true;
  if (action === "disable-geoblock") updates.geoBlockEnabled = false;
  if (action === "enable-quarantine") updates.quarantineEnabled = true;
  if (action === "disable-quarantine") updates.quarantineEnabled = false;
  if (action === "enable-escalation") updates.escalationEnabled = true;
  if (action === "disable-escalation") updates.escalationEnabled = false;

  if (Object.keys(updates).length > 0) {
    updateAutoDefenseConfig(updates);
  }

  if (action === "enable-geoblock" && country && interaction.guildId) {
    addGeoBlockRule({
      guildId: interaction.guildId,
      countryCode: country.toUpperCase(),
      action: "TIMEOUT",
      reason: `GeoBlock ${country}`,
    });
  }

  await interaction.reply({
    content: `✅ Action effectuée: ${action}${country ? ` (${country})` : ""}`,
    ephemeral: true,
  });
}

// ─── /youtube-check ──────────────────────────────────────────────────────────

export const youtubeCheckCommand = new SlashCommandBuilder()
  .setName("youtube-check")
  .setDescription("Vérifie si une vidéo YouTube est un scam")
  .addStringOption((opt) =>
    opt.setName("url").setDescription("URL de la vidéo YouTube").setRequired(true),
  );

export async function handleYouTubeCheck(interaction: ChatInputCommandInteraction): Promise<void> {
  const url = interaction.options.getString("url", true);
  if (!url) return;

  const match = url.match(
    /(?:youtube\.com\/watch\?v=|youtu\.be\/|youtube\.com\/embed\/)([a-zA-Z0-9_-]{11})/,
  );
  if (!match) {
    await interaction.reply({ content: "URL YouTube invalide.", ephemeral: true });
    return;
  }

  await interaction.deferReply();

  try {
    const safety = await checkYouTubeVideoSafety(match[1]);
    const embed = new EmbedBuilder()
      .setTitle("🎬 Vérification YouTube")
      .setColor(safety.isSuspicious ? 0xff6600 : 0x00ff00)
      .addFields(
        { name: "Vidéo", value: safety.video?.title ?? "Introuvable", inline: false },
        { name: "Chaîne", value: safety.video?.channelTitle ?? "Inconnue", inline: true },
        { name: "Vues", value: safety.video?.viewCount?.toLocaleString() ?? "?", inline: true },
        { name: "Suspecte", value: safety.isSuspicious ? "⚠️ OUI" : "✅ NON", inline: true },
        {
          name: "Raisons",
          value: safety.reasons.length > 0 ? safety.reasons.join("\n") : "Aucune",
          inline: false,
        },
      )
      .setTimestamp();

    await interaction.editReply({ embeds: [embed] });
  } catch (error) {
    await interaction.editReply({ content: "Erreur lors de la vérification." });
  }
}

// ─── /translate ──────────────────────────────────────────────────────────────

export const translateCommand = new SlashCommandBuilder()
  .setName("translate")
  .setDescription("Traduit un texte via Google Translation API")
  .addStringOption((opt) =>
    opt.setName("text").setDescription("Texte à traduire").setRequired(true),
  )
  .addStringOption((opt) =>
    opt.setName("lang").setDescription("Langue cible (ex: fr, en, es)").setRequired(false),
  );

export async function handleTranslate(interaction: ChatInputCommandInteraction): Promise<void> {
  const text = interaction.options.getString("text", true);
  const lang = interaction.options.getString("lang") || "fr";
  if (!text) return;

  await interaction.deferReply();

  try {
    const result = await translateText(text, lang);
    const embed = new EmbedBuilder()
      .setTitle("🌐 Traduction")
      .setColor(0x3498db)
      .addFields(
        {
          name: `Original (${result.detectedSourceLanguage})`,
          value: text.slice(0, 1024),
          inline: false,
        },
        {
          name: `Traduction (${lang})`,
          value: result.translatedText.slice(0, 1024),
          inline: false,
        },
      )
      .setTimestamp();

    await interaction.editReply({ embeds: [embed] });
  } catch (error) {
    await interaction.editReply({ content: "Erreur lors de la traduction." });
  }
}

// ─── /analyze-image ──────────────────────────────────────────────────────────

export const analyzeImageCommand = new SlashCommandBuilder()
  .setName("analyze-image")
  .setDescription("Analyse une image via Google Vision (labels, SafeSearch, OCR)")
  .addStringOption((opt) => opt.setName("url").setDescription("URL de l'image").setRequired(true));

export async function handleAnalyzeImage(interaction: ChatInputCommandInteraction): Promise<void> {
  const url = interaction.options.getString("url", true);
  if (!url) return;

  await interaction.deferReply();

  try {
    const result = await analyzeImage(url);
    const embed = new EmbedBuilder()
      .setTitle("🖼️ Analyse d'image")
      .setColor(result.isUnsafe ? 0xff0000 : 0x00ff00)
      .addFields(
        { name: "Inappropriée", value: result.isUnsafe ? "⚠️ OUI" : "✅ NON", inline: true },
        {
          name: "Labels",
          value:
            result.labels
              .map((l) => `${l.description} (${Math.round(l.score * 100)}%)`)
              .join(", ") || "Aucun",
          inline: false,
        },
        {
          name: "SafeSearch",
          value: result.safeSearch
            ? `Adult: ${result.safeSearch.adult}\nViolence: ${result.safeSearch.violence}\nRacy: ${result.safeSearch.racy}`
            : "N/A",
          inline: false,
        },
        {
          name: "Texte (OCR)",
          value: result.text?.slice(0, 500) || "Aucun texte détecté",
          inline: false,
        },
      )
      .setTimestamp();

    await interaction.editReply({ embeds: [embed] });
  } catch (error) {
    await interaction.editReply({ content: "Erreur lors de l'analyse." });
  }
}

// ─── /analyze-text ───────────────────────────────────────────────────────────

export const analyzeTextCommand = new SlashCommandBuilder()
  .setName("analyze-text")
  .setDescription("Analyse le sentiment d'un texte via Google Natural Language")
  .addStringOption((opt) =>
    opt.setName("text").setDescription("Texte à analyser").setRequired(true),
  );

export async function handleAnalyzeText(interaction: ChatInputCommandInteraction): Promise<void> {
  const text = interaction.options.getString("text", true);

  await interaction.deferReply();

  try {
    const result = await analyzeText(text);
    const embed = new EmbedBuilder()
      .setTitle("📝 Analyse de sentiment")
      .setColor(result.isToxic ? 0xff0000 : 0x00ff00)
      .addFields(
        { name: "Toxique", value: result.isToxic ? "⚠️ OUI" : "✅ NON", inline: true },
        {
          name: "Score toxicité",
          value: `${(result.toxicityScore * 100).toFixed(0)}%`,
          inline: true,
        },
        {
          name: "Sentiment",
          value: result.sentiment
            ? `Score: ${result.sentiment.score}\nMagnitude: ${result.sentiment.magnitude}`
            : "N/A",
          inline: true,
        },
        {
          name: "Entités",
          value: result.entities.map((e) => `${e.name} (${e.type})`).join(", ") || "Aucune",
          inline: false,
        },
        {
          name: "Catégories",
          value:
            result.categories
              .map((c) => `${c.name} (${(c.confidence * 100).toFixed(0)}%)`)
              .join(", ") || "Aucune",
          inline: false,
        },
      )
      .setTimestamp();

    await interaction.editReply({ embeds: [embed] });
  } catch (error) {
    await interaction.editReply({ content: "Erreur lors de l'analyse." });
  }
}

// ─── /security-config ────────────────────────────────────────────────────────

export const securityConfigCommand = new SlashCommandBuilder()
  .setName("security-config")
  .setDescription("Configure les intégrations de sécurité")
  .addStringOption((opt) =>
    opt
      .setName("module")
      .setDescription("Module à configurer")
      .setRequired(true)
      .addChoices(
        { name: "status", value: "status" },
        { name: "enable-image-moderation", value: "enable-image" },
        { name: "disable-image-moderation", value: "disable-image" },
        { name: "enable-sentiment", value: "enable-sentiment" },
        { name: "disable-sentiment", value: "disable-sentiment" },
        { name: "enable-youtube-check", value: "enable-youtube" },
        { name: "disable-youtube-check", value: "disable-youtube" },
        { name: "enable-log-analysis", value: "enable-log" },
        { name: "disable-log-analysis", value: "disable-log" },
      ),
  );

export async function handleSecurityConfig(
  interaction: ChatInputCommandInteraction,
): Promise<void> {
  const module = interaction.options.getString("module", true);

  if (module === "status") {
    const config = getIntegrationConfig();
    const embed = new EmbedBuilder()
      .setTitle("⚙️ Configuration sécurité")
      .setColor(0x3498db)
      .addFields(
        {
          name: "Intégration",
          value: config.enabled ? "✅ Activée" : "❌ Désactivée",
          inline: true,
        },
        { name: "Modération images", value: config.imageModeration ? "✅" : "❌", inline: true },
        { name: "Analyse sentiment", value: config.sentimentAnalysis ? "✅" : "❌", inline: true },
        { name: "Vérification YouTube", value: config.youtubeCheck ? "✅" : "❌", inline: true },
        { name: "Analyse logs", value: config.logAnalysis ? "✅" : "❌", inline: true },
        {
          name: "Google Cloud",
          value: isGoogleCloudConfigured() ? "✅ Configuré" : "❌ Non configuré",
          inline: true,
        },
      )
      .setTimestamp();

    await interaction.reply({ embeds: [embed] });
    return;
  }

  const updates: Partial<{
    imageModeration: boolean;
    sentimentAnalysis: boolean;
    youtubeCheck: boolean;
    logAnalysis: boolean;
  }> = {};

  if (module === "enable-image") updates.imageModeration = true;
  if (module === "disable-image") updates.imageModeration = false;
  if (module === "enable-sentiment") updates.sentimentAnalysis = true;
  if (module === "disable-sentiment") updates.sentimentAnalysis = false;
  if (module === "enable-youtube") updates.youtubeCheck = true;
  if (module === "disable-youtube") updates.youtubeCheck = false;
  if (module === "enable-log") updates.logAnalysis = true;
  if (module === "disable-log") updates.logAnalysis = false;

  updateIntegrationConfig(updates);

  await interaction.reply({
    content: `✅ Configuration mise à jour: ${module}`,
    ephemeral: true,
  });
}

// ─── Export de toutes les commandes ───────────────────────────────────────────

export const securityToolCommands = [
  scanCommand,
  checkIpCommand,
  threatReportCommand,
  autoDefenseCommand,
  youtubeCheckCommand,
  translateCommand,
  analyzeImageCommand,
  analyzeTextCommand,
  securityConfigCommand,
];

export const securityToolHandlers = new Map([
  ["scan", handleScan],
  ["checkip", handleCheckIp],
  ["threatreport", handleThreatReport],
  ["autodefense", handleAutoDefense],
  ["youtube-check", handleYouTubeCheck],
  ["translate", handleTranslate],
  ["analyze-image", handleAnalyzeImage],
  ["analyze-text", handleAnalyzeText],
  ["security-config", handleSecurityConfig],
]);
