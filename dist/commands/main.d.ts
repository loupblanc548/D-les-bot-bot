import { ChatInputCommandInteraction, Client, StringSelectMenuInteraction } from "discord.js";
export interface Category {
    id: string;
    name: string;
    emoji: string;
    description: string;
    commands: string;
}
export declare const CATEGORIES: Category[];
declare function handleCategorySelect(interaction: StringSelectMenuInteraction): Promise<void>;
export declare const commands: any[];
export declare function handleCommand(interaction: ChatInputCommandInteraction, client: Client): Promise<void>;
export { handleCategorySelect as handleSelectMenu };
//# sourceMappingURL=main.d.ts.map