/**
 * osint.ts — Commandes /osint (OSINT tools)
 *
 * Subcommands (23) :
 *  /osint search <pseudo>       — Scan rapide 35+ plateformes
 *  /osint sherlock <pseudo>     — Sherlock 480+ sites
 *  /osint maigret <pseudo>      — Maigret 2500+ sites
 *  /osint email <email>         — Holehe 120+ sites
 *  /osint phone <numero>        — PhoneInfoga
 *  /osint domain <domaine>      — crt.sh + WHOIS + DNS + Sublist3r
 *  /osint whois <domaine>       — WHOIS complet
 *  /osint dns <domaine>         — DNS lookup
 *  /osint breach <email>        — h8mail breach check
 *  /osint instagram <pseudo>    — Instaloader
 *  /osint crawl <url>           — Photon crawler
 *  /osint social <query>        — socialscan
 *  /osint harvester <domaine>   — theHarvester
 *  /osint wmn <pseudo>          — WhatsMyName 600+
 *  /osint exif <url>            — EXIF extraction
 *  /osint cms <url>             — CMSeeK
 *  /osint insta-deep <pseudo>   — Osintgram
 *  /osint headers <url>         — HTTP headers
 *  /osint ssl-check <domaine>   — SSL certificate
 *  /osint port-scan <host>      — Port scan
 *  /osint username-gen <mots>   — Username generator
 *  /osint metadata <url>        — URL metadata
 *  /osint tech-detect <url>     — Technology detection
 */

import {
  SlashCommandBuilder,
  ChatInputCommandInteraction,
  EmbedBuilder,
  MessageFlags,
} from "discord.js";
import { config } from "../config.js";
import logger from "../utils/logger.js";
import { PermissionLevel, getPermissionLevel } from "../services/permissions.js";
import {
  searchUsername,
  checkEmail,
  runSherlock,
  runMaigret,
  runHolehe,
  runPhoneInfoga,
  lookupDomain,
  runWhois,
  runDnsLookup,
  runSublist3r,
  runH8mail,
  runInstaloader,
  runPhoton,
  runSocialScan,
  runHarvester,
  runWhatsMyName,
  runExifExtract,
  runCmseek,
  runOsintgram,
} from "../services/osint.js";

export const commands = [
  new SlashCommandBuilder()
    .setName("osint")
    .setDescription("🔍 OSINT — Tools for open-source intelligence")
    .addSubcommand((sub) =>
      sub
        .setName("search")
        .setDescription("Recherche un username sur 35+ plateformes (scan rapide natif)")
        .addStringOption((opt) =>
          opt.setName("pseudo").setDescription("Le pseudo à rechercher").setRequired(true),
        ),
    )
    .addSubcommand((sub) =>
      sub
        .setName("sherlock")
        .setDescription("Recherche un username sur 480+ sites (Sherlock Python)")
        .addStringOption((opt) =>
          opt.setName("pseudo").setDescription("Le pseudo à rechercher").setRequired(true),
        ),
    )
    .addSubcommand((sub) =>
      sub
        .setName("maigret")
        .setDescription("Profiling profond username sur 2500+ sites (Maigret Python)")
        .addStringOption((opt) =>
          opt.setName("pseudo").setDescription("Le pseudo à analyser").setRequired(true),
        ),
    )
    .addSubcommand((sub) =>
      sub
        .setName("email")
        .setDescription("Vérifie sur quels sites un email est inscrit (Holehe 120+ sites)")
        .addStringOption((opt) =>
          opt.setName("email").setDescription("L'email à vérifier").setRequired(true),
        ),
    )
    .addSubcommand((sub) =>
      sub
        .setName("phone")
        .setDescription("Intel sur un numéro de téléphone (PhoneInfoga + libphonenumber)")
        .addStringOption((opt) =>
          opt
            .setName("numero")
            .setDescription("Le numéro (format international +33...)")
            .setRequired(true),
        ),
    )
    .addSubcommand((sub) =>
      sub
        .setName("domain")
        .setDescription("Intel domaine — crt.sh + WHOIS + DNS + Sublist3r")
        .addStringOption((opt) =>
          opt.setName("domaine").setDescription("Le domaine (ex: example.com)").setRequired(true),
        ),
    )
    .addSubcommand((sub) =>
      sub
        .setName("whois")
        .setDescription("WHOIS complet d'un domaine (registrar, dates, NS)")
        .addStringOption((opt) =>
          opt.setName("domaine").setDescription("Le domaine (ex: example.com)").setRequired(true),
        ),
    )
    .addSubcommand((sub) =>
      sub
        .setName("dns")
        .setDescription("DNS lookup complet (A, MX, TXT, NS, CNAME)")
        .addStringOption((opt) =>
          opt.setName("domaine").setDescription("Le domaine (ex: example.com)").setRequired(true),
        ),
    )
    .addSubcommand((sub) =>
      sub
        .setName("breach")
        .setDescription("Vérifie si un email est dans des breaches (h8mail)")
        .addStringOption((opt) =>
          opt.setName("email").setDescription("L'email à vérifier").setRequired(true),
        ),
    )
    .addSubcommand((sub) =>
      sub
        .setName("instagram")
        .setDescription("Intel Instagram — profil, followers, posts (instaloader)")
        .addStringOption((opt) =>
          opt.setName("pseudo").setDescription("Le pseudo Instagram").setRequired(true),
        ),
    )
    .addSubcommand((sub) =>
      sub
        .setName("crawl")
        .setDescription("Crawl un site web — URLs, emails, réseaux sociaux (Photon)")
        .addStringOption((opt) =>
          opt
            .setName("url")
            .setDescription("L'URL à crawler (ex: https://example.com)")
            .setRequired(true),
        ),
    )
    .addSubcommand((sub) =>
      sub
        .setName("social")
        .setDescription("Scan username/email sur plateformes sociales (socialscan)")
        .addStringOption((opt) =>
          opt.setName("query").setDescription("Username ou email à scanner").setRequired(true),
        ),
    )
    .addSubcommand((sub) =>
      sub
        .setName("harvester")
        .setDescription("Recon domaine — emails, hosts, sous-domaines (theHarvester)")
        .addStringOption((opt) =>
          opt.setName("domaine").setDescription("Le domaine (ex: example.com)").setRequired(true),
        ),
    )
    .addSubcommand((sub) =>
      sub
        .setName("wmn")
        .setDescription("Username search complémentaire (WhatsMyName 600+ sites)")
        .addStringOption((opt) =>
          opt.setName("pseudo").setDescription("Le pseudo à rechercher").setRequired(true),
        ),
    )
    .addSubcommand((sub) =>
      sub
        .setName("exif")
        .setDescription("Extrait les métadonnées EXIF d'une image (GPS, appareil, date)")
        .addStringOption((opt) =>
          opt.setName("url").setDescription("URL de l'image à analyser").setRequired(true),
        ),
    )
    .addSubcommand((sub) =>
      sub
        .setName("cms")
        .setDescription("Détecte le CMS et technologies d'un site web (CMSeeK)")
        .addStringOption((opt) =>
          opt
            .setName("url")
            .setDescription("L'URL du site (ex: https://example.com)")
            .setRequired(true),
        ),
    )
    .addSubcommand((sub) =>
      sub
        .setName("insta-deep")
        .setDescription("Instagram deep intel — email, tags, URLs externes (Osintgram)")
        .addStringOption((opt) =>
          opt.setName("pseudo").setDescription("Le pseudo Instagram").setRequired(true),
        ),
    )
    .addSubcommand((sub) =>
      sub
        .setName("headers")
        .setDescription("Récupère les headers HTTP d'une URL")
        .addStringOption((opt) => opt.setName("url").setDescription("L'URL à analyser").setRequired(true)),
    )
    .addSubcommand((sub) =>
      sub
        .setName("ssl-check")
        .setDescription("Vérifie le certificat SSL d'un domaine")
        .addStringOption((opt) => opt.setName("domaine").setDescription("Le domaine (ex: example.com)").setRequired(true)),
    )
    .addSubcommand((sub) =>
      sub
        .setName("port-scan")
        .setDescription("Scan de ports communs sur un host")
        .addStringOption((opt) => opt.setName("host").setDescription("Le host ou IP").setRequired(true)),
    )
    .addSubcommand((sub) =>
      sub
        .setName("username-gen")
        .setDescription("Génère des usernames à partir de mots-clés")
        .addStringOption((opt) => opt.setName("mots").setDescription("Mots-clés séparés par espaces").setRequired(true)),
    )
    .addSubcommand((sub) =>
      sub
        .setName("metadata")
        .setDescription("Métadonnées d'une URL (content-type, taille, server)")
        .addStringOption((opt) => opt.setName("url").setDescription("L'URL").setRequired(true)),
    )
    .addSubcommand((sub) =>
      sub
        .setName("tech-detect")
        .setDescription("Détecte les technologies d'un site web (headers)")
        .addStringOption((opt) => opt.setName("url").setDescription("L'URL du site").setRequired(true)),
    ),
];

export async function handleCommand(interaction: ChatInputCommandInteraction) {
  const sub = interaction.options.getSubcommand();

  // Toutes les sous-commandes : modérateur minimum
  const member = interaction.member;
  if (member && "roles" in member) {
    const permLevel = await getPermissionLevel(member as any);
    if (permLevel < PermissionLevel.MODERATOR && interaction.user.id !== config.ownerId) {
      await interaction.reply({
        content: "❌ Cette commande nécessite au minimum le grade **Modérateur**.",
        flags: [MessageFlags.Ephemeral],
      });
      return;
    }
  } else if (interaction.user.id !== config.ownerId) {
    await interaction.reply({
      content: "❌ Cette commande nécessite au minimum le grade **Modérateur**.",
      flags: [MessageFlags.Ephemeral],
    });
    return;
  }

  switch (sub) {
    case "search":
      return handleSearch(interaction);
    case "sherlock":
      return handleSherlock(interaction);
    case "maigret":
      return handleMaigret(interaction);
    case "email":
      return handleEmail(interaction);
    case "phone":
      return handlePhone(interaction);
    case "domain":
      return handleDomain(interaction);
    case "whois":
      return handleWhois(interaction);
    case "dns":
      return handleDns(interaction);
    case "breach":
      return handleBreach(interaction);
    case "instagram":
      return handleInstagram(interaction);
    case "crawl":
      return handleCrawl(interaction);
    case "social":
      return handleSocial(interaction);
    case "harvester":
      return handleHarvester(interaction);
    case "wmn":
      return handleWmn(interaction);
    case "exif":
      return handleExif(interaction);
    case "cms":
      return handleCms(interaction);
    case "insta-deep":
      return handleInstaDeep(interaction);
    case "headers":
    case "ssl-check":
    case "port-scan":
    case "username-gen":
    case "metadata":
    case "tech-detect": {
      const { handleShadowExtra } = await import("./stubHandlers.js");
      return handleShadowExtra(interaction, undefined as unknown as import("discord.js").Client);
    }
    default:
      await interaction.reply({
        content: "Sous-commande inconnue.",
        flags: [MessageFlags.Ephemeral],
      });
  }
}

// ─── /osint search ───────────────────────────────────────────────────────────

async function handleSearch(interaction: ChatInputCommandInteraction) {
  const username = interaction.options.getString("pseudo", true);
  await interaction.deferReply({ flags: [MessageFlags.Ephemeral] });

  try {
    const results = await searchUsername(username);
    const found = results.filter((r) => r.found);
    const notFound = results.filter((r) => !r.found);

    const embed = new EmbedBuilder()
      .setTitle(`🔍 OSINT — Recherche username: ${username}`)
      .setColor(0x00ff41)
      .setTimestamp();

    if (found.length > 0) {
      const foundText = found.map((r) => `✅ **${r.platform}** — [lien](${r.url})`).join("\n");
      embed.addFields({ name: `🟢 Trouvé (${found.length})`, value: foundText, inline: false });
    }

    if (notFound.length > 0) {
      const notFoundText = notFound
        .slice(0, 15)
        .map((r) => `❌ ${r.platform}`)
        .join("\n");
      embed.addFields({
        name: `🔴 Non trouvé (${notFound.length})`,
        value: notFoundText,
        inline: false,
      });
    }

    embed.setFooter({ text: `${found.length}/${results.length} plateformes — scan terminé` });
    await interaction.editReply({ embeds: [embed] });
  } catch (error) {
    logger.error("[OSINT/search] Erreur:", error);
    await interaction.editReply({ content: "Erreur lors de la recherche." });
  }
}

// ─── /osint sherlock ─────────────────────────────────────────────────────────

async function handleSherlock(interaction: ChatInputCommandInteraction) {
  const username = interaction.options.getString("pseudo", true);
  await interaction.deferReply({ flags: [MessageFlags.Ephemeral] });

  try {
    await interaction.editReply({
      content: `🔍 Sherlock en cours sur **${username}** (480+ sites, ~1-2 min)...`,
    });

    const result = await runSherlock(username);

    const embed = new EmbedBuilder()
      .setTitle(`🔍 Sherlock — ${username} (${result.totalFound} trouvés)`)
      .setColor(0x00ff41)
      .setTimestamp();

    if (result.found.length > 0) {
      const foundText = result.found
        .slice(0, 25)
        .map((r) => `✅ **${r.platform}** — [lien](${r.url})`)
        .join("\n");
      embed.addFields({
        name: `🟢 Trouvé (${result.totalFound})`,
        value: foundText,
        inline: false,
      });
      if (result.totalFound > 25) {
        embed.setFooter({ text: `Affichage des 25 premiers sur ${result.totalFound}` });
      }
    } else {
      embed.setDescription("Aucun profil trouvé sur les 480+ sites scannés.");
    }

    if (result.totalChecked > 0) {
      embed.addFields({
        name: "📊 Stats",
        value: `${result.totalFound}/${result.totalChecked} sites`,
        inline: true,
      });
    }

    await interaction.editReply({ content: "", embeds: [embed] });
  } catch (error) {
    logger.error("[OSINT/sherlock] Erreur:", error);
    await interaction.editReply({ content: "Erreur lors du scan Sherlock." });
  }
}

// ─── /osint maigret ──────────────────────────────────────────────────────────

async function handleMaigret(interaction: ChatInputCommandInteraction) {
  const username = interaction.options.getString("pseudo", true);
  await interaction.deferReply({ flags: [MessageFlags.Ephemeral] });

  try {
    await interaction.editReply({
      content: `🔍 Maigret en cours sur **${username}** (2500+ sites, ~2-3 min)...`,
    });

    const result = await runMaigret(username);

    const embed = new EmbedBuilder()
      .setTitle(`🔍 Maigret — ${username} (${result.totalFound} trouvés)`)
      .setColor(0x00ff41)
      .setTimestamp();

    if (result.found.length > 0) {
      const foundText = result.found
        .slice(0, 25)
        .map(
          (r) =>
            `✅ **${r.platform}** — [lien](${r.url})${r.tags?.length ? ` \`${r.tags.join(", ")}\`` : ""}`,
        )
        .join("\n");
      embed.addFields({
        name: `🟢 Trouvé (${result.totalFound})`,
        value: foundText,
        inline: false,
      });
      if (result.totalFound > 25) {
        embed.setFooter({ text: `Affichage des 25 premiers sur ${result.totalFound}` });
      }
    } else {
      embed.setDescription("Aucun profil trouvé sur les 2500+ sites scannés.");
    }

    if (result.errors > 0) {
      embed.addFields({ name: "⚠️ Erreurs", value: String(result.errors), inline: true });
    }

    await interaction.editReply({ content: "", embeds: [embed] });
  } catch (error) {
    logger.error("[OSINT/maigret] Erreur:", error);
    await interaction.editReply({ content: "Erreur lors du scan Maigret." });
  }
}

// ─── /osint email ────────────────────────────────────────────────────────────

async function handleEmail(interaction: ChatInputCommandInteraction) {
  const email = interaction.options.getString("email", true);
  await interaction.deferReply({ flags: [MessageFlags.Ephemeral] });

  try {
    await interaction.editReply({
      content: `📧 Holehe en cours sur **${email}** (120+ sites, ~1-2 min)...`,
    });

    const [holeheResult, nativeResults] = await Promise.all([runHolehe(email), checkEmail(email)]);

    const embed = new EmbedBuilder()
      .setTitle(`📧 OSINT — Email: ${email}`)
      .setColor(0x00ff41)
      .setTimestamp();

    if (holeheResult.totalRegistered > 0) {
      const holeheText = holeheResult.registered
        .slice(0, 20)
        .map((r) => `✅ **${r.platform}**`)
        .join("\n");
      embed.addFields({
        name: `🟢 Inscrit sur ${holeheResult.totalRegistered} sites (Holehe)`,
        value: holeheText,
        inline: false,
      });
      if (holeheResult.totalRegistered > 20) {
        embed.setFooter({ text: `Affichage des 20 premiers sur ${holeheResult.totalRegistered}` });
      }
    } else {
      embed.addFields({
        name: "🔴 Holehe",
        value: "Aucune inscription trouvée sur les 120+ sites",
        inline: false,
      });
    }

    const nativeRegistered = nativeResults.filter((r) => r.registered);
    if (nativeRegistered.length > 0) {
      embed.addFields({
        name: "🔍 Checks API natifs",
        value: nativeRegistered.map((r) => `✅ **${r.platform}**`).join("\n"),
        inline: false,
      });
    }

    await interaction.editReply({ content: "", embeds: [embed] });
  } catch (error) {
    logger.error("[OSINT/email] Erreur:", error);
    await interaction.editReply({ content: "Erreur lors de la vérification." });
  }
}

// ─── /osint phone ────────────────────────────────────────────────────────────

async function handlePhone(interaction: ChatInputCommandInteraction) {
  const phone = interaction.options.getString("numero", true);
  await interaction.deferReply({ flags: [MessageFlags.Ephemeral] });

  try {
    const result = await runPhoneInfoga(phone);

    const embed = new EmbedBuilder()
      .setTitle(`📱 OSINT — Téléphone: ${phone}`)
      .setColor(0x00ff41)
      .setTimestamp();

    if (result.valid) {
      embed.setColor(0x43b581);
      embed.addFields(
        { name: "✅ Valide", value: "Oui", inline: true },
        { name: "🌍 Pays", value: result.country || "N/A", inline: true },
        { name: "📞 Indicatif", value: result.countryCode || "N/A", inline: true },
        { name: "📡 Opérateur", value: result.carrier || "N/A", inline: true },
        { name: "📋 Type", value: result.lineType || "N/A", inline: true },
        { name: "Format intl.", value: result.internationalFormat || "N/A", inline: true },
      );
    } else {
      embed.setColor(0xff4444);
      embed.setDescription("❌ Numéro invalide ou non reconnu.");
    }

    await interaction.editReply({ embeds: [embed] });
  } catch (error) {
    logger.error("[OSINT/phone] Erreur:", error);
    await interaction.editReply({ content: "Erreur lors du lookup." });
  }
}

// ─── /osint domain ───────────────────────────────────────────────────────────

async function handleDomain(interaction: ChatInputCommandInteraction) {
  const domain = interaction.options.getString("domaine", true);
  await interaction.deferReply({ flags: [MessageFlags.Ephemeral] });

  try {
    await interaction.editReply({
      content: `🌐 Analyse complète de **${domain}** en cours (crt.sh + WHOIS + DNS + Sublist3r)...`,
    });

    const [crtResult, whoisResult, dnsResult, sublistResult] = await Promise.all([
      lookupDomain(domain),
      runWhois(domain),
      runDnsLookup(domain),
      runSublist3r(domain),
    ]);

    const embed = new EmbedBuilder()
      .setTitle(`🌐 Intel domaine — ${domain}`)
      .setColor(0x00ff41)
      .setTimestamp();

    if (crtResult.subdomains.length > 0) {
      const subdomainText = crtResult.subdomains
        .slice(0, 15)
        .map((s) => `• **${s.domain}**`)
        .join("\n");
      embed.addFields({
        name: `🔍 crt.sh (${crtResult.totalFound} sous-domaines)`,
        value: subdomainText,
        inline: false,
      });
    }

    if (sublistResult.total > 0) {
      const sublistText = sublistResult.subdomains
        .slice(0, 10)
        .map((s) => `• ${s}`)
        .join("\n");
      embed.addFields({
        name: `🔍 Sublist3r (${sublistResult.total} sous-domaines)`,
        value: sublistText,
        inline: false,
      });
    }

    if (whoisResult.registrar || whoisResult.creationDate) {
      embed.addFields(
        { name: "🏢 Registrar", value: whoisResult.registrar || "N/A", inline: true },
        { name: "📅 Création", value: whoisResult.creationDate || "N/A", inline: true },
        { name: "⏰ Expiration", value: whoisResult.expirationDate || "N/A", inline: true },
      );
    }

    if (dnsResult.aRecords.length > 0) {
      embed.addFields({
        name: "🔗 A Records",
        value: dnsResult.aRecords.join(", "),
        inline: false,
      });
    }
    if (dnsResult.mxRecords.length > 0) {
      embed.addFields({
        name: "📬 MX",
        value: dnsResult.mxRecords.slice(0, 3).join("\n"),
        inline: false,
      });
    }
    if (dnsResult.txtRecords.length > 0) {
      embed.addFields({
        name: "📝 TXT",
        value: dnsResult.txtRecords.slice(0, 2).join("\n").slice(0, 512),
        inline: false,
      });
    }

    const totalSubs = crtResult.totalFound + sublistResult.total;
    embed.setFooter({ text: `${totalSubs} sous-domaines trouvés au total` });

    await interaction.editReply({ content: "", embeds: [embed] });
  } catch (error) {
    logger.error("[OSINT/domain] Erreur:", error);
    await interaction.editReply({ content: "Erreur lors de la recherche." });
  }
}

// ─── /osint whois ────────────────────────────────────────────────────────────

async function handleWhois(interaction: ChatInputCommandInteraction) {
  const domain = interaction.options.getString("domaine", true);
  await interaction.deferReply({ flags: [MessageFlags.Ephemeral] });

  try {
    const result = await runWhois(domain);

    const embed = new EmbedBuilder()
      .setTitle(`📋 WHOIS — ${domain}`)
      .setColor(0x00ff41)
      .setTimestamp();

    if (result.registrar || result.creationDate) {
      embed.addFields(
        { name: "🏢 Registrar", value: result.registrar || "N/A", inline: true },
        { name: "📅 Création", value: result.creationDate || "N/A", inline: true },
        { name: "⏰ Expiration", value: result.expirationDate || "N/A", inline: true },
        { name: "🔄 Dernière MAJ", value: result.updatedDate || "N/A", inline: true },
        { name: "🏢 Organisation", value: result.org || "N/A", inline: true },
        { name: "🌍 Pays", value: result.country || "N/A", inline: true },
      );

      if (result.nameServers?.length) {
        embed.addFields({
          name: "📡 Name Servers",
          value: result.nameServers.join("\n"),
          inline: false,
        });
      }
      if (result.emails?.length) {
        embed.addFields({ name: "📧 Emails", value: result.emails.join("\n"), inline: false });
      }
      if (result.status?.length) {
        embed.addFields({ name: "📊 Status", value: result.status.join("\n"), inline: false });
      }
    } else {
      embed.setDescription("Aucune donnée WHOIS trouvée pour ce domaine.");
    }

    await interaction.editReply({ embeds: [embed] });
  } catch (error) {
    logger.error("[OSINT/whois] Erreur:", error);
    await interaction.editReply({ content: "Erreur lors du WHOIS." });
  }
}

// ─── /osint dns ──────────────────────────────────────────────────────────────

async function handleDns(interaction: ChatInputCommandInteraction) {
  const domain = interaction.options.getString("domaine", true);
  await interaction.deferReply({ flags: [MessageFlags.Ephemeral] });

  try {
    const result = await runDnsLookup(domain);

    const embed = new EmbedBuilder()
      .setTitle(`🌐 DNS — ${domain}`)
      .setColor(0x00ff41)
      .setTimestamp();

    if (result.aRecords.length > 0) {
      embed.addFields({ name: "🔗 A Records", value: result.aRecords.join("\n"), inline: false });
    }
    if (result.mxRecords.length > 0) {
      embed.addFields({ name: "📬 MX Records", value: result.mxRecords.join("\n"), inline: false });
    }
    if (result.txtRecords.length > 0) {
      embed.addFields({
        name: "📝 TXT Records",
        value: result.txtRecords.join("\n").slice(0, 1024),
        inline: false,
      });
    }
    if (result.nsRecords.length > 0) {
      embed.addFields({ name: "📡 NS Records", value: result.nsRecords.join("\n"), inline: false });
    }
    if (result.cnameRecords.length > 0) {
      embed.addFields({ name: "🔗 CNAME", value: result.cnameRecords.join("\n"), inline: false });
    }

    if (result.aRecords.length === 0 && result.mxRecords.length === 0) {
      embed.setDescription("Aucun enregistrement DNS trouvé.");
    }

    await interaction.editReply({ embeds: [embed] });
  } catch (error) {
    logger.error("[OSINT/dns] Erreur:", error);
    await interaction.editReply({ content: "Erreur lors du DNS lookup." });
  }
}

// ─── /osint breach ───────────────────────────────────────────────────────────

async function handleBreach(interaction: ChatInputCommandInteraction) {
  const email = interaction.options.getString("email", true);
  await interaction.deferReply({ flags: [MessageFlags.Ephemeral] });

  try {
    await interaction.editReply({
      content: `🔍 Recherche de breaches pour **${email}** en cours...`,
    });

    const result = await runH8mail(email);

    const embed = new EmbedBuilder()
      .setTitle(`💥 Breach Check — ${email}`)
      .setColor(result.totalBreaches > 0 ? 0xff3344 : 0x43b581)
      .setTimestamp();

    if (result.totalBreaches > 0) {
      embed.addFields({
        name: `🔴 Trouvé dans ${result.totalBreaches} breach(es)`,
        value: result.breaches
          .slice(0, 15)
          .map((b) => `• **${b.source}**${b.data ? `\n  \`${b.data}\`` : ""}`)
          .join("\n"),
        inline: false,
      });
    } else {
      embed.setDescription("✅ Aucune breach trouvée pour cet email.");
    }

    await interaction.editReply({ content: "", embeds: [embed] });
  } catch (error) {
    logger.error("[OSINT/breach] Erreur:", error);
    await interaction.editReply({ content: "Erreur lors de la recherche." });
  }
}

// ─── /osint instagram ────────────────────────────────────────────────────────

async function handleInstagram(interaction: ChatInputCommandInteraction) {
  const username = interaction.options.getString("pseudo", true);
  await interaction.deferReply({ flags: [MessageFlags.Ephemeral] });

  try {
    const result = await runInstaloader(username);

    const embed = new EmbedBuilder()
      .setTitle(`📸 Instagram — @${username}`)
      .setColor(0x00ff41)
      .setTimestamp();

    if (result.found) {
      embed.setColor(0xc13584);
      embed.addFields(
        { name: "👤 Nom", value: result.fullName || username, inline: true },
        { name: "👥 Followers", value: result.followers || "N/A", inline: true },
        { name: "➡️ Following", value: result.following || "N/A", inline: true },
        { name: "📷 Posts", value: result.posts || "N/A", inline: true },
        { name: "🔒 Privé", value: result.isPrivate ? "Oui" : "Non", inline: true },
        { name: "✅ Vérifié", value: result.isVerified ? "Oui" : "Non", inline: true },
      );
      if (result.bio) {
        embed.addFields({ name: "📝 Bio", value: result.bio.slice(0, 1024), inline: false });
      }
      if (result.profilePicUrl) {
        embed.setThumbnail(result.profilePicUrl);
      }
    } else {
      embed.setColor(0xff4444);
      embed.setDescription(`❌ Profil @${username} introuvable ou privé.`);
    }

    await interaction.editReply({ embeds: [embed] });
  } catch (error) {
    logger.error("[OSINT/instagram] Erreur:", error);
    await interaction.editReply({ content: "Erreur lors de la recherche Instagram." });
  }
}

// ─── /osint crawl ────────────────────────────────────────────────────────────

async function handleCrawl(interaction: ChatInputCommandInteraction) {
  const url = interaction.options.getString("url", true);
  await interaction.deferReply({ flags: [MessageFlags.Ephemeral] });

  try {
    await interaction.editReply({
      content: `🕷️ Crawl de **${url}** en cours (profondeur 3, ~1-2 min)...`,
    });

    const result = await runPhoton(url);

    const embed = new EmbedBuilder()
      .setTitle(`🕷️ Crawl — ${url}`)
      .setColor(0x00ff41)
      .setTimestamp();

    embed.addFields({ name: "📊 Total URLs", value: String(result.total), inline: true });

    if (result.emails.length > 0) {
      embed.addFields({
        name: `📧 Emails (${result.emails.length})`,
        value: result.emails.slice(0, 10).join("\n"),
        inline: false,
      });
    }
    if (result.socialLinks.length > 0) {
      embed.addFields({
        name: `📱 Réseaux sociaux (${result.socialLinks.length})`,
        value: result.socialLinks.slice(0, 10).join("\n"),
        inline: false,
      });
    }
    if (result.internalUrls.length > 0) {
      embed.addFields({
        name: `🔗 URLs internes (${result.internalUrls.length})`,
        value: result.internalUrls.slice(0, 10).join("\n").slice(0, 1024),
        inline: false,
      });
    }
    if (result.externalUrls.length > 0) {
      embed.addFields({
        name: `🌐 URLs externes (${result.externalUrls.length})`,
        value: result.externalUrls.slice(0, 10).join("\n").slice(0, 1024),
        inline: false,
      });
    }
    if (result.files.length > 0) {
      embed.addFields({
        name: `📁 Fichiers (${result.files.length})`,
        value: result.files.slice(0, 10).join("\n"),
        inline: false,
      });
    }

    await interaction.editReply({ content: "", embeds: [embed] });
  } catch (error) {
    logger.error("[OSINT/crawl] Erreur:", error);
    await interaction.editReply({ content: "Erreur lors du crawl." });
  }
}

// ─── /osint social ───────────────────────────────────────────────────────────

async function handleSocial(interaction: ChatInputCommandInteraction) {
  const query = interaction.options.getString("query", true);
  await interaction.deferReply({ flags: [MessageFlags.Ephemeral] });

  try {
    const result = await runSocialScan(query);

    const embed = new EmbedBuilder()
      .setTitle(`📱 SocialScan — ${query}`)
      .setColor(0x00ff41)
      .setTimestamp();

    const found = result.results.filter((r) => r.found);
    const notFound = result.results.filter((r) => !r.found && r.valid);

    if (found.length > 0) {
      embed.addFields({
        name: `🟢 Trouvé (${found.length})`,
        value: found
          .map((r) => `✅ **${r.platform}**${r.url ? ` — [lien](${r.url})` : ""}`)
          .join("\n"),
        inline: false,
      });
    }
    if (notFound.length > 0) {
      embed.addFields({
        name: `🔴 Non trouvé (${notFound.length})`,
        value: notFound
          .map((r) => `❌ ${r.platform}`)
          .join("\n")
          .slice(0, 1024),
        inline: false,
      });
    }
    if (found.length === 0 && notFound.length === 0) {
      embed.setDescription("Aucun résultat.");
    }

    embed.setFooter({ text: `${found.length}/${result.results.length} plateformes` });
    await interaction.editReply({ embeds: [embed] });
  } catch (error) {
    logger.error("[OSINT/social] Erreur:", error);
    await interaction.editReply({ content: "Erreur lors du scan." });
  }
}

// ─── /osint harvester ────────────────────────────────────────────────────────

async function handleHarvester(interaction: ChatInputCommandInteraction) {
  const domain = interaction.options.getString("domaine", true);
  await interaction.deferReply({ flags: [MessageFlags.Ephemeral] });

  try {
    await interaction.editReply({
      content: `🌾 theHarvester en cours sur **${domain}** (emails, hosts, sous-domaines, ~1-2 min)...`,
    });

    const result = await runHarvester(domain);

    const embed = new EmbedBuilder()
      .setTitle(`🌾 theHarvester — ${domain}`)
      .setColor(0x00ff41)
      .setTimestamp();

    embed.addFields({ name: "📊 Total", value: String(result.total), inline: true });

    if (result.emails.length > 0) {
      embed.addFields({
        name: `📧 Emails (${result.emails.length})`,
        value: result.emails.slice(0, 15).join("\n"),
        inline: false,
      });
    }
    if (result.hosts.length > 0) {
      embed.addFields({
        name: `🖥️ Hosts (${result.hosts.length})`,
        value: result.hosts.slice(0, 15).join("\n").slice(0, 1024),
        inline: false,
      });
    }
    if (result.subdomains.length > 0) {
      embed.addFields({
        name: `🔍 Sous-domaines (${result.subdomains.length})`,
        value: result.subdomains.slice(0, 10).join("\n"),
        inline: false,
      });
    }

    if (result.total === 0) {
      embed.setDescription("Aucune donnée trouvée pour ce domaine.");
    }

    await interaction.editReply({ content: "", embeds: [embed] });
  } catch (error) {
    logger.error("[OSINT/harvester] Erreur:", error);
    await interaction.editReply({ content: "Erreur lors de la recon." });
  }
}

// ─── /osint wmn ──────────────────────────────────────────────────────────────

async function handleWmn(interaction: ChatInputCommandInteraction) {
  const username = interaction.options.getString("pseudo", true);
  await interaction.deferReply({ flags: [MessageFlags.Ephemeral] });

  try {
    await interaction.editReply({
      content: `🔍 WhatsMyName en cours sur **${username}** (600+ sites, ~1-2 min)...`,
    });

    const result = await runWhatsMyName(username);

    const embed = new EmbedBuilder()
      .setTitle(`🔍 WhatsMyName — ${username} (${result.totalFound} trouvés)`)
      .setColor(0x00ff41)
      .setTimestamp();

    if (result.found.length > 0) {
      const foundText = result.found
        .slice(0, 25)
        .map(
          (r) => `✅ **${r.platform}**${r.category ? ` \`${r.category}\`` : ""} — [lien](${r.url})`,
        )
        .join("\n");
      embed.addFields({
        name: `🟢 Trouvé (${result.totalFound})`,
        value: foundText,
        inline: false,
      });
      if (result.totalFound > 25) {
        embed.setFooter({ text: `Affichage des 25 premiers sur ${result.totalFound}` });
      }
    } else {
      embed.setDescription("Aucun profil trouvé sur les 600+ sites scannés.");
    }

    await interaction.editReply({ content: "", embeds: [embed] });
  } catch (error) {
    logger.error("[OSINT/wmn] Erreur:", error);
    await interaction.editReply({ content: "Erreur lors du scan." });
  }
}

// ─── /osint exif ─────────────────────────────────────────────────────────────

async function handleExif(interaction: ChatInputCommandInteraction) {
  const imageUrl = interaction.options.getString("url", true);
  await interaction.deferReply({ flags: [MessageFlags.Ephemeral] });

  try {
    const result = await runExifExtract(imageUrl);

    const embed = new EmbedBuilder()
      .setTitle(`📷 EXIF — ${imageUrl.slice(0, 50)}...`)
      .setColor(result.hasExif ? 0x43b581 : 0xff4444)
      .setTimestamp();

    if (result.hasExif) {
      embed.addFields({
        name: "📊 Métadonnées",
        value: result.metadata
          .slice(0, 15)
          .map((m) => `• **${m.tag}**: \`${m.value.slice(0, 80)}\``)
          .join("\n"),
        inline: false,
      });

      if (result.gpsCoordinates) {
        embed.addFields({
          name: "📍 GPS détecté",
          value: `Lat: ${result.gpsCoordinates.latitude}\nLon: ${result.gpsCoordinates.longitude}`,
          inline: false,
        });
        embed.setColor(0xff3344);
      }
    } else {
      embed.setDescription("❌ Aucune métadonnée EXIF trouvée dans cette image.");
    }

    await interaction.editReply({ embeds: [embed] });
  } catch (error) {
    logger.error("[OSINT/exif] Erreur:", error);
    await interaction.editReply({ content: "Erreur lors de l'extraction EXIF." });
  }
}

// ─── /osint cms ──────────────────────────────────────────────────────────────

async function handleCms(interaction: ChatInputCommandInteraction) {
  const url = interaction.options.getString("url", true);
  await interaction.deferReply({ flags: [MessageFlags.Ephemeral] });

  try {
    const result = await runCmseek(url);

    const embed = new EmbedBuilder()
      .setTitle(`🔧 CMS Detection — ${url}`)
      .setColor(0x00ff41)
      .setTimestamp();

    embed.addFields(
      { name: "📦 CMS", value: result.cms, inline: true },
      { name: "🔢 Version", value: result.version || "N/A", inline: true },
      { name: "🖥️ Server", value: result.server || "N/A", inline: true },
    );

    if (result.technologies.length > 0) {
      embed.addFields({
        name: "⚙️ Technologies",
        value: result.technologies.map((t) => `• ${t}`).join("\n"),
        inline: false,
      });
    }

    if (result.poweredBy) {
      embed.addFields({ name: "⚡ Powered By", value: result.poweredBy, inline: true });
    }

    await interaction.editReply({ embeds: [embed] });
  } catch (error) {
    logger.error("[OSINT/cms] Erreur:", error);
    await interaction.editReply({ content: "Erreur lors de la détection CMS." });
  }
}

// ─── /osint insta-deep ───────────────────────────────────────────────────────

async function handleInstaDeep(interaction: ChatInputCommandInteraction) {
  const username = interaction.options.getString("pseudo", true);
  await interaction.deferReply({ flags: [MessageFlags.Ephemeral] });

  try {
    const result = await runOsintgram(username);

    const embed = new EmbedBuilder()
      .setTitle(`📸 Instagram Deep — @${username}`)
      .setColor(0x00ff41)
      .setTimestamp();

    if (result.found) {
      embed.setColor(0xc13584);
      embed.addFields(
        { name: "👤 Nom", value: result.fullName || username, inline: true },
        { name: "👥 Followers", value: result.followers || "N/A", inline: true },
        { name: "➡️ Following", value: result.following || "N/A", inline: true },
        { name: "📷 Posts", value: result.posts || "N/A", inline: true },
        { name: "🔒 Privé", value: result.isPrivate ? "Oui" : "Non", inline: true },
        { name: "✅ Vérifié", value: result.isVerified ? "Oui" : "Non", inline: true },
      );
      if (result.bio) {
        embed.addFields({ name: "📝 Bio", value: result.bio.slice(0, 1024), inline: false });
      }
      if (result.email) {
        embed.addFields({ name: "📧 Email", value: result.email, inline: true });
      }
      if (result.externalUrls?.length) {
        embed.addFields({
          name: "🔗 URLs externes",
          value: result.externalUrls.filter(Boolean).join("\n"),
          inline: false,
        });
      }
      if (result.tags?.length) {
        embed.addFields({
          name: `🏷️ Tags (${result.tags.length})`,
          value: result.tags
            .slice(0, 15)
            .map((t) => `#${t}`)
            .join(" "),
          inline: false,
        });
      }
      if (result.profilePicUrl) {
        embed.setThumbnail(result.profilePicUrl);
      }
    } else {
      embed.setColor(0xff4444);
      embed.setDescription(`❌ Profil @${username} introuvable ou privé.`);
    }

    await interaction.editReply({ embeds: [embed] });
  } catch (error) {
    logger.error("[OSINT/insta-deep] Erreur:", error);
    await interaction.editReply({ content: "Erreur lors de la recherche Instagram." });
  }
}
