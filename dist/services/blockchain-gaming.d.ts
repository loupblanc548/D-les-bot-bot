import { Client } from "discord.js";
interface NFTCollection {
    contractAddress: string;
    name: string;
    symbol: string;
    floorPrice: number;
    volume24h: number;
    owners: number;
    lastUpdated: number;
}
interface GamingToken {
    symbol: string;
    name: string;
    price: number;
    change24h: number;
    marketCap: number;
    lastUpdated: number;
}
interface BlockchainAlert {
    type: "nft_floor_drop" | "token_spike" | "whale_transaction" | "new_collection";
    severity: "low" | "medium" | "high";
    message: string;
    data: Record<string, unknown>;
    timestamp: number;
}
declare class BlockchainGamingService {
    private nftCollections;
    private gamingTokens;
    private alerts;
    private monitoringInterval;
    constructor();
    initializeCollections(): Promise<void>;
    initializeTokens(): Promise<void>;
    updateNFTPrices(): Promise<void>;
    updateTokenPrices(): Promise<void>;
    private createAlert;
    private cleanupOldAlerts;
    getRecentAlerts(hours?: number): BlockchainAlert[];
    getLowestFloorCollections(limit?: number): NFTCollection[];
    getTopGainers(limit?: number): GamingToken[];
    getTopLosers(limit?: number): GamingToken[];
    sendBlockchainReport(client: Client): Promise<void>;
    enableMonitoring(client: Client, intervalMs?: number): void;
    disableMonitoring(): void;
    getGlobalStats(): {
        totalCollections: number;
        totalTokens: number;
        totalVolume: number;
        averageFloorPrice: number;
        activeAlerts: number;
    };
    saveData(): Promise<void>;
    loadDataFromPrisma(): Promise<void>;
}
export declare const blockchainGamingService: BlockchainGamingService;
export {};
//# sourceMappingURL=blockchain-gaming.d.ts.map