export declare function transcribeAudio(audioBuffer: Buffer): Promise<string>;
export declare function startDictation(voiceChannelId: string, guildId: string, adapterCreator: any, userId: string, username: string, targetChannelId: string): Promise<void>;
export declare function stopDictation(userId: string): Promise<{
    text: string;
    username: string;
    targetChannelId: string;
} | null>;
export declare function hasActiveSession(userId: string): boolean;
export declare function cancelDictation(userId: string): void;
//# sourceMappingURL=dictation.d.ts.map