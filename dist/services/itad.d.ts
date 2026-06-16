import { EmbedBuilder } from "discord.js";
export interface ITADGame {
    plain: string;
    title: string;
    type: string;
}
export interface ITADPrice {
    shop: {
        id: string;
        name: string;
    };
    price_new: number;
    price_old: number;
    price_cut: number;
    url: string;
    drm: string[];
}
export interface ITADLowest {
    price: number;
    shop: {
        id: string;
        name: string;
    };
    cut: number;
    recorded: number;
}
export interface ITADDealResult {
    game: ITADGame;
    prices: ITADPrice[];
    lowest: ITADLowest | null;
    url: string;
}
export declare function getDeals(gameName: string): Promise<ITADDealResult | null>;
export declare function buildDealEmbed(result: ITADDealResult): EmbedBuilder;
//# sourceMappingURL=itad.d.ts.map