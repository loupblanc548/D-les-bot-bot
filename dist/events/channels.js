"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.handleChannelEvents = handleChannelEvents;
const logs_1 = require("../services/logs");
function handleChannelEvents(client) {
    client.on("channelCreate", async (channel) => {
        await (0, logs_1.createLog)({
            type: "channel_create",
            action: `Salon #${channel.name} cree`,
            targetId: channel.id,
        });
    });
    client.on("channelDelete", async (channel) => {
        if ("name" in channel) {
            await (0, logs_1.createLog)({
                type: "channel_delete",
                action: `Salon #${channel.name} supprime`,
                targetId: channel.id,
            });
        }
    });
}
//# sourceMappingURL=channels.js.map