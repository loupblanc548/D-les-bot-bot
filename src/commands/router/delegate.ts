/**
 * delegate.ts — Helper to delegate subcommand execution to existing legacy handlers.
 *
 * Many subcommands just need to set commandName and call an existing handler.
 * This helper reduces boilerplate for those cases.
 */

import type { ChatInputCommandInteraction, Client } from "discord.js";
import type { SubcommandDef } from "./types.js";

/**
 * Create a subcommand that delegates to an existing handler by setting
 * the commandName on the interaction and calling the handler.
 */
export function delegateSub(
  name: string,
  description: string,
  commandName: string,
  handler: (interaction: ChatInputCommandInteraction, client: Client) => Promise<void>,
  options?: {
    build?: SubcommandDef["build"];
  },
): SubcommandDef {
  return {
    name,
    build: options?.build ?? ((sc) => sc.setDescription(description)),
    execute: async (interaction, client) => {
      Object.defineProperty(interaction, "commandName", { value: commandName, writable: true });
      await handler(interaction, client);
    },
  };
}
