import { defineConfig, mergeConfig } from "vitest/config";
// «.mjs», а не «.mts»: без allowImportingTsExtensions TypeScript (npm run typecheck, next build) не приймає імпорт
// з розширенням .mts, а «./vitest.config.mjs» і TypeScript, і Vite зводять до vitest.config.mts.
import base from "./vitest.config.mjs";

// Покриття для npm run test:coverage (джерело — матеріали WS8 курсу, materials/gates). npm test не змінюється.
//
// Підлога покриття — ЛИШЕ для доменних файлів, які її вже тримають (кожен файл окремо, perFile): шлях від src/lib/
// без «.ts». Файл, що поки нижче, видно в Summary — додайте його сюди, коли тести його піднімуть (храповик: підлогу
// не знижуємо). Адаптери src/lib/supabase/** — поза підлогою: їх доводять тести бази (PGlite) та e2e.
// Загальний відсоток (≈34 %) не поріг: сторінки й server actions доводять тести бази (PGlite) та e2e, а не Vitest.
const FLOORED: string[] = [
  "leave/balance",
  "leave/calendar",
  "leave/calendar-grid",
  "leave/closure-dates",
  "leave/decision",
  "leave/draft",
  "leave/overview",
  "leave/request",
  "leave/time",
  "date-picker",
  "dot-month",
  "health",
  "motion",
  "preferences",
  "particle-field",
  "utils",
  "welcome/playground",
];
// Фігурні дужки glob розкриваються лише з комою всередині, тож один файл пишемо без них.
const FLOORED_GLOB = FLOORED.length === 1 ? `src/lib/${FLOORED[0]}.ts` : `src/lib/{${FLOORED.join(",")}}.ts`;

// Чиста логіка поза src/lib, яку тримають unit-тести на 100 % (рев'ю WS8: інакше їхні тести можна непомітно
// послабити): відмова 42501 → «not shown» (AC-BALANCE-13), стан дня календаря заявки (AC-LEAVE-06, AC-CAL-03),
// доступ до сторінки зміни календаря (AC-CAL-12). Тека (app) — через «*»: дужки в glob — група, а не символи.
const FLOORED_APP = [
  "balances/load-balances",
  "requests/new/calendar-view",
  "calendar/manage/access",
];
const FLOORED_APP_GLOB = `src/app/*/{${FLOORED_APP.join(",")}}.ts`;
const FLOOR = { statements: 90, branches: 85, functions: 90, lines: 90, perFile: true };

export default mergeConfig(
  base,
  defineConfig({
    test: {
      coverage: {
        provider: "v8",
        // Без include звіт показав би лише імпортовані тестами файли — сторінки з 0 % зникли б.
        include: ["src/**/*.{ts,tsx}"],
        // Згенеровані типи й компоненти дизайн-системи (якщо є shadcn/ui) — не ваш код під тестами.
        exclude: ["src/lib/supabase/database.types.ts", "src/components/ui/**"],
        // html — для людей (coverage/index.html), json-summary — для npm run coverage:summary, json — для інших інструментів.
        reporter: ["text", "html", "json-summary", "json"],
        reportOnFailure: true,
        thresholds: {
          ...(FLOORED.length ? { [FLOORED_GLOB]: FLOOR } : {}),
          [FLOORED_APP_GLOB]: FLOOR,
        },
      },
    },
  }),
);
