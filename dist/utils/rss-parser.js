import { XMLParser } from 'fast-xml-parser';
// RSS Headers constants
export const RSS_HEADERS = {
    Accept: 'application/rss+xml, application/xml, text/xml',
    'User-Agent': 'DiscordSurveillanceBot/1.0',
};
// Platform constants
export const PLATFORM_COLORS = {
    youtube: 0xFF0000,
    twitter: 0x1DA1F2,
    blog: 0xE67E22,
    bluesky: 0x0085FF,
    epicgames: 0x7c3aed,
    'patch-notes': 0x5865f2,
};
export const PLATFORM_ICONS = {
    youtube: '▶️',
    twitter: '🐦',
    blog: '📰',
    bluesky: '🦋',
    epicgames: '🎮',
};
export const PLATFORM_LABELS = {
    youtube: 'NOUVEAUTÉ sur YouTube !',
    twitter: 'Nouveau Tweet !',
    blog: 'Nouvel article !',
    bluesky: 'Nouveau post Bluesky !',
    'patch-notes': '📢 Notes de mise à jour !',
};
export const PLATFORM_NAMES = {
    youtube: 'YouTube',
    twitter: 'Twitter/X',
    bluesky: 'Bluesky',
};
// XML Parser instance (shared)
export const xmlParser = new XMLParser({
    ignoreAttributes: false,
    attributeNamePrefix: '@_',
    removeNSPrefix: true,
    isArray: (name) => ['item', 'entry'].includes(name),
});
// Helper functions for RSS parsing
export function textOf(val) {
    return typeof val === 'string' ? val : val?.['#text'] || '';
}
export function extractLink(link) {
    if (!link)
        return '';
    if (typeof link === 'string')
        return link;
    if (Array.isArray(link)) {
        const alt = link.find((l) => l['@_rel'] === 'alternate') || link[0];
        return alt?.['@_href'] || '';
    }
    return link['@_href'] || link['#text'] || '';
}
//# sourceMappingURL=rss-parser.js.map