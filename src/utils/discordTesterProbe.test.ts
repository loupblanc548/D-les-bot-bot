import { describe, expect, it } from "vitest";
import {
  buildJohnMention,
  DEFAULT_JOHN_BOT_USER_ID,
  findJohnReplyAfter,
  snowflakeAfter,
  summarizeProbeMessage,
} from "./discordTesterProbe.js";

describe("discordTesterProbe", () => {
  it("mentions John before the prompt", () => {
    expect(buildJohnMention("ping")).toBe(`<@${DEFAULT_JOHN_BOT_USER_ID}> ping`);
    expect(buildJohnMention("  ")).toBe(`<@${DEFAULT_JOHN_BOT_USER_ID}>`);
  });

  it("compares Discord snowflakes as bigints", () => {
    expect(snowflakeAfter("1544783063639138455", "1544783063639138454")).toBe(true);
    expect(snowflakeAfter("1544783063639138454", "1544783063639138455")).toBe(false);
  });

  it("picks John's first message after the tester ping", () => {
    const reply = findJohnReplyAfter(
      [
        {
          id: "100",
          author: { id: DEFAULT_JOHN_BOT_USER_ID, username: "John Helldiver" },
          content: "old",
        },
        {
          id: "300",
          author: { id: DEFAULT_JOHN_BOT_USER_ID, username: "John Helldiver" },
          content: "Présent.",
          message_reference: { message_id: "200" },
        },
        {
          id: "250",
          author: { id: "1321693294933180538", username: "encore un test" },
          content: "noise",
        },
      ],
      "200",
    );
    expect(reply?.id).toBe("300");
    expect(summarizeProbeMessage(reply!)).toContain("Présent");
  });

  it("returns undefined when John has not answered yet", () => {
    expect(
      findJohnReplyAfter(
        [
          {
            id: "10",
            author: { id: "1321693294933180538" },
            content: "<@1512435587926200391> ping",
          },
        ],
        "10",
      ),
    ).toBeUndefined();
  });
});
