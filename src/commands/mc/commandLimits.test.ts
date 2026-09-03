import { describe, expect, it } from "vitest";
import mcCommand from "./_command.js";
import agentaction from "./agentaction.js";
import { SlashCommandSubcommandBuilder } from "discord.js";

describe("/mc slash limits", () => {
  it("stays within Discord's 25-subcommand and 100-char description limits", () => {
    const root = mcCommand.build().toJSON();
    const subs = root.options ?? [];
    expect(subs.length).toBeGreaterThan(0);
    expect(subs.length).toBeLessThanOrEqual(25);
    expect((root.description ?? "").length).toBeLessThanOrEqual(100);

    for (const opt of subs) {
      expect((opt.description ?? "").length).toBeGreaterThan(0);
      expect((opt.description ?? "").length).toBeLessThanOrEqual(100);
    }
  });

  it("keeps agentaction option descriptions under 100 characters", () => {
    const built = agentaction.build(new SlashCommandSubcommandBuilder().setName("agentaction"));
    const json = built.toJSON();
    expect((json.description ?? "").length).toBeLessThanOrEqual(100);
    for (const opt of json.options ?? []) {
      expect((opt.description ?? "").length).toBeLessThanOrEqual(100);
    }
  });
});
