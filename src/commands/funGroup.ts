/**
 * funGroup.ts — Commandes fun & divertissement (sans clé API)
 *
 * /fun meme       — Mème aléatoire (Reddit)
 * /fun joke       — Blague aléatoire
 * /fun quote      — Citation inspirante
 * /fun advice     — Conseil aléatoire
 * /fun activity   — Activité anti-ennui
 * /fun trivia     — Question trivia
 * /fun 8ball      — Boule magique 8
 * /fun coinflip   — Pile ou face
 * /fun dice       — Lance de dés (format DnD)
 * /fun rps        — Pierre-feuille-ciseaux
 * /fun dog        — Photo de chien aléatoire
 * /fun number-fact — Fait sur un nombre
 * /fun hackernews  — Top Hacker News
 */

import { ChatInputCommandInteraction, SlashCommandBuilder, EmbedBuilder } from "discord.js";
import {
  getMeme,
  getJoke,
  getQuote,
  getAdvice,
  getActivity,
  getDogImage,
  getNumberFact,
  getHackerNewsTop,
} from "../services/freeApis.js";
import { startTrivia } from "../services/triviaService.js";

export const commands = [
  new SlashCommandBuilder()
    .setName("fun")
    .setDescription("Commandes fun & divertissement")
    .addSubcommand((sc) => sc.setName("meme").setDescription("Mème aléatoire (Reddit)"))
    .addSubcommand((sc) => sc.setName("joke").setDescription("Blague aléatoire (EN)"))
    .addSubcommand((sc) => sc.setName("quote").setDescription("Citation inspirante"))
    .addSubcommand((sc) => sc.setName("advice").setDescription("Conseil aléatoire"))
    .addSubcommand((sc) => sc.setName("activity").setDescription("Activité anti-ennui"))
    .addSubcommand((sc) =>
      sc
        .setName("trivia")
        .setDescription("Question trivia interactive")
        .addStringOption((o) =>
          o
            .setName("difficulte")
            .setDescription("Niveau de difficulté")
            .setRequired(false)
            .addChoices(
              { name: "🟢 Facile", value: "easy" },
              { name: "🟡 Moyen", value: "medium" },
              { name: "🔴 Difficile", value: "hard" },
            ),
        ),
    )
    .addSubcommand((sc) =>
      sc
        .setName("8ball")
        .setDescription("Boule magique 8")
        .addStringOption((o) =>
          o.setName("question").setDescription("Ta question").setRequired(true),
        ),
    )
    .addSubcommand((sc) => sc.setName("coinflip").setDescription("Pile ou face"))
    .addSubcommand((sc) =>
      sc
        .setName("dice")
        .setDescription("Lance de dés (format: 2d20+3)")
        .addStringOption((o) =>
          o.setName("format").setDescription("Format des dés (ex: 2d6, 1d20+5)").setRequired(true),
        ),
    )
    .addSubcommand((sc) =>
      sc
        .setName("rps")
        .setDescription("Pierre-feuille-ciseaux")
        .addStringOption((o) =>
          o
            .setName("choix")
            .setDescription("Ton choix")
            .setRequired(true)
            .addChoices(
              { name: "🪨 Pierre", value: "pierre" },
              { name: "📄 Feuille", value: "feuille" },
              { name: "✂️ Ciseaux", value: "ciseaux" },
            ),
        ),
    )
    .addSubcommand((sc) => sc.setName("dog").setDescription("Photo de chien aléatoire 🐶"))
    .addSubcommand((sc) =>
      sc
        .setName("number-fact")
        .setDescription("Fait intéressant sur un nombre")
        .addIntegerOption((o) =>
          o.setName("nombre").setDescription("Le nombre (vide = aléatoire)").setRequired(false),
        ),
    )
    .addSubcommand((sc) =>
      sc
        .setName("hackernews")
        .setDescription("Top articles Hacker News")
        .addIntegerOption((o) =>
          o
            .setName("nombre")
            .setDescription("Nombre d'articles (défaut: 5)")
            .setRequired(false)
            .setMinValue(1)
            .setMaxValue(10),
        ),
    )
    .toJSON(),
];

const EIGHT_BALL_RESPONSES = [
  "C'est certain.",
  "Sans aucun doute.",
  "Oui, absolument.",
  "Tu peux compter dessus.",
  "Très probable.",
  "Les signes pointent vers oui.",
  "Oui.",
  "Réponse floue, réessaie.",
  "Demande plus tard.",
  "Mieux vaut ne pas te le dire maintenant.",
  "Ne peux pas prédire maintenant.",
  "Concentre-toi et réessaie.",
  "N'y compte pas.",
  "Ma réponse est non.",
  "Mes sources disent non.",
  "Très douteux.",
];

function rollDice(format: string): { results: number[]; modifier: number; total: number } | null {
  const match = format.match(/(\d+)d(\d+)([+-]\d+)?/i);
  if (!match) return null;
  const count = parseInt(match[1]);
  const sides = parseInt(match[2]);
  const modifier = match[3] ? parseInt(match[3]) : 0;
  if (count < 1 || count > 100 || sides < 2 || sides > 1000) return null;

  const results: number[] = [];
  for (let i = 0; i < count; i++) {
    results.push(Math.floor(Math.random() * sides) + 1);
  }
  const total = results.reduce((a, b) => a + b, 0) + modifier;
  return { results, modifier, total };
}

export async function handleCommand(
  interaction: ChatInputCommandInteraction,
  _client: unknown,
): Promise<void> {
  const action = interaction.options.getSubcommand();

  switch (action) {
    case "meme": {
      await interaction.deferReply();
      const meme = await getMeme();
      if (!meme) {
        await interaction.editReply("❌ Aucun mème trouvé.");
        return;
      }
      const embed = new EmbedBuilder()
        .setTitle(meme.title)
        .setImage(meme.url)
        .setFooter({ text: `r/${meme.subreddit} • u/${meme.author}` })
        .setColor(0xff4500);
      await interaction.editReply({ embeds: [embed] });
      break;
    }

    case "joke": {
      await interaction.deferReply();
      const joke = await getJoke();
      if (!joke) {
        await interaction.editReply("❌ Aucune blague trouvée.");
        return;
      }
      const embed = new EmbedBuilder()
        .setTitle("😂 Blague")
        .addFields(
          { name: "Setup", value: joke.setup },
          { name: "Punchline", value: `||${joke.punchline}||` },
        )
        .setColor(0xffd700);
      await interaction.editReply({ embeds: [embed] });
      break;
    }

    case "quote": {
      await interaction.deferReply();
      const quote = await getQuote();
      if (!quote) {
        await interaction.editReply("❌ Aucune citation trouvée.");
        return;
      }
      const embed = new EmbedBuilder()
        .setDescription(`*"${quote.quote}"*`)
        .setAuthor({ name: `— ${quote.author}` })
        .setColor(0x5865f2);
      await interaction.editReply({ embeds: [embed] });
      break;
    }

    case "advice": {
      await interaction.deferReply();
      const advice = await getAdvice();
      if (!advice) {
        await interaction.editReply("❌ Aucun conseil trouvé.");
        return;
      }
      const embed = new EmbedBuilder()
        .setTitle("💡 Conseil du jour")
        .setDescription(advice)
        .setColor(0x00ff99);
      await interaction.editReply({ embeds: [embed] });
      break;
    }

    case "activity": {
      await interaction.deferReply();
      const activity = await getActivity();
      if (!activity) {
        await interaction.editReply("❌ Aucune activité trouvée.");
        return;
      }
      const embed = new EmbedBuilder()
        .setTitle("🎯 Activité anti-ennui")
        .setDescription(activity.activity)
        .addFields(
          { name: "Type", value: activity.type, inline: true },
          { name: "Participants", value: String(activity.participants), inline: true },
        )
        .setColor(0xff6b6b);
      await interaction.editReply({ embeds: [embed] });
      break;
    }

    case "trivia": {
      const difficulty = interaction.options.getString("difficulte") as
        "easy" | "medium" | "hard" | null;
      await startTrivia(interaction, { difficulty: difficulty ?? undefined });
      break;
    }

    case "8ball": {
      const question = interaction.options.getString("question", true);
      const response =
        EIGHT_BALL_RESPONSES[Math.floor(Math.random() * EIGHT_BALL_RESPONSES.length)];
      const embed = new EmbedBuilder()
        .setTitle("🎱 Boule Magique 8")
        .addFields(
          { name: "Question", value: question },
          { name: "Réponse", value: `**${response}**` },
        )
        .setColor(0x2c2f33);
      await interaction.reply({ embeds: [embed] });
      break;
    }

    case "coinflip": {
      const result = Math.random() < 0.5 ? "Pile" : "Face";
      const embed = new EmbedBuilder()
        .setTitle("🪙 Pile ou Face")
        .setDescription(`Résultat: **${result}**`)
        .setColor(0xffd700);
      await interaction.reply({ embeds: [embed] });
      break;
    }

    case "dice": {
      const format = interaction.options.getString("format", true);
      const roll = rollDice(format);
      if (!roll) {
        await interaction.reply({
          content: "❌ Format invalide. Utilise: `XdY[+/-Z]` (ex: `2d6`, `1d20+5`, `3d8-2`)",
          ephemeral: true,
        });
        return;
      }
      const embed = new EmbedBuilder()
        .setTitle("🎲 Lance de dés")
        .addFields(
          { name: "Format", value: format, inline: true },
          { name: "Résultats", value: roll.results.join(", "), inline: true },
          {
            name: "Modificateur",
            value: roll.modifier >= 0 ? `+${roll.modifier}` : String(roll.modifier),
            inline: true,
          },
          { name: "Total", value: `**${roll.total}**` },
        )
        .setColor(0xe74c3c);
      await interaction.reply({ embeds: [embed] });
      break;
    }

    case "rps": {
      const choices = ["pierre", "feuille", "ciseaux"];
      const emojis: Record<string, string> = { pierre: "🪨", feuille: "📄", ciseaux: "✂️" };
      const userChoice = interaction.options.getString("choix", true);
      const botChoice = choices[Math.floor(Math.random() * 3)];

      let result: string;
      if (userChoice === botChoice) {
        result = "Égalité !";
      } else if (
        (userChoice === "pierre" && botChoice === "ciseaux") ||
        (userChoice === "feuille" && botChoice === "pierre") ||
        (userChoice === "ciseaux" && botChoice === "feuille")
      ) {
        result = "Tu gagnes ! 🎉";
      } else {
        result = "Tu perds ! 😢";
      }

      const embed = new EmbedBuilder()
        .setTitle("✊ Pierre-Feuille-Ciseaux")
        .addFields(
          { name: "Ton choix", value: `${emojis[userChoice]} ${userChoice}`, inline: true },
          { name: "Bot", value: `${emojis[botChoice]} ${botChoice}`, inline: true },
          { name: "Résultat", value: `**${result}**` },
        )
        .setColor(0x5865f2);
      await interaction.reply({ embeds: [embed] });
      break;
    }

    case "dog": {
      await interaction.deferReply();
      const dogUrl = await getDogImage();
      if (!dogUrl) {
        await interaction.editReply("❌ Aucune photo trouvée.");
        return;
      }
      const embed = new EmbedBuilder()
        .setTitle("🐶 Doggo aléatoire")
        .setImage(dogUrl)
        .setColor(0xff9800);
      await interaction.editReply({ embeds: [embed] });
      break;
    }

    case "number-fact": {
      await interaction.deferReply();
      const num = interaction.options.getInteger("nombre");
      const fact = await getNumberFact(num ?? "random");
      if (!fact) {
        await interaction.editReply("❌ Aucun fait trouvé.");
        return;
      }
      const embed = new EmbedBuilder()
        .setTitle("🔢 Fait sur un nombre")
        .setDescription(fact)
        .setColor(0x3498db);
      await interaction.editReply({ embeds: [embed] });
      break;
    }

    case "hackernews": {
      await interaction.deferReply();
      const count = interaction.options.getInteger("nombre") ?? 5;
      const articles = await getHackerNewsTop(count);
      if (!articles.length) {
        await interaction.editReply("❌ Aucun article trouvé.");
        return;
      }
      const embed = new EmbedBuilder().setTitle("📰 Top Hacker News").setColor(0xff6600);
      articles.forEach((a, i) => {
        embed.addFields({
          name: `${i + 1}. ${a.title}`,
          value: `⬆️ ${a.score} points • [Lien](${a.url})`,
        });
      });
      await interaction.editReply({ embeds: [embed] });
      break;
    }

    default:
      await interaction.reply({ content: "❌ Sous-commande inconnue.", ephemeral: true });
  }
}
