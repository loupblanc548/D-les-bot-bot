import { Client } from "discord.js";
export interface EpicGame {
    title: string;
    description: string;
    url: string;
    imageUrl: string;
    originalPrice: string | null;
    freeEndDate: string | null;
}
export declare function fetchFreeGames(client: Client): Promise<EpicGame[]>;
//# sourceMappingURL=epicgames.d.ts.map