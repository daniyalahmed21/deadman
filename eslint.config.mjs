// @ts-check
import js from "@eslint/js";
import tseslint from "typescript-eslint";
import globals from "globals";

export default tseslint.config(
  {
    ignores: [
      "**/dist/**",
      "**/node_modules/**",
      "book/**",
      "knowledge-base/**",
      "spike-mcp/**",
      "apps/cockpit/public/**",
      "**/*.config.{js,mjs,ts,mts}",
    ],
  },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    files: ["**/*.{ts,tsx}"],
    rules: {
      // Hard errors: these gate CI. The codebase already satisfies them.
      "@typescript-eslint/no-explicit-any": "error",
      "@typescript-eslint/no-unused-vars": ["error", { argsIgnorePattern: "^_", varsIgnorePattern: "^_" }],
      // Signals: warn so they surface in review without blocking, until decomposed.
      complexity: ["warn", 15],
      "max-depth": ["warn", 4],
      "max-lines": ["warn", { max: 500, skipBlankLines: true, skipComments: true }],
      "max-lines-per-function": ["warn", { max: 130, skipBlankLines: true, skipComments: true }],
    },
  },
  // Node dev scripts (plain JS): give them the Node globals.
  {
    files: ["**/*.{js,mjs,cjs}"],
    languageOptions: { globals: { ...globals.node } },
  },
  // The kind backend marshals untyped `kubectl -o json` output; `any` is the honest type here.
  {
    files: ["packages/engine/src/backends/kind.ts"],
    rules: { "@typescript-eslint/no-explicit-any": "off" },
  },
);
