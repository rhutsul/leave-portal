// DatePicker на телефоні (ADR 0008, проєкт Playwright «mobile», Pixel 7) — розкладка за розробником, не AC PM: тому без
// AC ID і без тегу @uat. Нічого не зберігає: форму «Add closure» не надсилаємо.
import { expect, test, type Locator, type Page } from "@playwright/test";
import { clickDate, openDates } from "./support/calendar";
import { attachRuntimeErrors } from "./support/uat";

test.afterEach(async ({ page }) => attachRuntimeErrors(page));

async function noSideScroll(page: Page) {
  const width = page.viewportSize()!.width;
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(width);
}

/** Розмір елемента в розкладці (CSS px), без transform предків — на відміну від boundingBox(). */
function layoutSize(locator: Locator) {
  return locator.evaluate((el) => ({ width: (el as HTMLElement).offsetWidth, height: (el as HTMLElement).offsetHeight }));
}

test.describe("administrator on a narrow phone", () => {
  test.use({ storageState: "playwright/.auth/admin.json", viewport: { width: 360, height: 780 } });

  test("the closure calendar opens from a 44 px field, fits 360 px, its days are 44 px tall and a range is picked by taps", async ({ page }) => {
    await page.goto("/calendar/manage");
    await expect(page.getByRole("heading", { level: 1, name: "Add closure" })).toBeVisible();
    const field = page.getByTestId("date-field");
    expect((await field.boundingBox())!.height).toBeGreaterThanOrEqual(44);
    await openDates(page);
    const picker = page.getByTestId("date-picker");
    // Розмір дотику — розмір у розкладці, а не на екрані. Панель з'являється з zoom-in-95 (--duration-base, DESIGN.md
    // розділ 11), а boundingBox() рахує й transform: у CI клітинку зловили на 43.96 і 43.99 px замість 44 (run
    // 43451608456 і 43451369044, 13.11). Очікування кінця анімації (getAnimations) лишало гонку з її стартом, тож
    // міряємо розкладку (offsetWidth / offsetHeight — без transform), і результат не залежить від того, коли міряємо.
    const days = picker.getByRole("grid").getByRole("button");
    const first = await layoutSize(days.first());
    expect(first.height).toBeGreaterThanOrEqual(44);
    expect(first.width).toBeGreaterThanOrEqual(38);
    for (const label of ["Previous month", "Next month"]) {
      expect((await layoutSize(picker.getByRole("button", { name: label }))).height).toBeGreaterThanOrEqual(44);
    }
    const grid = (await picker.boundingBox())!;
    expect(grid.x).toBeGreaterThanOrEqual(0);
    expect(grid.x + grid.width).toBeLessThanOrEqual(360);

    await clickDate(page, "2027-02-15");
    await clickDate(page, "2027-02-19");
    await expect(field).toHaveText("Mon, 15 Feb 2027 – Fri, 19 Feb 2027, 5 days");
    await expect(page.locator('input[name="start"]')).toHaveValue("2027-02-15");
    await expect(page.locator('input[name="end"]')).toHaveValue("2027-02-19");
    await noSideScroll(page);
  });

  test("an early dismissal date is one tap", async ({ page }) => {
    await page.goto("/calendar/manage");
    await page.locator("label").filter({ hasText: "Early dismissal" }).click();
    await clickDate(page, "2027-03-11");
    await expect(page.locator('input[name="date"]')).toHaveValue("2027-03-11");
    await expect(page.getByTestId("date-field")).toHaveText("Thu, 11 Mar 2027");
    await noSideScroll(page);
  });
});

test.describe("employee on a phone", () => {
  test.use({ storageState: "playwright/.auth/teacher1.json" });

  test("the menu has no New request, and My requests still opens it", async ({ page }) => {
    await page.goto("/requests");
    await page.getByRole("button", { name: "Open menu" }).click();
    const menu = page.getByRole("dialog", { name: "Menu" });
    await expect(menu.getByRole("link", { name: /^My requests/ })).toBeVisible();
    await expect(menu.getByRole("link", { name: /New request/ })).toHaveCount(0);
    await page.keyboard.press("Escape");
    await page.getByRole("main").getByRole("link", { name: "New request" }).first().click();
    await expect(page.getByRole("heading", { level: 1, name: "New request" })).toBeVisible();
  });
});
