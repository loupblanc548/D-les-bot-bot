"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.handleEmojiEvents = handleEmojiEvents;
const logs_1 = require("../services/logs");
function handleEmojiEvents(client) {
    // Emoji created
    client.on("emojiCreate", async (emoji) => {
        await (0, logs_1.createLog)({
            type: "emoji_create",
            action: `Emoji :${emoji.name}: ajoute`,
            targetId: emoji.id,
        });
    });
    // Emoji deleted
    client.on("emojiDelete", async (emoji) => {
        await (0, logs_1.createLog)({
            type: "emoji_delete",
            action: `Emoji :${emoji.name}: supprime`,
            targetId: emoji.id,
        });
    });
}
//# sourceMappingURL=emojis.js.map