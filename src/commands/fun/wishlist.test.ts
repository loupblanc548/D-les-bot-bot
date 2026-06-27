import { describe, it, expect, vi, beforeEach } from "vitest";

const { mockPrisma } = vi.hoisted(() => ({
  mockPrisma: {
    wishlist: {
      findUnique: vi.fn(),
      findFirst: vi.fn(),
      findMany: vi.fn(),
      create: vi.fn(),
      deleteMany: vi.fn(),
    },
    userPreference: { findUnique: vi.fn(), upsert: vi.fn() },
  },
}));
vi.mock("../../prisma", () => ({ default: mockPrisma }));
vi.mock("../../services/fortnite-cosmetics", () => ({
  validateCosmeticName: vi.fn(),
  searchCosmetics: vi.fn(),
}));
vi.mock("../../services/fortnite-api", () => ({ fetchShop: vi.fn() }));

import { handleCommand, handleAutocomplete } from "./wishlist.js";
import { fetchShop } from "../../services/fortnite-api.js";
import { validateCosmeticName, searchCosmetics } from "../../services/fortnite-cosmetics.js";
function mi(o: any = {}) {
  return {
    options: {
      getString: vi.fn((n: string) =>
        n === "action"
          ? (o.action ?? "add")
          : n === "plateforme"
            ? (o.plateforme ?? null)
            : (o.nom ?? null),
      ),
    },
    user: o.user ?? { id: "u1", tag: "Test#1234", username: "Test", displayName: "Test" },
    guildId: "g1",
    reply: vi.fn().mockResolvedValue(undefined),
    followUp: vi.fn().mockResolvedValue(undefined),
    deferReply: vi.fn().mockResolvedValue(undefined),
    editReply: vi.fn().mockResolvedValue(undefined),
  } as any;
}

describe("add", () => {
  beforeEach(() => vi.clearAllMocks());

  it("ajoute un item (lowercase+trim)", async () => {
    (validateCosmeticName as any).mockResolvedValue(true);
    mockPrisma.wishlist.findFirst.mockResolvedValue(null);
    mockPrisma.wishlist.create.mockResolvedValue({});
    await handleCommand(mi({ nom: "  Renegade Raider  " }));
    expect(mockPrisma.wishlist.create).toHaveBeenCalledWith({
      data: {
        userId: "u1",
        itemName: "renegade raider",
        platform: "fortnite",
        gameName: "Renegade Raider",
        guildId: "g1",
      },
    });
  });

  it("refuse nom vide", async () => {
    await handleCommand(mi({ nom: "" }));
    expect(mockPrisma.wishlist.create).not.toHaveBeenCalled();
  });

  it("refuse nom null", async () => {
    await handleCommand(mi({ nom: null }));
    expect(mockPrisma.wishlist.create).not.toHaveBeenCalled();
  });

  it("refuse item invalide", async () => {
    (validateCosmeticName as any).mockResolvedValue(false);
    await handleCommand(mi({ nom: "Fake" }));
    expect(mockPrisma.wishlist.create).not.toHaveBeenCalled();
  });

  it("refuse doublon", async () => {
    (validateCosmeticName as any).mockResolvedValue(true);
    mockPrisma.wishlist.findFirst.mockResolvedValue({ id: 1 });
    await handleCommand(mi({ nom: "Test" }));
    expect(mockPrisma.wishlist.create).not.toHaveBeenCalled();
  });
});

describe("remove", () => {
  beforeEach(() => vi.clearAllMocks());

  it("supprime un item", async () => {
    mockPrisma.wishlist.deleteMany.mockResolvedValue({ count: 1 });
    await handleCommand(mi({ action: "remove", nom: "Test" }));
    expect(mockPrisma.wishlist.deleteMany).toHaveBeenCalledWith({
      where: { userId: "u1", itemName: "test", platform: "fortnite" },
    });
  });

  it("signale item non trouve", async () => {
    mockPrisma.wishlist.deleteMany.mockResolvedValue({ count: 0 });
    await handleCommand(mi({ action: "remove", nom: "X" }));
    expect(mockPrisma.wishlist.deleteMany).toHaveBeenCalled();
  });
});

describe("list", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    (fetchShop as any).mockResolvedValue(null); // pas de shop → liste simple
  });

  it("affiche liste vide", async () => {
    mockPrisma.wishlist.findMany.mockResolvedValue([]);
    await handleCommand(mi({ action: "list" }));
    expect(mockPrisma.wishlist.findMany).toHaveBeenCalled();
  });

  it("affiche items dans embed", async () => {
    mockPrisma.wishlist.findMany.mockResolvedValue([
      { id: 1, itemName: "skin1", createdAt: new Date() },
    ]);
    await handleCommand(mi({ action: "list" }));
    expect(mockPrisma.wishlist.findMany).toHaveBeenCalled();
  });
});

describe("erreurs", () => {
  beforeEach(() => vi.clearAllMocks());

  it("capture erreur Prisma", async () => {
    (validateCosmeticName as any).mockResolvedValue(true);
    mockPrisma.wishlist.findFirst.mockRejectedValue(new Error("DB locked"));
    await handleCommand(mi({ nom: "Test" }));
  });

  it("fallback reply echoue sans crash", async () => {
    (validateCosmeticName as any).mockResolvedValue(true);
    mockPrisma.wishlist.findFirst.mockRejectedValue(new Error("x"));
    const m = mi({ nom: "Test" });
    m.reply.mockRejectedValueOnce(new Error("deja repondu"));
    await handleCommand(m);
    // Le code catch l'erreur de reply silencieusement — pas de followUp
    expect(m.reply).toHaveBeenCalled();
  });
});

describe("autocomplete", () => {
  beforeEach(() => vi.clearAllMocks());

  it("retourne suggestions (fallback searchCosmetics)", async () => {
    (fetchShop as any).mockResolvedValue(null); // shop down, fallback actif
    (searchCosmetics as any).mockResolvedValue(["A", "B"]);
    const ai = {
      commandName: "wishlist",
      options: { getFocused: vi.fn().mockReturnValue({ name: "nom", value: "x" }) },
      respond: vi.fn(),
    } as any;
    await handleAutocomplete(ai);
    expect(ai.respond).toHaveBeenCalledWith([
      { name: "A", value: "A" },
      { name: "B", value: "B" },
    ]);
  });

  it("ignore autre commande", async () => {
    const ai = { commandName: "autre", options: { getFocused: vi.fn() }, respond: vi.fn() } as any;
    await handleAutocomplete(ai);
    expect(ai.respond).not.toHaveBeenCalled();
  });

  it("retourne vide si erreur", async () => {
    (fetchShop as any).mockResolvedValue(null);
    (searchCosmetics as any).mockRejectedValue(new Error("x"));
    const ai = {
      commandName: "wishlist",
      options: { getFocused: vi.fn().mockReturnValue({ name: "nom", value: "x" }) },
      respond: vi.fn(),
    } as any;
    await handleAutocomplete(ai);
    expect(ai.respond).toHaveBeenCalledWith([]);
  });

  describe("notify", () => {
    beforeEach(() => vi.clearAllMocks());

    it("active les DM si actuellement desactives", async () => {
      mockPrisma.userPreference.findUnique.mockResolvedValue({ userId: "u1", wishlistDm: false });
      mockPrisma.userPreference.upsert.mockResolvedValue({});
      const m = mi({ action: "notify" });
      await handleCommand(m);
      expect(mockPrisma.userPreference.upsert).toHaveBeenCalledWith(
        expect.objectContaining({
          create: expect.objectContaining({ wishlistDm: true }),
          update: expect.objectContaining({ wishlistDm: true }),
        }),
      );
      expect(m.reply).toHaveBeenCalledWith(
        expect.objectContaining({ content: expect.stringContaining("activées") }),
      );
    });

    it("desactive les DM si actuellement actifs", async () => {
      mockPrisma.userPreference.findUnique.mockResolvedValue({ userId: "u1", wishlistDm: true });
      mockPrisma.userPreference.upsert.mockResolvedValue({});
      const m = mi({ action: "notify" });
      await handleCommand(m);
      expect(mockPrisma.userPreference.upsert).toHaveBeenCalledWith(
        expect.objectContaining({
          create: expect.objectContaining({ wishlistDm: false }),
          update: expect.objectContaining({ wishlistDm: false }),
        }),
      );
      expect(m.reply).toHaveBeenCalledWith(
        expect.objectContaining({ content: expect.stringContaining("désactivées") }),
      );
    });

    it("active les DM par defaut si pas de preference existante", async () => {
      mockPrisma.userPreference.findUnique.mockResolvedValue(null);
      mockPrisma.userPreference.upsert.mockResolvedValue({});
      const m = mi({ action: "notify" });
      await handleCommand(m);
      // Par défaut wishlistDm = true → toggle → false
      expect(mockPrisma.userPreference.upsert).toHaveBeenCalledWith(
        expect.objectContaining({
          create: expect.objectContaining({ wishlistDm: false }),
        }),
      );
    });
  });
});
