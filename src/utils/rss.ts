/**
 * RSS parsing utilities partagées entre les cron jobs.
 * Centralise le parsing XML RSS/Atom avec fast-xml-parser.
 */

import { XMLParser } from "fast-xml-parser";

// ─── Types ────────────────────────────────────────────────────────────────────

export interface RssItem {
  title: string;
  link: string;
  pubDate: string;
  content?: string;
  contentSnippet?: string;
  author?: string;
  guid?: string;
  thumbnail?: string;
  enclosure?: { url: string; type: string };
}

// ─── Parser ────────────────────────────────────────────────────────────────────

/**
 * Parse le XML RSS brut en items structurés.
 * Utilise fast-xml-parser pour une extraction fiable de tous les champs.
 * Supporte RSS 2.0 et Atom.
 */
export function parseRssXmlItems(rawXml: string): RssItem[] {
  try {
    const parser = new XMLParser({ ignoreAttributes: false, attributeNamePrefix: "" });
    const parsed = parser.parse(rawXml);
    const rssItems = parsed?.rss?.channel?.item || parsed?.feed?.entry || [];
    const items = Array.isArray(rssItems) ? rssItems : [rssItems];

    // Helper: extrait le texte d'un champ (gère les objets avec attributs XML)
    const text = (val: any): string => {
      if (typeof val === "string") return val;
      if (val && typeof val === "object" && "#text" in (val as Record<string, any>)) {
        return String((val as Record<string, any>)["#text"]);
      }
      return String(val || "");
    };

    return items.map((it: Record<string, any>) => {
      // Atom <link href="..."/> -> it.link.href
      const linkObj = it.link as Record<string, any> | undefined;
      const link = typeof it.link === "string" ? it.link : (linkObj?.href ? String(linkObj.href) : "");

      return {
        title: text(it.title),
        link,
        // RSS <pubDate> ou Atom <published>
        pubDate: text(it.pubDate || it.published),
        // RSS <description> ou Atom <content>
        content: text(it.description || it.content),
        contentSnippet: text(it.description || it.content).replace(/<[^>]*>/g, ""),
        // RSS <author>, Atom <author><name>, ou Dublin Core <dc:creator>
        author: typeof it.author === "object" && it.author
          ? text((it.author as Record<string, any>).name || it.author)
          : text(it.author || it["dc:creator"]),
        // RSS <guid> ou Atom <id> (fallback: link)
        guid: text(it.guid || it.id) || link,
        thumbnail: text(it.thumbnail),
      } satisfies RssItem;
    });
  } catch {
    return [];
  }
}
