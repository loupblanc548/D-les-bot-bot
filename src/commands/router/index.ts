/**
 * index.ts — Public API for the dynamic command router.
 */

export {
  buildAllCommands,
  dispatchInteraction,
  dispatchAutocomplete,
  getCategoryNames,
} from "./loader.js";
export { defineSub, simpleSub } from "./helpers.js";
export { delegateSub } from "./delegate.js";
export { buildCommand } from "./autoCommand.js";
export type {
  RootCommandDef,
  SubcommandDef,
  SubcommandGroupDef,
  SubHandler,
  SubcommandMeta,
  MetaOption,
} from "./types.js";
