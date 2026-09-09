import { describe, expect, it } from "vitest";
import {
  DOMAIN_PLAYBOOKS,
  FICHE_DOMAINS,
  buildDeployCards,
  buildDomainPlaybookEmbeds,
  buildFactCheckCard,
  buildHibpCards,
  buildWelcomeCards,
  findFicheDomain,
  formatDomainFicheForAgent,
  listDomainIndexEmbeds,
} from "./domainFiches.js";
import { buildFicheEmbeds } from "./discordFiche.js";

describe("domainFiches", () => {
  it("covers every backlog domain as a native playbook", () => {
    expect(FICHE_DOMAINS.map((d) => d.id)).toEqual([
      "moderation",
      "securite",
      "gaming",
      "medias",
      "retail",
      "ia",
      "devops",
      "communaute",
      "vocal",
      "science",
      "analytics",
    ]);
    for (const domain of FICHE_DOMAINS) {
      expect(DOMAIN_PLAYBOOKS[domain.id].cards.length).toBeGreaterThan(0);
    }
  });

  it("never mentions fake Nitro as something John should ban or filter", () => {
    const blob = JSON.stringify(DOMAIN_PLAYBOOKS);
    expect(blob).toMatch(/faux Nitro/);
    expect(blob).toMatch(/on n’y touche pas|Trust & Safety|Hors scope/i);
    expect(blob).not.toMatch(/auto-?ban.{0,40}nitro/i);
  });

  it("never includes Kali attack recipes", () => {
    const blob = JSON.stringify(DOMAIN_PLAYBOOKS) + formatDomainFicheForAgent("securite");
    expect(blob).not.toMatch(/\bhydra -/);
    expect(blob).not.toMatch(/\bmsfconsole\b/);
    expect(blob).not.toMatch(/\| Date \|/);
    expect(blob).toMatch(/on ne lance pas/i);
  });

  it("builds a header plus cards without overflowing Discord's 10 embeds", () => {
    for (const domain of FICHE_DOMAINS) {
      const embeds = buildDomainPlaybookEmbeds(domain.id);
      expect(embeds.length).toBeGreaterThanOrEqual(2);
      expect(embeds.length).toBeLessThanOrEqual(10);
      expect(embeds[0].data.title).toBe(DOMAIN_PLAYBOOKS[domain.id].title);
    }
  });

  it("resolves domain aliases", () => {
    expect(findFicheDomain("Sécurité")).toBe("securite");
    expect(findFicheDomain("steam")).toBe("gaming");
    expect(findFicheDomain("nasa")).toBe("science");
  });

  it("indexes all domains when none is chosen", () => {
    const embeds = listDomainIndexEmbeds();
    expect(embeds[0].data.title).toBe("Fiches");
    expect(embeds.length).toBeGreaterThanOrEqual(2);
    expect(embeds.length).toBeLessThanOrEqual(10);
  });

  it("builds HIBP cards with a what-to-do parade and no secret dump", () => {
    const cards = buildHibpCards(
      [
        {
          name: "Adobe",
          title: "Adobe",
          domain: "adobe.com",
          breachDate: "2013-10-04",
          compromisedData: ["Emails", "Passwords"],
          description: "leak",
        },
      ],
      "jane@example.com",
    );
    expect(cards.some((c) => c.title === "Que faire")).toBe(true);
    expect(JSON.stringify(cards)).not.toMatch(/jane@example\.com/);
    expect(JSON.stringify(cards)).toMatch(/MFA/);
  });

  it("builds deploy, welcome and fact-check cards", () => {
    expect(buildDeployCards()[0].fields.some((f) => f.name === "SHA")).toBe(true);
    expect(buildWelcomeCards("LB").map((c) => c.title)).toEqual(["Bienvenue", "Règles", "Rôles"]);
    const fact = buildFactCheckCard("la terre est plate", "https://example.com", "Faux");
    expect(fact.fields[0].value).toMatch(/terre/);
    expect(fact.fields[1].value).toMatch(/example.com/);
  });

  it("caps fiches at 10 embeds", () => {
    const embeds = buildFicheEmbeds({
      title: "Test",
      description: "cap",
      cards: Array.from({ length: 20 }, (_, i) => ({
        title: `C${i}`,
        fields: [{ name: "x", value: "y" }],
      })),
    });
    expect(embeds).toHaveLength(10);
  });
});
