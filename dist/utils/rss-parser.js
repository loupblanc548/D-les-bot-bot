"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.xmlParser = exports.PLATFORM_NAMES = exports.PLATFORM_LABELS = exports.PLATFORM_ICONS = exports.PLATFORM_COLORS = exports.RSS_HEADERS = void 0;
exports.textOf = textOf;
exports.extractLink = extractLink;
const fast_xml_parser_1 = require("fast-xml-parser");
// RSS Headers constants
exports.RSS_HEADERS = {
    Accept: 'application/rss+xml, application/xml, text/xml',
    'User-Agent': 'DiscordSurveillanceBot/1.0',
};
// Platform constants
exports.PLATFORM_COLORS = {
    youtube: 0xFF0000,
    twitter: 0x1DA1F2,
    blog: 0xE67E22,
    bluesky: 0x0085FF,
    epicgames: 0x7c3aed,
    'patch-notes': 0x5865f2,
};
exports.PLATFORM_ICONS = {
    youtube: '▶️',
    twitter: '🐦',
    blog: '📰',
    bluesky: '🦋',
    epicgames: '🎮',
};
exports.PLATFORM_LABELS = {
    youtube: 'NOUVEAUTÉ sur YouTube !',
    twitter: 'Nouveau Tweet !',
    blog: 'Nouvel article !',
    bluesky: 'Nouveau post Bluesky !',
    'patch-notes': '📢 Notes de mise à jour !',
};
exports.PLATFORM_NAMES = {
    youtube: 'YouTube',
    twitter: 'Twitter/X',
    bluesky: 'Bluesky',
};
// XML Parser instance (shared)
exports.xmlParser = new fast_xml_parser_1.XMLParser({
    ignoreAttributes: false,
    attributeNamePrefix: '@_',
    removeNSPrefix: true,
    isArray: (name) => ['item', 'entry'].includes(name),
});
// Helper functions for RSS parsing
function textOf(val) {
    return typeof val === 'string' ? val : val?.['#text'] || '';
}
function extractLink(link) {
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