import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    globals: true,
    environment: "node",
    include: ["src/**/*.test.ts", "./*.test.ts"],
    exclude: ["node_modules", "dist"],
    coverage: {
      provider: "v8",
      reporter: ["text", "json-summary", "lcov"],
      include: ["src/**/*.ts"],
      exclude: [
        "src/**/*.test.ts",
        "src/**/*.spec.ts",
        "src/**/*.d.ts",
        "node_modules",
        "dist",
      ],
      thresholds: {
        lines: 40,
        functions: 0,
        branches: 30,
        statements: 0,
      },
    },
    
    testTimeout: 30000,
    hookTimeout: 30000,
    forceExit: true,
  },
});
