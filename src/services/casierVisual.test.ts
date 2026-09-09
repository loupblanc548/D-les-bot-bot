import { afterEach, describe, expect, it, vi } from "vitest";
import { buildCasierLayoutEmbeds, sendCasierTableToMessage } from "./casierVisual.js";
import type { CasierItem } from "./casierQuery.js";

const item: CasierItem = {
  source: "sanction",
  type: "WARN",
  reason: "test casier Cursor",
  date: new Date("2026-09-08T20:04:00Z"),
  moderatorId: "AI_AGENT",
  duration: null,
  userId: "1321693294933180538",
};

describe("buildCasierLayoutEmbeds", () => {
  it("builds a header plus one native card per sanction", () => {
    const embeds = buildCasierLayoutEmbeds({
      title: "Logs de sanctions du serveur",
      items: [item],
      withUser: true,
    });
    expect(embeds).toHaveLength(2);
    expect(embeds[0].data.title).toBe("Logs de sanctions du serveur");
    expect(embeds[0].data.image).toBeUndefined();
    expect(embeds[1].data.title).toMatch(/Avertissement/);
    expect(embeds[1].data.description).toMatch(/test casier Cursor/);
    const fields = embeds[1].data.fields ?? [];
    expect(fields.map((f) => f.name)).toEqual(["Date", "Membre", "Durée", "Par"]);
    expect(fields.find((f) => f.name === "Date")?.value).toMatch(/^<t:\d+:f>$/);
    expect(fields.find((f) => f.name === "Membre")?.value).toBe("<@1321693294933180538>");
    expect(fields.find((f) => f.name === "Par")?.value).toBe("John");
  });
});

describe("sendCasierTableToMessage", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it("posts native embeds through Discord REST without a file", async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      text: async () => "{}",
    });
    vi.stubGlobal("fetch", fetchMock);

    const ok = await sendCasierTableToMessage(
      { id: `msg-${Date.now()}`, channelId: "1497977006510440700" } as any,
      {
        title: "Logs de sanctions",
        items: [item],
        withUser: true,
        guildId: "1133720050331832340",
        client: { token: "test-token" } as any,
      },
    );

    expect(ok).toBe(true);
    expect(fetchMock).toHaveBeenCalledOnce();
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe("https://discord.com/api/v10/channels/1497977006510440700/messages");
    expect(init.method).toBe("POST");
    expect(init.headers.Authorization).toBe("Bot test-token");
    expect(init.headers["Content-Type"]).toBe("application/json");
    expect(init.body).toEqual(expect.any(String));
    const body = JSON.parse(init.body as string);
    expect(body.embeds).toHaveLength(2);
    expect(JSON.stringify(body)).not.toMatch(/casier\.png/);
    expect(body.embeds[1].title).toMatch(/Avertissement/);
  });
});
