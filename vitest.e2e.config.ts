import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    globals: true,
    environment: "node",
    include: ["src/**/*.integration.test.ts", "src/**/*.e2e.test.ts"],
    exclude: ["node_modules", "dist"],
    setupFiles: ["./src/test/setup.ts"],
    testTimeout: 60000,
    hookTimeout: 30000,
    forceExit: true,
  },
});
