import { MessageFlags, Client, Role, GuildMember, PartialGuildMember } from "discord.js";
import { createLog } from "../services/logs.js";

export function handleRoleEvents(client: Client) {
  client.on("roleCreate", async (role: Role) => {
    await createLog({ type: "role_create", action: `Role ${role.name} cree`, targetId: role.id });
  });

  client.on("roleDelete", async (role: Role) => {
    await createLog({ type: "role_delete", action: `Role ${role.name} supprime`, targetId: role.id });
  });

  client.on("guildMemberUpdate", async (oldMember: GuildMember | PartialGuildMember, newMember: GuildMember) => {
    // Skip if oldMember is partial - cannot accurately detect role changes
    if (oldMember.partial || !("roles" in oldMember)) return;

    const addedRoles = newMember.roles.cache.filter((role) => !oldMember.roles.cache.has(role.id));
    const removedRoles = oldMember.roles.cache.filter((role) => !newMember.roles.cache.has(role.id));

    for (const [, role] of addedRoles) {
      await createLog({
        type: "role_add",
        action: `Role ${role.name} ajoute a ${newMember.user.tag}`,
        userId: newMember.id,
        targetId: role.id,
      });
    }

    for (const [, role] of removedRoles) {
      await createLog({
        type: "role_remove",
        action: `Role ${role.name} retire de ${newMember.user.tag}`,
        userId: newMember.id,
        targetId: role.id,
      });
    }
  });
}
