export declare function getPlayerSummaries(steamIds: string[]): Promise<any[]>;
export declare function getOwnedGames(steamId: string): Promise<any[]>;
export declare function getCurrentlyPlaying(steamId: string): Promise<{
    gameName: string;
    gameId: string;
} | null>;
export declare function resolveVanityUrl(vanity: string): Promise<string | null>;
export declare function isValidSteamId(id: string): boolean;
//# sourceMappingURL=steam.d.ts.map