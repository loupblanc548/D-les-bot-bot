const fs = require("fs");
const f = "src/services/toolRiskRegistry.ts";
let c = fs.readFileSync(f, "utf8");
const reg = fs.readFileSync("src/services/_new_registry.txt", "utf8");

// Convert plain entries to proper Map entries format
const lines = reg.trim().split("\n");
const entries = lines.map(line => {
  // Parse: { name: "...", level: "..." },
  const m = line.match(/\{ name: "([^"]+)", level: "([^"]+)" \}/);
  if (!m) return null;
  const [, name, level] = m;
  const module = "extended-toolkits";
  const reason = level === "high" ? "Offensive security tool — requires approval" :
                 level === "medium" ? "Potentially sensitive operation — requires approval" :
                 "Read-only or safe operation";
  return `    ["${name}", { level: "${level}", module: "${module}", reason: "${reason}" }]`;
}).filter(Boolean).join(",\n");

// Insert before the closing ]);
const marker = "  ]);\n\n  // Remove mutating methods";
c = c.replace(marker, "    // ════════════════════════════════════════════════════════════════════════\n    // MODULE: Extended Toolkits (241 new tools — crypto, network, osint, sec, ds, math, nlp, sys, cloud, game, sci, geo, health, code, media)\n    // ════════════════════════════════════════════════════════════════════════\n" + entries + ",\n  ]);\n\n  // Remove mutating methods");

fs.writeFileSync(f, c);
console.log("Registry updated. Entries added:", lines.length);
