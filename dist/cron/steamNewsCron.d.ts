import { Client } from "discord.js";
type Platform = "epic" | "steam" | "playstation" | "xbox" | "nintendo";
interface PlatformConfig {
    channelId: string | undefined;
    color: number;
    iconUrl: string;
    label: string;
}
declare const PLATFORM_CONFIGS: Record<Platform, PlatformConfig>;
declare function checkTrackedGames(client: Client): Promise<void>;
export { checkTrackedGames, PLATFORM_CONFIGS };
export declare function startSteamNewsMonitoring(client: Client): void;
export declare function stopSteamNewsMonitoring(): void;
//# sourceMappingURL=steamNewsCron.d.ts.map