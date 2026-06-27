/**
 * memoryProfile.ts — /memory-profile
 *
 * Affiche ce que le bot sait de toi : faits stockés, poids, catégories,
 * résumé IA, tone, liens de connaissances, et statistiques d'apprentissage.
 */

import {
  ChatInputCommandInteraction,
  SlashCommandBuilder,
  EmbedBuilder,
  MessageFlags,
} from "discord.js";
import logger from "../utils/logger.js";
import prisma from "../prisma.js";

const FOOTER = { text: "Memory Profile • RGPD Transparency" };

export const commands = [
  new SlashCommandBuilder()
    .setName("memory-profile")
    .setDescription("Affiche tout ce que le bot sait de toi (faits, liens, résumé)")
    .addUserOption((opt) =>
      opt
        .setName("utilisateur")
        .setDescription("Voir le profil mémoire d'un autre utilisateur")
        .setRequired(false),
    )
    .toJSON(),
];

export async function handleCommand(interaction: ChatInputCommandInteraction): Promise<void> {
  await interaction.deferReply({ flags: [MessageFlags.Ephemeral] });

  const targetUser = interaction.options.getUser("utilisateur") ?? interaction.user;
  const userId = targetUser.id;

  try {
    const [userMemory, facts, links, messageCount] = await Promise.all([
      prisma.userMemory.findUnique({ where: { userId } }),
      prisma.memoryFact.findMany({
        where: { userId },
        orderBy: { weight: "desc" },
        take: 25,
      }),
      prisma.memoryLink.findMany({
        where: { userId },
        orderBy: { strength: "desc" },
        take: 15,
      }),
      prisma.memoryMessage.count({ where: { userId } }),
    ]);

    if (!userMemory && facts.length === 0) {
      await interaction.editReply({
        content: `⚠️ Aucune mémoire stockée pour ${targetUser.tag}. Le bot n'a pas encore appris de faits sur cet utilisateur.`,
      });
      return;
    }

    const embed = new EmbedBuilder()
      .setTitle(`🧠 Profil Mémoire — ${targetUser.tag}`)
      .setColor(0x5865f2)
      .setThumbnail(targetUser.displayAvatarURL())
      .setFooter(FOOTER)
      .setTimestamp();

    // Stats générales
    const totalFacts = await prisma.memoryFact.count({ where: { userId } });
    const totalLinks = await prisma.memoryLink.count({ where: { userId } });

    embed.addFields(
      { name: "📦 Faits stockés", value: `${totalFacts}`, inline: true },
      { name: "🔗 Liens de connaissances", value: `${totalLinks}`, inline: true },
      { name: "💬 Messages mémorisés", value: `${messageCount}`, inline: true },
    );

    // Tone & locale
    if (userMemory) {
      const toneEmoji =
        {
          casual: "😎",
          formal: "🎩",
          meme: "😂",
          helpful: "🤝",
        }[userMemory.tone as string] ?? "❓";

      embed.addFields(
        { name: "🎭 Tone", value: `${toneEmoji} ${userMemory.tone ?? "casual"}`, inline: true },
        { name: "🌍 Locale", value: userMemory.locale ?? "fr", inline: true },
        {
          name: "⏰ Dernière activité",
          value: userMemory.lastActiveAt
            ? `<t:${Math.floor(userMemory.lastActiveAt.getTime() / 1000)}:R>`
            : "N/A",
          inline: true,
        },
      );

      // Résumé IA
      if (userMemory.summary) {
        embed.addFields({
          name: "📝 Résumé IA",
          value: userMemory.summary.slice(0, 1024),
          inline: false,
        });
      }
    }

    // Top faits
    if (facts.length > 0) {
      const factsText = facts
        .map((f, i) => {
          const weightBar =
            "█".repeat(Math.min(10, Math.ceil(f.weight))) +
            "░".repeat(Math.max(0, 10 - Math.ceil(f.weight)));
          const cat = f.category ? ` [${f.category}]` : "";
          return `${i + 1}. **${f.key}**${cat} — ${f.value.slice(0, 80)} \`${weightBar}\` ${f.weight.toFixed(2)}`;
        })
        .join("\n");
      embed.addFields({
        name: "📊 Top faits (par poids)",
        value: factsText.slice(0, 1024),
        inline: false,
      });
    }

    // Liens de connaissances
    if (links.length > 0) {
      const linksText = links
        .map(
          (l) =>
            `• **${l.sourceKey}** —${l.relation}→ **${l.targetKey}** (×${l.strength.toFixed(1)})`,
        )
        .join("\n");
      embed.addFields({
        name: "🔗 Graphe de connaissances",
        value: linksText.slice(0, 1024),
        inline: false,
      });
    }

    // RGPD notice
    embed.addFields({
      name: "🔒 RGPD",
      value:
        "Tu peux demander la suppression de ta mémoire via un admin. Tes données ne sont jamais partagées.",
      inline: false,
    });

    await interaction.editReply({ embeds: [embed] });
    logger.info(
      `[MemoryProfile] ${interaction.user.tag} a consulté le profil de ${targetUser.tag} (${totalFacts} faits)`,
    );
  } catch (error) {
    logger.error(
      `[MemoryProfile] Erreur: ${error instanceof Error ? error.message : String(error)}`,
    );
    await interaction.editReply({
      content: "❌ Erreur lors de la récupération du profil mémoire.",
    });
  }
}
