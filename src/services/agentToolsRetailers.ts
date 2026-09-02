/**
 * agentToolsRetailers.ts — Tools revendeurs pour l'agent IA (Quent)
 *
 * Ces tools permettent à Quent de :
 *  1. Rechercher un produit sur tous les revendeurs
 *  2. Rechercher sur un revendeur spécifique
 *  3. Tracker un produit (alerte prix/stock/promo)
 *  4. Arrêter le tracking d'un produit
 *  5. Lister les produits trackés
 *  6. Récupérer les deals en cours
 *  7. Récupérer l'historique de prix Amazon (Keepa)
 *  8. Lister les revendeurs disponibles
 *  9. Comparer les prix d'un produit sur plusieurs revendeurs
 *
 * Quent décide seul quel tool utiliser selon le contexte de la demande.
 */

import type { AgentToolDef, ToolCallResult, ToolContext } from "./agentTools.js";
import logger from "../utils/logger.js";
import {
  searchAllRetailers,
  searchRetailer,
  getRetailerDeals,
  trackProduct,
  untrackProduct,
  getTrackedProducts,
  getAvailableRetailers,
  getKeepaPriceHistory,
} from "./retailerAlerts.js";
import { RETAILER_NAMES, RETAILER_EMOJIS } from "./retailers/types.js";
import type { RetailerId, CountryCode } from "./retailers/types.js";

// ─── Tool Definitions (JSON Schema pour LLM function calling) ────────────────

export const RETAILER_TOOL_DEFS: AgentToolDef[] = [
  {
    type: "function",
    function: {
      name: "searchRetailers",
      description:
        "Recherche un produit sur plusieurs revendeurs (Amazon, eBay, Cdiscount, Fnac, etc.). " +
        "Retourne les meilleurs prix trouvés. Utilise ce tool quand l'utilisateur cherche un produit " +
        "ou veut comparer les prix entre boutiques.",
      parameters: {
        type: "object",
        properties: {
          query: {
            type: "string",
            description: "Le produit à rechercher (ex: 'PS5', 'iPhone 15', 'RTX 4070')",
          },
          retailers: {
            type: "array",
            items: {
              type: "string",
              enum: Object.keys(RETAILER_NAMES),
            },
            description: "Liste des revendeurs à interroger (optionnel, tous par défaut)",
          },
          countries: {
            type: "array",
            items: {
              type: "string",
              enum: ["FR", "DE", "BE", "NL", "ES", "IT", "CH", "UK", "US"],
            },
            description: "Pays cibles (optionnel, FR par défaut)",
          },
          max_price: {
            type: "number",
            description: "Prix maximum (optionnel)",
          },
          min_price: {
            type: "number",
            description: "Prix minimum (optionnel)",
          },
          sort_by: {
            type: "string",
            enum: ["price", "discount", "rating"],
            description: "Tri: price (par défaut), discount, rating",
          },
          limit: {
            type: "number",
            description: "Nombre max de résultats par revendeur (défaut: 5)",
          },
        },
        required: ["query"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "searchSingleRetailer",
      description:
        "Recherche un produit sur un revendeur spécifique. " +
        "Utilise ce tool quand l'utilisateur veut chercher sur une boutique en particulier.",
      parameters: {
        type: "object",
        properties: {
          retailer: {
            type: "string",
            enum: Object.keys(RETAILER_NAMES),
            description: "Le revendeur cible",
          },
          query: {
            type: "string",
            description: "Le produit à rechercher",
          },
          country: {
            type: "string",
            enum: ["FR", "DE", "BE", "NL", "ES", "IT", "CH", "UK", "US"],
            description: "Pays (défaut: FR)",
          },
          limit: {
            type: "number",
            description: "Nombre max de résultats (défaut: 10)",
          },
        },
        required: ["retailer", "query"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "trackRetailerProduct",
      description:
        "Active le suivi d'un produit pour alerter l'utilisateur en cas de baisse de prix, " +
        "remise en stock, ou promotion. Le bot vérifie périodiquement et envoie une alerte Discord.",
      parameters: {
        type: "object",
        properties: {
          retailer: {
            type: "string",
            enum: Object.keys(RETAILER_NAMES),
            description: "Le revendeur",
          },
          product_id: {
            type: "string",
            description: "L'ID du produit (ASIN pour Amazon, item ID pour eBay, etc.)",
          },
          title: {
            type: "string",
            description: "Le nom/titre du produit",
          },
          country: {
            type: "string",
            enum: ["FR", "DE", "BE", "NL", "ES", "IT", "CH", "UK", "US"],
            description: "Pays (défaut: FR)",
          },
          target_price: {
            type: "number",
            description: "Prix cible pour déclencher une alerte (optionnel)",
          },
          alert_restock: {
            type: "boolean",
            description: "Alerter si remis en stock (défaut: true)",
          },
          alert_price_drop: {
            type: "boolean",
            description: "Alerter si baisse de prix (défaut: true)",
          },
          alert_promotion: {
            type: "boolean",
            description: "Alerter si promotion détectée (défaut: true)",
          },
        },
        required: ["retailer", "product_id", "title"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "untrackRetailerProduct",
      description: "Désactive le suivi d'un produit. L'utilisateur ne recevra plus d'alertes.",
      parameters: {
        type: "object",
        properties: {
          track_id: {
            type: "string",
            description: "L'ID du tracking à supprimer",
          },
        },
        required: ["track_id"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "listTrackedProducts",
      description:
        "Liste tous les produits actuellement suivis par l'utilisateur. " +
        "Affiche le revendeur, le produit, le prix actuel et les alertes configurées.",
      parameters: {
        type: "object",
        properties: {
          user_filter: {
            type: "string",
            description: "Filtrer par utilisateur (ID Discord, optionnel)",
          },
        },
        required: [],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "getRetailerDeals",
      description:
        "Récupère les deals/promotions en cours sur un revendeur. " +
        "Utilise ce tool quand l'utilisateur veut voir les offres du jour ou ventes flash.",
      parameters: {
        type: "object",
        properties: {
          retailer: {
            type: "string",
            enum: Object.keys(RETAILER_NAMES),
            description: "Le revendeur",
          },
          country: {
            type: "string",
            enum: ["FR", "DE", "BE", "NL", "ES", "IT", "CH", "UK", "US"],
            description: "Pays (défaut: FR)",
          },
          limit: {
            type: "number",
            description: "Nombre max de deals (défaut: 10)",
          },
        },
        required: ["retailer"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "getAmazonPriceHistory",
      description:
        "Récupère l'historique des prix d'un produit Amazon via Keepa. " +
        "Affiche le prix actuel, le plus bas, le plus haut et la moyenne. " +
        "Détecte aussi les restocks. Nécessite KEEPA_API_KEY.",
      parameters: {
        type: "object",
        properties: {
          asin: {
            type: "string",
            description: "L'ASIN du produit Amazon",
          },
          country: {
            type: "string",
            enum: ["FR", "DE", "BE", "NL", "ES", "IT", "CH", "UK", "US"],
            description: "Pays (défaut: FR)",
          },
        },
        required: ["asin"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "listAvailableRetailers",
      description:
        "Liste tous les revendeurs disponibles dans le système avec les pays supportés. " +
        "Utilise ce tool quand l'utilisateur demande quelles boutiques sont supportées.",
      parameters: {
        type: "object",
        properties: {},
        required: [],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "compareProductPrices",
      description:
        "Compare les prix d'un produit sur tous les revendeurs disponibles et retourne " +
        "le moins cher. Utilise ce tool quand l'utilisateur veut trouver le meilleur prix.",
      parameters: {
        type: "object",
        properties: {
          query: {
            type: "string",
            description: "Le produit à comparer",
          },
          countries: {
            type: "array",
            items: {
              type: "string",
              enum: ["FR", "DE", "BE", "NL", "ES", "IT", "CH", "UK", "US"],
            },
            description: "Pays à inclure dans la comparaison (défaut: FR)",
          },
        },
        required: ["query"],
      },
    },
  },
];

// ─── Tool Handlers ──────────────────────────────────────────────────────────

export async function handleRetailerTool(
  toolName: string,
  args: Record<string, any>,
  ctx: ToolContext,
): Promise<ToolCallResult> {
  try {
    switch (toolName) {
      case "searchRetailers": {
        const query = args.query as string;
        const products = await searchAllRetailers(query, {
          retailers: args.retailers as RetailerId[] | undefined,
          countries: args.countries as CountryCode[] | undefined,
          maxPrice: args.max_price as number | undefined,
          minPrice: args.min_price as number | undefined,
          sortBy: (args.sort_by as "price" | "discount" | "rating") || "price",
          limit: (args.limit as number) || 5,
          inStockOnly: true,
        });

        if (products.length === 0) {
          return { success: true, data: "Aucun produit trouvé pour cette recherche." };
        }

        const formatted = products
          .slice(0, 20)
          .map((p) => {
            const emoji = RETAILER_EMOJIS[p.retailer] || "🏷️";
            const discount = p.discountPercent ? ` (-${p.discountPercent}%)` : "";
            const stock = p.inStock ? "✅" : "❌";
            return `${emoji} **${RETAILER_NAMES[p.retailer]}** (${p.country}) — ${p.title}\n   ${p.price} ${p.currency}${discount} ${stock}\n   ${p.url}`;
          })
          .join("\n\n");

        return {
          success: true,
          data: `Résultats pour "${query}" (${products.length} produits):\n\n${formatted}`,
        };
      }

      case "searchSingleRetailer": {
        const retailer = args.retailer as RetailerId;
        const query = args.query as string;
        const country = (args.country as CountryCode) || "FR";
        const limit = (args.limit as number) || 10;

        const products = await searchRetailer(retailer, query, country, limit);

        if (products.length === 0) {
          return {
            success: true,
            data: `Aucun produit trouvé sur ${RETAILER_NAMES[retailer]} (${country}).`,
          };
        }

        const formatted = products
          .map((p) => {
            const discount = p.discountPercent ? ` (-${p.discountPercent}%)` : "";
            const stock = p.inStock ? "✅" : "❌";
            return `**${p.title}**\n   ${p.price} ${p.currency}${discount} ${stock}\n   ${p.url}`;
          })
          .join("\n\n");

        return {
          success: true,
          data: `${RETAILER_NAMES[retailer]} (${country}) — ${products.length} résultat(s):\n\n${formatted}`,
        };
      }

      case "trackRetailerProduct": {
        const retailer = args.retailer as RetailerId;
        const productId = args.product_id as string;
        const title = args.title as string;
        const country = (args.country as CountryCode) || "FR";
        const userId = ctx.userId || ctx.message?.author?.id || "unknown";
        const guildId = ctx.guildId || ctx.message?.guild?.id || "";

        const trackId = trackProduct(retailer, country, productId, title, userId, guildId, {
          targetPrice: args.target_price as number | undefined,
          alertOnRestock: args.alert_restock as boolean | undefined,
          alertOnPriceDrop: args.alert_price_drop as boolean | undefined,
          alertOnPromotion: args.alert_promotion as boolean | undefined,
        });

        return {
          success: true,
          data: `✅ Produit suivi: **${title}** sur ${RETAILER_NAMES[retailer]} (${country})\nID de tracking: ${trackId}\nTu recevras une alerte en cas de baisse de prix, remise en stock ou promotion.`,
        };
      }

      case "untrackRetailerProduct": {
        const trackId = args.track_id as string;
        const removed = untrackProduct(trackId);
        if (!removed) {
          return { success: false, data: "Tracking introuvable ou déjà supprimé." };
        }
        return {
          success: true,
          data: "✅ Suivi du produit arrêté. Tu ne recevras plus d'alertes.",
        };
      }

      case "listTrackedProducts": {
        const userFilter = args.user_filter as string | undefined;
        const tracked = getTrackedProducts(userFilter || undefined);

        if (tracked.length === 0) {
          return { success: true, data: "Aucun produit suivi pour le moment." };
        }

        const formatted = tracked
          .map((t) => {
            const emoji = RETAILER_EMOJIS[t.retailer] || "🏷️";
            const target = t.targetPrice ? ` | Cible: ${t.targetPrice}€` : "";
            const alerts = [
              t.alertOnPriceDrop ? "prix↓" : "",
              t.alertOnRestock ? "stock✅" : "",
              t.alertOnPromotion ? "promo🔥" : "",
            ]
              .filter(Boolean)
              .join(", ");
            return `${emoji} **${t.title}** — ${RETAILER_NAMES[t.retailer]} (${t.country})\n   Prix actuel: ${t.lastPrice}€${target} | Alertes: ${alerts}\n   ID: ${t.id}`;
          })
          .join("\n\n");

        return { success: true, data: `Produits suivis (${tracked.length}):\n\n${formatted}` };
      }

      case "getRetailerDeals": {
        const retailer = args.retailer as RetailerId;
        const country = (args.country as CountryCode) || "FR";
        const limit = (args.limit as number) || 10;

        const deals = await getRetailerDeals(retailer, country, limit);

        if (deals.length === 0) {
          return {
            success: true,
            data: `Aucun deal trouvé sur ${RETAILER_NAMES[retailer]} (${country}).`,
          };
        }

        const formatted = deals
          .map((d) => {
            const discount = d.discountPercent ? ` (-${d.discountPercent}%)` : "";
            return `🔥 **${d.title}** — ${d.price} ${d.currency}${discount}\n   ${d.url}`;
          })
          .join("\n\n");

        return {
          success: true,
          data: `${RETAILER_NAMES[retailer]} (${country}) — Deals:\n\n${formatted}`,
        };
      }

      case "getAmazonPriceHistory": {
        const asin = args.asin as string;
        const country = (args.country as CountryCode) || "FR";

        const history = await getKeepaPriceHistory(asin, country);
        if (!history) {
          return {
            success: false,
            data: "Historique indisponible (Keepa API key manquante ou produit introuvable).",
          };
        }

        return {
          success: true,
          data:
            `📈 Historique Amazon (${country}) — ASIN: ${asin}\n` +
            `Prix actuel: ${history.currentPrice}€\n` +
            `Plus bas: ${history.lowestPrice}€\n` +
            `Plus haut: ${history.highestPrice}€\n` +
            `Moyenne: ${history.averagePrice.toFixed(2)}€\n` +
            `Restock détecté: ${history.isRestock ? "Oui" : "Non"}\n` +
            `Points historique: ${history.priceHistory.length}`,
        };
      }

      case "listAvailableRetailers": {
        const retailers = getAvailableRetailers();
        const formatted = retailers
          .map((r) => {
            const emoji = RETAILER_EMOJIS[r.id] || "🏷️";
            return `${emoji} **${r.name}** — Pays: ${r.countries.join(", ")}`;
          })
          .join("\n");

        return {
          success: true,
          data: `Revendeurs disponibles (${retailers.length}):\n\n${formatted}`,
        };
      }

      case "compareProductPrices": {
        const query = args.query as string;
        const countries = (args.countries as CountryCode[]) || ["FR"];

        const products = await searchAllRetailers(query, {
          countries,
          sortBy: "price",
          limit: 3,
          inStockOnly: true,
        });

        if (products.length === 0) {
          return { success: true, data: `Aucun prix trouvé pour "${query}".` };
        }

        const cheapest = products[0];
        const emoji = RETAILER_EMOJIS[cheapest.retailer] || "🏷️";

        const formatted = products
          .slice(0, 10)
          .map((p, i) => {
            const e = RETAILER_EMOJIS[p.retailer] || "🏷️";
            const medal = i === 0 ? "🥇" : i === 1 ? "🥈" : i === 2 ? "🥉" : `${i + 1}.`;
            return `${medal} ${e} ${RETAILER_NAMES[p.retailer]} (${p.country}) — ${p.price} ${p.currency}`;
          })
          .join("\n");

        return {
          success: true,
          data:
            `Comparaison de prix pour "${query}":\n\n${formatted}\n\n` +
            `Meilleur prix: ${emoji} **${RETAILER_NAMES[cheapest.retailer]}** — ${cheapest.price} ${cheapest.currency}\n${cheapest.url}`,
        };
      }

      default:
        return { success: false, data: `Tool revendeur inconnu: ${toolName}` };
    }
  } catch (err) {
    logger.error(`[RetailerTools] Erreur ${toolName}:`, err);
    return { success: false, data: err instanceof Error ? err.message : String(err) };
  }
}
