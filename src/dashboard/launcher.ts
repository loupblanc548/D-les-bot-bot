/**
 * dashboard/launcher.ts — Lance le dashboard Electron
 *
 * Utilisé par: npm run dashboard
 * Lance le main process Electron qui démarre le serveur Express + la fenêtre.
 */

import { spawn } from "child_process";
import * as path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// En production, lancer directement electron
// En développement, lancer avec tsx
const isDev = process.env.NODE_ENV !== "production";

const electronBin = isDev ? "npx" : "electron";
const args = isDev ? ["tsx", path.join(__dirname, "main.ts")] : [path.join(__dirname, "main.js")];

const child = spawn(electronBin, args, {
  stdio: "inherit",
  cwd: path.join(__dirname, "..", ".."),
  env: {
    ...process.env,
    DASHBOARD_DEV: isDev ? "true" : "false",
  },
});

child.on("exit", (code) => {
  process.exit(code ?? 0);
});
