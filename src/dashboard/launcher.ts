/**
 * dashboard/launcher.ts — Lance le dashboard
 *
 * En développement: lance le serveur Express avec tsx (ouvre le navigateur)
 * En production: lance Electron (fenêtre desktop)
 */

import { spawn } from "child_process";
import * as path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const isDev = process.env.NODE_ENV !== "production";

if (isDev) {
  // Mode dev: lancer le serveur Express directement avec tsx
  const child = spawn(process.execPath, ["--import", "tsx", path.join(__dirname, "server.ts")], {
    stdio: "inherit",
    cwd: path.join(__dirname, "..", ".."),
    env: {
      ...process.env,
      DASHBOARD_DEV: "true",
    },
  });
  child.on("exit", (code) => process.exit(code ?? 0));
} else {
  // Mode prod: lancer Electron
  const child = spawn("electron", [path.join(__dirname, "main.js")], {
    stdio: "inherit",
    cwd: path.join(__dirname, "..", ".."),
    env: {
      ...process.env,
      DASHBOARD_DEV: "false",
    },
  });
  child.on("exit", (code) => process.exit(code ?? 0));
}
