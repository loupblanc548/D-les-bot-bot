/**
 * _command.ts — Root command definition for /mc (Minecraft Bedrock Bot)
 *
 * Imports all subcommand definitions and assembles the full SlashCommandBuilder.
 * At runtime, the router dispatches to individual subcommand files via dynamic import.
 */

import { SlashCommandBuilder } from "discord.js";
import type { RootCommandDef, SubcommandDef } from "../router/types.js";

import connect from "./connect.js";
import disconnect from "./disconnect.js";
import status from "./status.js";
import mine from "./mine.js";
import stop from "./stop.js";
import chat from "./chat.js";
import seed from "./seed.js";
import stopServer from "./stop-server.js";
import solo from "./solo.js";
import follow from "./follow.js";
import unfollow from "./unfollow.js";
import give from "./give.js";
import equip from "./equip.js";
import farm from "./farm.js";
import stopFarm from "./stop-farm.js";
import link from "./link.js";
import unlink from "./unlink.js";
import profile from "./profile.js";
import stats from "./stats.js";

const subcommands: SubcommandDef[] = [
  connect,
  disconnect,
  status,
  mine,
  stop,
  chat,
  seed,
  stopServer,
  solo,
  follow,
  unfollow,
  give,
  equip,
  farm,
  stopFarm,
  link,
  unlink,
  profile,
  stats,
];

export default {
  name: "mc",
  build: () => {
    const builder = new SlashCommandBuilder()
      .setName("mc")
      .setDescription("Bot Minecraft Bedrock (mining, follow, farm, inventory, serveur)");

    for (const sub of subcommands) {
      builder.addSubcommand((sc) => sub.build(sc.setName(sub.name).setDescription("")));
    }

    return builder;
  },
} as RootCommandDef;
