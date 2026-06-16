"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.activePlayers = exports.activeConnections = exports.DISCONNECT_DELAY_MS = exports.AUTOCOMPLETE_LIMIT = exports.SOUNDS_DIR = void 0;
exports.listSoundFiles = listSoundFiles;
exports.findSoundFile = findSoundFile;
exports.cleanupConnection = cleanupConnection;
const fs_1 = require("fs");
const path_1 = require("path");
// Constantes
exports.SOUNDS_DIR = (0, path_1.join)(__dirname, "..", "..", "assets", "sounds");
exports.AUTOCOMPLETE_LIMIT = 25;
exports.DISCONNECT_DELAY_MS = 5000;
// État partagé
exports.activeConnections = new Map();
exports.activePlayers = new Map();
// Fonctions
function listSoundFiles() {
    try {
        if (!(0, fs_1.existsSync)(exports.SOUNDS_DIR))
            return [];
        const files = (0, fs_1.readdirSync)(exports.SOUNDS_DIR).filter((f) => (0, path_1.extname)(f).toLowerCase() === ".mp3");
        return files.map((f) => ({
            name: f,
            displayName: f.replace(/\.mp3$/i, "").replace(/[_-]/g, " "),
        }));
    }
    catch {
        return [];
    }
}
function findSoundFile(query) {
    const files = listSoundFiles();
    const normalized = query.toLowerCase().trim();
    const exact = files.find((f) => f.name.toLowerCase() === normalized + ".mp3");
    if (exact)
        return exact;
    const byName = files.find((f) => f.name.toLowerCase() === normalized);
    if (byName)
        return byName;
    const byDisplay = files.find((f) => f.displayName.toLowerCase() === normalized);
    if (byDisplay)
        return byDisplay;
    return (files.find((f) => f.displayName.toLowerCase().includes(normalized)) ?? null);
}
function cleanupConnection(guildId) {
    const player = exports.activePlayers.get(guildId);
    if (player) {
        player.stop();
        exports.activePlayers.delete(guildId);
    }
    const connection = exports.activeConnections.get(guildId);
    if (connection) {
        connection.destroy();
        exports.activeConnections.delete(guildId);
    }
}
//# sourceMappingURL=audioPlayer.js.map