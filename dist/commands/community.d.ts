import { ChatInputCommandInteraction, Client, ButtonInteraction } from "discord.js";
export declare const commands: import("discord.js").RESTPostAPIChatInputApplicationCommandsJSONBody[];
export declare function handleCommand(interaction: ChatInputCommandInteraction, client: Client): Promise<void>;
export declare function handleTicketButton(interaction: ButtonInteraction, client: Client): Promise<void>;
export declare function handleTicketClose(interaction: ButtonInteraction, client: Client): Promise<void>;
//# sourceMappingURL=community.d.ts.map