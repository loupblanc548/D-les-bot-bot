/**
 * autoCommand.ts — Helper to build a RootCommandDef that auto-discovers
 * subcommand files using the meta+execute pattern.
 *
 * Instead of manually importing every subcommand file, this helper
 * scans the category directory for .ts files (excluding _command.ts)
 * and dynamically imports them to collect their `meta` definitions.
 *
 * Usage in _command.ts:
 *   export default autoCommand("ai", "Commandes IA", {
 *     groups: {
 *       basic: "IA basique",
 *       advanced: "IA avancée",
 *     }
 *   });
 */

import { SlashCommandBuilder, Interaction, Client } from "discord.js";
import { ApplicationCommandOptionType, type SlashCommandSubcommandBuilder } from "discord.js";
import type { RootCommandDef, SubcommandMeta, MetaOption } from "./types.js";
import logger from "../../utils/logger.js";

/**
 * Apply a MetaOption to a SlashCommandSubcommandBuilder.
 * (Mirrors the logic in loader.ts applyOption.)
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
 * Apply meta options to a subcommand builder.
 */
function applyMeta(
  sc: SlashCommandSubcommandBuilder,
  meta: SubcommandMeta,
): SlashCommandSubcommandBuilder {
  sc.setDescription(meta.description);
  if (meta.options) {
    for (const opt of meta.options) {
      applyOption(sc, opt);
    }
  }
  return sc;
}

interface AutoCommandOptions {
  /** Subcommand groups: { groupName: description } */
  groups?: Record<string, string>;
  /** Default member permissions (bitfield) */
  defaultMemberPermissions?: bigint;
}

/**
 * Build a RootCommandDef that auto-discovers subcommands from the filesystem.
 * The category directory must be the same directory as the _command.ts file.
 */
export function autoCommand(
  name: string,
  description: string,
  options: AutoCommandOptions = {},
): RootCommandDef {
  return {
    name,
    build: () => {
      const builder = new SlashCommandBuilder().setName(name).setDescription(description);

      if (options.defaultMemberPermissions !== undefined) {
        builder.setDefaultMemberPermissions(options.defaultMemberPermissions);
      }

      // We can't do async discovery in build(), so we use a sync approach.
      // The _command.ts files that use autoCommand must be in a directory
      // where we can readdirSync to find subcommand files.
      //
      // However, since build() is called from buildAllCommands() which is async,
      // we could make this work with a pre-discovery step. For now, we rely on
      // the _command.ts explicitly importing subcommand files (the standard pattern).
      //
      // This helper is kept for future use when we add a pre-discovery step.
      return builder;
    },
  };
}

/**
 * Build a RootCommandDef from an explicit list of subcommand modules.
 * Supports both flat subcommands and grouped subcommands.
 *
 * Each module can be either:
 *   - { meta, execute } (pattern 1)
 *   - { default: SubcommandDef } (pattern 2)
 */
export function buildCommand(
  name: string,
  description: string,
  config: {
    /** Flat subcommands: { subcommandName: importedModule } */
    subcommands?: Record<
      string,
      {
        meta?: SubcommandMeta;
        execute?: (interaction: Interaction, client: Client) => Promise<void>;
        default?: any;
      }
    >;
    /** Grouped subcommands */
    groups?: Record<
      string,
      {
        description: string;
        subcommands: Record<
          string,
          {
            meta?: SubcommandMeta;
            execute?: (interaction: Interaction, client: Client) => Promise<void>;
            default?: any;
          }
        >;
      }
    >;
    /** Default member permissions */
    defaultMemberPermissions?: bigint;
  },
): RootCommandDef {
  return {
    name,
    build: () => {
      const builder = new SlashCommandBuilder().setName(name).setDescription(description);

      if (config.defaultMemberPermissions !== undefined) {
        builder.setDefaultMemberPermissions(config.defaultMemberPermissions);
      }

      // Add grouped subcommands
      if (config.groups) {
        for (const [groupName, groupDef] of Object.entries(config.groups)) {
          builder.addSubcommandGroup((grp) => {
            grp.setName(groupName).setDescription(groupDef.description);

            for (const [subName, mod] of Object.entries(groupDef.subcommands)) {
              grp.addSubcommand((sc) => {
                sc.setName(subName);
                if (mod.meta) {
                  applyMeta(sc, mod.meta);
                } else if (mod.default?.build) {
                  mod.default.build(sc.setName(subName).setDescription(""));
                } else {
                  sc.setDescription("...");
                }
                return sc;
              });
            }

            return grp;
          });
        }
      }

      // Add flat subcommands
      if (config.subcommands) {
        for (const [subName, mod] of Object.entries(config.subcommands)) {
          builder.addSubcommand((sc) => {
            sc.setName(subName);
            if (mod.meta) {
              applyMeta(sc, mod.meta);
            } else if (mod.default?.build) {
              mod.default.build(sc.setName(subName).setDescription(""));
            } else {
              sc.setDescription("...");
            }
            return sc;
          });
        }
      }

      return builder;
    },
  };
}
