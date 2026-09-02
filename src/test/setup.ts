/**
 * vitest setup shared test utilities.
 *
 * Registered through `setupFiles: ["./src/test/setup.ts"]` in
 * vitest.config.ts (see project root).
 *
 * Exposes `globalThis.__createMockLogger()` so test files can build a fresh
 * logger mock without reproducing the
 *   `vi.hoisted(() => ({ debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn() }))`
 * boilerplate inline. Each call returns a brand-new object with isolated
 * `vi.fn` spies, so `vi.clearAllMocks()` in `beforeEach` cleanly resets
 * state per test.
 *
 * Usage in a test file:
 *   const mockLogger = vi.hoisted(() => globalThis.__createMockLogger());
 *   vi.mock("../utils/logger", () => ({ default: mockLogger }));
 */
import { vi } from "vitest";

// Required env so tests can import `config` without a local .env
process.env.DISCORD_TOKEN ||= "test-discord-token";
process.env.DISCORD_CLIENT_ID ||= "123456789012345678";
process.env.DISCORD_GUILD_ID ||= "123456789012345678";
process.env.OWNER_ID ||= "123456789012345678";
process.env.DATABASE_URL ||=
  "postgresql://discord_bot:discord_bot@localhost:5432/discord_bot?schema=public";
process.env.NODE_ENV ||= "test";

type MockLogger = {
  debug: ReturnType<typeof vi.fn>;
  info: ReturnType<typeof vi.fn>;
  warn: ReturnType<typeof vi.fn>;
  error: ReturnType<typeof vi.fn>;
};

declare global {
  var __createMockLogger: () => MockLogger;
}

globalThis.__createMockLogger = (): MockLogger => ({
  debug: vi.fn(),
  info: vi.fn(),
  warn: vi.fn(),
  error: vi.fn(),
});
