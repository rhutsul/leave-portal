// E2E і UAT — одна специфікація Playwright (tests/e2e/*.spec.ts), дві цілі:
//   UAT_BASE_URL задано  → розгорнутий застосунок (ваш прод), npm run uat: запис → кадри «Тоді» → вердикт агента → звіт;
//   UAT_BASE_URL немає   → локальна збірка (webServer: npm run build && npm run start).
// Запис увімкнено для КОЖНОГО тесту, не лише для впалих: для PM зелений прогін — такий самий доказ, як червоний.
import { existsSync } from "node:fs";
import { defineConfig, devices } from "@playwright/test";

// Локально — значення з .env.local (DEMO_USER_PASSWORD). Файл не друкуємо й не комітимо.
if (existsSync(".env.local")) process.loadEnvFile(".env.local");

// Один ідентифікатор прогону на всі проєкти й воркери: синтетичні адреси uat-<run>…@example.test.
process.env.UAT_RUN ??= new Date().toISOString().replace(/\D/g, "").slice(2, 14);

const deployed = process.env.UAT_BASE_URL?.replace(/\/+$/, "");
const baseURL = deployed ?? "http://localhost:3000";
// Негативні контролі (навмисно хибні очікування) — лише на окреме прохання: UAT_NEGATIVE_CONTROLS=1.
const withNegativeControls = process.env.UAT_NEGATIVE_CONTROLS === "1";
// Тести з тегом @writes створюють записи: лише в CI на одноразовому Supabase (e2e.yml). На проді (UAT_BASE_URL) і
// локально (.env.local вказує на спільну базу) їх не вибираємо (а не пропускаємо), тож skipped лишається 0.
const withWrites = !deployed && !!process.env.CI;
// @prod-writes — тести шкільного календаря, що пишуть, але самі створюють дані «Дано» й прибирають за собою
// секретним ключем (tests/e2e/support/admin.ts, teardown cleanup). Їх беремо скрізь, де є ключ: на проді з
// .env.local розробника і в CI на одноразовому Supabase. Без ключа — не вибираємо.
const withAdminKey = Boolean(process.env.NEXT_PUBLIC_SUPABASE_URL && process.env.SUPABASE_SECRET_KEY);
// Знімки сторінок для docs/img/ (calendar-screenshots.spec.ts) — лише на прохання: UAT_SCREENSHOTS=1.
const withScreenshots = process.env.UAT_SCREENSHOTS === "1";
const excluded = [
  "@negative-control",
  ...(withWrites ? [] : ["@writes"]),
  ...(withAdminKey ? [] : ["@prod-writes"]),
  ...(withScreenshots ? [] : ["@screenshots"]),
];
const grepInvert = new RegExp(excluded.join("|"));
const noRecording = { video: "off", trace: "off", screenshot: "off" } as const;

export default defineConfig({
  testDir: "tests/e2e",
  testMatch: "**/*.spec.ts",
  outputDir: "test-results/artifacts",
  forbidOnly: !!process.env.CI,
  // Повтор на розгорнутому застосунку може вдруге створити дані, а доказом має бути перша спроба.
  retries: 0,
  // По одному сценарію: читабельні відео, без гонок за спільні акаунти.
  workers: 1,
  timeout: 60_000,
  reporter: [
    ["list"],
    ["html", { outputFolder: "test-results/html", open: "never" }],
    ["json", { outputFile: "test-results/results.json" }],
  ],
  use: {
    ...devices["Desktop Chrome"],
    baseURL,
    locale: "uk-UA",
    timezoneId: "Europe/Kyiv",
    viewport: { width: 1280, height: 800 },
    video: {
      mode: "on",
      size: { width: 1280, height: 800 },
      // У відео видно назву тесту (AC ID) і поточний крок «Тоді: …». Перед кадром-доказом ці накладки ховаємо
      // (tests/e2e/support/uat.ts): інакше на кадрі «видно» текст, якого застосунок не показував.
      show: { actions: { position: "top-right" }, test: { level: "step", position: "top-left" } },
    },
    trace: { mode: "on", snapshots: { dom: true, aria: true, screen: true } },
    screenshot: "on",
  },
  projects: [
    // Вхід ролей один раз → playwright/.auth/<role>.json (у .gitignore). Без запису: тут вводиться пароль.
    // Прибирання після прогону (cleanup.teardown.ts) — лише з ключем: тести @prod-writes шкільного календаря
    // створюють закриття й записи на проді й прибирають їх за id; teardown перевіряє, що нічого не лишилось.
    {
      name: "setup",
      testMatch: /auth\.setup\.ts$/,
      use: noRecording,
      ...(withAdminKey ? { teardown: "cleanup" } : {}),
    },
    { name: "cleanup", testMatch: /cleanup\.teardown\.ts$/, use: noRecording },
    {
      name: "chromium",
      dependencies: ["setup"],
      testIgnore: /\.mobile\.spec\.ts$/,
      grepInvert,
    },
    // Телефон (ADR 0008): ті самі акаунти, емуляція Pixel 7 (Chromium, дотик) — лише для *.mobile.spec.ts.
    {
      name: "mobile",
      dependencies: ["setup"],
      testMatch: /\.mobile\.spec\.ts$/,
      use: { ...devices["Pixel 7"] },
      grepInvert,
    },
    ...(withNegativeControls
      ? [{ name: "negative-controls", dependencies: ["setup"], grep: /@negative-control/ }]
      : []),
  ],
  webServer: deployed
    ? undefined
    : {
        // У CI (e2e.yml) застосунок уже зібрано окремим кроком — лише запускаємо.
        command: process.env.CI ? "npm run start" : "npm run build && npm run start",
        url: "http://localhost:3000/login",
        reuseExistingServer: !process.env.CI,
        timeout: 300_000,
      },
});
