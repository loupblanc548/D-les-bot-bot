import { ChatInputCommandInteraction, SlashCommandBuilder, Client } from "discord.js";
import { handleCommand as handleAI } from "./ai.js";
import { handleCommand as handleAiCmd } from "./aiCommands.js";
import { handleCommand as handleTranslateAuto } from "./translateAuto.js";
import { handleAiExtra } from "./stubHandlers.js";

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
    // ─── Nouvelles sous-commandes IA ───
    .addSubcommand((sc) =>
      sc
        .setName("summarize")
        .setDescription("Résume les derniers messages d'un salon")
        .addChannelOption((o) => o.setName("salon").setDescription("Le salon").setRequired(false))
        .addIntegerOption((o) => o.setName("nombre").setDescription("Nombre de messages (défaut: 50)").setRequired(false).setMinValue(5).setMaxValue(200),
        ),
    )
    .addSubcommand((sc) =>
      sc
        .setName("explain")
        .setDescription("Explique un concept complexe")
        .addStringOption((o) => o.setName("sujet").setDescription("Le sujet à expliquer").setRequired(true)),
    )
    .addSubcommand((sc) => sc.setName("ai-profile").setDescription("Profil de personnalité IA du serveur"))
    .addSubcommand((sc) => sc.setName("ai-suggest").setDescription("Suggère des améliorations pour le serveur"))
    .addSubcommand((sc) =>
      sc
        .setName("ai-mood")
        .setDescription("Analyse l'humeur générale du serveur")
        .addChannelOption((o) => o.setName("salon").setDescription("Le salon à analyser").setRequired(false)),
    )
    .addSubcommand((sc) =>
      sc
        .setName("ai-channel-summary")
        .setDescription("Résumé complet d'un salon")
        .addChannelOption((o) => o.setName("salon").setDescription("Le salon").setRequired(true)),
    )
    .addSubcommand((sc) =>
      sc
        .setName("ai-fun")
        .setDescription("Générateur de contenu fun (roast, compliment, etc.)")
        .addStringOption((o) => o.setName("type").setDescription("Type (roast/compliment/pickup/fortune)").setRequired(true))
        .addUserOption((o) => o.setName("cible").setDescription("Cible").setRequired(false)),
    )
    .addSubcommand((sc) =>
      sc
        .setName("ai-translate-custom")
        .setDescription("Traduction avec paramètres avancés")
        .addStringOption((o) => o.setName("texte").setDescription("Texte").setRequired(true))
        .addStringOption((o) => o.setName("source").setDescription("Langue source").setRequired(false))
        .addStringOption((o) => o.setName("cible").setDescription("Langue cible").setRequired(true)),
    )
    .addSubcommand((sc) =>
      sc
        .setName("ai-image")
        .setDescription("Génère une image via IA")
        .addStringOption((o) => o.setName("prompt").setDescription("Description de l'image").setRequired(true)),
    )
    .addSubcommand((sc) =>
      sc
        .setName("ai-moderation-config")
        .setDescription("Configure la modération IA (seuil, action)")
        .addStringOption((o) => o.setName("parametre").setDescription("Paramètre").setRequired(true))
        .addStringOption((o) => o.setName("valeur").setDescription("Valeur").setRequired(true)),
    )
    .addSubcommand((sc) => sc.setName("ai-history").setDescription("Historique des actions de modération IA"))
    .addSubcommand((sc) =>
      sc
        .setName("ai-sentiment")
        .setDescription("Analyse de sentiment d'un message")
        .addStringOption((o) => o.setName("message_id").setDescription("ID du message").setRequired(true)),
    )
    .addSubcommand((sc) =>
      sc
        .setName("ai-chat-export")
        .setDescription("Exporte une conversation IA")
        .addChannelOption((o) => o.setName("salon").setDescription("Le salon").setRequired(true)),
    )
    .addSubcommand((sc) => sc.setName("ai-prompt-templates").setDescription("Liste/modifie les templates de prompts"))
    .addSubcommand((sc) =>
      sc
        .setName("ai-persona")
        .setDescription("Change la personnalité de l'IA")
        .addStringOption((o) => o.setName("persona").setDescription("Nom du persona").setRequired(true)),
    )
    .addSubcommand((sc) =>
      sc
        .setName("ai-context")
        .setDescription("Gère le contexte de conversation (clear, size)")
        .addStringOption((o) => o.setName("action").setDescription("Action (clear/size)").setRequired(true)),
    )
    .addSubcommand((sc) =>
      sc
        .setName("ai-temperature")
        .setDescription("Ajuste la créativité de l'IA")
        .addNumberOption((o) => o.setName("valeur").setDescription("Valeur 0-2").setRequired(true).setMinValue(0).setMaxValue(2)),
    )
    .addSubcommand((sc) =>
      sc
        .setName("ai-model-select")
        .setDescription("Change le modèle LLM utilisé")
        .addStringOption((o) => o.setName("modele").setDescription("Nom du modèle").setRequired(true)),
    )
    .addSubcommand((sc) => sc.setName("ai-token-usage").setDescription("Statistiques de consommation de tokens"))
    .addSubcommand((sc) =>
      sc
        .setName("ai-summarize-user")
        .setDescription("Résumé de l'activité d'un membre par IA")
        .addUserOption((o) => o.setName("cible").setDescription("Le membre").setRequired(true)),
    )
    .toJSON(),
];

const AI_SUBS = ["chat", "aichat", "smartpoll"];
const AI_STUB_SUBS = [
  "summarize","explain","ai-profile","ai-suggest","ai-mood","ai-channel-summary",
  "ai-fun","ai-translate-custom","ai-image","ai-moderation-config","ai-history",
  "ai-sentiment","ai-chat-export","ai-prompt-templates","ai-persona","ai-context",
  "ai-temperature","ai-model-select","ai-token-usage","ai-summarize-user",
];

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
  } else if (AI_STUB_SUBS.includes(action)) {
    await handleAiExtra(interaction, dc);
  }
}
