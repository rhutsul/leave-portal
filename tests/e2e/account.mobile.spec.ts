// /account на телефоні (ADR 0011, ADR 0008): посилання з мобільного меню поруч із Sign out; меню закривається, а
// фокус переходить на заголовок сторінки. Лише читання; без AC ID — вимог PM до фічі ще немає. Знімок для docs/img/
// (390 px) — у test-results/, звідки його бере артефакт CI.
import { expect, test } from "@playwright/test";

test.use({ storageState: "playwright/.auth/teacher1.json", viewport: { width: 390, height: 844 } });

test("account opens from the mobile menu and fits the phone width", async ({ page }) => {
  await page.goto("/");
  await page.getByRole("button", { name: "Open menu" }).click();
  await page.getByRole("link", { name: /^Account: / }).click();
  await expect(page).toHaveURL(/\/account$/);
  const heading = page.getByRole("heading", { level: 1, name: "Account" });
  await expect(heading).toBeFocused();
  await expect(page.getByRole("button", { name: "Open menu" })).toBeVisible();
  // Без горизонтальної прокрутки сторінки (DESIGN.md, розділ 12).
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
  expect(overflow).toBeLessThanOrEqual(0);
  // Поля пароля на дотику — 44 px заввишки (ADR 0008).
  const box = await page.getByLabel("Current password").boundingBox();
  expect(box?.height).toBeGreaterThanOrEqual(44);
  await page.screenshot({ path: test.info().outputPath("account-390-light.png"), fullPage: true });
});
