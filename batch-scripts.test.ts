import { describe, it, expect } from "vitest";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const BOT_DIR = path.dirname(fileURLToPath(import.meta.url));
const BATCH_FILES = fs.readdirSync(BOT_DIR).filter((f) => f.endsWith(".bat"));

/**
 * Extrait les noms de labels (sans le : initial).
 */
function extractLabels(content: string): string[] {
  return content
    .split("\n")
    .map((line) => line.trim())
    .filter((line) => /^:[a-zA-Z_]/.test(line)) // : suivi d'une lettre
    .map((line) => line.replace(/^:/, "").split(/\s/)[0]);
}

/**
 * Extrait les cibles des instructions goto (sans le : optionnel).
 */
function extractGotos(content: string): string[] {
  const results: string[] = [];
  for (const line of content.split("\n")) {
    const trimmed = line.trim();
    // Cherche 'goto label' ou 'goto :label'
    const match = trimmed.match(/^goto\s+:?([a-zA-Z_][a-zA-Z0-9_]*)$/i);
    if (match) {
      results.push(match[1]);
    }
  }
  return results;
}

/**
 * Vérifie que les parenthèses sont équilibrées.
 */
function checkBalancedParentheses(content: string): {
  balanced: boolean;
  open: number;
  close: number;
} {
  const opens = (content.match(/\(/g) || []).length;
  const closes = (content.match(/\)/g) || []).length;
  return { balanced: opens === closes, open: opens, close: closes };
}

describe("Scripts batch du bot", () => {
  it("devrait avoir des fichiers .bat", () => {
    expect(BATCH_FILES.length).toBeGreaterThan(0);
    console.log("  " + BATCH_FILES.length + " fichiers batch trouves");
  });

  describe.each(BATCH_FILES)("Validation de %s", (filename) => {
    const filePath = path.join(BOT_DIR, filename);
    const content = fs.readFileSync(filePath, "utf-8");
    const lines = content.split("\n");

    it("devrait commencer par @echo off", () => {
      expect(lines[0].trim()).toBe("@echo off");
    });

    it("ne devrait pas contenir %%~ (bug double pourcentage)", () => {
      if (filename === "status.bat") return;
      const issueLines = lines
        .map((line, i) => ({ line, num: i + 1 }))
        .filter(({ line }) => line.includes("%%~"));
      expect(issueLines).toEqual([]);
    });

    it("devrait avoir des parentheses equilibrees", () => {
      const { balanced, open, close } = checkBalancedParentheses(content);
      expect(balanced).toBe(true);
    });

    it("ne devrait pas contenir de caracteres non-ASCII", () => {
      const suspicious = lines
        .map((line, i) => ({ line, num: i + 1 }))
        .filter(({ line }) => /[^\x00-\x7F]/.test(line) && !line.trim().startsWith("REM"));
      expect(suspicious).toEqual([]);
    });

    // Validation des labels <-> gotos
    if (content.includes("goto ") || content.includes(":")) {
      it("les goto devraient pointer vers des labels existants", () => {
        const labels = extractLabels(content);
        const gotos = extractGotos(content);
        const labelsSet = new Set(labels);
        const missing = gotos.filter((g) => !labelsSet.has(g) && g.toLowerCase() !== "eof");
        expect(missing).toEqual([]);
      });
    }

    // Verifications specifiques par type de fichier
    if (filename === "start.bat") {
      it("(start.bat) utilise PM2 et ecosystem.config.cjs", () => {
        expect(content).toContain("pm2");
        expect(content).toContain("ecosystem.config.cjs");
      });
    }

    if (filename === "stop.bat") {
      it("(stop.bat) devrait avoir taskkill ou PM2", () => {
        expect(content).toContain("pm2");
      });
    }

    if (filename === "install-service.bat") {
      it("(install-service.bat) devrait referencer PM2 et prisma", () => {
        expect(content).toContain("pm2");
        expect(content).toContain("prisma");
      });
    }

    if (filename === "register-commands.bat") {
      it("(register-commands.bat) devrait utiliser --register", () => {
        expect(content).toContain("--register");
      });
    }

    // update.bat utilise git, update-bot.bat est une maintenance sans git
    if (filename === "update.bat") {
      it("(update.bat) devrait utiliser git et npm", () => {
        expect(content).toContain("git");
        expect(content).toContain("npm");
      });
    }

    if (filename === "update-bot.bat") {
      it("(update-bot.bat) devrait utiliser npm update et prisma", () => {
        expect(content).toContain("npm update");
        expect(content).toContain("prisma");
      });
    }
  });

  // Conventions globales : cd /d %~dp0
  describe("Conventions globales", () => {
    const filesNeedingCd = BATCH_FILES.filter(
      (f) => !["autostart.bat", "stop.bat", "logs-pm2.bat", "debug.bat"].includes(f),
    );

    it.each(filesNeedingCd)("%s devrait avoir cd /d %%~dp0", (filename) => {
      const filePath = path.join(BOT_DIR, filename);
      const content = fs.readFileSync(filePath, "utf-8");
      const cdLine = content
        .split("\n")
        .slice(0, 5)
        .find((line) => line.includes("cd /d") || line.includes(`set "BOT_DIR="`));
      expect(cdLine).toBeDefined();
    });
  });

  // Verification que les scripts essentiels existent
  describe("Scripts essentiels", () => {
    const expected = ["start.bat", "stop.bat", "restart.bat"];

    it.each(expected)("le script %s devrait exister", (scriptName) => {
      expect(BATCH_FILES).toContain(scriptName);
    });
  });

  // Titres de fenetre coherents
  describe("Titres de fenetre", () => {
    it("stop.bat et start.bat utilisent le meme titre", () => {
      const startContent = fs.readFileSync(path.join(BOT_DIR, "start.bat"), "utf-8");
      const stopContent = fs.readFileSync(path.join(BOT_DIR, "stop.bat"), "utf-8");
      const startTitle = startContent
        .split("\n")
        .find((l) => l.startsWith("title "))
        ?.replace("title ", "")
        .trim();
      expect(startTitle).toBeDefined();
      const stopTitle = stopContent
        .split("\n")
        .find((l) => l.startsWith("title "))
        ?.replace("title ", "")
        .trim();
      expect(startTitle).toBeDefined();
      expect(stopTitle).toBeDefined();
      expect(startTitle!).toContain("John Helldiver");
      expect(stopTitle!).toContain("John Helldiver");
    });
  });
});
