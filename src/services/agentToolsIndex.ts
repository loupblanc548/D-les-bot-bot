/**
 * agentToolsIndex.ts — Barrel export unifié pour tous les modules agentTools*
 *
 * Au lieu d'importer depuis 10 fichiers différents, les consommateurs
 * peuvent importer depuis ce seul fichier:
 *   import { ALL_AGENT_TOOLS, executeTool, type AgentToolDef } from "./agentToolsIndex.js";
 *
 * Organisation:
 *  - agentTools.ts          → types, core tools, executeTool (dispatcher principal)
 *  - agentToolsExtended.ts  → EXTENDED_TOOLS (IP, network, OSINT)
 *  - agentToolsExtra.ts     → EXTRA_TOOLS (data, media, utilities)
 *  - agentToolsAutonomous.ts→ AUTONOMOUS_TOOLS (moderation, sentiment)
 *  - agentToolsExternal.ts  → EXTERNAL_TOOLS (APIs externes)
 *  - agentToolsFree.ts      → FREE_TOOLS (APIs gratuites)
 *  - agentToolsGeneric.ts   → executeGenericTool (dispatcher générique)
 *  - agentToolsKali.ts      → KALI_TOOLS (sécurité, pentest)
 *  - agentToolsOrphan.ts    → ORPHAN_TOOLS (tools orphelins)
 *  - agentToolsRetailers.ts → RETAILER_TOOLS (deals, pricing)
 */

// ─── Types & Core ────────────────────────────────────────────────────────────
export {
  type AgentToolDef,
  type ToolCallResult,
  type ToolContext,
  AGENT_TOOLS,
  ALL_AGENT_TOOLS,
  executeTool,
  generateToolListPrompt,
} from "./agentTools.js";

// ─── Extended (IP, network, OSINT) ───────────────────────────────────────────
export { EXTENDED_TOOLS, executeExtendedTool } from "./agentToolsExtended.js";

// ─── Extra (data, media, utilities) ──────────────────────────────────────────
export { EXTRA_TOOLS, executeExtraTool } from "./agentToolsExtra.js";

// ─── Autonomous (moderation, sentiment, proactive) ───────────────────────────
export {
  AUTONOMOUS_TOOLS,
  executeAutonomousTool,
  trackMessageForGhostPings,
} from "./agentToolsAutonomous.js";

// ─── External APIs ───────────────────────────────────────────────────────────
export { EXTERNAL_TOOLS, executeExternalTool } from "./agentToolsExternal.js";

// ─── Free APIs ───────────────────────────────────────────────────────────────
export { FREE_TOOLS, executeFreeTool, autoHealTypeScriptError } from "./agentToolsFree.js";

// ─── Generic dispatcher ──────────────────────────────────────────────────────
export { executeGenericTool } from "./agentToolsGeneric.js";

// ─── Kali (security, pentest) ────────────────────────────────────────────────
export {
  KALI_TOOLS,
  executeKaliTool,
  setKaliClient,
  handleKaliApprove,
  handleKaliReject,
  checkKaliContainer,
  ensureKaliContainer,
} from "./agentToolsKali.js";

// ─── Orphan tools ────────────────────────────────────────────────────────────
export { ORPHAN_TOOLS, executeOrphanTool } from "./agentToolsOrphan.js";

// ─── Retailer tools ──────────────────────────────────────────────────────────
export { RETAILER_TOOL_DEFS, handleRetailerTool } from "./agentToolsRetailers.js";
