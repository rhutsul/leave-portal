// Календар кроку «Dates» форми нової заявки: спільне для специфікацій AC і негативних контролів.
import { expect, type Page } from "@playwright/test";

/** Гортає календар на листопад 2026: форма відкривається на поточному місяці, а PM може перевіряти пізніше. */
export async function showNovember2026(page: Page) {
  // Назва місяця — між кнопками «Previous month» і «Next month».
  const month = page.getByRole("button", { name: "Previous month" }).locator("xpath=following-sibling::div[1]");
  const shown = Date.parse(`1 ${await month.innerText()} UTC`);
  const delta = Math.round((Date.UTC(2026, 10) - shown) / (30.44 * 24 * 3600 * 1000));
  const button = page.getByRole("button", { name: delta < 0 ? "Previous month" : "Next month" });
  for (let i = 0; i < Math.abs(delta); i++) await button.click();
  await expect(month).toHaveText("November 2026");
}
