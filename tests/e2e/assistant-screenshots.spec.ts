// Знімки панелі помічника календаря для docs/img/ (DESIGN.md розділ 12, design.md D1 impl-calendar-assistant): 390 і
// 1280 px, світла й темна тема. Не AC і не UAT — без AC ID; вибирається лише на прохання: UAT_SCREENSHOTS=1, напр.
//   UAT_SCREENSHOTS=1 npx playwright test assistant-screenshots --project chromium     (з .env.local і ключем моделі)
// На кожну ширину — ОДИН справжній запит до моделі (безкоштовний ліміт): тема перемикається атрибутом data-theme без
// перезавантаження, тож пропозиції лишаються. Нічого не зберігає: «Save closures» не натискаємо.
import { expect, test, type Page } from "@playwright/test";

const SIZES = [
  { name: "390", width: 390, height: 844 },
  { name: "1280", width: 1280, height: 800 },
] as const;
const TEXT = "Winter break 28.12–08.01. Teachers' meeting on 20 November, school closes at 12:00.";

async function both(page: Page, file: string) {
  for (const theme of ["light", "dark"] as const) {
    await page.evaluate((t) => document.documentElement.setAttribute("data-theme", t), theme);
    await page.screenshot({ path: `docs/img/ws10-${file}-${theme}.png` });
  }
}

test.describe("calendar assistant screenshots", { tag: ["@screenshots"] }, () => {
  for (const size of SIZES) {
    test(`assistant panel at ${size.name} px`, async ({ browser }) => {
      const context = await browser.newContext({
        storageState: "playwright/.auth/admin.json",
        viewport: { width: size.width, height: size.height },
        reducedMotion: "reduce",
      });
      const page = await context.newPage();
      await page.goto("/calendar?year=2026");
      await page.getByRole("link", { name: "Add from text" }).click();
      await expect(page).toHaveURL(/assistant=1/);
      const panel = page.getByRole("dialog", { name: "Calendar assistant" });
      await expect(panel).toBeVisible();
      await both(page, `assistant-empty-${size.name}`);

      await panel.getByLabel("Paste the text of the school calendar").fill(TEXT);
      // Набраний текст: Esc не закриває панель (щоб не загубити його).
      await page.keyboard.press("Escape");
      await expect(panel).toBeVisible();

      await panel.getByRole("button", { name: "Suggest closures" }).click();
      await expect(panel.getByRole("heading", { name: /suggested closures?/ })).toBeVisible({ timeout: 45_000 });
      await both(page, `assistant-suggestions-${size.name}`);
      await panel.getByRole("button", { name: "Save closures" }).scrollIntoViewIfNeeded();
      await both(page, `assistant-save-bar-${size.name}`);

      // Хрестик (телефон — «Back to calendar») закриває завжди, і пропозиції зникають із сітки.
      await panel.getByRole("button", { name: size.width < 768 ? "Back to calendar" : "Close" }).click();
      await expect(panel).toBeHidden();
      await expect(page).toHaveURL(/\/calendar\?year=2026$/);
      await context.close();
    });
  }

  test("assistant panel for an employee", async ({ browser }) => {
    const context = await browser.newContext({ storageState: "playwright/.auth/teacher1.json", reducedMotion: "reduce" });
    const page = await context.newPage();
    await page.goto("/calendar/assistant");
    await expect(page).toHaveURL(/\/calendar\?assistant=1$/);
    await expect(page.getByRole("dialog", { name: "Calendar assistant" })).toContainText(
      "Only an administrator can change the school calendar",
    );
    await both(page, "assistant-denied-1280");
    await context.close();
  });
});
