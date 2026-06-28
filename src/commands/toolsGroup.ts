import { ChatInputCommandInteraction, SlashCommandBuilder, Client, EmbedBuilder } from "discord.js";
import { handleCommand as handleUtility } from "./utility.js";
import { handleCommand as handleVocal } from "./vocal.js";
import { handleCommand as handleMp3 } from "./mp3.js";
import { handleCommand as handleTts } from "./tts.js";
import { handleCommand as handleRecherche } from "./recherche.js";
import { handleCommand as handleAudioPanel } from "./audioPanel.js";
import {
  getWeather,
  getQrCodeUrl,
  shortenUrl,
  defineWord,
  getIpInfo,
  generatePassword,
  convertColor,
  encodeBase64,
  decodeBase64,
  makeTimestamp,
} from "../services/freeApis.js";

export const commands = [
  new SlashCommandBuilder()
    .setName("tools")
    .setDescription("Outils et utilitaires")
    .addSubcommand((sc) => sc.setName("embed-builder").setDescription("Crée un embed personnalisé"))
    .addSubcommand((sc) =>
      sc
        .setName("say")
        .setDescription("Fait parler le bot")
        .addChannelOption((o) => o.setName("salon").setDescription("Salon cible").setRequired(true))
        .addStringOption((o) =>
          o.setName("message").setDescription("Le message").setRequired(true),
        ),
    )
    .addSubcommand((sc) =>
      sc
        .setName("vocal")
        .setDescription("Gère la connexion vocale")
        .addStringOption((o) =>
          o.setName("action").setDescription("Action (rejoindre/quitter)").setRequired(true),
        ),
    )
    .addSubcommand((sc) =>
      sc
        .setName("mp3")
        .setDescription("Joue un son en vocal")
        .addStringOption((o) => o.setName("nom").setDescription("Nom du son").setRequired(true)),
    )
    .addSubcommand((sc) =>
      sc
        .setName("tts")
        .setDescription("Lit du texte à voix haute en vocal")
        .addStringOption((o) => o.setName("texte").setDescription("Le texte").setRequired(true))
        .addStringOption((o) => o.setName("langue").setDescription("Langue").setRequired(false)),
    )
    .addSubcommand((sc) =>
      sc
        .setName("recherche")
        .setDescription("Recherche sur Internet")
        .addStringOption((o) => o.setName("sujet").setDescription("Le sujet").setRequired(true)),
    )
    .addSubcommand((sc) => sc.setName("audio-effects").setDescription("Effets audio"))
    .addSubcommand((sc) => sc.setName("radio-stop").setDescription("Arrête la radio"))
    // ─── Nouveaux outils (APIs gratuites sans clé) ───
    .addSubcommand((sc) =>
      sc
        .setName("weather")
        .setDescription("Météo d'une ville (Open-Meteo, sans clé)")
        .addStringOption((o) =>
          o.setName("ville").setDescription("Nom de la ville").setRequired(true),
        ),
    )
    .addSubcommand((sc) =>
      sc
        .setName("qr-code")
        .setDescription("Génère un QR code")
        .addStringOption((o) =>
          o.setName("texte").setDescription("Texte ou URL à encoder").setRequired(true),
        )
        .addIntegerOption((o) =>
          o
            .setName("taille")
            .setDescription("Taille en pixels (défaut: 300)")
            .setRequired(false)
            .setMinValue(100)
            .setMaxValue(1000),
        ),
    )
    .addSubcommand((sc) =>
      sc
        .setName("url-shorten")
        .setDescription("Raccourcit une URL (is.gd, sans clé)")
        .addStringOption((o) =>
          o.setName("url").setDescription("L'URL à raccourcir").setRequired(true),
        ),
    )
    .addSubcommand((sc) =>
      sc
        .setName("define")
        .setDescription("Définition d'un mot (dictionnaire EN, sans clé)")
        .addStringOption((o) =>
          o.setName("mot").setDescription("Le mot à définir").setRequired(true),
        ),
    )
    .addSubcommand((sc) =>
      sc
        .setName("ipinfo")
        .setDescription("Géolocalisation d'une IP (ip-api.com, sans clé)")
        .addStringOption((o) => o.setName("ip").setDescription("Adresse IP").setRequired(true)),
    )
    .addSubcommand((sc) =>
      sc
        .setName("password-gen")
        .setDescription("Génère un mot de passe sécurisé")
        .addIntegerOption((o) =>
          o
            .setName("longueur")
            .setDescription("Longueur (défaut: 16)")
            .setRequired(false)
            .setMinValue(8)
            .setMaxValue(128),
        )
        .addBooleanOption((o) =>
          o
            .setName("symboles")
            .setDescription("Inclure des symboles (défaut: true)")
            .setRequired(false),
        ),
    )
    .addSubcommand((sc) =>
      sc
        .setName("color")
        .setDescription("Convertit une couleur (HEX/RGB/HSL)")
        .addStringOption((o) =>
          o
            .setName("valeur")
            .setDescription("Couleur (ex: #ff5733, rgb(255,87,51), hsl(11,100%,60%))")
            .setRequired(true),
        ),
    )
    .addSubcommand((sc) =>
      sc
        .setName("base64")
        .setDescription("Encode/décode en Base64")
        .addStringOption((o) =>
          o
            .setName("action")
            .setDescription("Encoder ou décoder")
            .setRequired(true)
            .addChoices({ name: "Encoder", value: "encode" }, { name: "Décoder", value: "decode" }),
        )
        .addStringOption((o) => o.setName("texte").setDescription("Le texte").setRequired(true)),
    )
    .addSubcommand((sc) =>
      sc
        .setName("timestamp")
        .setDescription("Génère un timestamp Discord")
        .addStringOption((o) =>
          o
            .setName("date")
            .setDescription("Date (ex: 2025-12-25, 2025-12-25T18:00:00)")
            .setRequired(true),
        )
        .addStringOption((o) =>
          o
            .setName("format")
            .setDescription("Format d'affichage")
            .setRequired(false)
            .addChoices(
              { name: "Court (25 Dec 2025)", value: "d" },
              { name: "Long (25 December 2025)", value: "D" },
              { name: "Heure courte (18:00)", value: "t" },
              { name: "Heure longue (18:00:00)", value: "T" },
              { name: "Complet (25 December 2025 18:00)", value: "f" },
              { name: "Complet + jour (Thursday, 25 December 2025 18:00)", value: "F" },
              { name: "Relatif (dans 3 mois)", value: "R" },
            ),
        ),
    )
    .addSubcommand((sc) =>
      sc
        .setName("github")
        .setDescription("Recherche des repos GitHub (API publique, sans clé)")
        .addStringOption((o) =>
          o.setName("requete").setDescription("Termes de recherche").setRequired(true),
        ),
    )
    .toJSON(),
];

export async function handleCommand(interaction: ChatInputCommandInteraction, client: unknown) {
  const dc = client as Client;
  const action = interaction.options.getSubcommand();
  Object.defineProperty(interaction, "commandName", { value: action, writable: true });

  if (action === "embed-builder" || action === "say") {
    await handleUtility(interaction, dc);
  } else if (action === "vocal") {
    await handleVocal(interaction);
  } else if (action === "mp3") {
    await handleMp3(interaction);
  } else if (action === "tts") {
    await handleTts(interaction);
  } else if (action === "recherche") {
    await handleRecherche(interaction);
  } else if (action === "audio-effects" || action === "radio-stop") {
    await handleAudioPanel(interaction);
  } else if (action === "weather") {
    await handleWeather(interaction);
  } else if (action === "qr-code") {
    await handleQrCode(interaction);
  } else if (action === "url-shorten") {
    await handleUrlShorten(interaction);
  } else if (action === "define") {
    await handleDefine(interaction);
  } else if (action === "ipinfo") {
    await handleIpInfo(interaction);
  } else if (action === "password-gen") {
    await handlePasswordGen(interaction);
  } else if (action === "color") {
    await handleColor(interaction);
  } else if (action === "base64") {
    await handleBase64(interaction);
  } else if (action === "timestamp") {
    await handleTimestamp(interaction);
  } else if (action === "github") {
    await handleGithub(interaction);
  }
}

async function handleWeather(interaction: ChatInputCommandInteraction): Promise<void> {
  const city = interaction.options.getString("ville", true);
  await interaction.deferReply();
  const weather = await getWeather(city);
  if (!weather) {
    await interaction.editReply(`❌ Ville "${city}" introuvable.`);
    return;
  }
  const embed = new EmbedBuilder()
    .setTitle(`🌤️ Météo — ${weather.city}`)
    .addFields(
      { name: "🌡️ Température", value: `${weather.temperature}°C`, inline: true },
      { name: "💨 Vent", value: `${weather.windspeed} km/h`, inline: true },
      { name: "☁️ Conditions", value: weather.description, inline: true },
    )
    .setColor(0x3498db);
  await interaction.editReply({ embeds: [embed] });
}

async function handleQrCode(interaction: ChatInputCommandInteraction): Promise<void> {
  const text = interaction.options.getString("texte", true);
  const size = interaction.options.getInteger("taille") ?? 300;
  const qrUrl = getQrCodeUrl(text, size);
  const embed = new EmbedBuilder()
    .setTitle("📱 QR Code")
    .setDescription(`\`\`\`${text}\`\`\``)
    .setImage(qrUrl)
    .setColor(0x2c2f33);
  await interaction.reply({ embeds: [embed] });
}

async function handleUrlShorten(interaction: ChatInputCommandInteraction): Promise<void> {
  const url = interaction.options.getString("url", true);
  await interaction.deferReply();
  const short = await shortenUrl(url);
  if (!short) {
    await interaction.editReply("❌ Impossible de raccourcir cette URL.");
    return;
  }
  const embed = new EmbedBuilder()
    .setTitle("🔗 URL raccourcie")
    .addFields({ name: "Original", value: url.slice(0, 100) }, { name: "Raccourci", value: short })
    .setColor(0x5865f2);
  await interaction.editReply({ embeds: [embed] });
}

async function handleDefine(interaction: ChatInputCommandInteraction): Promise<void> {
  const word = interaction.options.getString("mot", true);
  await interaction.deferReply();
  const definitions = await defineWord(word);
  if (!definitions.length) {
    await interaction.editReply(`❌ Aucune définition trouvée pour "${word}".`);
    return;
  }
  const embed = new EmbedBuilder().setTitle(`📖 Définition — ${word}`).setColor(0x2ecc71);
  definitions.forEach((d) => {
    embed.addFields({
      name: `(${d.partOfSpeech})`,
      value: `${d.definition}${d.example ? `\n\n*Exemple: ${d.example}*` : ""}`,
    });
  });
  await interaction.editReply({ embeds: [embed] });
}

async function handleIpInfo(interaction: ChatInputCommandInteraction): Promise<void> {
  const ip = interaction.options.getString("ip", true);
  await interaction.deferReply();
  const info = await getIpInfo(ip);
  if (!info) {
    await interaction.editReply(`❌ IP "${ip}" introuvable ou invalide.`);
    return;
  }
  const embed = new EmbedBuilder()
    .setTitle(`🌐 IP Info — ${info.ip}`)
    .addFields(
      { name: "📍 Ville", value: info.city, inline: true },
      { name: "🗺️ Région", value: info.region, inline: true },
      { name: "🏳️ Pays", value: info.country, inline: true },
      { name: "📡 ISP", value: info.isp },
      { name: "📐 Coordonnées", value: `${info.lat}, ${info.lon}` },
    )
    .setColor(0xe74c3c);
  await interaction.editReply({ embeds: [embed] });
}

async function handlePasswordGen(interaction: ChatInputCommandInteraction): Promise<void> {
  const length = interaction.options.getInteger("longueur") ?? 16;
  const useSymbols = interaction.options.getBoolean("symboles") ?? true;
  const password = generatePassword(length, useSymbols);
  const embed = new EmbedBuilder()
    .setTitle("🔐 Mot de passe généré")
    .setDescription(`||${password}||`)
    .addFields(
      { name: "Longueur", value: String(length), inline: true },
      { name: "Symboles", value: useSymbols ? "Oui" : "Non", inline: true },
    )
    .setFooter({ text: "Mot de passe caché — clique pour révéler" })
    .setColor(0x2c2f33);
  await interaction.reply({ embeds: [embed], ephemeral: true });
}

async function handleColor(interaction: ChatInputCommandInteraction): Promise<void> {
  const input = interaction.options.getString("valeur", true);
  const result = convertColor(input);
  if (!result) {
    await interaction.reply({
      content: "❌ Format invalide. Utilise: `#ff5733`, `rgb(255,87,51)`, ou `hsl(11,100%,60%)`",
      ephemeral: true,
    });
    return;
  }
  const embed = new EmbedBuilder()
    .setTitle("🎨 Conversion de couleur")
    .addFields(
      { name: "HEX", value: result.hex, inline: true },
      { name: "RGB", value: result.rgb, inline: true },
      { name: "HSL", value: result.hsl, inline: true },
    )
    .setColor(result.hex as `#${string}`);
  await interaction.reply({ embeds: [embed] });
}

async function handleBase64(interaction: ChatInputCommandInteraction): Promise<void> {
  const action = interaction.options.getString("action", true);
  const text = interaction.options.getString("texte", true);
  if (action === "encode") {
    const encoded = encodeBase64(text);
    const embed = new EmbedBuilder()
      .setTitle("📝 Base64 — Encodage")
      .addFields(
        { name: "Entrée", value: text.slice(0, 1024) },
        { name: "Résultat", value: `\`\`\`${encoded}\`\`\`` },
      )
      .setColor(0x3498db);
    await interaction.reply({ embeds: [embed] });
  } else {
    const decoded = decodeBase64(text);
    if (!decoded) {
      await interaction.reply({ content: "❌ Décodage échoué.", ephemeral: true });
      return;
    }
    const embed = new EmbedBuilder()
      .setTitle("📝 Base64 — Décodage")
      .addFields(
        { name: "Entrée", value: text.slice(0, 1024) },
        { name: "Résultat", value: decoded.slice(0, 1024) },
      )
      .setColor(0xe67e22);
    await interaction.reply({ embeds: [embed] });
  }
}

async function handleTimestamp(interaction: ChatInputCommandInteraction): Promise<void> {
  const dateStr = interaction.options.getString("date", true);
  const format = interaction.options.getString("format") ?? "f";
  const result = makeTimestamp(dateStr, format);
  if (!result) {
    await interaction.reply({
      content: "❌ Date invalide. Utilise un format comme `2025-12-25` ou `2025-12-25T18:00:00`.",
      ephemeral: true,
    });
    return;
  }
  const embed = new EmbedBuilder()
    .setTitle("⏰ Timestamp Discord")
    .addFields(
      { name: "Timestamp", value: `\`${result.timestamp}\`` },
      { name: "Aperçu", value: result.timestamp },
      { name: "Unix", value: String(result.unix) },
    )
    .setColor(0x9b59b6);
  await interaction.reply({ embeds: [embed] });
}

async function handleGithub(interaction: ChatInputCommandInteraction): Promise<void> {
  const query = interaction.options.getString("requete", true);
  await interaction.deferReply();
  const { searchGithubRepos } = await import("../services/freeApis.js");
  const repos = await searchGithubRepos(query, 5);
  if (!repos.length) {
    await interaction.editReply(`❌ Aucun repo trouvé pour "${query}".`);
    return;
  }
  const embed = new EmbedBuilder().setTitle(`🔍 GitHub — ${query}`).setColor(0x24292e);
  repos.forEach((r, i) => {
    embed.addFields({
      name: `${i + 1}. ${r.fullName} ⭐ ${r.stars}`,
      value: `${r.description || "Aucune description"}\n**Langage:** ${r.language} • [Voir](${r.url})`,
    });
  });
  await interaction.editReply({ embeds: [embed] });
}
