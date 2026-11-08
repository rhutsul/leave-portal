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
    await expect(page.getByLabel("Closed from")).toBeVisible();
    await noSideScroll(page);
  });
});
