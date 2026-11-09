// Календар кроку «Dates» форми нової заявки: спільне для специфікацій AC і негативних контролів.
import { expect, type Page } from "@playwright/test";

/** Гортає календар форми на місяць year-month (month 1–12): форма відкривається на поточному місяці. */
export async function showMonth(page: Page, year: number, month: number) {
  // Назва місяця — між кнопками «Previous month» і «Next month».
  const label = page.getByRole("button", { name: "Previous month" }).locator("xpath=following-sibling::div[1]");
  const shown = Date.parse(`1 ${await label.innerText()} UTC`);
  const delta = Math.round((Date.UTC(year, month - 1) - shown) / (30.44 * 24 * 3600 * 1000));
  const button = page.getByRole("button", { name: delta < 0 ? "Previous month" : "Next month" });
  for (let i = 0; i < Math.abs(delta); i++) await button.click();
  const name = new Date(Date.UTC(year, month - 1)).toLocaleString("en-GB", { month: "long", year: "numeric", timeZone: "UTC" });
  await expect(label).toHaveText(name);
}

/** Гортає календар на листопад 2026: форма відкривається на поточному місяці, а PM може перевіряти пізніше. */
export async function showNovember2026(page: Page) {
  await showMonth(page, 2026, 11);
}
