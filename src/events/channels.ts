import { MessageFlags, Client, GuildChannel, NonThreadGuildBasedChannel, DMChannel } from "discord.js";
import { createLog } from "../services/logs";

export function handleChannelEvents(client: Client) {
  client.on("channelCreate", async (channel: GuildChannel) => {
    await createLog({
      type: "channel_create",
      action: `Salon #${channel.name} cree`,
      targetId: channel.id,
    });
  });

  client.on("channelDelete", async (channel: DMChannel | NonThreadGuildBasedChannel) => {
    if ("name" in channel) {
      await createLog({
        type: "channel_delete",
        action: `Salon #${channel.name} supprime`,
        targetId: channel.id,
      });
    }
  });
}
