import { Client } from "discord.js";
export declare function getStreamerByLogin(login: string): Promise<{
    id: string;
    login: string;
    displayName: string;
    profileImageUrl: string;
} | null>;
export declare function startTwitchMonitoring(client: Client, intervalMs?: number): void;
export declare function stopTwitchMonitoring(): void;
//# sourceMappingURL=twitch.d.ts.map