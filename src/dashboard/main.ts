/**
 * dashboard/main.ts — Point d'entrée Electron du Dashboard
 *
 * Lance une fenêtre Electron qui charge le frontend du dashboard.
 * Le backend Express tourne dans le même process (port 3721).
 */

import { app, BrowserWindow, ipcMain } from "electron";
import * as path from "path";
import { fileURLToPath } from "url";
import { startDashboardServer } from "./server.js";

let mainWindow: BrowserWindow | null = null;
const __dirname = path.dirname(fileURLToPath(import.meta.url));

async function createWindow(): Promise<void> {
  // Démarrer le serveur Express intégré
  const port = await startDashboardServer(3721);
  console.log(`[Dashboard] Serveur démarré sur le port ${port}`);

  mainWindow = new BrowserWindow({
    width: 1280,
    height: 800,
    minWidth: 900,
    minHeight: 600,
    title: "Shadow Broker — Dashboard",
    backgroundColor: "#000000",
    autoHideMenuBar: true,
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      preload: path.join(__dirname, "preload.js"),
    },
  });

  // Charger le frontend
  const frontendPath = path.join(__dirname, "frontend", "index.html");
  mainWindow.loadFile(frontendPath);

  // Ouvrir DevTools en dev
  if (process.env.DASHBOARD_DEV === "true") {
    mainWindow.webContents.openDevTools();
  }

  mainWindow.on("closed", () => {
    mainWindow = null;
  });
}

// IPC handlers
ipcMain.handle("get-app-version", () => app.getVersion());

app.whenReady().then(() => {
  void createWindow();

  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      void createWindow();
    }
  });
});

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") {
    app.quit();
  }
});
