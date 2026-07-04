/**
 * notificationCards.ts — Générateur de cartes de notification visuelles
 *
 * Utilise satori (JSX → SVG) + @resvg/resvg-js (SVG → PNG) pour créer
 * de belles images de notification pour chaque type d'alerte.
 *
 * Catégories supportées :
 *  - YouTube (nouvelle vidéo)
 *  - Blog/RSS (nouvel article)
 *  - Deal (réduction Steam, Instant Gaming, etc.)
 *  - FreeGame (jeu gratuit Epic/Steam)
 *  - PatchNote (news/patch notes)
 *  - Gaming (notification gaming générique par plateforme)
 */

import satori from "satori";
import { Resvg } from "@resvg/resvg-js";
import { readFile } from "fs/promises";
import { join } from "path";
import logger from "./logger.js";

// ─── Types ──────────────────────────────────────────────────────────────────

export type CardType = "youtube" | "blog" | "deal" | "freegame" | "patchnote" | "gaming";

export interface CardData {
  type: CardType;
  title: string;
  subtitle?: string;
  description?: string;
  imageUrl?: string;
  platformName?: string;
  platformColor?: string;
  badge?: string;
  url?: string;
  price?: string;
  originalPrice?: string;
  discountPercent?: number;
  endDate?: string;
}

// ─── Couleurs par plateforme ─────────────────────────────────────────────────

export const PLATFORM_COLORS: Record<string, string> = {
  steam: "#1b2838",
  epic: "#0078f2",
  playstation: "#003791",
  xbox: "#107c10",
  nintendo: "#e60012",
  instantgaming: "#ff5400",
  youtube: "#ff0000",
  blog: "#5865f2",
  generic: "#5865f2",
};

export const PLATFORM_LABELS: Record<string, string> = {
  steam: "STEAM",
  epic: "EPIC GAMES",
  playstation: "PLAYSTATION",
  xbox: "XBOX",
  nintendo: "NINTENDO",
  instantgaming: "INSTANT GAMING",
  youtube: "YOUTUBE",
  blog: "BLOG",
  generic: "GAMING",
};

// ─── Polices ─────────────────────────────────────────────────────────────────

let fontData: Buffer | null = null;

async function loadFont(): Promise<Buffer> {
  if (fontData) return fontData;
  try {
    const fontPath = join(process.cwd(), "assets", "fonts", "NotoSans-Bold.ttf");
    fontData = await readFile(fontPath);
    return fontData;
  } catch {
    // Fallback : utiliser une police système via Google Fonts CDN
    try {
      const response = await fetch(
        "https://cdn.jsdelivr.net/npm/@fontsource/inter@5.0.0/files/inter-latin-700-normal.woff",
      );
      if (response.ok) {
        fontData = Buffer.from(await response.arrayBuffer());
        return fontData;
      }
    } catch {
      // Ignore
    }
    // Dernier recours : buffer vide (satori utilisera une police par défaut)
    logger.warn("[NotificationCards] Police non trouvée, utilisation fallback");
    fontData = Buffer.alloc(0);
    return fontData;
  }
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

function truncate(text: string, max: number): string {
  if (text.length <= max) return text;
  return text.slice(0, max - 3) + "...";
}

function escapeXml(text: string): string {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

// ─── Templates JSX (objets satori) ───────────────────────────────────────────

interface SatoriNode {
  type: string;
  props: {
    style?: Record<string, string | number>;
    children?: SatoriNode | SatoriNode[] | string;
    [key: string]: unknown;
  };
}

function el(type: string, props: SatoriNode["props"]): SatoriNode {
  return { type, props };
}

function text(content: string, style: Record<string, string | number> = {}): SatoriNode {
  return el("div", { style, children: content });
}

function flex(children: SatoriNode[], style: Record<string, string | number> = {}): SatoriNode {
  return el("div", {
    style: { display: "flex", ...style },
    children,
  });
}

// ─── Carte YouTube ───────────────────────────────────────────────────────────

function youtubeCard(data: CardData): SatoriNode {
  const color = data.platformColor || PLATFORM_COLORS.youtube;
  return flex(
    [
      // Bande supérieure colorée
      el("div", {
        style: {
          width: "100%",
          height: "8px",
          backgroundColor: color,
          flexShrink: 0,
        },
      }),
      // Corps
      flex(
        [
          // Section image / thumbnail
          el("div", {
            style: {
              width: "100%",
              height: "180px",
              backgroundColor: "#0f0f0f",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              ...(data.imageUrl ? { backgroundImage: `url(${data.imageUrl})`, backgroundSize: "cover", backgroundPosition: "center" } : {}),
            },
            children: data.imageUrl ? [] : [text("▶", { fontSize: 48, color: "#ff0000" })],
          }),
          // Section texte
          flex(
            [
              // Badge plateforme
              flex(
                [
                  text("▶", { fontSize: 16, color: "#ff0000", marginRight: 6 }),
                  text("YOUTUBE", {
                    fontSize: 14,
                    color: "#ff0000",
                    fontWeight: 700,
                    letterSpacing: 2,
                  }),
                ],
                { alignItems: "center", marginBottom: 8 },
              ),
              // Titre
              text(truncate(data.title, 80), {
                fontSize: 22,
                color: "#ffffff",
                fontWeight: 700,
                lineHeight: 1.3,
              }),
              // Subtitle (chaîne)
              data.subtitle
                ? text(data.subtitle, {
                    fontSize: 14,
                    color: "#aaaaaa",
                    marginTop: 6,
                  })
                : el("div", { style: {} }),
            ],
            {
              flexDirection: "column",
              padding: 20,
              width: "100%",
            },
          ),
        ],
        { flexDirection: "column", flex: 1 },
      ),
    ],
    {
      flexDirection: "column",
      width: 600,
      height: 340,
      backgroundColor: "#1a1a1a",
      borderRadius: 12,
      overflow: "hidden",
    },
  );
}

// ─── Carte Blog/RSS ──────────────────────────────────────────────────────────

function blogCard(data: CardData): SatoriNode {
  const color = data.platformColor || PLATFORM_COLORS.blog;
  return flex(
    [
      el("div", {
        style: { width: "100%", height: "8px", backgroundColor: color, flexShrink: 0 },
      }),
      flex(
        [
          data.imageUrl
            ? el("div", {
                style: {
                  width: "100%",
                  height: "160px",
                  backgroundImage: `url(${data.imageUrl})`,
                  backgroundSize: "cover",
                  backgroundPosition: "center",
                },
              })
            : el("div", {
                style: {
                  width: "100%",
                  height: "160px",
                  backgroundColor: "#2a2a3a",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                },
                children: [text("📰", { fontSize: 40 })],
              }),
          flex(
            [
              flex(
                [
                  text("📰", { fontSize: 16, marginRight: 6 }),
                  text("BLOG / RSS", {
                    fontSize: 14,
                    color: color,
                    fontWeight: 700,
                    letterSpacing: 2,
                  }),
                ],
                { alignItems: "center", marginBottom: 8 },
              ),
              text(truncate(data.title, 80), {
                fontSize: 22,
                color: "#ffffff",
                fontWeight: 700,
                lineHeight: 1.3,
              }),
              data.subtitle
                ? text(truncate(data.subtitle, 100), {
                    fontSize: 14,
                    color: "#999999",
                    marginTop: 6,
                  })
                : el("div", { style: {} }),
            ],
            { flexDirection: "column", padding: 20, width: "100%" },
          ),
        ],
        { flexDirection: "column", flex: 1 },
      ),
    ],
    {
      flexDirection: "column",
      width: 600,
      height: 320,
      backgroundColor: "#1e1e2e",
      borderRadius: 12,
      overflow: "hidden",
    },
  );
}

// ─── Carte Deal (réduction) ──────────────────────────────────────────────────

function dealCard(data: CardData): SatoriNode {
  const color = data.platformColor || PLATFORM_COLORS.steam;
  const platformLabel = data.platformName || "DEAL";
  return flex(
    [
      el("div", {
        style: { width: "100%", height: "8px", backgroundColor: color, flexShrink: 0 },
      }),
      flex(
        [
          // Image du jeu
          data.imageUrl
            ? el("div", {
                style: {
                  width: "100%",
                  height: "200px",
                  backgroundImage: `url(${data.imageUrl})`,
                  backgroundSize: "cover",
                  backgroundPosition: "center",
                },
              })
            : el("div", {
                style: {
                  width: "100%",
                  height: "200px",
                  backgroundColor: "#1a1a2e",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                },
                children: [text("🔥", { fontSize: 48 })],
              }),
          // Badge réduction
          data.discountPercent
            ? el("div", {
                style: {
                  position: "absolute",
                  top: 180,
                  right: 20,
                  backgroundColor: "#43b581",
                  borderRadius: 8,
                  padding: "6px 12px",
                },
                children: [
                  text(`-${data.discountPercent}%`, {
                    fontSize: 20,
                    color: "#ffffff",
                    fontWeight: 700,
                  }),
                ],
              })
            : el("div", { style: {} }),
          // Infos
          flex(
            [
              flex(
                [
                  text("🔥", { fontSize: 16, marginRight: 6 }),
                  text(platformLabel, {
                    fontSize: 14,
                    color: color,
                    fontWeight: 700,
                    letterSpacing: 2,
                  }),
                ],
                { alignItems: "center", marginBottom: 8 },
              ),
              text(truncate(data.title, 70), {
                fontSize: 22,
                color: "#ffffff",
                fontWeight: 700,
                lineHeight: 1.3,
              }),
              // Prix
              flex(
                [
                  data.originalPrice
                    ? text(data.originalPrice, {
                        fontSize: 16,
                        color: "#666666",
                        textDecoration: "line-through",
                        marginRight: 10,
                      })
                    : el("div", { style: {} }),
                  data.price
                    ? text(data.price, {
                        fontSize: 24,
                        color: "#43b581",
                        fontWeight: 700,
                      })
                    : el("div", { style: {} }),
                ],
                { alignItems: "center", marginTop: 10 },
              ),
              data.endDate
                ? text(`⏰ ${data.endDate}`, {
                    fontSize: 14,
                    color: "#999999",
                    marginTop: 8,
                  })
                : el("div", { style: {} }),
            ],
            { flexDirection: "column", padding: 20, width: "100%" },
          ),
        ],
        { flexDirection: "column", flex: 1, position: "relative" },
      ),
    ],
    {
      flexDirection: "column",
      width: 600,
      height: 400,
      backgroundColor: "#1a1a2e",
      borderRadius: 12,
      overflow: "hidden",
    },
  );
}

// ─── Carte Jeu Gratuit ───────────────────────────────────────────────────────

function freeGameCard(data: CardData): SatoriNode {
  const color = data.platformColor || PLATFORM_COLORS.epic;
  const platformLabel = data.platformName || "JEU GRATUIT";
  return flex(
    [
      el("div", {
        style: { width: "100%", height: "8px", backgroundColor: color, flexShrink: 0 },
      }),
      flex(
        [
          data.imageUrl
            ? el("div", {
                style: {
                  width: "100%",
                  height: "200px",
                  backgroundImage: `url(${data.imageUrl})`,
                  backgroundSize: "cover",
                  backgroundPosition: "center",
                },
              })
            : el("div", {
                style: {
                  width: "100%",
                  height: "200px",
                  backgroundColor: "#0a1a2e",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                },
                children: [text("🎁", { fontSize: 48 })],
              }),
          // Badge GRATUIT
          el("div", {
            style: {
              position: "absolute",
              top: 180,
              right: 20,
              backgroundColor: "#43b581",
              borderRadius: 8,
              padding: "6px 14px",
            },
            children: [
              text("GRATUIT", {
                fontSize: 18,
                color: "#ffffff",
                fontWeight: 700,
                letterSpacing: 1,
              }),
            ],
          }),
          flex(
            [
              flex(
                [
                  text("🎁", { fontSize: 16, marginRight: 6 }),
                  text(platformLabel, {
                    fontSize: 14,
                    color: color,
                    fontWeight: 700,
                    letterSpacing: 2,
                  }),
                ],
                { alignItems: "center", marginBottom: 8 },
              ),
              text(truncate(data.title, 70), {
                fontSize: 22,
                color: "#ffffff",
                fontWeight: 700,
                lineHeight: 1.3,
              }),
              data.originalPrice
                ? flex(
                    [
                      text(data.originalPrice, {
                        fontSize: 16,
                        color: "#666666",
                        textDecoration: "line-through",
                        marginRight: 10,
                      }),
                      text("GRATUIT", {
                        fontSize: 24,
                        color: "#43b581",
                        fontWeight: 700,
                      }),
                    ],
                    { alignItems: "center", marginTop: 10 },
                  )
                : el("div", { style: {} }),
              data.endDate
                ? text(`⏰ ${data.endDate}`, {
                    fontSize: 14,
                    color: "#999999",
                    marginTop: 8,
                  })
                : el("div", { style: {} }),
            ],
            { flexDirection: "column", padding: 20, width: "100%" },
          ),
        ],
        { flexDirection: "column", flex: 1, position: "relative" },
      ),
    ],
    {
      flexDirection: "column",
      width: 600,
      height: 400,
      backgroundColor: "#0d1b2a",
      borderRadius: 12,
      overflow: "hidden",
    },
  );
}

// ─── Carte Patch Note / News ─────────────────────────────────────────────────

function patchNoteCard(data: CardData): SatoriNode {
  const color = data.platformColor || PLATFORM_COLORS.steam;
  const platformLabel = data.platformName || "PATCH NOTES";
  return flex(
    [
      el("div", {
        style: { width: "100%", height: "8px", backgroundColor: color, flexShrink: 0 },
      }),
      flex(
        [
          data.imageUrl
            ? el("div", {
                style: {
                  width: "100%",
                  height: "160px",
                  backgroundImage: `url(${data.imageUrl})`,
                  backgroundSize: "cover",
                  backgroundPosition: "center",
                },
              })
            : el("div", {
                style: {
                  width: "100%",
                  height: "160px",
                  backgroundColor: "#1a1a2e",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                },
                children: [text("📋", { fontSize: 40 })],
              }),
          flex(
            [
              flex(
                [
                  text("📋", { fontSize: 16, marginRight: 6 }),
                  text(platformLabel, {
                    fontSize: 14,
                    color: color,
                    fontWeight: 700,
                    letterSpacing: 2,
                  }),
                ],
                { alignItems: "center", marginBottom: 8 },
              ),
              text(truncate(data.title, 80), {
                fontSize: 22,
                color: "#ffffff",
                fontWeight: 700,
                lineHeight: 1.3,
              }),
              data.description
                ? text(truncate(data.description, 120), {
                    fontSize: 14,
                    color: "#999999",
                    marginTop: 8,
                    lineHeight: 1.4,
                  })
                : el("div", { style: {} }),
            ],
            { flexDirection: "column", padding: 20, width: "100%" },
          ),
        ],
        { flexDirection: "column", flex: 1 },
      ),
    ],
    {
      flexDirection: "column",
      width: 600,
      height: 340,
      backgroundColor: "#1a1a2e",
      borderRadius: 12,
      overflow: "hidden",
    },
  );
}

// ─── Carte Gaming générique ──────────────────────────────────────────────────

function gamingCard(data: CardData): SatoriNode {
  const color = data.platformColor || PLATFORM_COLORS.generic;
  const platformLabel = data.platformName || "GAMING";
  return flex(
    [
      el("div", {
        style: { width: "100%", height: "8px", backgroundColor: color, flexShrink: 0 },
      }),
      flex(
        [
          data.imageUrl
            ? el("div", {
                style: {
                  width: "100%",
                  height: "180px",
                  backgroundImage: `url(${data.imageUrl})`,
                  backgroundSize: "cover",
                  backgroundPosition: "center",
                },
              })
            : el("div", {
                style: {
                  width: "100%",
                  height: "180px",
                  backgroundColor: "#1a1a2e",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                },
                children: [text("🎮", { fontSize: 40 })],
              }),
          flex(
            [
              flex(
                [
                  text("🎮", { fontSize: 16, marginRight: 6 }),
                  text(platformLabel, {
                    fontSize: 14,
                    color: color,
                    fontWeight: 700,
                    letterSpacing: 2,
                  }),
                ],
                { alignItems: "center", marginBottom: 8 },
              ),
              text(truncate(data.title, 80), {
                fontSize: 22,
                color: "#ffffff",
                fontWeight: 700,
                lineHeight: 1.3,
              }),
              data.subtitle
                ? text(truncate(data.subtitle, 100), {
                    fontSize: 14,
                    color: "#999999",
                    marginTop: 6,
                  })
                : el("div", { style: {} }),
            ],
            { flexDirection: "column", padding: 20, width: "100%" },
          ),
        ],
        { flexDirection: "column", flex: 1 },
      ),
    ],
    {
      flexDirection: "column",
      width: 600,
      height: 340,
      backgroundColor: "#1a1a2e",
      borderRadius: 12,
      overflow: "hidden",
    },
  );
}

// ─── Génération PNG ──────────────────────────────────────────────────────────

function selectTemplate(data: CardData): SatoriNode {
  switch (data.type) {
    case "youtube":
      return youtubeCard(data);
    case "blog":
      return blogCard(data);
    case "deal":
      return dealCard(data);
    case "freegame":
      return freeGameCard(data);
    case "patchnote":
      return patchNoteCard(data);
    case "gaming":
    default:
      return gamingCard(data);
  }
}

/**
 * Génère une carte de notification en PNG.
 *
 * @param data Données de la carte
 * @returns Buffer PNG ou null en cas d'erreur
 */
export async function generateNotificationCard(data: CardData): Promise<Buffer | null> {
  try {
    const font = await loadFont();
    const node = selectTemplate(data);

    const svg = await satori(node, {
      width: 600,
      height: data.type === "deal" || data.type === "freegame" ? 400 : 340,
      fonts: font.length > 0 ? [{ name: "Inter", data: font, weight: 700, style: "normal" }] : [],
    });

    const resvg = new Resvg(svg, {
      fitTo: { mode: "width", value: 600 },
      background: "transparent",
    });
    const pngData = resvg.render();
    return pngData.asPng();
  } catch (error) {
    logger.error(
      `[NotificationCards] Erreur génération carte: ${error instanceof Error ? error.message : String(error)}`,
    );
    return null;
  }
}

/**
 * Génère une carte et retourne un Attachment prêt pour Discord.
 *
 * @param data Données de la carte
 * @param filename Nom du fichier (sans extension)
 * @returns { attachment: Buffer, name: string } ou null
 */
export async function generateCardAttachment(
  data: CardData,
  filename: string = "notification",
): Promise<{ attachment: Buffer; name: string } | null> {
  const png = await generateNotificationCard(data);
  if (!png) return null;
  return {
    attachment: png,
    name: `${filename}.png`,
  };
}

// ─── Helpers par plateforme ──────────────────────────────────────────────────

export function getPlatformColor(platform: string): string {
  return PLATFORM_COLORS[platform.toLowerCase()] || PLATFORM_COLORS.generic;
}

export function getPlatformLabel(platform: string): string {
  return PLATFORM_LABELS[platform.toLowerCase()] || PLATFORM_LABELS.generic;
}
