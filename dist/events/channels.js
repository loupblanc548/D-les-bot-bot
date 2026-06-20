import { createLog } from "../services/logs.js";
export function handleChannelEvents(client) {
    client.on("channelCreate", async (channel) => {
        await createLog({
            type: "channel_create",
            action: `Salon #${channel.name} cree`,
            targetId: channel.id,
        });
    });
    client.on("channelDelete", async (channel) => {
        if ("name" in channel) {
            await createLog({
                type: "channel_delete",
                action: `Salon #${channel.name} supprime`,
                targetId: channel.id,
            });
        }
    });
}
//# sourceMappingURL=channels.js.map