import { describe, expect, it } from "vitest";
import { banSignalFields, extractBanOrder } from "./banSignal.js";

const TARGET = "1512435587926200391";

describe("extractBanOrder", () => {
  it("prend la mention d'un ordre de ban", () => {
    const order = extractBanOrder(`bannis <@${TARGET}> pour spam`);
    expect(order?.userId).toBe(TARGET);
    expect(order?.reason).toContain("spam");
  });

  it("prend un identifiant nu", () => {
    expect(extractBanOrder(`ban ${TARGET}`)?.userId).toBe(TARGET);
  });

  it("demande une cible quand personne n'est nommé", () => {
    expect(extractBanOrder("bannis ce type pour spam")).toBeNull();
  });

  it("ignore une question de capacité", () => {
    expect(extractBanOrder(`tu peux bannir <@${TARGET}> ?`)).toBeNull();
  });
});

describe("banSignalFields", () => {
  it("nomme le salon d'où le ban a été demandé", () => {
    const fields = banSignalFields({
      userId: TARGET,
      askedById: "620589482185457674",
      channelId: "1497977006510440700",
      channelName: "les-test-de-lb",
      reason: "spam",
    });
    const channel = fields.find((field) => field.name === "Salon concerné");
    expect(channel?.value).toContain("<#1497977006510440700>");
    expect(channel?.value).toContain("les-test-de-lb");
  });
});
