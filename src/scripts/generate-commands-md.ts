/**
 * generate-commands-md.ts — Génère COMMANDS.md depuis helpCategories.ts
 * À exécuter après chaque modification des commandes: npx tsx src/scripts/generate-commands-md.ts
 */
import { CATEGORIES } from "../commands/helpCategories.js";
import { writeFileSync } from "fs";

let md = "# Commandes du Bot\n\n";
md += "> Généré automatiquement — ne pas éditer manuellement.\n\n";

let totalCmds = 0;

for (const cat of CATEGORIES) {
  md += `## ${cat.emoji} ${cat.name}\n\n`;
  md += `> ${cat.description}\n\n`;

  const lines = cat.commands.split("\n").filter((l) => l.trim());
  for (const line of lines) {
    const match = line.match(/`\/([^`]+)`\s*-\s*(.+)/) || line.match(/`\/([^`]+)\s*-\s*([^`]+)`/);
    if (match) {
      const cmd = match[1];
      const desc = match[2];
      md += `- \`/${cmd.trim()}\` — ${desc.trim()}\n`;
      totalCmds++;
    }
  }
  md += "\n";
}

md += "---\n\n";
md += `**Total : ${CATEGORIES.length} catégories, ${totalCmds} commandes.**\n`;

writeFileSync("COMMANDS.md", md, "utf-8");
console.log(`COMMANDS.md généré: ${CATEGORIES.length} catégories, ${totalCmds} commandes.`);
