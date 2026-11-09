// Шкільний календар на телефоні (ADR 0008, проєкт Playwright «mobile», Pixel 7) — розкладка за розробником, не AC PM:
// тому без AC ID і без тегу @uat. Поведінку за AC доводить tests/e2e/calendar.spec.ts (задача 3 impl-school-calendar).
import { expect, test, type Page } from "@playwright/test";
import { attachRuntimeErrors } from "./support/uat";

test.afterEach(async ({ page }) => attachRuntimeErrors(page));

async function noSideScroll(page: Page) {
  const width = page.viewportSize()!.width;
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(width);
}

test.describe("employee on a phone", () => {
  test.use({ storageState: "playwright/.auth/teacher1.json" });

  test("the school calendar opens from the menu and fits the screen", async ({ page }) => {
    await page.goto("/");
    await page.getByRole("button", { name: "Open menu" }).click();
    await page.getByRole("dialog", { name: "Menu" }).getByRole("link", { name: /^School calendar/ }).click();
    await expect(page).toHaveURL(/\/calendar$/);
    await expect(page.getByRole("heading", { level: 1, name: "School calendar" })).toBeVisible();
    // Працівник не змінює календар: ні кнопки додавання, ні меню рядка.
    await expect(page.getByRole("link", { name: "Add closure" })).toHaveCount(0);
    await noSideScroll(page);
  });
});

test.describe("year grid on a narrow phone", () => {
  test.use({ storageState: "playwright/.auth/teacher1.json", viewport: { width: 360, height: 780 } });

  test("the year grid shows twelve months two per row at 360 px without side scroll", async ({ page }) => {
    await page.goto("/calendar?year=2026");
    await expect(page.getByRole("heading", { level: 1, name: "School calendar" })).toBeVisible();
    const grid = page.getByTestId("school-year-calendar");
    // Сітка сховано від зчитувача (aria-hidden; ті самі закриття — у списку), тож місяці — за data-month.
    const months = grid.locator("[data-month]");
    await expect(months).toHaveCount(12);
    await expect(months.first()).toContainText("September 2026");
    await expect(months.last()).toContainText("August 2027");
    // Два місяці в рядку: вересень і жовтень на одній висоті, листопад — нижче.
    const [sep, oct, nov] = await Promise.all([0, 1, 2].map(async (i) => (await months.nth(i).boundingBox())!));
    expect(Math.abs(sep.y - oct.y)).toBeLessThan(2);
    expect(nov.y).toBeGreaterThan(sep.y + sep.height - 1);
    const box = (await grid.boundingBox())!;
    expect(box.x).toBeGreaterThanOrEqual(0);
    expect(box.x + box.width).toBeLessThanOrEqual(360);
    // Легенда і список (чи порожній стан) — під сіткою, не праворуч.
    await expect(page.getByRole("list", { name: "Calendar legend" })).toBeVisible();
    await noSideScroll(page);
  });
});

test.describe("administrator on a phone", () => {
  test.use({ storageState: "playwright/.auth/admin.json" });

  test("the add-closure form fits the screen and its choices are at least 44 px tall", async ({ page }) => {
    await page.goto("/calendar/manage");
    await expect(page.getByRole("heading", { level: 1, name: "Add closure" })).toBeVisible();
    for (const label of ["Whole days", "Early dismissal"]) {
      const choice = page.locator("label").filter({ hasText: label });
      expect((await choice.boundingBox())!.height).toBeGreaterThanOrEqual(44);
    }
    await page.locator("label").filter({ hasText: "Early dismissal" }).click();
    // exact: підказка варіанта «Early dismissal» теж містить «closed from».
    await expect(page.getByLabel("Closed from", { exact: true })).toBeVisible();
    // Перегляд «Your closure» — під формою, а не праворуч від неї.
    const form = (await page.locator("form").filter({ has: page.getByRole("button", { name: "Add closure" }) }).boundingBox())!;
    const preview = (await page.getByRole("complementary", { name: "Your closure" }).boundingBox())!;
    expect(preview.y).toBeGreaterThan(form.y + form.height - 1);
    await noSideScroll(page);
  });
});
