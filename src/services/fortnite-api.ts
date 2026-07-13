import { fortniteLogger } from "../utils/logger.js";
import { broadcastFortniteUpdate, pushFortniteDetection } from "./fortnite-broadcast.js";
// Service Fortnite-API.com — boutique du jour, cosmétiques, wishlist check
import { config } from "../config.js";
// API gratuite, pas de clé requise
// Docs: https://fortnite-api.com

import prisma from "../prisma.js";
import { Client, EmbedBuilder } from "discord.js";
interface FortniteApiResponse {
  status: number;
  data: {
    entries?: Record<string, any>[];
    date?: string;
  };
}

const SHOP_URL = "https://fortnite-api.com/v2/shop";

// Cache TTL 15 minutes (la boutique change une fois par jour)
const CACHE_TTL_MS = config.fortniteCacheTtlMs;
const shopCache = new Map<string, { data: FortniteShopResponse | null; ts: number }>();
let lastSweep = 0;
const SWEEP_COOLDOWN_MS = 60_000;

function sweepCache() {
  const now = Date.now();
  if (now - lastSweep < SWEEP_COOLDOWN_MS) return;
  lastSweep = now;
  for (const [key, { ts }] of shopCache) {
    if (now - ts >= CACHE_TTL_MS) shopCache.delete(key);
  }
}

// --- Types ---

export interface ShopEntry {
  displayName: string;
  allNames: string[];
  description: string;
  type: string;
  rarity: string;
  rarityColor: number;
  price: number;
  icon: string;
  featuredImage: string | null;
  section: string;
}

export interface FortniteShopResponse {
  date: string;
  featured: ShopEntry[];
  daily: ShopEntry[];
  specialFeatured: ShopEntry[];
  specialDaily: ShopEntry[];
}

interface FortniteApiItem {
  displayName?: string;
  name?: string;
  description?: string;
  type?: { displayValue?: string; backendValue?: string };
  rarity?: { displayValue?: string; backendValue?: string };
  price?: { regularPrice?: number; finalPrice?: number };
  images?: { icon?: string; featured?: string; smallIcon?: string };
}

// --- Helpers ---

const RARITY_COLORS: Record<string, number> = {
  common: 0xb0b0b0,
  uncommon: 0x00cc00,
  rare: 0x0099ff,
  epic: 0x9933ff,
  legendary: 0xff6600,
  mythic: 0xffcc00,
  icon: 0x00ffff,
  marvel: 0xff0000,
  dc: 0x3366ff,
  "star wars": 0xffff00,
  frozen: 0x66ccff,
  lava: 0xff4400,
  shadow: 0x333333,
  slurp: 0x00ffcc,
};

function getRarityColor(rarity: string): number {
  return RARITY_COLORS[rarity.toLowerCase()] || 0xb0b0b0;
}

/**
 * Extrait TOUS les noms affichables d'une entrée brute de la boutique (pack + sous-articles).
 * - Récupère le nom du bundle/pack si présent (entry.bundle.name)
 * - Récupère le nom de chaque item dans entry.items (utilise displayName ou name en fallback)
 * - Retourne un tableau de noms normalisés (minuscule/trim) et uniques
 */
export function extractAllNamesFromEntry(entry: Record<string, unknown>): string[] {
  const names = new Set<string>();
  const e = entry as Record<string, any>;

  // 1. Nom du pack/bundle si présent
  const bundleName = e.bundle?.name || e.bundle?.displayName || e.displayName || e.name || "";
  if (bundleName) {
    names.add(bundleName.toLowerCase().trim());
  }

  // 2. Nom de chaque sous-article (items / brItems)
  const items: Record<string, any>[] = (e.items || e.brItems || []) as Record<string, any>[];
  for (const item of items) {
    const itemName = item.displayName || item.name || "";
    if (itemName) {
      names.add(itemName.toLowerCase().trim());
    }
  }

  // 3. Si rien trouvé, log un avertissement (uniquement si on n'a vraiment aucun nom)
  if (names.size === 0) {
    fortniteLogger.warn(
      `[FortniteAPI] \u26a0\ufe0f Entrée sans nom exploitable détectée (offerId: ${entry.offerId || "inconnu"})`,
    );
  }

  return [...names];
}

const ESCAPE_RE = /[.*+?^${}()|[\]\\]/g;
const _regexCache = new Map<string, RegExp>();

/**
 * Word-level fuzzy matching entre le nom wishlist et le nom boutique.
 * Stratégie :
 *  1. Split en mots (\W+), filtre les mots de 2+ caractères (évite "A", "I")
 *  2. Vérifie si un mot du shop est dans l'ensemble wishlist
 *  3. Fallback : boundary regex match (évite les faux positifs type "Skin" → "Skinny")
 */
export function matchesWishlist(wishlistName: string, shopName: string): boolean {
  const w = wishlistName.toLowerCase().trim();
  const s = shopName.toLowerCase().trim();

  // Correspondance exacte (insensible à la casse)
  if (w === s) return true;

  // Word-level : split sur non-word chars, filtre les mots de 2+ caractères
  const wWords = new Set(w.split(/\W+/).filter((x) => x.length >= 2));
  if (wWords.size > 0) {
    for (const sw of s.split(/\W+/)) {
      if (sw.length >= 2 && wWords.has(sw)) return true;
    }
  }

  // Fallback : boundary regex (avec cache)
  let regex = _regexCache.get(w);
  if (!regex) {
    const escaped = w.replace(ESCAPE_RE, "\\$&");
    regex = new RegExp("(^|\\W)" + escaped + "($|\\W)", "i");
    if (_regexCache.size > 200) _regexCache.clear();
    _regexCache.set(w, regex);
  }
  if (regex.test(s)) return true;

  return false;
}

// --- API calls ---

export async function fetchShop(): Promise<FortniteShopResponse | null> {
  const key = SHOP_URL;
  const cached = shopCache.get(key);
  if (cached && Date.now() - cached.ts < CACHE_TTL_MS) {
    fortniteLogger.info("[FortniteAPI] Boutique récupérée depuis le cache");
    return cached.data;
  }

  try {
    fortniteLogger.info("[FortniteAPI] Récupération de la boutique depuis l'API...");
    const res = await fetch(SHOP_URL, {
      headers: { "User-Agent": "DiscordSurveillanceBot/1.0" },
      signal: AbortSignal.timeout(10000),
    });
    if (!res.ok) {
      fortniteLogger.warn(`[FortniteAPI] Échec HTTP ${res.status} — boutique indisponible`);
      sweepCache();
      shopCache.set(key, { data: null, ts: Date.now() });
      return null;
    }
    const json = (await res.json()) as FortniteApiResponse;
    if (json.status !== 200 || !json.data) {
      fortniteLogger.warn("[FortniteAPI] Réponse API invalide (status != 200 ou data manquant)");
      sweepCache();
      shopCache.set(key, { data: null, ts: Date.now() });
      return null;
    }

    const entries = json.data.entries || [];
    const featured: ShopEntry[] = [];
    const daily: ShopEntry[] = [];
    const specialFeatured: ShopEntry[] = [];
    const specialDaily: ShopEntry[] = [];
    const unknown: ShopEntry[] = []; // Fallback : sections non reconnues

    for (const rawEntry of entries) {
      const entry = rawEntry as Record<string, any>;
      // Normalisé en minuscule : l'API renvoie "Featured","Daily","BestSellers", etc.
      const section = (entry.section?.id || "").toLowerCase();
      const items: FortniteApiItem[] = (entry.items || entry.brItems || []) as FortniteApiItem[];

      // Extraction de TOUS les noms pour cette entrée (pack + sous-articles)
      const allNames = extractAllNamesFromEntry(entry);

      // Log diagnostic pour les packs/bundles (uniquement si un vrai bundle est présent)
      if (allNames.length > 1 && entry.bundle) {
        const bundleLabel = allNames[0];
        const subItems = allNames.slice(1);
        fortniteLogger.info(
          `\u{1F4E6} [Shop Scan] Pack détecté : ${bundleLabel}. Contient les sous-articles : [${subItems.join(", ")}]`,
        );
      }

      // Compteur pour savoir si au moins un item a été transformé en ShopEntry
      let itemsProcessed = 0;

      for (const item of items) {
        // Fallback displayName → name pour les items sans displayName (commun dans les bundles)
        const itemDisplayName = item.displayName || item.name || "";
        if (!itemDisplayName) continue; // skip les items sans aucun nom

        // Utiliser les métadonnées de l'item, avec fallback sur l'entrée parente
        const mapped: ShopEntry = {
          displayName: itemDisplayName,
          allNames,
          description: (item.description || entry.description || "").slice(0, 200),
          type: item.type?.displayValue || entry.type?.displayValue || "",
          rarity: item.rarity?.displayValue || entry.rarity?.displayValue || "",
          rarityColor: getRarityColor(
            item.rarity?.displayValue || entry.rarity?.displayValue || "",
          ),
          price:
            item.price?.finalPrice ||
            item.price?.regularPrice ||
            entry.price?.finalPrice ||
            entry.price?.regularPrice ||
            0,
          icon: item.images?.icon || entry.images?.icon || "",
          featuredImage: item.images?.featured || entry.images?.featured || null,
          section,
        };
        if (section === "featured") featured.push(mapped);
        else if (section === "daily") daily.push(mapped);
        else if (section.startsWith("specialfeatured")) specialFeatured.push(mapped);
        else if (section.startsWith("specialdaily")) specialDaily.push(mapped);
        else unknown.push(mapped);

        itemsProcessed++;
      }

      // FALLBACK : si aucun item n'a été traité (items vide ou sans nom),
      // on crée UNE ShopEntry à partir du nom de premier niveau (entry.name / entry.displayName).
      // Cela couvre les cosmétiques offerts, les items sans sous-tableau 'items',
      // et les cas où l'API change le format des champs.
      if (itemsProcessed === 0 && allNames.length > 0) {
        const topName = allNames[0];
        const mapped: ShopEntry = {
          displayName: topName,
          allNames,
          description: (entry.description || "").slice(0, 200),
          type: entry.type?.displayValue || "",
          rarity: entry.rarity?.displayValue || "",
          rarityColor: getRarityColor(entry.rarity?.displayValue || ""),
          price: entry.price?.finalPrice || entry.price?.regularPrice || 0,
          icon: entry.images?.icon || "",
          featuredImage: entry.images?.featured || null,
          section,
        };
        if (section === "featured") featured.push(mapped);
        else if (section === "daily") daily.push(mapped);
        else if (section.startsWith("specialfeatured")) specialFeatured.push(mapped);
        else if (section.startsWith("specialdaily")) specialDaily.push(mapped);
        else unknown.push(mapped);

        fortniteLogger.info(
          `\u{1F527} [Shop Scan] Entrée sans sous-items traitée via fallback : "${topName}" ` +
            `(section: ${section || "inconnue"}, offerId: ${entry.offerId || "inconnu"})`,
        );
      } else if (itemsProcessed === 0) {
        // Vraiment rien : ni items avec nom, ni nom de premier niveau
        fortniteLogger.warn(
          `[FortniteAPI] \u26a0\ufe0f Entrée sans nom exploitable — ignorée ` +
            `(section: ${section || "inconnue"}, offerId: ${entry.offerId || "inconnu"})`,
        );
      }
    }

    // ─── Redistribution des sections inconnues ───
    // L'API Fortnite v2 expose désormais 10+ sections (Featured, Daily, BestSellers,
    // BattlePass, SpecialOffers, New, Icons, GamingLegends, FortniteAnime, Lego...).
    // Seules "featured" et "daily" sont reconnues (case-insensitive).
    // Les autres (BestSellers, SpecialOffers, etc.) sont ajoutées à "daily".
    // Si vraiment aucune section connue n'a matché, tout va dans "featured".

    // CORRECTION : si aucune section connue n'a matché mais qu'il y a des items
    // inconnus, c'est probablement un changement d'API → on les met dans "featured"
    const totalKnown =
      featured.length + daily.length + specialFeatured.length + specialDaily.length;
    if (totalKnown === 0 && unknown.length > 0) {
      fortniteLogger.warn(
        `[FortniteAPI] \u26a0\ufe0f Aucune section reconnue (featured/daily/etc.) ! ` +
          `${unknown.length} items récupérés dans des sections inconnues, ajoutés à "featured". ` +
          `Sections détectées : ${[...new Set(unknown.map((i) => i.section))].join(", ")}`,
      );
      featured.push(...unknown);
    } else if (unknown.length > 0) {
      fortniteLogger.info(
        `[FortniteAPI] ${unknown.length} items dans des sections non reconnues ` +
          `(${[...new Set(unknown.map((i) => i.section))].join(", ")}), ajoutés à "daily"`,
      );
      daily.push(...unknown);
    }

    const result: FortniteShopResponse = {
      date: json.data.date || new Date().toISOString().split("T")[0],
      featured,
      daily,
      specialFeatured,
      specialDaily,
    };

    fortniteLogger.info(
      `[FortniteAPI] Boutique du ${result.date} récupérée : ` +
        `${featured.length} featured, ${daily.length} daily, ` +
        `${specialFeatured.length} specialFeatured, ${specialDaily.length} specialDaily`,
    );

    // Broadcast shop update to WebSocket clients
    broadcastFortniteUpdate({
      shop: [...featured, ...daily, ...specialFeatured, ...specialDaily].slice(0, 50).map((e) => ({
        name: e.displayName,
        rarity: e.rarity,
        price: e.price,
        icon: e.icon || undefined,
      })),
    });

    sweepCache();
    shopCache.set(key, { data: result, ts: Date.now() });
    return result;
  } catch (err) {
    fortniteLogger.error("[FortniteAPI] Erreur réseau/parse :", String(err));
    sweepCache();
    shopCache.set(key, { data: null, ts: Date.now() });
    return null;
  }
}

// --- Wishlist check & DM notifications ---

export async function checkWishlistMatches(client: Client): Promise<number> {
  fortniteLogger.info("\n\ud83d\udd0d [Wishlist] ====== DÉBUT DU SCAN DE NOTIFICATION ======");
  let sentCount = 0;
  let failCount = 0;

  try {
    fortniteLogger.info("\ud83d\udd0d [Wishlist] Récupération de la boutique Fortnite...");
    const shop = await fetchShop();
    if (!shop) {
      fortniteLogger.info("\u274c [Wishlist] Boutique indisponible, scan annulé.");
      return 0;
    }

    const allItems = [
      ...shop.featured,
      ...shop.daily,
      ...shop.specialFeatured,
      ...shop.specialDaily,
    ];
    fortniteLogger.info(
      "\ud83d\udcca [Wishlist] Boutique du " + shop.date + " : " + allItems.length + " objets",
    );

    fortniteLogger.info("\ud83d\udd0d [Wishlist] Récupération des wishlists en base...");
    const wishlistItems = await prisma.wishlist.findMany({ take: 1000 });
    fortniteLogger.info(
      "\ud83d\udcca [Wishlist] " + wishlistItems.length + " entrée(s) wishlist trouvée(s)",
    );

    if (wishlistItems.length === 0 || allItems.length === 0) {
      fortniteLogger.info(
        "\u26a0\ufe0f [Wishlist] Aucune entrée wishlist ou boutique vide, scan terminé.",
      );
      return 0;
    }

    fortniteLogger.info("\ud83c\udfaf [Wishlist] Début du matching...");
    const matchMap = new Map<string, { userId: string; itemName: string; entry: ShopEntry }>();

    for (const entry of allItems) {
      // On match contre TOUS les noms extraits (pack + sous-articles)
      const namesToCheck =
        entry.allNames.length > 0 ? entry.allNames : [entry.displayName.toLowerCase().trim()];

      for (const wish of wishlistItems) {
        const wishNameLower = wish.itemName.toLowerCase().trim();
        if (!wishNameLower) continue;
        // Vérifier si déjà notifié récemment (évite les doublons — 24h de cooldown)
        if (wish.lastNotifiedAt) {
          const hoursSinceNotified =
            (Date.now() - wish.lastNotifiedAt.getTime()) / (1000 * 60 * 60);
          if (hoursSinceNotified < 24) continue;
        }

        // Vérifie si le nom de la wishlist correspond à l'un des noms extraits
        let matched = false;
        for (const shopName of namesToCheck) {
          if (!shopName) continue;
          if (matchesWishlist(wishNameLower, shopName)) {
            matched = true;
            break;
          }
        }

        if (!matched) continue;

        const key = wish.userId + "|" + wish.itemName;
        if (!matchMap.has(key)) {
          matchMap.set(key, { userId: wish.userId, itemName: wish.itemName, entry });
          // Log de diagnostic enrichi
          if (namesToCheck.length > 1) {
            fortniteLogger.info(
              `\ud83c\udfaf [Shop Match] Le skin "${wish.itemName}" trouvé dans un pack correspond à la wishlist de ${wish.userId} !`,
            );
          } else {
            fortniteLogger.info(
              `\ud83c\udfaf [Wishlist] MATCH ! "${entry.displayName}" correspond à la wishlist de ${wish.userId} (cherchait: ${wish.itemName})`,
            );
          }
        }
      }
    }

    fortniteLogger.info(
      "\ud83d\udcca [Wishlist] " + matchMap.size + " correspondance(s) trouvée(s)",
    );
    if (matchMap.size === 0) {
      fortniteLogger.info("\u2705 [Wishlist] Aucun match — scan terminé.");
      return 0;
    }

    fortniteLogger.info(
      "\ud83d\udce8 [Wishlist] Envoi des notifications DM à " +
        matchMap.size +
        " utilisateur(s) (avec pause anti-rate-limit)...",
    );

    // Boucle séquentielle avec micro-pause de 200ms entre chaque DM (anti-rate-limit Discord)
    const matches = [...matchMap.values()];
    for (const match of matches) {
      try {
        const pref = await prisma.userPreference.findUnique({ where: { userId: match.userId } });
        if (pref && pref.wishlistDm === false) {
          fortniteLogger.info(
            "\u23ed\ufe0f [Wishlist] DM ignoré pour " + match.userId + " — wishlistDm désactivé",
          );
          continue;
        }

        const user = await client.users.fetch(match.userId);
        if (!user) {
          fortniteLogger.warn(
            "\u26a0\ufe0f [Wishlist] Utilisateur " + match.userId + " introuvable",
          );
          failCount++;
          continue;
        }

        const embed = new EmbedBuilder()
          .setTitle("\ud83c\udf89 " + match.entry.displayName)
          .setDescription(
            "L'objet **" +
              match.itemName +
              "** que tu surveillais est disponible aujourd'hui dans la boutique Fortnite !",
          )
          .setColor(match.entry.rarityColor || 0x9b59b6)
          .setURL("https://fortnite.gg/shop")
          .addFields(
            { name: "Rareté", value: match.entry.rarity || "Inconnue", inline: true },
            {
              name: "Prix",
              value: match.entry.price ? match.entry.price + " V-Bucks" : "Gratuit",
              inline: true,
            },
            { name: "Type", value: match.entry.type || "Cosmétique", inline: true },
          )
          .setTimestamp();

        if (match.entry.featuredImage) embed.setImage(match.entry.featuredImage);
        else if (match.entry.icon) embed.setThumbnail(match.entry.icon);

        await user.send({ embeds: [embed] });
        sentCount++;
        fortniteLogger.info(
          "\u2705 [Wishlist] DM envoyé à " +
            user.username +
            " (" +
            match.userId +
            ") pour " +
            match.itemName,
        );

        // Pause anti-rate-limit Discord (200ms entre chaque DM)
        await new Promise((resolve) => setTimeout(resolve, 200));

        // Marquer l'item comme notifié (horodatage anti-doublon)
        await prisma.wishlist.updateMany({
          where: { userId: match.userId, itemName: match.itemName },
          data: { lastNotifiedAt: new Date() },
        });
      } catch (dmError) {
        failCount++;
        const errMsg = dmError instanceof Error ? dmError.message : String(dmError);
        fortniteLogger.warn(
          "\u274c [Wishlist] Échec DM pour " +
            match.userId +
            " : " +
            errMsg +
            " (DMs probablement fermés, on continue)",
        );
      }
    }

    fortniteLogger.info(
      "\u2705 [Wishlist] ====== SCAN TERMINÉ : " +
        sentCount +
        " notification(s) envoyée(s), " +
        failCount +
        " échec(s) (sur " +
        matchMap.size +
        " correspondance(s)) ======\n",
    );

    // Broadcast Fortnite update to WebSocket clients
    if (sentCount > 0) {
      broadcastFortniteUpdate({ skins: sentCount });
      pushFortniteDetection("skins", sentCount + " skin(s) trouvé(s) en wishlist");
    }
    return sentCount;
  } catch (err) {
    fortniteLogger.error(
      "\ud83d\udca5 [CRASH WISHLIST SCAN] Erreur fatale dans checkWishlistMatches :",
      err,
    );
    return 0;
  }
}

// --- Wishlist retrospective (catch-up after bot downtime) ---

export async function runWishlistRetrospective(client: Client): Promise<number> {
  fortniteLogger.info(
    "\n\ud83d\udd04 [Wishlist Retrospective] ====== DÉBUT DE LA RÉTROSPECTIVE WISHLIST ======",
  );
  let sentCount = 0;

  try {
    fortniteLogger.info(
      "\ud83d\udd0d [Wishlist Retrospective] Récupération de la boutique Fortnite...",
    );
    const shop = await fetchShop();
    if (!shop) {
      fortniteLogger.info(
        "\u274c [Wishlist Retrospective] Boutique indisponible, rétrospective annulée.",
      );
      return 0;
    }

    const allItems = [
      ...shop.featured,
      ...shop.daily,
      ...shop.specialFeatured,
      ...shop.specialDaily,
    ];
    fortniteLogger.info(
      "\ud83d\udcca [Wishlist Retrospective] Boutique du " +
        shop.date +
        " : " +
        allItems.length +
        " objets",
    );

    fortniteLogger.info(
      "\ud83d\udd0d [Wishlist Retrospective] Récupération des wishlists en base...",
    );
    const wishlistItems = await prisma.wishlist.findMany({ take: 1000 });
    fortniteLogger.info(
      "\ud83d\udcca [Wishlist Retrospective] " +
        wishlistItems.length +
        " entrée(s) wishlist trouvée(s)",
    );

    if (wishlistItems.length === 0 || allItems.length === 0) {
      fortniteLogger.info(
        "\u26a0\ufe0f [Wishlist Retrospective] Aucune entrée wishlist ou boutique vide, rétrospective terminée.",
      );
      return 0;
    }

    fortniteLogger.info("\ud83c\udfaf [Wishlist Retrospective] Début du matching...");
    const matchMap = new Map<string, { userId: string; itemName: string; entry: ShopEntry }>();

    for (const entry of allItems) {
      // On match contre TOUS les noms extraits (pack + sous-articles)
      const namesToCheck =
        entry.allNames.length > 0 ? entry.allNames : [entry.displayName.toLowerCase().trim()];

      for (const wish of wishlistItems) {
        const wishNameLower = wish.itemName.toLowerCase().trim();
        if (!wishNameLower) continue;

        // Vérifier si déjà notifié récemment (évite les doublons — 24h de cooldown)
        if (wish.lastNotifiedAt) {
          const hoursSinceNotified =
            (Date.now() - wish.lastNotifiedAt.getTime()) / (1000 * 60 * 60);
          if (hoursSinceNotified < 24) {
            fortniteLogger.info(
              "\u23ed\ufe0f [Wishlist Retrospective] Déjà notifié il y a " +
                Math.floor(hoursSinceNotified) +
                "h, skip pour " +
                wish.itemName,
            );
            continue;
          }
        }

        let matched = false;
        for (const shopName of namesToCheck) {
          if (!shopName) continue;
          if (matchesWishlist(wishNameLower, shopName)) {
            matched = true;
            break;
          }
        }

        if (!matched) continue;

        const key = wish.userId + "|" + wish.itemName;
        if (!matchMap.has(key)) {
          matchMap.set(key, { userId: wish.userId, itemName: wish.itemName, entry });
          if (namesToCheck.length > 1) {
            fortniteLogger.info(
              `\ud83c\udfaf [Shop Match Retro] Le skin "${wish.itemName}" trouvé dans un pack correspond à la wishlist de ${wish.userId} !`,
            );
          } else {
            fortniteLogger.info(
              `\ud83c\udfaf [Wishlist Retrospective] MATCH ! "${entry.displayName}" correspond à la wishlist de ${wish.userId} (cherchait: ${wish.itemName})`,
            );
          }
        }
      }
    }

    fortniteLogger.info(
      "\ud83d\udcca [Wishlist Retrospective] " + matchMap.size + " correspondance(s) trouvée(s)",
    );
    if (matchMap.size === 0) {
      fortniteLogger.info("\u2705 [Wishlist Retrospective] Aucun match — rétrospective terminée.");
      return 0;
    }

    fortniteLogger.info(
      "\ud83d\udce8 [Wishlist Retrospective] Envoi des notifications DM à " +
        matchMap.size +
        " utilisateur(s) (avec pause anti-rate-limit)...",
    );

    // Boucle séquentielle avec micro-pause de 200ms entre chaque DM (anti-rate-limit Discord)
    const matches = [...matchMap.values()];
    for (const match of matches) {
      try {
        const pref = await prisma.userPreference.findUnique({ where: { userId: match.userId } });
        if (pref && pref.wishlistDm === false) {
          fortniteLogger.info(
            "\u23ed\ufe0f [Wishlist Retrospective] DM ignoré pour " +
              match.userId +
              " — wishlistDm désactivé",
          );
          continue;
        }

        const user = await client.users.fetch(match.userId);
        if (!user) {
          fortniteLogger.warn(
            "\u26a0\ufe0f [Wishlist Retrospective] Utilisateur " + match.userId + " introuvable",
          );
          continue;
        }

        const embed = new EmbedBuilder()
          .setTitle("\ud83c\udf89 " + match.entry.displayName)
          .setDescription(
            "L'objet **" +
              match.itemName +
              "** que tu surveillais est disponible aujourd'hui dans la boutique Fortnite !",
          )
          .setColor(match.entry.rarityColor || 0x9b59b6)
          .setURL("https://fortnite.gg/shop")
          .addFields(
            { name: "Rareté", value: match.entry.rarity || "Inconnue", inline: true },
            {
              name: "Prix",
              value: match.entry.price ? match.entry.price + " V-Bucks" : "Gratuit",
              inline: true,
            },
            { name: "Type", value: match.entry.type || "Cosmétique", inline: true },
          )
          .setTimestamp();

        if (match.entry.featuredImage) embed.setImage(match.entry.featuredImage);
        else if (match.entry.icon) embed.setThumbnail(match.entry.icon);

        await user.send({ embeds: [embed] });
        sentCount++;
        fortniteLogger.info(
          "\u2705 [Wishlist Retrospective] DM envoyé à " +
            user.username +
            " (" +
            match.userId +
            ") pour " +
            match.itemName,
        );

        // Pause anti-rate-limit Discord (200ms entre chaque DM)
        await new Promise((resolve) => setTimeout(resolve, 200));

        // Marquer l'item comme notifié (horodatage anti-doublon)
        await prisma.wishlist.updateMany({
          where: { userId: match.userId, itemName: match.itemName },
          data: { lastNotifiedAt: new Date() },
        });
      } catch (dmError) {
        const errMsg = dmError instanceof Error ? dmError.message : String(dmError);
        fortniteLogger.warn(
          "\u274c [Wishlist Retrospective] Échec DM pour " +
            match.userId +
            " : " +
            errMsg +
            " (DMs probablement fermés, on continue)",
        );
      }
    }

    fortniteLogger.info(
      "\u2705 [Wishlist Retrospective] ====== RÉTROSPECTIVE TERMINÉE : " +
        sentCount +
        " notification(s) envoyée(s) ======\n",
    );
    return sentCount;

    // Broadcast Fortnite update to WebSocket clients
    if (sentCount > 0) {
      broadcastFortniteUpdate({ skins: sentCount });
      pushFortniteDetection("skins", sentCount + " skin(s) trouvé(s) en rétrospective wishlist");
    }
  } catch (err) {
    fortniteLogger.error(
      "\ud83d\udca5 [CRASH WISHLIST RETROSPECTIVE] Erreur fatale dans runWishlistRetrospective :",
      err,
    );
    return 0;
  }
}
