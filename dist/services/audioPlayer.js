import { readdirSync, existsSync } from "fs";
import { dirname, join, extname } from "path";
import { fileURLToPath } from "url";
// ESM polyfill for __dirname
const __dirname = dirname(fileURLToPath(import.meta.url));
// Constantes
export const SOUNDS_DIR = join(__dirname, "..", "..", "assets", "sounds");
export const AUTOCOMPLETE_LIMIT = 25;
export const DISCONNECT_DELAY_MS = 5000;
// État partagé
export const activeConnections = new Map();
export const activePlayers = new Map();
// Fonctions
export function listSoundFiles() {
    try {
        if (!existsSync(SOUNDS_DIR))
            return [];
        const files = readdirSync(SOUNDS_DIR).filter((f) => extname(f).toLowerCase() === ".mp3");
        return files.map((f) => ({
            name: f,
            displayName: f.replace(/\.mp3$/i, "").replace(/[_-]/g, " "),
        }));
    }
    catch {
        return [];
    }
}
export function findSoundFile(query) {
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
export function cleanupConnection(guildId) {
    const player = activePlayers.get(guildId);
    if (player) {
        player.stop();
        activePlayers.delete(guildId);
    }
    const connection = activeConnections.get(guildId);
    if (connection) {
        connection.destroy();
        activeConnections.delete(guildId);
    }
}
//# sourceMappingURL=audioPlayer.js.map