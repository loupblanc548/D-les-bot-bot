import { MessageFlags, Client, GuildEmoji } from "discord.js";
import { createLog } from "../services/logs.js";

export function handleEmojiEvents(client: Client) {
  // Emoji created
  client.on("emojiCreate", async (emoji: GuildEmoji) => {
    await createLog({
      type: "emoji_create",
      action: `Emoji :${emoji.name}: ajoute`,
      targetId: emoji.id,
    });
  });

  // Emoji deleted
  client.on("emojiDelete", async (emoji: GuildEmoji) => {
    await createLog({
      type: "emoji_delete",
      action: `Emoji :${emoji.name}: supprime`,
      targetId: emoji.id,
    });
  });
}
