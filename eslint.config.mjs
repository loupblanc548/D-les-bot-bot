import eslint from "@eslint/js";
import tseslint from "typescript-eslint";

export default tseslint.config(
  eslint.configs.recommended,
  ...tseslint.configs.recommended,
  {
    languageOptions: {
      ecmaVersion: 2022,
      sourceType: "module",
      parserOptions: {
        project: "./tsconfig.json",
      },
    },
    rules: {
      "@typescript-eslint/no-explicit-any": "off",
      "@typescript-eslint/no-unused-vars": [
        "warn",
        {
          argsIgnorePattern: "^_",
          varsIgnorePattern: "^_",
          caughtErrorsIgnorePattern: "^_",
          destructuredArrayIgnorePattern: "^_",
        },
      ],
      "no-console": "off",
      // Intentional silence (e.g. graceful per-field scraper fallbacks) is allowed.
      "no-empty": ["error", { allowEmptyCatch: true }],
      // Cosmetic / zero-impact rules — keep as warnings so devs see them but don't fail builds.
      "no-useless-escape": "warn",
      "no-irregular-whitespace": "warn",
      "no-useless-assignment": "warn",
    },
  },
  {
    // Files kept outside the type-aware parser (JS-only / not in tsconfig include).
    ignores: [
      "dist",
      "node_modules",
      "src/imageExtractor.js",
      "src/imageExtractor.d.ts",
      "src/managers/_fix_scraper.js",
      "src/rawgClient.js",
      "src/rawgClient.d.ts",
      "src/rssTwitterTracker.js",
      "src/undici-patch.cjs",
      "src/dashboard/frontend/**",
      "scripts/migrate-cache-to-neon.ts",
      "vitest.config.ts",
      "batch-scripts.test.ts",
    ],
  },
);
