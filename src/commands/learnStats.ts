/**
 * learnStats.ts — Commande /learn-stats (statistiques d'auto-apprentissage)
 */

import { SlashCommandBuilder, ChatInputCommandInteraction, EmbedBuilder } from "discord.js";
import fs from "fs";
import path from "path";
import { config } from "../config.js";

export const data = new SlashCommandBuilder()
  .setName("learn-stats")
  .setDescription("Affiche les statistiques d'auto-apprentissage du bot");

export async function execute(interaction: ChatInputCommandInteraction): Promise<void> {
  try {
    const vaultPath = config.obsidianVaultPath || process.env.OBSIDIAN_VAULT_PATH;
    if (!vaultPath) {
      await interaction.editReply("❌ Vault Obsidian non configuré.");
      return;
    }

    const qaDir = path.join(vaultPath, "qa");

    // Count Q&A files per category (fast — no statSync)
    const categories: Record<string, number> = {};
    let totalQA = 0;

    if (fs.existsSync(qaDir)) {
      for (const dir of fs.readdirSync(qaDir, { withFileTypes: true })) {
        if (dir.isDirectory()) {
          const count = fs
            .readdirSync(path.join(qaDir, dir.name))
            .filter((f) => f.endsWith(".md")).length;
          categories[dir.name] = count;
          totalQA += count;
        }
      }
    }

    // Count dedup entries
    const dedupFile = path.join(qaDir, ".learned-subjects.json");
    let dedupCount = 0;
    if (fs.existsSync(dedupFile)) {
      try {
        const data = fs.readFileSync(dedupFile, "utf-8");
        const parsed = JSON.parse(data);
        dedupCount = Array.isArray(parsed) ? parsed.length : Object.keys(parsed).length;
      } catch {
        // ignore
      }
    }

    // Get last 5 learned subjects — only scan if total < 500 (performance)
    const recentSubjects: string[] = [];
    if (fs.existsSync(qaDir) && totalQA < 2000) {
      const allFiles: { name: string; mtime: number }[] = [];
      for (const dir of Object.keys(categories)) {
        const dirPath = path.join(qaDir, dir);
        for (const file of fs.readdirSync(dirPath).filter((f) => f.endsWith(".md"))) {
          try {
            const stat = fs.statSync(path.join(dirPath, file));
            allFiles.push({ name: `${dir}/${file.replace(/\.md$/, "")}`, mtime: stat.mtimeMs });
          } catch {
            // skip
          }
        }
      }
      allFiles.sort((a, b) => b.mtime - a.mtime);
      recentSubjects.push(...allFiles.slice(0, 5).map((f) => f.name));
    }

    // Build embed
    const categoryList =
      Object.entries(categories)
        .sort((a, b) => b[1] - a[1])
        .map(([cat, count]) => `**${cat}**: ${count}`)
        .join("\n") || "Aucune catégorie";

    const recentList: string =
      recentSubjects.length > 0
        ? recentSubjects.map((s, i) => `${i + 1}. ${s}`).join("\n")
        : totalQA >= 2000
          ? "Trop de fichiers (>2000) — récents masqués pour performance"
          : "Aucun sujet récent";

    const embed = new EmbedBuilder()
      .setTitle("🧠 Statistiques d'auto-apprentissage")
      .setColor(0x00d4aa)
      .addFields(
        { name: "📚 Total Q&A", value: `${totalQA}`, inline: true },
        { name: "🔒 Sujets hashés (dédup)", value: `${dedupCount}`, inline: true },
        {
          name: "⚡ Cadence",
          value: "~80 Q&A / 5s (wiki filtré + vault push si dépôt séparé)",
          inline: true,
        },
        { name: "📂 Répartition par catégorie", value: categoryList, inline: false },
        { name: "🕐 Derniers sujets appris", value: recentList, inline: false },
      )
      .setTimestamp();

    await interaction.editReply({ embeds: [embed] });
  } catch (err) {
    await interaction.editReply(`❌ Erreur: ${err instanceof Error ? err.message : String(err)}`);
  }
}
