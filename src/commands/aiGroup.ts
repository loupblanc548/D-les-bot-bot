import { ChatInputCommandInteraction, SlashCommandBuilder } from "discord.js";
import { handleCommand as handleAI } from "./ai.js";
import { handleCommand as handleAiCmd } from "./aiCommands.js";
import { handleCommand as handleTranslateAuto } from "./translateAuto.js";

export const commands = [
  new SlashCommandBuilder()
    .setName("ai")
    .setDescription("Commandes IA du bot")
    .addSubcommand((sc) =>
      sc
        .setName("chat")
        .setDescription("Pose une question à l'IA")
        .addStringOption((o) =>
          o.setName("message").setDescription("Ton message").setRequired(true),
        ),
    )
    .addSubcommand((sc) =>
      sc
        .setName("aichat")
        .setDescription("Active/désactive le chat IA contextuel dans ce salon")
        .addStringOption((o) =>
          o
            .setName("action")
            .setDescription("Action")
            .setRequired(true)
            .addChoices({ name: "Activer", value: "on" }, { name: "Désactiver", value: "off" }),
        ),
    )
    .addSubcommand((sc) =>
      sc
        .setName("smartpoll")
        .setDescription("Génère un sondage intelligent avec des options créées par l'IA")
        .addStringOption((o) =>
          o.setName("question").setDescription("Le sujet du sondage").setRequired(true),
        ),
    )
    .addSubcommand((sc) =>
      sc
        .setName("translate-auto")
        .setDescription("Traduit un texte avec auto-détection de la langue source")
        .addStringOption((o) =>
          o.setName("texte").setDescription("Le texte à traduire").setRequired(true),
        )
        .addStringOption((o) =>
          o.setName("cible").setDescription("Langue cible (défaut: Français)").setRequired(false),
        ),
    )
    .addSubcommand((sc) =>
      sc
        .setName("config")
        .setDescription("Configure l'IA du bot (modèle, prompt, température) (Admin)")
        .addStringOption((o) =>
          o
            .setName("parametre")
            .setDescription("Le paramètre à configurer")
            .setRequired(true)
            .addChoices(
              { name: "model", value: "model" },
              { name: "system_prompt", value: "system_prompt" },
              { name: "temperature", value: "temperature" },
            ),
        )
        .addStringOption((o) =>
          o.setName("valeur").setDescription("La nouvelle valeur").setRequired(true),
        ),
    )
    .toJSON(),
];

const AI_SUBS = ["chat", "aichat", "smartpoll"];

export async function handleCommand(interaction: ChatInputCommandInteraction, client: unknown) {
  const action = interaction.options.getSubcommand();
  const dc = client as import("discord.js").Client;

  if (AI_SUBS.includes(action)) {
    Object.defineProperty(interaction, "commandName", { value: action, writable: true });
    await handleAI(interaction);
  } else if (action === "translate-auto") {
    Object.defineProperty(interaction, "commandName", { value: "translate-auto", writable: true });
    await handleTranslateAuto(interaction);
  } else if (action === "config") {
    Object.defineProperty(interaction, "commandName", { value: "ai-config", writable: true });
    await handleAiCmd(interaction);
  }
}
