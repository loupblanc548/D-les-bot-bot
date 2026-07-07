import { ChatInputCommandInteraction, SlashCommandBuilder, Client } from "discord.js";
import { handleCommand as handleAI } from "./ai.js";
import { handleCommand as handleAiCmd } from "./aiCommands.js";
import { handleCommand as handleTranslateAuto } from "./translateAuto.js";
import { handleAiExtra } from "./stubHandlers.js";

export const commands = [
  new SlashCommandBuilder()
    .setName("ai")
    .setDescription("Commandes IA (chat, analyse, avancé, config)")

    // ── Group: basic (5 subs) ──
    .addSubcommandGroup((grp) =>
      grp
        .setName("basic")
        .setDescription("IA basique (chat, image, traduction)")
        .addSubcommand((sc) =>
          sc.setName("chat").setDescription("Pose une question à l'IA")
            .addStringOption((o) => o.setName("message").setDescription("Ton message").setRequired(true)),
        )
        .addSubcommand((sc) =>
          sc.setName("ask-bot").setDescription("Active/désactive le chat IA contextuel")
            .addStringOption((o) => o.setName("action").setDescription("Action").setRequired(true)
              .addChoices({ name: "Activer", value: "on" }, { name: "Désactiver", value: "off" })),
        )
        .addSubcommand((sc) =>
          sc.setName("image").setDescription("Génère une image via IA")
            .addStringOption((o) => o.setName("prompt").setDescription("Description").setRequired(true)),
        )
        .addSubcommand((sc) =>
          sc.setName("translate").setDescription("Traduit un texte (auto-détection)")
            .addStringOption((o) => o.setName("texte").setDescription("Texte").setRequired(true))
            .addStringOption((o) => o.setName("cible").setDescription("Langue cible").setRequired(false)),
        )
        .addSubcommand((sc) =>
          sc.setName("summarize").setDescription("Résume les derniers messages")
            .addChannelOption((o) => o.setName("salon").setDescription("Salon").setRequired(false))
            .addIntegerOption((o) => o.setName("nombre").setDescription("Nb messages (défaut: 50)").setRequired(false).setMinValue(5).setMaxValue(200)),
        ),
    )

    // ── Group: analysis (5 subs) ──
    .addSubcommandGroup((grp) =>
      grp
        .setName("analysis")
        .setDescription("Analyse IA (sentiment, résumés, comportement)")
        .addSubcommand((sc) =>
          sc.setName("sentiment").setDescription("Analyse de sentiment d'un message")
            .addStringOption((o) => o.setName("message_id").setDescription("ID du message").setRequired(true)),
        )
        .addSubcommand((sc) =>
          sc.setName("summarize-user").setDescription("Résumé activité d'un membre")
            .addUserOption((o) => o.setName("cible").setDescription("Membre").setRequired(true)),
        )
        .addSubcommand((sc) =>
          sc.setName("channel-summary").setDescription("Résumé complet d'un salon")
            .addChannelOption((o) => o.setName("salon").setDescription("Salon").setRequired(true)),
        )
        .addSubcommand((sc) =>
          sc.setName("behavior-timeline").setDescription("Timeline comportementale")
            .addUserOption((o) => o.setName("cible").setDescription("Utilisateur").setRequired(true)),
        )
        .addSubcommand((sc) =>
          sc.setName("spam-analysis").setDescription("Analyse spam d'un salon")
            .addChannelOption((o) => o.setName("salon").setDescription("Salon").setRequired(false)),
        ),
    )

    // ── Group: advanced (6 subs) ──
    .addSubcommandGroup((grp) =>
      grp
        .setName("advanced")
        .setDescription("IA avancée (persona, mood, prompts, fine-tune)")
        .addSubcommand((sc) =>
          sc.setName("persona").setDescription("Change la personnalité de l'IA")
            .addStringOption((o) => o.setName("persona").setDescription("Nom du persona").setRequired(true)),
        )
        .addSubcommand((sc) =>
          sc.setName("mood").setDescription("Humeur générale du serveur")
            .addChannelOption((o) => o.setName("salon").setDescription("Salon").setRequired(false)),
        )
        .addSubcommand((sc) => sc.setName("prompt-templates").setDescription("Liste/modifie templates de prompts"))
        .addSubcommand((sc) =>
          sc.setName("fine-tune").setDescription("Fine-tune du modèle")
            .addStringOption((o) => o.setName("action").setDescription("Action").setRequired(true)),
        )
        .addSubcommand((sc) =>
          sc.setName("context").setDescription("Gère le contexte (clear/size)")
            .addStringOption((o) => o.setName("action").setDescription("Action (clear/size)").setRequired(true)),
        )
        .addSubcommand((sc) => sc.setName("history").setDescription("Historique actions modération IA")),
    )

    // ── Group: config (5 subs) ──
    .addSubcommandGroup((grp) =>
      grp
        .setName("config")
        .setDescription("Configuration IA (modèle, température, tokens)")
        .addSubcommand((sc) =>
          sc.setName("model-select").setDescription("Change le modèle LLM")
            .addStringOption((o) => o.setName("modele").setDescription("Nom du modèle").setRequired(true)),
        )
        .addSubcommand((sc) =>
          sc.setName("temperature").setDescription("Ajuste la créativité (0-2)")
            .addNumberOption((o) => o.setName("valeur").setDescription("Valeur 0-2").setRequired(true).setMinValue(0).setMaxValue(2)),
        )
        .addSubcommand((sc) => sc.setName("token-usage").setDescription("Stats consommation tokens"))
        .addSubcommand((sc) =>
          sc.setName("moderation-config").setDescription("Config modération IA")
            .addStringOption((o) => o.setName("parametre").setDescription("Paramètre").setRequired(true))
            .addStringOption((o) => o.setName("valeur").setDescription("Valeur").setRequired(true)),
        )
        .addSubcommand((sc) =>
          sc.setName("fun-mode").setDescription("Mode fun (roast, compliment, etc.)")
            .addStringOption((o) => o.setName("type").setDescription("Type (roast/compliment/pickup/fortune)").setRequired(true))
            .addUserOption((o) => o.setName("cible").setDescription("Cible").setRequired(false)),
        ),
    )
    .toJSON(),
];

// ─── Handler ───────────────────────────────────────────────────────────

const AI_BASIC_SUBS = ["chat", "ask-bot"];
const AI_BASIC_STUB = ["image", "summarize"];
const AI_ANALYSIS_STUB = ["sentiment", "summarize-user", "channel-summary", "behavior-timeline", "spam-analysis"];
const AI_ADVANCED_STUB = ["persona", "mood", "prompt-templates", "fine-tune", "context", "history"];
const AI_CONFIG_STUB = ["model-select", "temperature", "token-usage", "moderation-config", "fun-mode"];

export async function handleCommand(interaction: ChatInputCommandInteraction, client: unknown) {
  const group = interaction.options.getSubcommandGroup();
  const action = interaction.options.getSubcommand();
  const dc = client as Client;

  // ── basic ──
  if (group === "basic") {
    if (AI_BASIC_SUBS.includes(action)) {
      const cmdName = action === "ask-bot" ? "aichat" : action;
      Object.defineProperty(interaction, "commandName", { value: cmdName, writable: true });
      await handleAI(interaction);
    } else if (action === "translate") {
      Object.defineProperty(interaction, "commandName", { value: "translate-auto", writable: true });
      await handleTranslateAuto(interaction);
    } else if (AI_BASIC_STUB.includes(action)) {
      const cmdName = action === "image" ? "ai-image" : action;
      Object.defineProperty(interaction, "commandName", { value: cmdName, writable: true });
      await handleAiExtra(interaction, dc);
    }
    return;
  }

  // ── analysis ──
  if (group === "analysis") {
    const cmdMap: Record<string, string> = {
      "sentiment": "ai-sentiment",
      "summarize-user": "ai-summarize-user",
      "channel-summary": "ai-channel-summary",
      "behavior-timeline": "behavior-timeline",
      "spam-analysis": "ai-spam-analysis",
    };
    const cmdName = cmdMap[action] || action;
    Object.defineProperty(interaction, "commandName", { value: cmdName, writable: true });
    if (action === "behavior-timeline") {
      const { handleCommand: handleExtraCmd } = await import("./extraCommands.js");
      await handleExtraCmd(interaction, dc);
    } else {
      await handleAiExtra(interaction, dc);
    }
    return;
  }

  // ── advanced ──
  if (group === "advanced") {
    const cmdMap: Record<string, string> = {
      "persona": "ai-persona",
      "mood": "ai-mood",
      "prompt-templates": "ai-prompt-templates",
      "fine-tune": "ai-fine-tune",
      "context": "ai-context",
      "history": "ai-history",
    };
    const cmdName = cmdMap[action] || action;
    Object.defineProperty(interaction, "commandName", { value: cmdName, writable: true });
    await handleAiExtra(interaction, dc);
    return;
  }

  // ── config ──
  if (group === "config") {
    if (action === "model-select" || action === "temperature" || action === "token-usage" || action === "moderation-config") {
      const cmdMap: Record<string, string> = {
        "model-select": "ai-model-select",
        "temperature": "ai-temperature",
        "token-usage": "ai-token-usage",
        "moderation-config": "ai-moderation-config",
      };
      Object.defineProperty(interaction, "commandName", { value: cmdMap[action], writable: true });
      if (action === "model-select" || action === "temperature" || action === "token-usage") {
        await handleAiExtra(interaction, dc);
      } else {
        await handleAiCmd(interaction);
      }
    } else if (action === "fun-mode") {
      Object.defineProperty(interaction, "commandName", { value: "ai-fun", writable: true });
      await handleAiExtra(interaction, dc);
    }
    return;
  }
}
