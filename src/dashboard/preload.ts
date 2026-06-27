/**
 * dashboard/preload.ts — Script de préchargement Electron
 *
 * Expose une API sécurisée au frontend (contextBridge).
 */

import { contextBridge, ipcRenderer } from "electron";

contextBridge.exposeInMainWorld("electronAPI", {
  getAppVersion: () => ipcRenderer.invoke("get-app-version"),
  platform: process.platform,
});
