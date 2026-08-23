/**
 * toolRegistry.ts — Registre générique d'outils pour LLM (function calling)
 *
 * Permet d'enregistrer des outils réutilisables par Gemini/OpenAI
 * avec description JSON pour le function calling.
 *
 * Étendu avec: niveau de risque, permissions, validation, intégrité CI,
 * déduplication et génération automatique des schemas LLM.
 */

import logger from "../utils/logger.js";
import { getToolPermission, type RiskLevel } from "./toolExecutionGuard.js";

export interface ToolParameter {
  type: "string" | "number" | "boolean" | "array" | "object";
  description: string;
  enum?: string[];
  required?: boolean;
  default?: unknown;
  items?: ToolParameter;
  properties?: Record<string, ToolParameter>;
}

export interface ToolDefinition {
  name: string;
  description: string;
  parameters: Record<string, ToolParameter>;
  handler: (args: Record<string, any>) => Promise<any>;
  // Extended fields
  category?: string;
  riskLevel?: RiskLevel;
  requiresApproval?: boolean;
  restricted?: boolean;
  costEstimate?: number;
  deprecated?: boolean;
  aliases?: string[];
}

type ToolRegistry = Map<string, ToolDefinition>;

const registry: ToolRegistry = new Map();
const aliasMap = new Map<string, string>();

export function registerTool(tool: ToolDefinition): void {
  registry.set(tool.name, tool);
  if (tool.aliases) {
    for (const alias of tool.aliases) {
      aliasMap.set(alias, tool.name);
    }
  }
  logger.debug(`[ToolRegistry] Registered tool "${tool.name}"`);
}

export function getTool(name: string): ToolDefinition | null {
  const canonical = aliasMap.get(name) ?? name;
  return registry.get(canonical) ?? null;
}

export function listTools(): string[] {
  return Array.from(registry.keys());
}

export function getAllTools(): ToolDefinition[] {
  return Array.from(registry.values());
}

export function getToolsByCategory(category: string): ToolDefinition[] {
  return getAllTools().filter((t) => t.category === category);
}

export function getDeprecatedTools(): ToolDefinition[] {
  return getAllTools().filter((t) => t.deprecated);
}

/** Retourne les définitions au format JSON pour Gemini/OpenAI function calling */
export function getToolSchemas(): Array<{
  name: string;
  description: string;
  parameters: Record<string, ToolParameter>;
}> {
  return Array.from(registry.values())
    .filter((t) => !t.deprecated)
    .map((t) => ({
      name: t.name,
      description: t.description,
      parameters: t.parameters,
    }));
}

/** Génère le schema au format OpenAI function calling */
export function generateLlmSchema(toolName: string): object | null {
  const tool = getTool(toolName);
  if (!tool) return null;

  const properties: Record<string, unknown> = {};
  const required: string[] = [];

  for (const [name, param] of Object.entries(tool.parameters)) {
    const schema: Record<string, unknown> = {
      type: param.type,
      description: param.description,
    };
    if (param.enum) schema.enum = param.enum;
    if (param.default !== undefined) schema.default = param.default;
    properties[name] = schema;
    if (param.required) required.push(name);
  }

  return {
    type: "function",
    function: {
      name: tool.name,
      description: tool.description,
      parameters: {
        type: "object",
        properties,
        required,
      },
    },
  };
}

export function generateAllLlmSchemas(): object[] {
  return getAllTools()
    .filter((t) => !t.deprecated)
    .map((t) => generateLlmSchema(t.name))
    .filter((s): s is object => s !== null);
}

/** Valide les paramètres d'un outil */
export function validateParams(
  toolName: string,
  args: Record<string, unknown>,
): { valid: boolean; errors: string[] } {
  const tool = getTool(toolName);
  if (!tool) return { valid: false, errors: [`Unknown tool: ${toolName}`] };

  const errors: string[] = [];

  for (const [name, param] of Object.entries(tool.parameters)) {
    if (param.required && !(name in args)) {
      errors.push(`Missing required parameter: ${name}`);
      continue;
    }
    if (name in args) {
      const value = args[name];
      if (param.enum && !param.enum.includes(String(value))) {
        errors.push(`Parameter "${name}" must be one of: ${param.enum.join(", ")}`);
      }
    }
  }

  return { valid: errors.length === 0, errors };
}

/** Exécute un outil enregistré par son nom */
export async function executeTool(name: string, args: Record<string, any>): Promise<any> {
  const tool = registry.get(name);
  if (!tool) {
    throw new Error(`Tool "${name}" not found in registry`);
  }
  return tool.handler(args);
}

// ─── Vérification d'intégrité (CI) ───────────────────────────────────────────

export interface IntegrityCheckResult {
  valid: boolean;
  issues: Array<{
    toolName: string;
    issue: string;
    severity: "error" | "warning";
  }>;
}

export function checkIntegrity(): IntegrityCheckResult {
  const issues: IntegrityCheckResult["issues"] = [];

  for (const tool of getAllTools()) {
    if (typeof tool.handler !== "function") {
      issues.push({ toolName: tool.name, issue: "Missing or invalid handler", severity: "error" });
    }
    if (!tool.riskLevel) {
      issues.push({ toolName: tool.name, issue: "Missing risk level", severity: "error" });
    }
    if (tool.deprecated && !tool.aliases?.length) {
      issues.push({
        toolName: tool.name,
        issue: "Deprecated tool without alias/replacement",
        severity: "warning",
      });
    }
    // Check permission consistency
    const perm = getToolPermission(tool.name);
    if (tool.riskLevel && perm.riskLevel !== tool.riskLevel) {
      issues.push({
        toolName: tool.name,
        issue: `Risk level mismatch: tool=${tool.riskLevel}, registry=${perm.riskLevel}`,
        severity: "warning",
      });
    }
  }

  return { valid: issues.filter((i) => i.severity === "error").length === 0, issues };
}

// ─── Déduplication ───────────────────────────────────────────────────────────

export function findDuplicateTools(): Array<{ toolName: string; overlapsWith: string[] }> {
  const tools = getAllTools();
  const duplicates: Array<{ toolName: string; overlapsWith: string[] }> = [];

  for (let i = 0; i < tools.length; i++) {
    const overlaps: string[] = [];
    for (let j = 0; j < tools.length; j++) {
      if (i === j) continue;
      if (
        tools[i].name !== tools[j].name &&
        (tools[i].name.includes(tools[j].name) ||
          tools[j].name.includes(tools[i].name) ||
          (tools[i].aliases?.includes(tools[j].name) ?? false))
      ) {
        overlaps.push(tools[j].name);
      }
    }
    if (overlaps.length > 0) {
      duplicates.push({ toolName: tools[i].name, overlapsWith: overlaps });
    }
  }

  return duplicates;
}
