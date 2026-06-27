import { ChatInputCommandInteraction, SlashCommandBuilder } from "discord.js";
import { handleCommand as handleAI } from "./ai.js";
import { handleCommand as handleExtraCmd } from "./extraCommands.js";

export const commands = [
  new SlashCommandBuilder()
    .setName("ai")
    .setDescription("Commandes IA (chat, mention, aichat, smartpoll, traduction)")
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
        .setName("mention")
        .setDescription("Mentionne un utilisateur avec l'IA")
        .addStringOption((o) =>
          o
            .setName("message")
            .setDescription("Message au format @utilisateur ton message")
            .setRequired(true),
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
        .setName("translate")
        .setDescription("Traduit un texte avec un ton spécifique")
        .addStringOption((o) =>
          o.setName("texte").setDescription("Le texte à traduire").setRequired(true),
        )
        .addStringOption((o) =>
          o.setName("langue").setDescription("Langue cible").setRequired(true),
        )
        .addStringOption((o) =>
          o.setName("ton").setDescription("Ton de la traduction").setRequired(false),
        ),
    )
    .toJSON(),
];

const NAME_MAP: Record<string, string> = {
  chat: "chat",
  mention: "mention",
  aichat: "aichat",
  smartpoll: "smartpoll",
  translate: "ai-translate-custom",
};

export async function handleCommand(interaction: ChatInputCommandInteraction, client: unknown) {
  const action = interaction.options.getSubcommand();
  const mappedName = NAME_MAP[action] || action;
  Object.defineProperty(interaction, "commandName", { value: mappedName, writable: true });

  if (action === "translate") {
    await handleExtraCmd(interaction, client as import("discord.js").Client);
  } else {
    await handleAI(interaction);
  }
}
