export interface PsnProfile {
    onlineId: string;
    accountId: string;
    avatarUrl: string;
    aboutMe: string;
    plusTier: number;
    trophySummary: PsnTrophySummary;
}
export interface PsnTrophySummary {
    level: number;
    progress: number;
    platinum: number;
    gold: number;
    silver: number;
    bronze: number;
    total: number;
}
export interface PsnGameTitle {
    npCommunicationId: string;
    titleName: string;
    platform: string;
    imageUrl: string;
    trophyCount: {
        platinum: number;
        gold: number;
        silver: number;
        bronze: number;
    };
    progress: number;
    lastPlayedAt?: string;
}
export interface PsnDeal {
    title: string;
    originalPrice: string;
    discountedPrice: string;
    discountPercent: number;
    endDate: string;
    url: string;
    imageUrl: string;
}
export declare function authenticatePsn(): Promise<string>;
export declare function getPsnProfile(username: string): Promise<PsnProfile | null>;
export declare function getPsnRecentGames(accountIdOrUsername: string, limit?: number): Promise<PsnGameTitle[]>;
/**
 * Scrape les deals PlayStation depuis psprices.com.
 * Approche similaire a instantgaming.ts.
 */
export declare function getPsnDeals(limit?: number): Promise<PsnDeal[]>;
export declare function isValidPsnId(id: string): boolean;
//# sourceMappingURL=psn.d.ts.map