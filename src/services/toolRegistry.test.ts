import { describe, it, expect } from "vitest";
import { registerTool, getTool, listTools, executeTool, getToolSchemas } from "./toolRegistry.js";

describe("toolRegistry", () => {
  it("registers and retrieves a tool", () => {
    registerTool({
      name: "test_tool",
      description: "A test tool",
      parameters: { input: { type: "string", description: "test input", required: true } },
      handler: async (args) => `result: ${args.input}`,
    });

    const tool = getTool("test_tool");
    expect(tool).not.toBeNull();
    expect(tool!.name).toBe("test_tool");
  });

  it("lists registered tools", () => {
    const tools = listTools();
    expect(tools).toContain("test_tool");
  });

  it("executes a tool", async () => {
    registerTool({
      name: "echo",
      description: "Echo tool",
      parameters: { msg: { type: "string", description: "message", required: true } },
      handler: async (args) => args.msg,
    });

    const result = await executeTool("echo", { msg: "hello" });
    expect(result).toBe("hello");
  });

  it("throws on unknown tool", async () => {
    await expect(executeTool("nonexistent", {})).rejects.toThrow("not found");
  });

  it("getToolSchemas returns JSON definitions", () => {
    const schemas = getToolSchemas();
    expect(schemas.length).toBeGreaterThan(0);
    expect(schemas[0]).toHaveProperty("name");
    expect(schemas[0]).toHaveProperty("description");
    expect(schemas[0]).toHaveProperty("parameters");
  });
});
