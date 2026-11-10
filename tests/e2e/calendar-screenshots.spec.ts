// Знімки сторінок шкільного календаря для docs/img/ (ADR 0008, DESIGN.md розділ 12): 390 і 1280 px, світла й темна
// тема. Не AC і не UAT — без AC ID; вибирається лише на прохання: UAT_SCREENSHOTS=1 (playwright.config.ts), напр.
//   UAT_SCREENSHOTS=1 npx playwright test calendar-screenshots --project chromium     (з .env.local і ключем)
// Закриття для знімків створює й прибирає той самий помічник, що й UAT (@prod-writes).
import { expect, test, type Page } from "@playwright/test";
import { addClosure, assertCalendarClean, cleanupRemembered } from "./support/admin";
import { clickDate, showMonth } from "./support/calendar";

const SIZES = [
  { name: "390", width: 390, height: 844 },
  { name: "1280", width: 1280, height: 800 },
] as const;
const THEMES = ["light", "dark"] as const;

test.describe("school calendar screenshots", { tag: ["@screenshots", "@prod-writes"] }, () => {
  test.beforeAll(async () => {
    await assertCalendarClean();
    await addClosure("Winter break", "2026-12-28", "2027-01-08");
    await addClosure("Teachers' meeting", "2026-11-20", "2026-11-20", 12 * 60);
  });

  // addClosure запам'ятовує id створеного; прибираємо лише їх (afterAll виконується і після помилки в beforeAll).
  test.afterAll(async () => {
    await cleanupRemembered();
  });

  for (const theme of THEMES) {
    for (const size of SIZES) {
      test(`calendar pages at ${size.name} px, ${theme}`, async ({ browser, baseURL }) => {
        const shot = async (
          role: string,
          path: string,
          heading: string,
          file: string,
          before: (p: Page) => Promise<void> = async () => {},
        ) => {
          const context = await browser.newContext({
            storageState: `playwright/.auth/${role}.json`,
            viewport: { width: size.width, height: size.height },
            colorScheme: theme,
            reducedMotion: "reduce",
          });
          await context.addCookies([{ name: "theme", value: theme, url: baseURL! }]);
          const page = await context.newPage();
          await page.goto(path);
          // Знімок — лише тієї сторінки, яку чекаємо (не входу, не відмови замість форми, не помилки).
          await expect(page).toHaveURL(new URL(path, baseURL).toString());
          await expect(page.getByRole("heading", { level: 1, name: heading, exact: true })).toBeVisible();
          await before(page);
          await page.screenshot({ path: `docs/img/ws9-${file}-${size.name}-${theme}.png`, fullPage: true });
          await context.close();
        };
        await shot("teacher1", "/calendar?year=2026", "School calendar", "calendar-teacher1");
        await shot("admin", "/calendar?year=2026", "School calendar", "calendar-admin");
        await shot("admin", "/calendar/manage", "Add closure", "calendar-manage-admin", async (page) => {
          // Перегляд «Your closure» з датами, що заходять на «Winter break»: видно і нові дні, і перетин.
          await page.getByLabel("Name").fill("Christmas week");
          await clickDate(page, "2026-12-21");
          await clickDate(page, "2026-12-29");
          await expect(page.getByRole("complementary", { name: "Your closure" })).toContainText(
            "These dates are already closed: Winter break",
          );
        });
        await shot("teacher1", "/calendar/manage", "Change the school calendar", "calendar-manage-refused-teacher1");
        await shot("teacher1", "/requests/new", "New request", "new-request-closed-day", async (page) => {
          await showMonth(page, 2026, 12);
          await page.getByRole("button", { name: /^Tue, 29 Dec 2026/ }).click();
          // Кадр лише тоді, коли закриття справді дійшли до форми: інакше 29 грудня просто вибралось би.
          await expect(page.getByRole("main").getByRole("alert")).toHaveText("The school is closed on this day: Winter break");
        });
      });
    }
  }
});
