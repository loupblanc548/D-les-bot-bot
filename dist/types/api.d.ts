export interface EpicGamesApiResponse {
    data: {
        Catalog: {
            searchStore: {
                elements: EpicGamesElement[];
            };
        };
    };
}
export interface EpicGamesElement {
    title: string;
    description: string;
    productSlug?: string;
    urlSlug?: string;
    catalogNs?: {
        mappings?: Array<{
            pageSlug?: string;
            pageType?: string;
        }>;
    };
    keyImages: EpicGamesImage[];
    price?: {
        totalPrice?: {
            fmtPrice?: {
                originalPrice?: string;
            };
        };
    };
    promotions?: {
        promotionalOffers?: EpicGamesPromotion[];
        upcomingPromotionalOffers?: EpicGamesPromotion[];
    };
}
export interface EpicGamesPromotion {
    promotionalOffers: EpicGamesOffer[];
}
export interface EpicGamesOffer {
    startDate?: string;
    endDate?: string;
    discountSetting?: {
        discountPercentage?: number;
        discountType?: string;
    };
}
export interface EpicGamesImage {
    type: string;
    url: string;
}
export interface EpicGame {
    title: string;
    description: string;
    url: string;
    imageUrl: string;
    originalPrice: string | null;
    freeEndDate: string | null;
}
export interface SteamApiResponse<T> {
    response: T;
}
export interface SteamPlayerSummaries {
    players: SteamPlayer[];
}
export interface SteamPlayer {
    steamid: string;
    personaname?: string;
    avatarfull?: string;
    gameextrainfo?: string;
    gameid?: string;
}
export interface SteamOwnedGames {
    game_count: number;
    games: SteamGame[];
}
export interface SteamGame {
    appid: number;
    name: string;
    playtime_forever: number;
    playtime_2weeks?: number;
    img_icon_url?: string;
    img_logo_url?: string;
}
export interface SteamVanityResponse {
    success: number;
    steamid?: string;
}
export interface TwitchTokenResponse {
    access_token: string;
    expires_in: number;
    token_type?: string;
}
export interface TwitchUsersResponse {
    data: TwitchUser[];
}
export interface TwitchUser {
    id: string;
    login: string;
    display_name: string;
    profile_image_url: string;
}
export interface TwitchStreamsResponse {
    data: TwitchStream[];
    pagination?: {
        cursor?: string;
    };
}
export interface TwitchStream {
    id: string;
    user_id: string;
    user_login: string;
    user_name: string;
    game_name: string;
    title: string;
    viewer_count: number;
    thumbnail_url: string;
    started_at: string;
}
export interface ITADSearchResponse {
    data: {
        list: ITADGame[];
    };
}
export interface ITADGame {
    plain: string;
    title: string;
    type: string;
}
export interface ITADPricesResponse {
    data: Record<string, {
        list: ITADPrice[];
    }>;
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
export interface ITADLowestResponse {
    data: Record<string, ITADLowest | null>;
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
//# sourceMappingURL=api.d.ts.map