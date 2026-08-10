#!/usr/bin/env node
/**
 * License compliance checker
 * Generates LICENSES.md with all dependency licenses
 * Flags copyleft/non-permissive licenses
 *
 * Usage: npx tsx src/scripts/license-check.ts
 */

import { execSync } from "child_process";
import { writeFileSync } from "fs";

interface LicenseEntry {
  name: string;
  version: string;
  licenses: string;
  repository?: string;
  licenseText?: string;
}

const PROBLEMATIC_LICENSES = ["GPL", "AGPL", "LGPL", "MPL", "CDDL", "EPL"];
const SAFE_LICENSES = ["MIT", "ISC", "Apache-2.0", "BSD-2-Clause", "BSD-3-Clause", "0BSD", "Unlicense"];

function run() {
  console.log("📋 Generating license report...");

  const output = execSync("npx license-checker --json --production", {
    encoding: "utf-8",
    maxBuffer: 10 * 1024 * 1024,
  });

  const data = JSON.parse(output) as Record<string, LicenseEntry>;
  const entries = Object.entries(data).map(([key, val]) => {
    const [name, version] = key.split("@");
    return { name, version, ...val };
  });

  const problematic = entries.filter((e) =>
    PROBLEMATIC_LICENSES.some((p) => e.licenses?.includes(p)),
  );

  const safe = entries.filter((e) =>
    SAFE_LICENSES.some((s) => e.licenses?.includes(s)),
  );

  const unknown = entries.filter(
    (e) => !safe.includes(e) && !problematic.includes(e),
  );

  let md = "# License Compliance Report\n\n";
  md += `Generated: ${new Date().toISOString()}\n\n`;
  md += `Total dependencies: ${entries.length}\n\n`;

  md += "## ⚠️ Problematic Licenses (Copyleft)\n\n";
  if (problematic.length === 0) {
    md += "None found ✅\n\n";
  } else {
    md += "| Package | Version | License |\n|---------|---------|---------|\n";
    for (const p of problematic) {
      md += `| ${p.name} | ${p.version} | ${p.licenses} |\n`;
    }
    md += "\n**Recommendation**: Replace with permissive alternatives if possible.\n\n";
  }

  md += "## ✅ Safe Licenses (Permissive)\n\n";
  md += "| Package | Version | License |\n|---------|---------|---------|\n";
  for (const s of safe) {
    md += `| ${s.name} | ${s.version} | ${s.licenses} |\n`;
  }

  md += "\n## ❓ Unknown/Other Licenses\n\n";
  if (unknown.length === 0) {
    md += "None found ✅\n\n";
  } else {
    md += "| Package | Version | License |\n|---------|---------|---------|\n";
    for (const u of unknown) {
      md += `| ${u.name} | ${u.version} | ${u.licenses || "UNKNOWN"} |\n`;
    }
  }

  writeFileSync("LICENSES.md", md);
  console.log(`✅ License report written to LICENSES.md (${entries.length} deps, ${problematic.length} problematic)`);
}

run();
