import { ChatInputCommandInteraction, ActionRowBuilder, ButtonBuilder } from "discord.js";
export declare const commands: import("discord.js").RESTPostAPIChatInputApplicationCommandsJSONBody[];
export interface CasierEntry {
    section: "warn" | "mute" | "kick" | "ban_sanction" | "ban";
    isHeader: boolean;
    headerLine: string;
    line: string;
}
export declare function buildEntries(warnings: Record<string, unknown>[], mutes: Record<string, unknown>[], kicks: Record<string, unknown>[], banSanctions: Record<string, unknown>[], bans: Record<string, unknown>[]): CasierEntry[];
export declare function chunkEntries(entries: CasierEntry[], maxChars: number): string[];
export declare function buildNavRow(page: number, total: number): ActionRowBuilder<ButtonBuilder>;
export declare function handleCasierClear(interaction: ChatInputCommandInteraction): Promise<void>;
export declare function handleCommand(interaction: ChatInputCommandInteraction): Promise<void>;
//# sourceMappingURL=casier.d.ts.map