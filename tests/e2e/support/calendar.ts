// Календар кроку «Dates» форми нової заявки: спільне для специфікацій AC і негативних контролів.
import { expect, type Page } from "@playwright/test";
import { formatDateLong } from "../../../src/lib/leave/time";

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

/** Календар поля дати (DatePickerField) відкрито: спливна панель на місці й не закривається. */
const openPanel = (page: Page) => page.locator('[data-slot="popover-content"][data-open]');

/** Відкриває календар поля дати форми «Add closure», якщо він закритий (дочекавшись, поки закриється попередній). */
export async function openDates(page: Page) {
  if ((await openPanel(page).count()) > 0) return;
  await expect(page.getByRole("grid")).toBeHidden();
  await page.getByTestId("date-field").click();
  await expect(openPanel(page)).toBeVisible();
}

/** Закриває календар кліком повз (як користувач): незавершений діапазон лишається однією датою. */
export async function closeDates(page: Page) {
  await page.getByRole("heading", { level: 1 }).click();
  await expect(page.getByRole("grid")).toBeHidden();
}

/**
 * Клік по даті в DatePickerField (форма «Add closure»): відкриває календар, гортає на місяць дати й натискає день.
 * Назва дня починається з дати — «Mon, 28 Dec 2026», далі можуть іти позначки («already closed: …», «today»).
 */
export async function clickDate(page: Page, date: string) {
  await openDates(page);
  const [year, month] = date.split("-").map(Number);
  await showMonth(page, year, month);
  const name = new RegExp(`^${formatDateLong(date)}`);
  await page.getByRole("grid").getByRole("button", { name }).click();
}
