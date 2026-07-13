/**
 * types.ts — Core types for the dynamic file-based command router.
 *
 * Two supported patterns for subcommand files:
 *
 * 1. meta + execute (preferred, simplest):
 *    export const meta = { description: "...", options: [...] };
 *    export async function execute(interaction, client) { ... }
 *
 * 2. default export SubcommandDef (legacy, still supported):
 *    export default defineSub({ name, build, execute });
 */

import type {
  ChatInputCommandInteraction,
  Client,
  SlashCommandBuilder,
  SlashCommandSubcommandsOnlyBuilder,
  SlashCommandOptionsOnlyBuilder,
  SlashCommandSubcommandBuilder,
  ApplicationCommandOptionType,
} from "discord.js";

// A handler receives the interaction and the client.
export type SubHandler = (
  interaction: ChatInputCommandInteraction,
  client: Client,
) => Promise<void> | void;

// ─── Pattern 1: meta + execute ──────────────────────────────────────────

/** A single option definition in the meta.options array. */
export interface MetaOption {
  type: keyof typeof ApplicationCommandOptionType | number;
  name: string;
  description: string;
  required?: boolean;
  choices?: { name: string; value: string | number }[];
  minValue?: number;
  maxValue?: number;
  autocomplete?: boolean;
  channelTypes?: number[];
}

/** The meta object exported by subcommand files. */
export interface SubcommandMeta {
  description: string;
  options?: MetaOption[];
  /** Optional: autocomplete handler. */
  autocomplete?: (
    interaction: import("discord.js").AutocompleteInteraction,
    client: Client,
  ) => Promise<void> | void;
}

// ─── Pattern 2: default export SubcommandDef ────────────────────────────

/**
 * SubcommandDef — exported by every leaf file (e.g. admin/backup.ts).
 *
 * `build` returns the Discord.js subcommand builder for registration.
 * `execute` is called at runtime when the subcommand is invoked.
 */
export interface SubcommandDef {
  /** Subcommand name (must match the name used in `build`). */
  name: string;
  /** Build the subcommand option for the SlashCommandBuilder. */
  build: (sc: SlashCommandSubcommandBuilder) => SlashCommandSubcommandBuilder;
  /** Runtime handler. */
  execute: SubHandler;
  /** Optional: autocomplete handler. */
  autocomplete?: (
    interaction: import("discord.js").AutocompleteInteraction,
    client: Client,
  ) => Promise<void> | void;
}

// ─── Root command ────────────────────────────────────────────────────────

/**
 * RootCommandDef — exported by every _command.ts file.
 */
export interface RootCommandDef {
  /** Root command name (e.g. "admin", "ai", "mc"). */
  name: string;
  /** Build the full command with all subcommands and groups. */
  build: () =>
    | SlashCommandBuilder
    | SlashCommandSubcommandsOnlyBuilder
    | SlashCommandOptionsOnlyBuilder
    | Omit<SlashCommandBuilder, "addSubcommandGroup" | "addSubcommand">;
  /** Whether this command needs the client passed to its handler. */
  needsClient?: boolean;
}

/**
 * SubcommandGroupDef — represents a group folder (e.g. ai/basic/).
 */
export interface SubcommandGroupDef {
  /** Group name. */
  name: string;
  /** Group description. */
  description: string;
  /** List of subcommand names in this group (for validation). */
  subcommands: string[];
}
