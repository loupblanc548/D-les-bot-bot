import type { Client, Guild } from "discord.js";
import logger from "../utils/logger.js";
import { maybeSetupJoinedGuild } from "../services/basicServerSetup.js";

export function handleGuildEvents(client: Client) {
  client.on("guildCreate", (guild: Guild) => {
    void maybeSetupJoinedGuild(guild).catch((err) => {
      logger.warn(
        `[GuildEvents] setup basique échoué sur ${guild.id}: ${err instanceof Error ? err.message : String(err)}`,
      );
    });
  });
}
