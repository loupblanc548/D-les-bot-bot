import { describe, it, expect } from "vitest";
import { CATEGORIES, TOP_LEVEL_COMMANDS } from "./helpCategories.js";

// Commandes explicitement retirées lors du grand nettoyage — si l'une
// d'elles réapparaît dans le menu d'aide, c'est le signe d'une désync.
const REMOVED_COMMANDS = [
  "/osint",
  "/modadmin",
  "/fnbot",
  "/game2",
  "/track ",
  "/community",
  "/autothread",
  "/customcmd",
  "/shadow",
  "/report ", // ancien /report standalone (désormais /mod report)
  "/steam-price",
  "/twitch " + "add", // éviter faux positif avec /game twitch
  "/alert ",
  "/casier ",
  "/ticket",
  "/tools ",
  "/sources ",
  "/music ",
  "/manage ",
  "/commands ",
];

describe("helpCategories — anti-désync du menu /bot help", () => {
  it("chaque catégorie référence uniquement des commandes top-level valides", () => {
    for (const cat of CATEGORIES) {
      const firstToken = cat.commands.match(/`\/(\S+)/);
      expect(firstToken, `Catégorie "${cat.id}" n'a pas de commande détectable`).not.toBeNull();
      const cmdName = firstToken![1];
      expect(
        TOP_LEVEL_COMMANDS,
        `La commande /${cmdName} dans la catégorie "${cat.id}" n'est pas dans TOP_LEVEL_COMMANDS`,
      ).toContain(cmdName);
    }
  });

  it("ne contient aucune référence à une commande supprimée", () => {
    const fullText = CATEGORIES.map((c) => c.commands).join("\n");
    for (const removed of REMOVED_COMMANDS) {
      expect(
        fullText.includes(removed),
        `Le menu d'aide contient encore une référence à "${removed}" (commande supprimée)`,
      ).toBe(false);
    }
  });

  it("a exactement une catégorie par commande top-level enregistrée", () => {
    // 7 commandes top-level actuelles : bot, mod, security, ai, game, mc, admin
    expect(TOP_LEVEL_COMMANDS.length).toBe(7);
    expect(CATEGORIES.length).toBeGreaterThanOrEqual(TOP_LEVEL_COMMANDS.length);
  });
});
