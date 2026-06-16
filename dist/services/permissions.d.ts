import { CommandInteraction, GuildMember } from "discord.js";
export declare enum PermissionLevel {
    EVERYONE = 0,
    MODERATOR = 1,
    ADMIN = 2
}
export declare function getPermissionLevel(member: GuildMember): Promise<PermissionLevel>;
export declare function requireAdmin(interaction: CommandInteraction): Promise<boolean>;
export declare function requireMod(interaction: CommandInteraction): Promise<boolean>;
//# sourceMappingURL=permissions.d.ts.map