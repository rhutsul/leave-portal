// Портал на телефоні (ADR 0008, проєкт Playwright «mobile», Pixel 7) — розкладка за розробником, не AC PM: тому без AC
// ID і без тегу @uat. Меню з кнопки в шапці, картки замість таблиці, запис на весь екран із діями внизу.
import { devices, expect, test } from "@playwright/test";
import { showNovember2026 } from "./support/calendar";
import { attachRuntimeErrors } from "./support/uat";

test.afterEach(async ({ page }) => attachRuntimeErrors(page));

test.describe("employee on a phone", () => {
  test.use({ storageState: "playwright/.auth/teacher1.json" });

  test("the menu opens from the top bar, closes on a choice and moves focus to the new page", async ({ page }) => {
    await page.goto("/");
    // Бічної панелі вужче за lg немає: навігація — у меню з кнопки.
    await expect(page.getByRole("navigation").getByRole("link", { name: /^My requests/ })).toHaveCount(0);
    await page.getByRole("button", { name: "Open menu" }).click();
    const menu = page.getByRole("dialog", { name: "Menu" });
    await expect(menu.getByRole("link", { name: /^Overview/ })).toBeVisible();
    await menu.getByRole("link", { name: /^My requests/ }).click();
    await expect(page).toHaveURL(/\/requests$/);
    await expect(menu).toBeHidden();
    await expect(page.getByRole("heading", { level: 1, name: "My requests" })).toBeFocused();
  });

});

test("on a phone records are cards, and a record opens full screen with Back to list and the actions at the bottom", { tag: ["@writes"] }, async ({ browser }) => {
  // Запис, що чекає рішення: працівник подає заявку на весь день (звичайне вікно — нова заявка на телефоні — окремий PR).
  const employee = await browser.newContext({ storageState: "playwright/.auth/teacher1.json", viewport: { width: 1280, height: 800 } });
  const form = await employee.newPage();
  await form.goto("/requests/new");
  await showNovember2026(form);
  await form.getByRole("button", { name: /^Thu, 5 Nov 2026/ }).click();
  await form.getByRole("button", { name: "Continue" }).click();
  await form.getByRole("button", { name: "Continue" }).click();
  await form.getByText("Personal leave", { exact: true }).click();
  await form.getByRole("button", { name: "Continue" }).click();
  await form.getByRole("button", { name: "Submit request" }).click();
  await expect(form.getByRole("main").getByText("Request submitted")).toBeVisible();
  await employee.close();

  // My requests на телефоні: записи — картки в ширину екрана, сторінка не прокручується вбік.
  const own = await browser.newContext({ storageState: "playwright/.auth/teacher1.json", ...devices["Pixel 7"] });
  const list = await own.newPage();
  await list.goto("/requests");
  const card = list.getByTestId("leave-record").filter({ hasText: "Thu 5" }).first();
  await expect(card).toBeVisible();
  expect(await card.evaluate((row) => getComputedStyle(row).display)).toBe("flex");
  const listWidth = list.viewportSize()!.width;
  const box = (await card.boundingBox())!;
  expect(box.x + box.width).toBeLessThanOrEqual(listWidth);
  expect(await list.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(listWidth);
  await attachRuntimeErrors(list);
  await own.close();

  const admin = await browser.newContext({ storageState: "playwright/.auth/admin.json", ...devices["Pixel 7"] });
  const phone = await admin.newPage();
  await phone.goto("/decisions");
  await phone.getByTestId("decision-record").filter({ hasText: "2026-11-05" }).first().getByRole("link").click();
  await expect(phone).toHaveURL(/record=\d+/);

  const panel = phone.locator('[data-slot="sheet-content"]');
  const width = phone.viewportSize()!.width;
  await expect.poll(async () => (await panel.boundingBox())?.width).toBe(width);
  await expect(panel.getByRole("button", { name: "Back to list" })).toBeVisible();
  await expect(panel.getByRole("button", { name: "Close" })).toBeHidden();
  // Дії рішення — на екрані без прокрутки (прикріплені внизу).
  await expect(panel.getByRole("button", { name: "Approve", exact: true })).toBeInViewport();
  await expect(panel.getByRole("button", { name: "Reject", exact: true })).toBeInViewport();

  await panel.getByRole("button", { name: "Back to list" }).click();
  await expect(phone).not.toHaveURL(/record=/);
  await attachRuntimeErrors(phone);
  await admin.close();
});
