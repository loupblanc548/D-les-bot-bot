import { Client } from "discord.js";
interface PlatformConfig {
    keywords: string[];
    channelId: string | undefined;
    color: number;
    name: string;
    defaultImage: string;
}
declare const PLATFORM_CONFIGS: PlatformConfig[];
declare function detectPlatforms(title: string): PlatformConfig[];
declare function checkDeals(client: Client): Promise<void>;
export declare function startDealsMonitoring(client: Client): void;
export declare function stopDealsMonitoring(): void;
export { checkDeals, detectPlatforms, PLATFORM_CONFIGS };
//# sourceMappingURL=dealsCron.d.ts.map