/**
 * _command.ts — Root command definition for /bot
 */

import { SlashCommandBuilder } from "discord.js";
import type { RootCommandDef, SubcommandDef } from "../router/types.js";

import start from "./start.js";
import help from "./help.js";
import restart from "./restart.js";
import status from "./status.js";
import uptime from "./uptime.js";
import serverInfo from "./server-info.js";
import userinfo from "./userinfo.js";
import dashboard from "./dashboard.js";
import shadowbroker from "./shadowbroker.js";
import invite from "./invite.js";
import stats from "./stats.js";
import ping from "./ping.js";
import changelog from "./changelog.js";
import vote from "./vote.js";
import support from "./support.js";
import privacy from "./privacy.js";
import commandsList from "./commands-list.js";
import shardStats from "./shard-stats.js";
import shardRestart from "./shard-restart.js";

const subcommands: SubcommandDef[] = [
  start,
  help,
  restart,
  status,
  uptime,
  serverInfo,
  userinfo,
  dashboard,
  shadowbroker,
  invite,
  stats,
  ping,
  changelog,
  vote,
  support,
  privacy,
  commandsList,
  shardStats,
  shardRestart,
];

export default {
  name: "bot",
  build: () => {
    const builder = new SlashCommandBuilder()
      .setName("bot")
      .setDescription("Commandes principales du bot");

    for (const sub of subcommands) {
      builder.addSubcommand((sc) => sub.build(sc.setName(sub.name).setDescription("")));
    }

    return builder;
  },
} as RootCommandDef;
