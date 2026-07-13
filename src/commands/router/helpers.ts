/**
 * helpers.ts — Utility functions for building subcommands and groups.
 *
 * These helpers reduce boilerplate in subcommand files.
 */

import type { SubcommandDef } from "./types.js";

/**
 * Define a subcommand with minimal boilerplate.
 *
 * @example
 * export default defineSub({
 *   name: "backup",
 *   build: (sc) => sc.setDescription("Backup manuel de la DB"),
 *   execute: async (interaction, client) => { ... },
 * });
 */
export function defineSub(def: SubcommandDef): SubcommandDef {
  return def;
}

/**
 * Helper to create a simple subcommand with just a name, description, and handler.
 */
export function simpleSub(
  name: string,
  description: string,
  execute: SubcommandDef["execute"],
): SubcommandDef {
  return {
    name,
    build: (sc) => sc.setName(name).setDescription(description),
    execute,
  };
}

// Re-export for convenience.
export type { SubcommandDef, RootCommandDef } from "./types.js";
