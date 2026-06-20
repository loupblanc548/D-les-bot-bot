import { Client, EmbedBuilder } from "discord.js";
import { PLATFORM_COLORS, PLATFORM_ICONS, PLATFORM_LABELS } from "../utils/rss-parser.js";
export declare function parseRssItems(xml: string): {
    title: string;
    url: string;
    thumbnail?: string;
}[];
export declare function sendToChannel(client: Client, channelId: string, embed: EmbedBuilder): Promise<boolean>;
export declare function logError(client: Client, module: string, error: string): Promise<void>;
export declare function runGamingFeeds(client: Client): Promise<void>;
export declare function runStartupRetrospective(client: Client): Promise<void>;
export { PLATFORM_COLORS, PLATFORM_ICONS, PLATFORM_LABELS };
//# sourceMappingURL=feeds.d.ts.map