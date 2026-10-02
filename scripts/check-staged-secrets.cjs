#!/usr/bin/env node
/**
 * Pre-commit : refuse le commit si une ligne ajoutée contient un secret
 * (règles dans .secret-scan.json). Aucune dépendance, fonctionne sous Windows.
 * Faux positif assumé : `git commit --no-verify` après vérification manuelle.
 */
const { execFileSync } = require("node:child_process");
const { readFileSync } = require("node:fs");
const { join } = require("node:path");

const root = execFileSync("git", ["rev-parse", "--show-toplevel"], { encoding: "utf8" }).trim();

function loadRules() {
  const config = JSON.parse(readFileSync(join(root, ".secret-scan.json"), "utf8"));
  return config.rules.map((rule) => {
    let source = rule.pattern;
    let flags = "";
    if (source.startsWith("(?i)")) {
      source = source.slice(4);
      flags = "i";
    }
    return { id: rule.id, description: rule.description, regex: new RegExp(source, flags) };
  });
}

function mask(secret) {
  return secret.length <= 8 ? "****" : `${secret.slice(0, 4)}…${secret.slice(-2)}`;
}

function scanDiff(diff, rules) {
  const findings = [];
  let file = null;
  let line = 0;
  for (const raw of diff.split("\n")) {
    if (raw.startsWith("+++ ")) {
      file = raw.slice(4).replace(/^b\//, "");
      continue;
    }
    const hunk = /^@@ -\d+(?:,\d+)? \+(\d+)/.exec(raw);
    if (hunk) {
      line = Number(hunk[1]);
      continue;
    }
    if (raw.startsWith("+") && file && file !== "/dev/null") {
      const added = raw.slice(1);
      for (const rule of rules) {
        const match = rule.regex.exec(added);
        if (match) findings.push({ file, line, rule, secret: match[0] });
      }
      line++;
    }
  }
  return findings;
}

function main() {
  const diff = execFileSync("git", ["diff", "--cached", "-U0", "--no-color", "--diff-filter=ACMR"], {
    encoding: "utf8",
    maxBuffer: 64 * 1024 * 1024,
  });
  const findings = scanDiff(diff, loadRules()).filter((f) => f.file !== ".secret-scan.json");
  if (findings.length === 0) return;
  console.error("\n✖ Commit bloqué : secret(s) détecté(s) dans les lignes ajoutées\n");
  for (const f of findings) {
    console.error(`  ${f.file}:${f.line}  ${f.rule.description} (${mask(f.secret)})`);
  }
  console.error("\nRetire le secret (variable d'environnement / .env) puis re-stage le fichier.\n");
  process.exit(1);
}

if (require.main === module) main();
module.exports = { scanDiff, loadRules, mask };
