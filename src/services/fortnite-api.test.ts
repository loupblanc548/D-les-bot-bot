// Tests unitaires pour extractAllNamesFromEntry() + checkWishlistMatches()
// Valide l'extraction des noms de packs/bundles, le matching, et l'envoi de DMs
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { extractAllNamesFromEntry, matchesWishlist } from "./fortnite-api.js";

// ─── Mocks Prisma (pattern vi.hoisted, comme dans logs.test.ts) ───
const { mockPrisma } = vi.hoisted(() => ({
  mockPrisma: {
    wishlist: {
      updateMany: vi.fn().mockResolvedValue({ count: 1 }),
      findMany: vi.fn().mockResolvedValue([]),
    },
    userPreference: {
      findUnique: vi.fn().mockResolvedValue(null),
    },
  },
}));

vi.mock("../prisma", () => ({
  default: mockPrisma,
}));

// ─── Mock fetch global (contrôle de fetchShop indirectement) ───
const mockGlobalFetch = vi.fn();
vi.stubGlobal("fetch", mockGlobalFetch);

// ─────────────────────────────────────────────────────────────────
//  matchesWishlist
// ─────────────────────────────────────────────────────────────────

describe("matchesWishlist", () => {
  // ─── MATCH EXACT ────────────────────────────────────────

  it("match exact insensible à la casse", () => {
    expect(matchesWishlist("Renegade Raider", "Renegade Raider")).toBe(true);
    expect(matchesWishlist("RENEGADE RAIDER", "renegade raider")).toBe(true);
    expect(matchesWishlist("renegade raider", "RENEGADE RAIDER")).toBe(true);
  });

  it("match exact avec trim automatique", () => {
    expect(matchesWishlist("  Renegade Raider  ", "Renegade Raider")).toBe(true);
    expect(matchesWishlist("Skin", "  Skin  ")).toBe(true);
    expect(matchesWishlist("  Pack  ", "  pack  ")).toBe(true);
  });

  // ─── WORD-LEVEL MATCHING ────────────────────────────────

  it("match par mot-clé : un mot de la wishlist présent dans le nom boutique", () => {
    expect(matchesWishlist("renegade", "Renegade Raider")).toBe(true);
    expect(matchesWishlist("raider", "Renegade Raider")).toBe(true);
  });

  it("match quand tous les mots de la wishlist sont dans le nom boutique", () => {
    expect(matchesWishlist("raider renegade", "Renegade Raider")).toBe(true);
    expect(matchesWishlist("skin cool", "Cool Skin")).toBe(true);
  });

  it("les mots de 1 caractère matchent via boundary regex s'ils sont isolés", () => {
    // Word-level filtre les mots < 2 chars, mais le boundary regex les rattrape
    // "a" isolé en fin de chaîne → précédé d'espace (\\W), en fin de chaîne ($) → match
    expect(matchesWishlist("a", "Skin A")).toBe(true);
    expect(matchesWishlist("i", "Item I")).toBe(true);
    // "a" au milieu sans frontière → pas de match
    expect(matchesWishlist("a", "abc def")).toBe(false);
  });

  it("match word-level avec séparateurs variés (tirets, points, espaces)", () => {
    expect(matchesWishlist("renegade", "Renegade-Raider")).toBe(true);
    expect(matchesWishlist("skin", "cool_skin_pro")).toBe(false); // _ est w en JS, pas split
    expect(matchesWishlist("pack", "super.pack")).toBe(true);
  });

  // ─── BOUNDARY REGEX ─────────────────────────────────────

  it("boundary regex : évite les faux positifs type 'Skin' dans 'Skinny'", () => {
    // "skin" ne doit PAS matcher "skinny" (pas une frontière de mot après "skin")
    expect(matchesWishlist("skin", "Skinny")).toBe(false);
    // "scar" ne doit PAS matcher "Scarlet" (même raison)
    expect(matchesWishlist("scar", "Scarlet Defender")).toBe(false);
  });

  it("boundary regex : match quand le mot wishlist est entouré de ponctuation", () => {
    // "skin" dans "Cool Skin!" → espace avant, "!" après = frontières
    expect(matchesWishlist("skin", "Cool Skin!")).toBe(true);
    // "raider" dans "(Renegade Raider)" → espace avant, ")" après = frontières
    expect(matchesWishlist("raider", "(Renegade Raider)")).toBe(true);
  });

  // ─── AUCUN MATCH ────────────────────────────────────────

  it("retourne false si aucun mot en commun", () => {
    expect(matchesWishlist("xyz", "Renegade Raider")).toBe(false);
    expect(matchesWishlist("Completely Different", "Unrelated Item")).toBe(false);
  });

  it("retourne false si la wishlist est vide", () => {
    expect(matchesWishlist("", "Renegade Raider")).toBe(false);
    expect(matchesWishlist("   ", "Renegade Raider")).toBe(false);
  });

  it("retourne false si le nom boutique est vide", () => {
    expect(matchesWishlist("Renegade Raider", "")).toBe(false);
    expect(matchesWishlist("Skin", "   ")).toBe(false);
  });

  // ─── EDGE CASES ─────────────────────────────────────────

  it("gère les accents et caractères spéciaux", () => {
    expect(matchesWishlist("peau", "Peau Estivale")).toBe(true);
    expect(matchesWishlist("épée", "Épée Légendaire")).toBe(true);
  });

  it("gère les noms avec apostrophes", () => {
    // Split sur \W : "l'ombre" → ["l", "ombre"] ; "L'Ombre" → ["l", "ombre"]
    // "ombre" (2+ chars) est dans les deux → match
    expect(matchesWishlist("ombre", "L'Ombre")).toBe(true);
  });

  it("gère les noms très longs", () => {
    const longName1 = "Super Mega Ultra Legendary Skin of the Eternal Void";
    const longName2 = "Super Mega Ultra Legendary Skin of the Eternal Void";
    expect(matchesWishlist(longName1, longName2)).toBe(true);
  });

  it("gère les noms avec uniquement des mots de 1 caractère", () => {
    // Tous les mots filtrés (<2 chars), le matching tombe au boundary regex
    // "a b" → w="a b", s="a b" → exact match true
    expect(matchesWishlist("a b", "a b")).toBe(true);
    // "a" tout seul → w="a", s="x y" → boundary regex "(^|\\W)a($|\\W)" ne trouve rien
    expect(matchesWishlist("a", "x y")).toBe(false);
  });
});

// ─────────────────────────────────────────────────────────────────
//  extractAllNamesFromEntry
// ─────────────────────────────────────────────────────────────────

describe("extractAllNamesFromEntry", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  // ─── BUNDLE / PACK ──────────────────────────────────────

  it("extrait le nom du pack + les sous-articles d'un bundle Fortnite classique", () => {
    const entry = {
      bundle: { name: "Pack Légendes Estivales" },
      items: [
        { name: "Peau Estivale Pro" },
        { name: "Danseur Solaire" },
        { name: "Pioche Tropicale" },
      ],
    };

    const result = extractAllNamesFromEntry(entry);

    expect(result).toHaveLength(4);
    expect(result).toContain("pack légendes estivales");
    expect(result).toContain("peau estivale pro");
    expect(result).toContain("danseur solaire");
    expect(result).toContain("pioche tropicale");
  });

  it("utilise bundle.displayName comme fallback si bundle.name est absent", () => {
    const entry = {
      bundle: { displayName: "Mega Bundle" },
      items: [{ name: "Skin A" }],
    };

    const result = extractAllNamesFromEntry(entry);

    expect(result).toContain("mega bundle");
    expect(result).toContain("skin a");
  });

  it("utilise item.displayName comme fallback si item.name est absent", () => {
    const entry = {
      bundle: { name: "Starter Pack" },
      items: [
        { displayName: "Casual Outfit" },
        { name: "Pickaxe Pro" },
      ],
    };

    const result = extractAllNamesFromEntry(entry);

    expect(result).toContain("starter pack");
    expect(result).toContain("casual outfit");
    expect(result).toContain("pickaxe pro");
  });

  it("gère un bundle avec brItems au lieu de items", () => {
    const entry = {
      bundle: { name: "BR Exclusive Pack" },
      brItems: [
        { name: "Battle Royale Skin" },
        { displayName: "Glider Storm" },
      ],
    };

    const result = extractAllNamesFromEntry(entry);

    expect(result).toHaveLength(3);
    expect(result).toContain("br exclusive pack");
    expect(result).toContain("battle royale skin");
    expect(result).toContain("glider storm");
  });

  // ─── ENTRÉE SIMPLE (pas de bundle) ──────────────────────

  it("extrait uniquement les items pour une entrée sans bundle", () => {
    const entry = {
      items: [
        { name: "Renegade Raider" },
      ],
    };

    const result = extractAllNamesFromEntry(entry);

    expect(result).toHaveLength(1);
    expect(result).toContain("renegade raider");
  });

  it("utilise entry.displayName puis entry.name quand il n'y a ni bundle ni items", () => {
    const entry = {
      displayName: "Direct Shop Item",
      items: [],
    };

    const result = extractAllNamesFromEntry(entry);

    expect(result).toHaveLength(1);
    expect(result).toContain("direct shop item");
  });

  it("utilise entry.name comme dernier fallback", () => {
    const entry = {
      name: "Fallback Item Name",
      items: [],
    };

    const result = extractAllNamesFromEntry(entry);

    expect(result).toHaveLength(1);
    expect(result).toContain("fallback item name");
  });

  // ─── ITEMS MULTIPLES SANS BUNDLE ────────────────────────

  it("extrait tous les items même sans bundle (entrée multi-variantes)", () => {
    const entry = {
      items: [
        { name: "Style 1" },
        { displayName: "Style 2" },
        { name: "Style 3" },
      ],
    };

    const result = extractAllNamesFromEntry(entry);

    expect(result).toHaveLength(3);
    expect(result).toContain("style 1");
    expect(result).toContain("style 2");
    expect(result).toContain("style 3");
  });

  // ─── NORMALISATION (casse, espaces, doublons) ───────────

  it("normalise tout en minuscules et trim", () => {
    const entry = {
      bundle: { name: "  PACK   ÉTÉ  " },
      items: [
        { name: "  Skin Blanc  " },
        { displayName: "ACCESSOIRE NOIR" },
      ],
    };

    const result = extractAllNamesFromEntry(entry);

    expect(result).toContain("pack   été");
    expect(result).toContain("skin blanc");
    expect(result).toContain("accessoire noir");
  });

  it("élimine les doublons (même nom en minuscule après trim)", () => {
    const entry = {
      bundle: { name: "Mega Pack" },
      items: [
        { name: "MEGA PACK" },
        { name: "Unique Skin" },
        { displayName: "unique skin" },
      ],
    };

    const result = extractAllNamesFromEntry(entry);

    // "mega pack" présent une seule fois, "unique skin" aussi
    expect(result.filter(n => n === "mega pack")).toHaveLength(1);
    expect(result.filter(n => n === "unique skin")).toHaveLength(1);
  });

  // ─── EDGE CASES ─────────────────────────────────────────

  it("retourne un tableau vide silencieusement pour une entrée vide (fetchShop() logue l'avertissement)", () => {
    const entry = { items: [] };
    const result = extractAllNamesFromEntry(entry);

    expect(result).toEqual([]);
    // Plus de console.warn — fetchShop() centralise les avertissements avec plus de contexte
  });

  it("retourne un tableau vide silencieusement pour une entrée sans bundle/items/displayName/name (fetchShop() logue l'avertissement)", () => {
    const entry = { offerId: "v2:/abc123" };
    const result = extractAllNamesFromEntry(entry);

    expect(result).toEqual([]);
    // Plus de console.warn — fetchShop() centralise les avertissements avec plus de contexte
  });

  it("ignore les items sans nom (displayName et name absents)", () => {
    const entry = {
      bundle: { name: "Pack Test" },
      items: [
        { name: "Valid Skin" },
        { rarity: "legendary" }, // pas de name/displayName
        { type: "outfit" },       // pas de name/displayName
      ],
    };

    const result = extractAllNamesFromEntry(entry);

    expect(result).toHaveLength(2); // pack test + valid skin
    expect(result).toContain("pack test");
    expect(result).toContain("valid skin");
  });

  it("gère entry.items = undefined (pas d'items du tout)", () => {
    const entry = {
      bundle: { name: "Empty Bundle" },
      // pas d'items
    };

    const result = extractAllNamesFromEntry(entry);

    expect(result).toHaveLength(1);
    expect(result).toContain("empty bundle");
  });

  it("ignore un bundle vide (ni name ni displayName)", () => {
    const entry = {
      bundle: {},
      items: [{ name: "Skin Sans Pack" }],
    };

    const result = extractAllNamesFromEntry(entry);

    expect(result).toEqual(["skin sans pack"]);
  });

  // ─── RESPECT DE L'ORDRE D'INSERTION ─────────────────────

  it("préserve l'ordre : nom du bundle en premier, puis les sous-articles", () => {
    const entry = {
      bundle: { name: "ZZZ Pack" },
      items: [
        { name: "AAA Skin" },
        { name: "BBB Skin" },
        { name: "CCC Skin" },
      ],
    };

    const result = extractAllNamesFromEntry(entry);

    // Le bundle doit être en premier
    expect(result[0]).toBe("zzz pack");
    // Les sous-articles dans l'ordre
    expect(result[1]).toBe("aaa skin");
    expect(result[2]).toBe("bbb skin");
    expect(result[3]).toBe("ccc skin");
  });
});

// ─────────────────────────────────────────────────────────────────
//  checkWishlistMatches (avec mock fetchShop via global.fetch)
// ─────────────────────────────────────────────────────────────────

describe("checkWishlistMatches", () => {
  let checkWishlistMatches: any;
  let fakeUser: any;
  let mockClient: any;

  beforeEach(async () => {
    vi.clearAllMocks();
    mockGlobalFetch.mockReset();

    // Réinitialise le cache des modules pour vider shopCache (évite la pollution entre tests)
    vi.resetModules();

    // Recrée les objets mockés (resetModules vide les imports dynamiques)
    fakeUser = {
      id: "111111111111111111",
      username: "TestUser",
      send: vi.fn().mockResolvedValue(undefined),
    };

    mockClient = {
      users: {
        fetch: vi.fn().mockResolvedValue(fakeUser),
      },
    };

    // Ré-importer après resetModules pour avoir un module frais (shopCache vide)
    const mod = await import("./fortnite-api.js");
    checkWishlistMatches = mod.checkWishlistMatches;
  });

  afterEach(() => {
    // Nettoie les fake timers même si un test échoue
    vi.useRealTimers();
  });

  // Helper : construire une réponse API Fortnite simulée
  function mockFortniteApiResponse(entries: any[]) {
    return {
      ok: true,
      json: async () => ({
        status: 200,
        data: {
          date: "2026-06-09",
          entries,
        },
      }),
    };
  }

  // Helper : construire un ShopEntry (simule ce que fetchShop produit)
  function makeShopEntry(overrides: Partial<{
    displayName: string;
    allNames: string[];
    rarity: string;
    price: number;
    type: string;
    featuredImage: string | null;
    icon: string;
  }> = {}): any {
    return {
      displayName: overrides.displayName || "Default Skin",
      allNames: overrides.allNames || [overrides.displayName?.toLowerCase() || "default skin"],
      description: "A test item",
      type: overrides.type || "Outfit",
      rarity: overrides.rarity || "Legendary",
      rarityColor: 0xff6600,
      price: overrides.price ?? 1500,
      icon: overrides.icon || "https://example.com/icon.png",
      featuredImage: overrides.featuredImage || null,
      section: "featured",
    };
  }

  // ─── BOUTIQUE INDISPONIBLE / VIDE ───────────────────────

  it("retourne 0 si la boutique est indisponible (fetch échoue)", async () => {
    mockGlobalFetch.mockRejectedValue(new Error("Network error"));

    const result = await checkWishlistMatches(mockClient);

    expect(result).toBe(0);
  });

  it("retourne 0 si la boutique est vide (0 entrées)", async () => {
    mockGlobalFetch.mockResolvedValue(mockFortniteApiResponse([]));

    const result = await checkWishlistMatches(mockClient);

    expect(result).toBe(0);
  });

  it("retourne 0 si la wishlist est vide", async () => {
    mockGlobalFetch.mockResolvedValue(
      mockFortniteApiResponse([
        {
          section: { id: "featured" },
          items: [{ name: "Some Skin", displayName: "Some Skin" }],
        },
      ])
    );
    mockPrisma.wishlist.findMany.mockResolvedValue([]);

    const result = await checkWishlistMatches(mockClient);

    expect(result).toBe(0);
  });

  // ─── MATCH SIMPLE (displayName fallback) ─────────────────

  it("envoie un DM quand un item match exactement par displayName", async () => {
    mockGlobalFetch.mockResolvedValue(
      mockFortniteApiResponse([
        {
          section: { id: "featured" },
          items: [{ name: "Renegade Raider", displayName: "Renegade Raider" }],
        },
      ])
    );
    mockPrisma.wishlist.findMany.mockResolvedValue([
      { userId: "111111111111111111", itemName: "Renegade Raider" },
    ]);
    mockPrisma.userPreference.findUnique.mockResolvedValue(null); // pas de pref → DM autorisé

    const result = await checkWishlistMatches(mockClient);

    expect(result).toBe(1);
    expect(fakeUser.send).toHaveBeenCalledTimes(1);
    const sentEmbed = fakeUser.send.mock.calls[0][0].embeds[0];
    expect(sentEmbed.data.title).toContain("Renegade Raider");
    expect(sentEmbed.data.description).toContain("Renegade Raider");
  });

  // ─── MATCH VIA ALLNAMES (PACK) ───────────────────────────

  it("détecte un skin à l'intérieur d'un pack via allNames", async () => {
    mockGlobalFetch.mockResolvedValue(
      mockFortniteApiResponse([
        {
          bundle: { name: "Pack Légendes Estivales" },
          section: { id: "featured" },
          items: [
            { name: "Peau Estivale Pro" },
            { name: "Danseur Solaire" },
          ],
        },
      ])
    );
    mockPrisma.wishlist.findMany.mockResolvedValue([
      { userId: "111111111111111111", itemName: "danseur solaire" },
    ]);
    mockPrisma.userPreference.findUnique.mockResolvedValue(null);

    const result = await checkWishlistMatches(mockClient);

    expect(result).toBe(1);
    expect(fakeUser.send).toHaveBeenCalledTimes(1);
    const sentEmbed = fakeUser.send.mock.calls[0][0].embeds[0];
    // L'embed doit mentionner le nom de l'item wishlist
    expect(sentEmbed.data.description).toContain("danseur solaire");
  });

  it("détecte un match quand le wishlist item correspond au NOM DU PACK lui-même", async () => {
    mockGlobalFetch.mockResolvedValue(
      mockFortniteApiResponse([
        {
          bundle: { name: "Pack Légendes Estivales" },
          section: { id: "featured" },
          items: [
            { name: "Peau Estivale Pro" },
          ],
        },
      ])
    );
    mockPrisma.wishlist.findMany.mockResolvedValue([
      { userId: "111111111111111111", itemName: "pack légendes estivales" },
    ]);
    mockPrisma.userPreference.findUnique.mockResolvedValue(null);

    const result = await checkWishlistMatches(mockClient);

    expect(result).toBe(1);
    expect(fakeUser.send).toHaveBeenCalledTimes(1);
  });

  // ─── AUCUN MATCH ────────────────────────────────────────

  it("retourne 0 si aucun item ne correspond à la wishlist", async () => {
    mockGlobalFetch.mockResolvedValue(
      mockFortniteApiResponse([
        {
          section: { id: "featured" },
          items: [{ name: "Unrelated Outfit XYZ" }],
        },
      ])
    );
    mockPrisma.wishlist.findMany.mockResolvedValue([
      { userId: "111111111111111111", itemName: "Completely Different Item ABC" },
    ]);

    const result = await checkWishlistMatches(mockClient);

    expect(result).toBe(0);
    expect(fakeUser.send).not.toHaveBeenCalled();
  });

  // ─── DM PREFERENCE (wishlistDm désactivé) ────────────────

  it("ignore l'envoi DM si wishlistDm est false", async () => {
    mockGlobalFetch.mockResolvedValue(
      mockFortniteApiResponse([
        {
          section: { id: "featured" },
          items: [{ name: "Cool Skin" }],
        },
      ])
    );
    mockPrisma.wishlist.findMany.mockResolvedValue([
      { userId: "111111111111111111", itemName: "Cool Skin" },
    ]);
    mockPrisma.userPreference.findUnique.mockResolvedValue({
      userId: "111111111111111111",
      wishlistDm: false,
    });

    const result = await checkWishlistMatches(mockClient);

    // Aucun DM envoyé → sentCount = 0
    expect(result).toBe(0);
    expect(fakeUser.send).not.toHaveBeenCalled();
  });

  // ─── UTILISATEUR INTROUVABLE ────────────────────────────

  it("incrémente failCount si l'utilisateur Discord est introuvable", async () => {
    mockGlobalFetch.mockResolvedValue(
      mockFortniteApiResponse([
        {
          section: { id: "featured" },
          items: [{ name: "Ghost Skin" }],
        },
      ])
    );
    mockPrisma.wishlist.findMany.mockResolvedValue([
      { userId: "999999999999999999", itemName: "Ghost Skin" },
    ]);
    mockPrisma.userPreference.findUnique.mockResolvedValue(null);
    mockClient.users.fetch.mockResolvedValue(null); // utilisateur introuvable

    const result = await checkWishlistMatches(mockClient);

    // sentCount = 0, mais la fonction ne retourne pas failCount
    expect(result).toBe(0);
    expect(fakeUser.send).not.toHaveBeenCalled();
  });

  // ─── ÉCHEC DM (DMs fermés) ──────────────────────────────

  it("incrémente failCount et continue si l'envoi DM échoue", async () => {
    mockGlobalFetch.mockResolvedValue(
      mockFortniteApiResponse([
        {
          section: { id: "featured" },
          items: [{ name: "Blocked Skin" }],
        },
      ])
    );
    mockPrisma.wishlist.findMany.mockResolvedValue([
      { userId: "111111111111111111", itemName: "Blocked Skin" },
    ]);
    mockPrisma.userPreference.findUnique.mockResolvedValue(null);
    fakeUser.send.mockRejectedValue(new Error("Cannot send messages to this user"));

    const result = await checkWishlistMatches(mockClient);

    // DM échoue → sentCount = 0
    expect(result).toBe(0);
  });

  // ─── DÉDUPLICATION ──────────────────────────────────────

  it("déduplique les matchs : un même wishlist item → une seule notification", async () => {
    // Deux entrées de boutique avec le même skin (ex: featured + daily)
    mockGlobalFetch.mockResolvedValue(
      mockFortniteApiResponse([
        {
          section: { id: "featured" },
          items: [{ name: "Duplicate Skin" }],
        },
        {
          section: { id: "daily" },
          items: [{ name: "Duplicate Skin" }],
        },
      ])
    );
    mockPrisma.wishlist.findMany.mockResolvedValue([
      { userId: "111111111111111111", itemName: "Duplicate Skin" },
    ]);
    mockPrisma.userPreference.findUnique.mockResolvedValue(null);

    const result = await checkWishlistMatches(mockClient);

    // Une seule notification malgré 2 entrées avec le même skin
    expect(result).toBe(1);
    expect(fakeUser.send).toHaveBeenCalledTimes(1);
  });

  // ─── UTILISATEURS MULTIPLES ─────────────────────────────

  it("envoie un DM à chaque utilisateur ayant le même item en wishlist", async () => {
    mockGlobalFetch.mockResolvedValue(
      mockFortniteApiResponse([
        {
          section: { id: "featured" },
          items: [{ name: "Popular Skin" }],
        },
      ])
    );
    mockPrisma.wishlist.findMany.mockResolvedValue([
      { userId: "111111111111111111", itemName: "Popular Skin" },
      { userId: "222222222222222222", itemName: "Popular Skin" },
    ]);
    mockPrisma.userPreference.findUnique.mockResolvedValue(null);

    const fakeUser2 = {
      id: "222222222222222222",
      username: "TestUser2",
      send: vi.fn().mockResolvedValue(undefined),
    };
    mockClient.users.fetch
      .mockResolvedValueOnce(fakeUser)
      .mockResolvedValueOnce(fakeUser2);

    const result = await checkWishlistMatches(mockClient);

    expect(result).toBe(2);
    expect(fakeUser.send).toHaveBeenCalledTimes(1);
    expect(fakeUser2.send).toHaveBeenCalledTimes(1);
  });

  // ─── DÉLAI ANTI-RATE-LIMIT (ENVOI SÉQUENTIEL) ───────────

  it("envoie les DMs séquentiellement avec succès (3 matchs → 3 DMs)", async () => {
    mockGlobalFetch.mockResolvedValue(
      mockFortniteApiResponse([
        {
          section: { id: "featured" },
          items: [
            { name: "Skin One" },
            { name: "Skin Two" },
            { name: "Skin Three" },
          ],
        },
      ])
    );
    mockPrisma.wishlist.findMany.mockResolvedValue([
      { userId: "111111111111111111", itemName: "Skin One" },
      { userId: "222222222222222222", itemName: "Skin Two" },
      { userId: "333333333333333333", itemName: "Skin Three" },
    ]);
    mockPrisma.userPreference.findUnique.mockResolvedValue(null);

    const fakeUser2 = {
      id: "222222222222222222",
      username: "User2",
      send: vi.fn().mockResolvedValue(undefined),
    };
    const fakeUser3 = {
      id: "333333333333333333",
      username: "User3",
      send: vi.fn().mockResolvedValue(undefined),
    };
    mockClient.users.fetch
      .mockResolvedValueOnce(fakeUser)
      .mockResolvedValueOnce(fakeUser2)
      .mockResolvedValueOnce(fakeUser3);

    const result = await checkWishlistMatches(mockClient);

    // Les 3 DMs sont envoyés (boucle for...of séquentielle complétée)
    expect(result).toBe(3);
    expect(fakeUser.send).toHaveBeenCalledTimes(1);
    expect(fakeUser2.send).toHaveBeenCalledTimes(1);
    expect(fakeUser3.send).toHaveBeenCalledTimes(1);
  });

  // ─── MATCHING CASE-INSENSITIVE ──────────────────────────

  it("matche de manière insensible à la casse", async () => {
    mockGlobalFetch.mockResolvedValue(
      mockFortniteApiResponse([
        {
          section: { id: "daily" },
          items: [{ name: "rEnEgAdE rAiDeR" }],
        },
      ])
    );
    mockPrisma.wishlist.findMany.mockResolvedValue([
      { userId: "111111111111111111", itemName: "RENEGADE RAIDER" },
    ]);
    mockPrisma.userPreference.findUnique.mockResolvedValue(null);

    const result = await checkWishlistMatches(mockClient);

    expect(result).toBe(1);
  });

  it("matche par mot-clé (word-level matching)", async () => {
    mockGlobalFetch.mockResolvedValue(
      mockFortniteApiResponse([
        {
          section: { id: "featured" },
          items: [{ name: "Renegade Raider" }],
        },
      ])
    );
    mockPrisma.wishlist.findMany.mockResolvedValue([
      { userId: "111111111111111111", itemName: "renegade" },
    ]);
    mockPrisma.userPreference.findUnique.mockResolvedValue(null);

    const result = await checkWishlistMatches(mockClient);

    expect(result).toBe(1);
  });

  // ─── FALLBACK : ENTRY.ITEMS VIDE AVEC ENTRY.NAME VALIDE ──

  it("crée une ShopEntry via fallback quand entry.items est vide mais entry.name est valide", async () => {
    // Entrée sans items mais avec un nom de premier niveau (cosmétique offert, etc.)
    mockGlobalFetch.mockResolvedValue(
      mockFortniteApiResponse([
        {
          section: { id: "featured" },
          name: "Cosmétique Offert Spécial",
          // Pas de items → le fallback doit créer une ShopEntry
        },
      ])
    );
    mockPrisma.wishlist.findMany.mockResolvedValue([
      { userId: "111111111111111111", itemName: "cosmétique offert" },
    ]);
    mockPrisma.userPreference.findUnique.mockResolvedValue(null);

    const result = await checkWishlistMatches(mockClient);

    // Le fallback doit créer une ShopEntry → le match wishlist fonctionne → 1 DM
    expect(result).toBe(1);
    expect(fakeUser.send).toHaveBeenCalledTimes(1);
  });

  it("crée une ShopEntry via fallback quand entry.items est vide mais entry.displayName est valide", async () => {
    // Même test mais avec displayName au lieu de name
    mockGlobalFetch.mockResolvedValue(
      mockFortniteApiResponse([
        {
          section: { id: "daily" },
          displayName: "Skin Gratuit Quotidien",
        },
      ])
    );
    mockPrisma.wishlist.findMany.mockResolvedValue([
      { userId: "111111111111111111", itemName: "skin gratuit" },
    ]);
    mockPrisma.userPreference.findUnique.mockResolvedValue(null);

    const result = await checkWishlistMatches(mockClient);

    expect(result).toBe(1);
    expect(fakeUser.send).toHaveBeenCalledTimes(1);
  });

  it("ignore correctement une entrée sans items ET sans nom (vraiment vide)", async () => {
    // Entrée complètement vide : ni items, ni name, ni displayName
    mockGlobalFetch.mockResolvedValue(
      mockFortniteApiResponse([
        {
          section: { id: "featured" },
          offerId: "v2:/empty123",
          // Rien d'exploitable
        },
        {
          section: { id: "featured" },
          name: "Skin Valide",
          // Celle-ci a un nom → doit matcher
        },
      ])
    );
    mockPrisma.wishlist.findMany.mockResolvedValue([
      { userId: "111111111111111111", itemName: "skin valide" },
    ]);
    mockPrisma.userPreference.findUnique.mockResolvedValue(null);

    const result = await checkWishlistMatches(mockClient);

    // Seul le 2e item matche, l'entrée vide est ignorée sans erreur
    expect(result).toBe(1);
    expect(fakeUser.send).toHaveBeenCalledTimes(1);
  });

});
