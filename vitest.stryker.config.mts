import { defineConfig, mergeConfig } from "vitest/config";
// «.mjs», а не «.mts» — як у vitest.coverage.config.mts (інакше npm run typecheck і next build падають на TS5097).
import base from "./vitest.config.mjs";

// Stryker мутує лише TS (джерело — матеріали WS8 курсу). Тести бази (tests/db: PGlite зі всіма міграціями, секунди на
// файл) і тести скриптів сюди не потрапляють: правила в SQL/RLS перевіряє npm run mutation:sql (scripts/mutation-check.mjs).
export default mergeConfig(base, defineConfig({ test: { exclude: ["tests/db/**", "tests/scripts/**"] } }));
