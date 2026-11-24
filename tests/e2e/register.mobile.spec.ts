// /register на телефоні (ADR 0012, ADR 0008): рядки реєстру — картки, сторінка не прокручується вбік, «Download CSV»
// на місці. Без AC ID — вимог PM до фічі ще немає. Дані — синтетичний працівник із двома погодженими записами
// (@prod-writes, прибирання за id). Знімок 390 px для docs/img/ — у test-results/, звідки його бере артефакт CI.
import { expect, test } from "@playwright/test";
import { cleanupRemembered } from "./support/admin";
import { registerFixture, screenshotWithoutOverlays } from "./support/register";
import { attachRuntimeErrors } from "./support/uat";

test.use({ storageState: "playwright/.auth/manager1.json", viewport: { width: 390, height: 844 } });

test.afterEach(async ({ page }) => {
  await attachRuntimeErrors(page);
  await cleanupRemembered();
});

test("on a 390 px phone register rows are cards and the page does not scroll sideways", { tag: ["@prod-writes"] }, async ({ page }) => {
  const fx = await registerFixture();
  await page.goto(`/register?division=${fx.divisionCode}&month=${fx.month}`);

  const rows = page.getByTestId("register-row").filter({ hasText: fx.employee.email });
  await expect(rows).toHaveCount(2);
  // Картка: шапку таблиці сховано, тож числа днів мають власні слова. Точний збіг: «paid» — підрядок «unpaid».
  await expect(rows.first().getByText("paid", { exact: true })).toBeVisible();
  await expect(rows.first().getByText("unpaid", { exact: true })).toBeVisible();
  await expect(page.getByRole("link", { name: "Download CSV" })).toBeVisible();

  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
  expect(overflow).toBeLessThanOrEqual(0);
  const box = (await rows.first().boundingBox())!;
  expect(box.x).toBeGreaterThanOrEqual(0);
  expect(box.x + box.width).toBeLessThanOrEqual(390);

  await screenshotWithoutOverlays(page, test.info().outputPath("register-390-light.png"), true);
});
