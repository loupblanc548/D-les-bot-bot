/**
 * agentLoop.test.ts — Tests pour la boucle de réflexion de l'Agent IA
 */
import { describe, it, expect, vi, beforeEach } from "vitest";

// Mocks massifs — agentLoop a ~30 dépendances
vi.mock("../config.js", () => ({
  config: {
    openRouterApiKey: "test-key",
    openRouterModel: "test-model",
    openRouterBaseUrl: "https://test.example.com/v1",
    aiSystemPrompt: "You are a test bot.",
    maxAgentIterations: 3,
  },
}));

vi.mock("../utils/logger.js", () => ({
  default: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
}));

vi.mock("../prisma.js", () => ({
  default: {
    userMemory: { create: vi.fn().mockResolvedValue({}), findMany: vi.fn().mockResolvedValue([]) },
    guildConfig: { findUnique: vi.fn().mockResolvedValue(null) },
  },
}));

vi.mock("./ai.js", () => ({ getOpenAIClient: vi.fn(() => ({})) }));
vi.mock("./groq.js", () => ({ getGroqClient: vi.fn(() => ({})), isGroqAvailable: () => false }));
vi.mock("./modelRotation.js", () => ({
  markModelFailure: vi.fn(),
  markModelSuccess: vi.fn(),
  recordModelLatency: vi.fn(),
  isModelAvailable: vi.fn(() => true),
  claimModel: vi.fn(() => true),
  releaseModel: vi.fn(),
  getAllAvailableModels: vi.fn(() => ["test-model"]),
  ensureAtLeastOneModelAvailable: vi.fn(),
}));
vi.mock("./nvidiaNim.js", () => ({
  getNvidiaNimClient: vi.fn(() => ({})),
  isNvidiaNimAvailable: () => false,
  isNvidiaModel: () => false,
  resolveNvidiaModel: (requested?: string) => requested || "test-model",
  nvidiaModelSupportsTools: () => true,
  NVIDIA_DEFAULT_MODEL: "test-model",
  NVIDIA_TOOLS_MODEL: "test-model",
}));
vi.mock("./omniroute.js", () => ({
  getOmnirouteClient: vi.fn(() => ({})),
  isOmnirouteAvailable: () => false,
  isOmnirouteModel: () => false,
}));
vi.mock("./cerebras.js", () => ({
  getCerebrasClient: vi.fn(() => ({})),
  isCerebrasAvailable: () => false,
  getCerebrasModel: vi.fn(),
}));
vi.mock("./sambanova.js", () => ({
  getSambaNovaClient: vi.fn(() => ({})),
  isSambaNovaAvailable: () => false,
  getSambaNovaModel: vi.fn(),
}));
vi.mock("../utils/promptSanitizer.js", () => ({
  sanitizeForLlm: vi.fn((s: string) => s),
  wrapUntrustedToolContent: vi.fn((s: string) => s),
}));
vi.mock("./taskModelRouter.js", () => ({
  classifyTaskComplexity: vi.fn(() => "simple"),
  getModelChainForTask: vi.fn(() => ["test-model"]),
}));
vi.mock("./agentTools.js", () => ({
  ALL_AGENT_TOOLS: [],
  executeTool: vi.fn().mockResolvedValue({ success: true, data: "ok" }),
  generateToolListPrompt: vi.fn(() => "Tools: none"),
}));
vi.mock("./orchestrator.js", () => ({
  delegateToExpert: vi.fn().mockResolvedValue("expert result"),
  DELEGATE_TOOL: {
    type: "function",
    function: { name: "delegate_to_expert", description: "delegate", parameters: {} },
  },
}));
vi.mock("./circuitBreaker.js", () => ({
  beginInteraction: vi.fn(),
  recordLoop: vi.fn(),
  completeInteraction: vi.fn(),
  tripBreaker: vi.fn(() => false),
  createTrippedEmbed: vi.fn(() => ({})),
}));
vi.mock("./agentPlanner.js", () => ({
  generatePlan: vi.fn().mockResolvedValue(null),
  formatPlanForPrompt: vi.fn(() => ""),
  detectAmbiguity: vi.fn(() => null),
}));
vi.mock("./agentMemory.js", () => ({
  storeMemory: vi.fn(),
  formatMemoriesForPrompt: vi.fn(() => ""),
  persistMemoryToDb: vi.fn(),
}));
vi.mock("./agentReflector.js", () => ({
  reflectOnToolResult: vi.fn(),
  resetRetries: vi.fn(),
  reflectOnStasis: vi.fn(),
}));
vi.mock("./cognitiveLoopEngine.js", () => ({
  initSession: vi.fn(),
  purgeSession: vi.fn(),
  checkCognitiveStasis: vi.fn(() => false),
}));
vi.mock("./agentToolRouter.js", () => ({
  routeTools: vi.fn((tools: unknown[]) => tools),
  getToolHints: vi.fn(() => ""),
  suggestToolChain: vi.fn(() => []),
  getApiKeyStatusLine: vi.fn(() => ""),
  isPrivateChannel: vi.fn(() => false),
}));
vi.mock("./agentSoarGate.js", () => ({
  isRestrictedTool: vi.fn(() => false),
  requestToolApproval: vi.fn(),
}));
vi.mock("./toolRiskRegistry.js", () => ({
  isLowRisk: vi.fn(() => true),
  getRiskLevel: vi.fn(() => "low"),
}));
vi.mock("./proactiveAgent.js", () => ({ getFeedbackHints: vi.fn(() => "") }));
vi.mock("./modelRouter.js", () => ({ getAgentLoopModel: vi.fn(() => "test-model") }));
vi.mock("./customInstructions.js", () => ({ getCustomInstructions: vi.fn(() => "") }));
vi.mock("./gemini.js", () => ({
  summarizeWithGemini: vi.fn().mockResolvedValue(""),
  chatWithGemini: vi.fn().mockResolvedValue(""),
  isGeminiAvailable: () => false,
}));
vi.mock("./localLlm.js", () => ({
  isLocalLlmAvailable: () => false,
  isLocalLlmVisionAvailable: () => false,
  getLocalLlmVisionModelName: vi.fn(() => ""),
}));

describe("agentLoop", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe("extractAndSaveMemory", () => {
    it("should be a function", { timeout: 120_000 }, async () => {
      const { extractAndSaveMemory } = await import("./agentLoop.js");
      expect(typeof extractAndSaveMemory).toBe("function");
    });

    it("should not throw on valid inputs", { timeout: 120_000 }, async () => {
      const { extractAndSaveMemory } = await import("./agentLoop.js");
      await expect(extractAndSaveMemory("user123", "Bonjour", "Salut !")).resolves.toBeUndefined();
    });
  });

  describe("runAgentLoop", () => {
    it("should be a function", { timeout: 120_000 }, async () => {
      const { runAgentLoop } = await import("./agentLoop.js");
      expect(typeof runAgentLoop).toBe("function");
    });
  });
});
