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

/**
 * Minimal env so that importing `src/config.ts` (which validates the
 * environment eagerly at module load) does not throw. Without these, every
 * suite that transitively imports config.ts fails at collection time with
 * "Environment variable validation failed" instead of running.
 *
 * Only filled in when absent, so a real .env still wins locally.
 */
const TEST_ENV_DEFAULTS: Record<string, string> = {
  NODE_ENV: "test",
  DISCORD_TOKEN: "test-discord-token",
  DISCORD_CLIENT_ID: "000000000000000000",
  DISCORD_GUILD_ID: "000000000000000001",
  OWNER_ID: "000000000000000002",
  DATABASE_URL: "postgresql://test:test@localhost:5432/test",
};

for (const [key, value] of Object.entries(TEST_ENV_DEFAULTS)) {
  process.env[key] ??= value;
}

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
