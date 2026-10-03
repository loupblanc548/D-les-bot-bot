import { describe, expect, it } from "vitest";
import { extractChatOrder, resolveChatOrder } from "./chatOrders.js";

describe("extractChatOrder", () => {
  it("copie le dernier message vers le salon actuel", () => {
    const order = extractChatOrder("copie le dernier message vers ce salon");
    expect(order?.tool).toBe("moveOrCopyMessages");
    if (order?.tool !== "moveOrCopyMessages") return;
    expect(order.args.mode).toBe("copy");
    expect(order.args.amount).toBe(1);
    expect(resolveChatOrder(order, "1497977006510440700").args).toMatchObject({
      targetChannelId: "1497977006510440700",
    });
  });

  it("déplace vers un salon nommé", () => {
    const order = extractChatOrder("déplace 3 messages vers #annonces");
    expect(order).toMatchObject({
      tool: "moveOrCopyMessages",
      args: { mode: "move", amount: 3, targetChannelId: "annonces" },
    });
  });

  it("lit un mp3 et rejoint le vocal seulement sur demande", () => {
    expect(extractChatOrder("Joue un mp3.")).toMatchObject({ tool: "playMp3", args: { name: "" } });
    expect(extractChatOrder("rejoins le vocal")?.tool).toBe("joinVoice");
    expect(extractChatOrder("quitte le vocal")?.tool).toBe("leaveVoice");
    expect(extractChatOrder("tu peux jouer un mp3 ?")).toBeNull();
  });
});
