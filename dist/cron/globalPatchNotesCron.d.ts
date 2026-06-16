import { Client } from "discord.js";
interface PatchNoteItem {
    title: string;
    link: string;
    pubDate: string;
    content?: string;
    contentSnippet?: string;
    author?: string;
    guid?: string;
    thumbnail?: string;
    enclosure?: {
        url: string;
        type: string;
    };
}
/**
 * Parse le XML RSS brut en items structures.
 * Utilise fast-xml-parser pour une extraction fiable de tous les champs.
 */
/** @internal Test-only export */
export declare function parseRssXmlItems(rawXml: string): PatchNoteItem[];
declare function checkPatchNotes(client: Client): Promise<void>;
export declare function startGlobalPatchNotesMonitoring(client: Client): void;
export declare function stopGlobalPatchNotesMonitoring(): void;
export { checkPatchNotes };
//# sourceMappingURL=globalPatchNotesCron.d.ts.map