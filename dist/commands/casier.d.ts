import { ChatInputCommandInteraction, ActionRowBuilder, ButtonBuilder } from "discord.js";
export declare const commands: import("discord.js").RESTPostAPIChatInputApplicationCommandsJSONBody[];
export interface CasierEntry {
    section: "warn" | "mute" | "kick" | "ban_sanction" | "ban";
    isHeader: boolean;
    headerLine: string;
    line: string;
}
interface SanctionRow {
    reason?: string | null;
    createdAt: Date;
    moderatorId?: string | null;
    duration?: number | null;
}
interface LogRow {
    action?: string | null;
    details?: string | null;
    createdAt: Date | string;
}
export declare function buildEntries(warnings: SanctionRow[], mutes: SanctionRow[], kicks: SanctionRow[], banSanctions: SanctionRow[], bans: LogRow[]): CasierEntry[];
export declare function chunkEntries(entries: CasierEntry[], maxChars: number): string[];
export declare function buildNavRow(page: number, total: number): ActionRowBuilder<ButtonBuilder>;
export declare function handleCasierClear(interaction: ChatInputCommandInteraction): Promise<void>;
export declare function handleCommand(interaction: ChatInputCommandInteraction): Promise<void>;
export {};
//# sourceMappingURL=casier.d.ts.map