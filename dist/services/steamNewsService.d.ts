interface SteamAppEntry {
    appid: number;
    name: string;
}
export interface GameNews {
    title: string;
    url: string;
    content: string;
    date: Date;
    gid: string;
    appId: number;
    author: string;
    feedLabel: string;
}
export declare function syncSteamApps(): Promise<SteamAppEntry[]>;
export declare function findAppIdByName(gameName: string): Promise<{
    appid: number;
    name: string;
    score: number;
} | null>;
export declare function getLatestNews(appId: number): Promise<GameNews | null>;
export declare function getLatestNewsForApps(appIds: number[]): Promise<Map<number, GameNews>>;
export {};
//# sourceMappingURL=steamNewsService.d.ts.map