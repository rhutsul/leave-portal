import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";
import playwright from "eslint-plugin-playwright";

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  // WS8 · E2E/UAT (Playwright) — лише tests/e2e/**. Правила recommended закривають те, чого Playwright не має сам:
  // тест без перевірки (expect-expect), пропущений чи сфокусований тест, waitForTimeout і networkidle.
  // lint іде з --max-warnings 0, тож і «warn» тут — червоний app.
  {
    ...playwright.configs["flat/recommended"],
    files: ["tests/e2e/**"],
    rules: {
      ...playwright.configs["flat/recommended"].rules,
      // Перевірки AC живуть у thenStep(…) (tests/e2e/support/uat.ts): він і є expect для цього правила.
      "playwright/expect-expect": ["error", { assertFunctionNames: ["thenStep"] }],
    },
  },
  // Override default ignores of eslint-config-next.
  globalIgnores([
    // Default ignores of eslint-config-next:
    ".next/**",
    "out/**",
    "build/**",
    "next-env.d.ts",
    // Дані для тестів скриптів (навмисно «зламані» файли).
    "tests/fixtures/**",
    // WS8 · Звіти, відео й траси Playwright і сесії тестових ролей (ESLint не читає .gitignore).
    "test-results/**",
    "playwright-report/**",
    "blob-report/**",
    "playwright/.auth/**",
  ]),
]);

export default eslintConfig;
