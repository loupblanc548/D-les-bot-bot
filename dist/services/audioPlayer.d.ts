import { VoiceConnection } from "@discordjs/voice";
export interface SoundFile {
    name: string;
    displayName: string;
}
export declare const SOUNDS_DIR: string;
export declare const AUTOCOMPLETE_LIMIT = 25;
export declare const DISCONNECT_DELAY_MS = 5000;
export declare const activeConnections: Map<string, VoiceConnection>;
export declare const activePlayers: Map<string, import("@discordjs/voice").AudioPlayer>;
export declare function listSoundFiles(): SoundFile[];
export declare function findSoundFile(query: string): SoundFile | null;
export declare function cleanupConnection(guildId: string): void;
//# sourceMappingURL=audioPlayer.d.ts.map