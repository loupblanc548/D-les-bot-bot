/**
 * tsc n'emet pas les .cjs — les copier dans dist pour le runtime prod.
 */
const fs = require("fs");
const path = require("path");

const files = ["utils/memoryLimits.cjs"];

for (const rel of files) {
  const src = path.join(__dirname, "..", "src", rel);
  const dest = path.join(__dirname, "..", "dist", rel);
  if (!fs.existsSync(src)) {
    throw new Error("Asset manquant: " + src);
  }
  fs.mkdirSync(path.dirname(dest), { recursive: true });
  fs.copyFileSync(src, dest);
}
