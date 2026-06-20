import { createLog } from "../services/logs.js";
export function handleEmojiEvents(client) {
    // Emoji created
    client.on("emojiCreate", async (emoji) => {
        await createLog({
            type: "emoji_create",
            action: `Emoji :${emoji.name}: ajoute`,
            targetId: emoji.id,
        });
    });
    // Emoji deleted
    client.on("emojiDelete", async (emoji) => {
        await createLog({
            type: "emoji_delete",
            action: `Emoji :${emoji.name}: supprime`,
            targetId: emoji.id,
        });
    });
}
//# sourceMappingURL=emojis.js.map