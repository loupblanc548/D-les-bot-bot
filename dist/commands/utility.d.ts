import { ChatInputCommandInteraction, Client, ModalSubmitInteraction } from "discord.js";
export declare const commands: import("discord.js").RESTPostAPIChatInputApplicationCommandsJSONBody[];
export declare function handleCommand(interaction: ChatInputCommandInteraction, client: Client): Promise<void>;
export declare function handleModalSubmit(interaction: ModalSubmitInteraction, _client: Client): Promise<void>;
/**
 * Autocomplete pour /translate - filtre les langues selon la saisie utilisateur
 */
export declare function handleTranslateAutocomplete(interaction: any): Promise<void>;
//# sourceMappingURL=utility.d.ts.map