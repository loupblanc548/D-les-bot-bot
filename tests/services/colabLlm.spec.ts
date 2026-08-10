import { describe, it, expect, vi, beforeEach } from "vitest";

// Mock fs
vi.mock("fs", () => ({
  default: {
    readFileSync: vi.fn(),
    writeFileSync: vi.fn(),
  },
}));

// Mock OpenAI
vi.mock("openai", () => ({
  default: vi.fn().mockImplementation(() => ({
    chat: {
      completions: {
        create: vi.fn().mockResolvedValue({
          choices: [{ message: { content: "Hello from Colab!" } }],
        }),
      },
    },
  })),
}));

// Mock httpClient
vi.mock("../../src/utils/httpClient.js", () => ({
  fetchWithRetry: vi.fn().mockResolvedValue({
    models: [{ name: "qwen2.5:7b" }],
  }),
  createCircuitBreaker: vi.fn((fn: any) => ({
    fire: (...args: any[]) => fn(...args),
    status: () => ({ state: "CLOSED", failures: 0, openUntil: 0 }),
    forceOpen: vi.fn(),
    forceClose: vi.fn(),
  })),
}));

describe("colabLlm", () => {
  beforeEach(() => {
    vi.resetModules();
    process.env.LLM_DYNAMIC_URL = "true";
    process.env.LLM_DYNAMIC_URL_FILE = "/tmp/test_colab_url.txt";
    process.env.LOCAL_LLM_MODEL = "qwen2.5:7b";
  });

  it("reads URL from file and pings successfully", async () => {
    const fs = (await import("fs")).default;
    vi.mocked(fs.readFileSync).mockReturnValue("https://abc123.ngrok.io");

    const { updateColabUrl, isColabLlmAvailable } = await import("../../src/services/colabLlm.js");
    const result = await updateColabUrl();
    expect(result).toBe(true);
    expect(isColabLlmAvailable()).toBe(true);
  });

  it("returns false when URL file is empty", async () => {
    const fs = (await import("fs")).default;
    vi.mocked(fs.readFileSync).mockReturnValue("");

    const { updateColabUrl, isColabLlmAvailable } = await import("../../src/services/colabLlm.js");
    const result = await updateColabUrl();
    expect(result).toBe(false);
    expect(isColabLlmAvailable()).toBe(false);
  });

  it("writes URL to file via setColabUrl", async () => {
    const fs = (await import("fs")).default;
    vi.mocked(fs.writeFileSync).mockImplementation(() => {});
    vi.mocked(fs.readFileSync).mockReturnValue("https://new-url.ngrok.io");

    const { setColabUrl } = await import("../../src/services/colabLlm.js");
    await setColabUrl("https://new-url.ngrok.io");
    expect(fs.writeFileSync).toHaveBeenCalledWith(
      "/tmp/test_colab_url.txt",
      "https://new-url.ngrok.io",
      "utf-8",
    );
  });

  it("chatWithColabLlm returns response when available", async () => {
    const fs = (await import("fs")).default;
    vi.mocked(fs.readFileSync).mockReturnValue("https://abc123.ngrok.io");

    const { updateColabUrl, chatWithColabLlm } = await import("../../src/services/colabLlm.js");
    await updateColabUrl();
    const result = await chatWithColabLlm([{ role: "user", content: "Hello" }]);
    expect(result).toBe("Hello from Colab!");
  });
});
