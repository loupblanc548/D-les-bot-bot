/**
 * loader.ts — Dynamic file-based command loader.
 *
 * Scans src/commands/[category]/ for _command.ts and subcommand files.
 * Supports two subcommand file patterns:
 *   1. meta + execute (preferred)
 *   2. default export SubcommandDef (legacy)
 *
 * At runtime, dispatches interactions to the correct subcommand file
 * via dynamic import — keeping memory footprint minimal.
 */

import { readdirSync, existsSync } from "fs";
import { join, dirname } from "path";
import { fileURLToPath } from "url";
import {
  ApplicationCommandOptionType,
  type ChatInputCommandInteraction,
  type Client,
  type SlashCommandBuilder,
  type SlashCommandSubcommandBuilder,
} from "discord.js";
import type { RootCommandDef, SubcommandDef, SubcommandMeta, MetaOption } from "./types.js";
import logger from "../../utils/logger.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const COMMANDS_DIR = join(__dirname, "..");

// Cache for loaded root command definitions.
const rootCommandCache = new Map<string, RootCommandDef>();

// Cache for loaded subcommand modules (lazy: only loaded when invoked).
// Stores either SubcommandDef (pattern 2) or a wrapper around meta+execute (pattern 1).
const subcommandModuleCache = new Map<string, SubcommandDef>();

/**
 * Convert a MetaOption to the appropriate add*Option call on a SlashCommandSubcommandBuilder.
 */
function applyOption(
  sc: SlashCommandSubcommandBuilder,
  opt: MetaOption,
): SlashCommandSubcommandBuilder {
  const typeNum =
    typeof opt.type === "string"
      ? ApplicationCommandOptionType[opt.type as keyof typeof ApplicationCommandOptionType]
      : opt.type;

  switch (typeNum) {
    case ApplicationCommandOptionType.String:
      return sc.addStringOption((o) => {
        o.setName(opt.name).setDescription(opt.description);
        if (opt.required) o.setRequired(true);
        if (opt.choices) o.addChoices(...(opt.choices as any));
        if (opt.autocomplete) o.setAutocomplete(true);
        return o;
      });
    case ApplicationCommandOptionType.Integer:
      return sc.addIntegerOption((o) => {
        o.setName(opt.name).setDescription(opt.description);
        if (opt.required) o.setRequired(true);
        if (opt.choices) o.addChoices(...(opt.choices as any));
        if (opt.minValue !== undefined) o.setMinValue(opt.minValue);
        if (opt.maxValue !== undefined) o.setMaxValue(opt.maxValue);
        if (opt.autocomplete) o.setAutocomplete(true);
        return o;
      });
    case ApplicationCommandOptionType.Number:
      return sc.addNumberOption((o) => {
        o.setName(opt.name).setDescription(opt.description);
        if (opt.required) o.setRequired(true);
        if (opt.choices) o.addChoices(...(opt.choices as any));
        if (opt.minValue !== undefined) o.setMinValue(opt.minValue);
        if (opt.maxValue !== undefined) o.setMaxValue(opt.maxValue);
        return o;
      });
    case ApplicationCommandOptionType.Boolean:
      return sc.addBooleanOption((o) => {
        o.setName(opt.name).setDescription(opt.description);
        if (opt.required) o.setRequired(true);
        return o;
      });
    case ApplicationCommandOptionType.User:
      return sc.addUserOption((o) => {
        o.setName(opt.name).setDescription(opt.description);
        if (opt.required) o.setRequired(true);
        return o;
      });
    case ApplicationCommandOptionType.Channel:
      return sc.addChannelOption((o) => {
        o.setName(opt.name).setDescription(opt.description);
        if (opt.required) o.setRequired(true);
        if (opt.channelTypes) o.addChannelTypes(opt.channelTypes as any);
        return o;
      });
    case ApplicationCommandOptionType.Role:
      return sc.addRoleOption((o) => {
        o.setName(opt.name).setDescription(opt.description);
        if (opt.required) o.setRequired(true);
        return o;
      });
    case ApplicationCommandOptionType.Mentionable:
      return sc.addMentionableOption((o) => {
        o.setName(opt.name).setDescription(opt.description);
        if (opt.required) o.setRequired(true);
        return o;
      });
    case ApplicationCommandOptionType.Attachment:
      return sc.addAttachmentOption((o) => {
        o.setName(opt.name).setDescription(opt.description);
        if (opt.required) o.setRequired(true);
        return o;
      });
    default:
      logger.warn(`Unsupported option type ${typeNum} for option "${opt.name}"`);
      return sc;
  }
}

/**
 * Convert a meta+execute module to a SubcommandDef for internal use.
 */
function metaToDef(
  name: string,
  meta: SubcommandMeta,
  execute: SubcommandDef["execute"],
): SubcommandDef {
  return {
    name,
    build: (sc) => {
      sc.setDescription(meta.description);
      if (meta.options) {
        for (const opt of meta.options) {
          applyOption(sc, opt);
        }
      }
      return sc;
    },
    execute,
    autocomplete: meta.autocomplete,
  };
}

// Type alias for the handler function
type SubHandler = SubcommandDef["execute"];

/**
 * Discover all category directories (folders containing _command.ts).
 */
function discoverCategories(): string[] {
  const entries = readdirSync(COMMANDS_DIR, { withFileTypes: true });
  return entries
    .filter((e) => e.isDirectory() && !e.name.startsWith("_") && e.name !== "router")
    .map((e) => e.name)
    .filter((name) => existsSync(join(COMMANDS_DIR, name, "_command.ts")));
}

/**
 * Load a root command definition from _command.ts.
 */
async function loadRootCommand(category: string): Promise<RootCommandDef> {
  if (rootCommandCache.has(category)) {
    return rootCommandCache.get(category)!;
  }
  const mod = await import(`../${category}/_command.js`);
  const def = mod.default as RootCommandDef;
  if (!def) {
    throw new Error(`_command.ts in ${category} must export a default RootCommandDef`);
  }
  rootCommandCache.set(category, def);
  return def;
}

/**
 * Load a subcommand module dynamically.
 * Supports both patterns:
 *   1. export const meta + export async function execute
 *   2. export default defineSub({...})
 */
async function loadSubcommand(
  category: string,
  subcommand: string,
  group?: string,
): Promise<SubcommandDef | null> {
  const cacheKey = `${category}/${group ?? "_"}/${subcommand}`;
  if (subcommandModuleCache.has(cacheKey)) {
    return subcommandModuleCache.get(cacheKey)!;
  }

  const paths = group
    ? [`../${category}/${group}/${subcommand}.js`]
    : [`../${category}/${subcommand}.js`];

  for (const p of paths) {
    try {
      const mod = await import(p);

      // Pattern 1: meta + execute
      if (mod.meta && typeof mod.execute === "function") {
        const def = metaToDef(subcommand, mod.meta as SubcommandMeta, mod.execute as SubHandler);
        subcommandModuleCache.set(cacheKey, def);
        return def;
      }

      // Pattern 2: default export SubcommandDef
      const def = mod.default as SubcommandDef;
      if (def && def.name) {
        subcommandModuleCache.set(cacheKey, def);
        return def;
      }
    } catch {
      // Try next path.
    }
  }

  logger.warn(`Subcommand not found: ${cacheKey}`);
  return null;
}

/**
 * Build all SlashCommandBuilders for registration with Discord.
 */
export async function buildAllCommands(): Promise<ReturnType<SlashCommandBuilder["toJSON"]>[]> {
  const categories = discoverCategories();
  const commands: ReturnType<SlashCommandBuilder["toJSON"]>[] = [];

  for (const category of categories) {
    try {
      const rootDef = await loadRootCommand(category);
      const builder = rootDef.build();
      commands.push((builder as SlashCommandBuilder).toJSON());
    } catch (err) {
      logger.error(
        `Failed to build command for /${category}: ${err instanceof Error ? err.message : String(err)}`,
      );
    }
  }

  logger.info(
    `✓ Dynamic router: ${commands.length} root commands built from ${categories.length} categories`,
  );
  return commands;
}

/**
 * Dispatch an interaction to the correct subcommand file.
 */
export async function dispatchInteraction(
  interaction: ChatInputCommandInteraction,
  client: Client,
): Promise<void> {
  const commandName = interaction.commandName;
  const subcommandGroup = interaction.options.getSubcommandGroup(false) ?? undefined;
  const subcommand = interaction.options.getSubcommand(false);

  if (!subcommand) {
    logger.warn(`Interaction for /${commandName} has no subcommand`);
    return;
  }

  const def = await loadSubcommand(commandName, subcommand, subcommandGroup);
  if (!def) {
    logger.warn(
      `No handler found for /${commandName} ${subcommandGroup ? subcommandGroup + " " : ""}${subcommand}`,
    );
    return;
  }

  await def.execute(interaction, client);
}

/**
 * Dispatch an autocomplete interaction.
 */
export async function dispatchAutocomplete(
  interaction: import("discord.js").AutocompleteInteraction,
  client: Client,
): Promise<void> {
  const commandName = interaction.commandName;
  const subcommandGroup = interaction.options.getSubcommandGroup(false) ?? undefined;
  const subcommand = interaction.options.getSubcommand(false);

  if (!subcommand) return;

  const def = await loadSubcommand(commandName, subcommand, subcommandGroup);
  if (!def?.autocomplete) return;

  await def.autocomplete(interaction, client);
}

/**
 * Get the list of all category names (for router registration).
 */
export function getCategoryNames(): string[] {
  return discoverCategories();
}
