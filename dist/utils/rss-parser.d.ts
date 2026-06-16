import { XMLParser } from 'fast-xml-parser';
export declare const RSS_HEADERS: {
    Accept: string;
    'User-Agent': string;
};
export declare const PLATFORM_COLORS: Record<string, number>;
export declare const PLATFORM_ICONS: Record<string, string>;
export declare const PLATFORM_LABELS: Record<string, string>;
export declare const PLATFORM_NAMES: Record<string, string>;
export declare const xmlParser: XMLParser;
export declare function textOf(val: Record<string, unknown>): string;
export declare function extractLink(link: Record<string, unknown>): string;
//# sourceMappingURL=rss-parser.d.ts.map