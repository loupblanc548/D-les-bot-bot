/**
 * toolRegistry.ts — Registre générique d'outils pour LLM (function calling)
 *
 * Permet d'enregistrer des outils réutilisables par Gemini/OpenAI
 * avec description JSON pour le function calling.
 */

import logger from "../utils/logger.js";

export interface ToolParameter {
  type: "string" | "number" | "boolean" | "array" | "object";
  description: string;
  enum?: string[];
  required?: boolean;
  items?: ToolParameter;
  properties?: Record<string, ToolParameter>;
}

export interface ToolDefinition {
  name: string;
  description: string;
  parameters: Record<string, ToolParameter>;
  handler: (args: Record<string, any>) => Promise<any>;
}

type ToolRegistry = Map<string, ToolDefinition>;

const registry: ToolRegistry = new Map();

export function registerTool(tool: ToolDefinition): void {
  registry.set(tool.name, tool);
  logger.debug(`[ToolRegistry] Registered tool "${tool.name}"`);
}

export function getTool(name: string): ToolDefinition | null {
  return registry.get(name) ?? null;
}

export function listTools(): string[] {
  return Array.from(registry.keys());
}

/** Retourne les définitions au format JSON pour Gemini/OpenAI function calling */
export function getToolSchemas(): Array<{
  name: string;
  description: string;
  parameters: Record<string, ToolParameter>;
}> {
  return Array.from(registry.values()).map((t) => ({
    name: t.name,
    description: t.description,
    parameters: t.parameters,
  }));
}

/** Exécute un outil enregistré par son nom */
export async function executeTool(
  name: string,
  args: Record<string, any>,
): Promise<any> {
  const tool = registry.get(name);
  if (!tool) {
    throw new Error(`Tool "${name}" not found in registry`);
  }
  return tool.handler(args);
}
