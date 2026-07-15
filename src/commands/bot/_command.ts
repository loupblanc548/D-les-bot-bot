/**
 * _command.ts — Root command definition for /bot
 */

import { SlashCommandBuilder } from "discord.js";
import type { RootCommandDef, SubcommandDef } from "../router/types.js";

import help from "./help.js";
import restart from "./restart.js";
import status from "./status.js";

const subcommands: SubcommandDef[] = [help, restart, status];

export default {
  name: "bot",
  build: () => {
    const builder = new SlashCommandBuilder()
      .setName("bot")
      .setDescription("Commandes principales du bot");

    for (const sub of subcommands) {
      builder.addSubcommand((sc) => sub.build(sc.setName(sub.name)));
    }

    return builder;
  },
} as RootCommandDef;
