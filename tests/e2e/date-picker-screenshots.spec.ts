// Знімки DatePicker і меню без «New request» для docs/img/ (ADR 0008, DESIGN.md розділи 5 і 12): 390 і 1280 px,
// світла й темна тема. Не AC і не UAT — без AC ID; вибирається лише на прохання: UAT_SCREENSHOTS=1
// (playwright.config.ts), напр. UAT_SCREENSHOTS=1 npx playwright test date-picker-screenshots --project chromium.
// Нічого не пише: форму «Add closure» не надсилаємо, тож тегу @prod-writes немає.
import { expect, test, type Page } from "@playwright/test";
import { clickDate } from "./support/calendar";

/** Вужче за lg меню — у Sheet з кнопки в шапці: відкриваємо, щоб на знімку був список пунктів. */
async function openMenuOnNarrow(page: Page, width: number) {
  if (width >= 1024) return;
  await page.getByRole("button", { name: "Open menu" }).click();
  await expect(page.getByRole("dialog", { name: "Menu" })).toBeVisible();
}

const SIZES = [
  { name: "390", width: 390, height: 844 },
  { name: "1280", width: 1280, height: 800 },
] as const;
const THEMES = ["light", "dark"] as const;

test.describe("date picker screenshots", { tag: ["@screenshots"] }, () => {
  for (const theme of THEMES) {
    for (const size of SIZES) {
      test(`date picker and menu at ${size.name} px, ${theme}`, async ({ browser, baseURL }) => {
        const open = async (role: string, path: string, heading: string) => {
          const context = await browser.newContext({
            storageState: `playwright/.auth/${role}.json`,
            viewport: { width: size.width, height: size.height },
            colorScheme: theme,
            reducedMotion: "reduce",
            hasTouch: size.width < 768,
          });
          await context.addCookies([{ name: "theme", value: theme, url: baseURL! }]);
          const page = await context.newPage();
          await page.goto(path);
          await expect(page).toHaveURL(new URL(path, baseURL).toString());
          await expect(page.getByRole("heading", { level: 1, name: heading, exact: true })).toBeVisible();
          return { page, close: () => context.close() };
        };
        const file = (name: string) => `docs/img/ws9-${name}-${size.name}-${theme}.png`;

        // «Add closure»: готовий діапазон у полі (уся сторінка), далі — відкритий календар із незавершеним діапазоном.
        {
          const { page, close } = await open("admin", "/calendar/manage", "Add closure");
          await page.getByLabel("Name").fill("Spring break");
          await clickDate(page, "2027-03-22");
          await clickDate(page, "2027-03-26");
          await expect(page.getByTestId("date-field")).toContainText("5 days");
          await page.screenshot({ path: file("closure-picker-range"), fullPage: true });
          // Знову відкрито: новий початок 15 березня і попередній перегляд до дня під курсором.
          await clickDate(page, "2027-03-15");
          await page.getByRole("grid").getByRole("button", { name: /^Thu, 18 Mar 2027/ }).hover();
          await page.screenshot({ path: file("closure-picker-pending") });
          await close();
        }

        // Вітрина /design: три режими.
        {
          const { page, close } = await open("teacher1", "/design", "Design system");
          const section = page.locator("section").filter({ has: page.getByRole("heading", { level: 2, name: "Date picker" }) });
          await section.scrollIntoViewIfNeeded();
          await section.screenshot({ path: file("design-date-picker") });
          await close();
        }

        // Меню на сторінці «New request»: пункту немає, підсвічено «My requests».
        {
          const { page, close } = await open("teacher1", "/requests/new", "New request");
          await openMenuOnNarrow(page, size.width);
          await page.screenshot({ path: file("new-request-menu") });
          await close();
        }
      });
    }
  }
});
