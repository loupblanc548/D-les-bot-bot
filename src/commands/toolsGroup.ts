import { ChatInputCommandInteraction, SlashCommandBuilder, Client } from "discord.js";
import { handleCommand as handleUtility } from "./utility.js";
import { handleCommand as handleVocal } from "./vocal.js";
import { handleCommand as handleMp3 } from "./mp3.js";
import { handleCommand as handleTts } from "./tts.js";
import { handleCommand as handleRecherche } from "./recherche.js";
import { handleCommand as handleAudioPanel } from "./audioPanel.js";

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
  }
}
