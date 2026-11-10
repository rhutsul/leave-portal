// Поле дати з календарем (DatePickerField) у формі «Add closure» і «New request» поза меню — вигляд і керування за
// розробником, не AC PM: тому без AC ID і без тегу @uat. Нічого не зберігає: форму не надсилаємо (правила дат —
// AC-CAL-10, -11 у calendar.spec.ts).
import { expect, test, type Page } from "@playwright/test";
import { clickDate, closeDates, openDates } from "./support/calendar";
import { attachRuntimeErrors } from "./support/uat";

test.afterEach(async ({ page }) => attachRuntimeErrors(page));

const field = (page: Page) => page.getByTestId("date-field");
const grid = (page: Page) => page.getByRole("grid");
const status = (page: Page) => page.getByTestId("date-picker").getByRole("status");
const day = (page: Page, label: string) => grid(page).getByRole("button", { name: new RegExp(`^${label}`) });

async function openForm(page: Page) {
  await page.goto("/calendar/manage");
  await expect(page.getByRole("heading", { level: 1, name: "Add closure" })).toBeVisible();
}

test.describe("administrator picks closure dates by clicks", () => {
  test.use({ storageState: "playwright/.auth/admin.json" });

  test("a range: the field opens the calendar, hover previews, the second click ends and closes it", async ({ page }) => {
    await openForm(page);
    // Цілі дні — вид за замовчуванням; старих полів дати немає, календар закритий до натискання на поле.
    await expect(page.getByLabel("Start date", { exact: true })).toHaveCount(0);
    await expect(grid(page)).toHaveCount(0);
    await expect(field(page)).toHaveAccessibleName("Dates Choose dates");

    await clickDate(page, "2027-02-15");
    await expect(grid(page)).toHaveAccessibleName("Dates February 2027");
    await expect(status(page)).toHaveText("Selected Mon, 15 Feb 2027. Click another day to make it a range.");
    // Попередній перегляд до дня під курсором — ще не вибір.
    await day(page, "Thu, 18 Feb 2027").hover();
    await expect(day(page, "Wed, 17 Feb 2027").locator("xpath=..")).toHaveAttribute("aria-selected", "false");
    await expect(day(page, "Wed, 17 Feb 2027")).toHaveClass(/border-dashed/);

    await day(page, "Fri, 19 Feb 2027").click();
    await expect(grid(page)).toBeHidden();
    await expect(field(page)).toHaveText("Mon, 15 Feb 2027 – Fri, 19 Feb 2027, 5 days");
    await expect(page.locator('input[name="start"]')).toHaveValue("2027-02-15");
    await expect(page.locator('input[name="end"]')).toHaveValue("2027-02-19");
    await expect(page.getByRole("complementary", { name: "Your closure" })).toContainText("2027-02-15 – 2027-02-19");

    // Знову відкрито — вибране позначено.
    await openDates(page);
    for (const d of ["Mon, 15 Feb 2027", "Wed, 17 Feb 2027", "Fri, 19 Feb 2027"])
      await expect(day(page, d).locator("xpath=..")).toHaveAttribute("aria-selected", "true");
  });

  test("a single date: one click and a click outside make a one-day closure; early dismissal closes on the click", async ({ page }) => {
    await openForm(page);
    await clickDate(page, "2027-03-05");
    await closeDates(page);
    await expect(field(page)).toHaveText("Fri, 5 Mar 2027");
    await expect(page.locator('input[name="start"]')).toHaveValue("2027-03-05");
    await expect(page.locator('input[name="end"]')).toHaveValue("2027-03-05");

    await page.locator("label").filter({ hasText: "Early dismissal" }).click();
    await expect(field(page)).toHaveAccessibleName("Date Choose a date");
    await clickDate(page, "2027-03-12");
    await expect(grid(page)).toBeHidden();
    // single: кожен клік замінює дату.
    await clickDate(page, "2027-03-11");
    await expect(field(page)).toHaveText("Thu, 11 Mar 2027");
    await expect(page.locator('input[name="date"]')).toHaveValue("2027-03-11");
    await expect(page.getByRole("complementary", { name: "Your closure" })).toContainText("2027-03-11");
  });

  test("the keyboard: Enter opens, arrows move, Esc cancels an unfinished range, then closes", async ({ page }) => {
    await openForm(page);
    await clickDate(page, "2027-02-15");
    await clickDate(page, "2027-02-19");

    await field(page).focus();
    await page.keyboard.press("Enter");
    // Фокус — у календарі, на першому вибраному дні; один день у Tab.
    await expect(day(page, "Mon, 15 Feb 2027")).toBeFocused();
    await expect(grid(page).locator('button[tabindex="0"]')).toHaveCount(1);

    await page.keyboard.press("ArrowDown");
    await expect(day(page, "Mon, 22 Feb 2027")).toBeFocused();
    await page.keyboard.press("Enter");
    await expect(status(page)).toHaveText("Selected Mon, 22 Feb 2027. Click another day to make it a range.");
    // Перший Esc повертає діапазон, що був до нового початку, і лишає календар відкритим.
    await page.keyboard.press("Escape");
    await expect(status(page)).toHaveText("Selected Mon, 15 Feb 2027 – Fri, 19 Feb 2027, 5 days");
    await expect(grid(page)).toBeVisible();

    // Фокус лишився на 22 лютого; стрілка за край місяця гортає календар, PageUp — місяць назад.
    await page.keyboard.press("ArrowDown");
    await expect(day(page, "Mon, 1 Mar 2027")).toBeFocused();
    await page.keyboard.press("PageUp");
    await expect(day(page, "Mon, 1 Feb 2027")).toBeFocused();
    // Комбінації з Ctrl / Alt / Meta сітка не перехоплює (Alt+← — назад в історії браузера).
    await page.keyboard.press("Control+ArrowRight");
    await expect(day(page, "Mon, 1 Feb 2027")).toBeFocused();

    // Другий Esc закриває календар, фокус — знову на полі, вибір той самий.
    await page.keyboard.press("Escape");
    await expect(grid(page)).toBeHidden();
    await expect(field(page)).toBeFocused();
    await expect(field(page)).toHaveText("Mon, 15 Feb 2027 – Fri, 19 Feb 2027, 5 days");
  });

  test("without a date the form is not sent and asks for one", async ({ page }) => {
    await openForm(page);
    await page.getByLabel("Name").fill("Staff day");
    await page.getByRole("button", { name: "Add closure" }).click();
    await expect(page.getByRole("main").getByRole("alert")).toHaveText("Choose a date in the calendar");
    await expect(field(page)).toHaveAttribute("aria-invalid", "true");
    await expect(page).toHaveURL(/\/calendar\/manage$/);
  });
});

test.describe("New request is a form, not a menu item", () => {
  test.use({ storageState: "playwright/.auth/teacher1.json" });

  test("the menu has no New request; the Overview button opens it and My requests stays highlighted", async ({ page }) => {
    await page.goto("/");
    const nav = page.getByRole("navigation", { name: "Main" });
    await expect(nav.getByRole("link", { name: /^My requests/ })).toBeVisible();
    await expect(nav.getByRole("link", { name: /New request/ })).toHaveCount(0);

    await page.getByRole("main").getByRole("link", { name: "New request" }).click();
    await expect(page).toHaveURL(/\/requests\/new$/);
    await expect(page.getByRole("heading", { level: 1, name: "New request" })).toBeVisible();
    await expect(nav.getByRole("link", { name: /^My requests/ })).toHaveAttribute("aria-current", "true");
  });

  test("My requests opens New request from its header", async ({ page }) => {
    await page.goto("/requests");
    await page.getByRole("main").getByRole("link", { name: "New request" }).first().click();
    await expect(page).toHaveURL(/\/requests\/new$/);
    await page.getByRole("link", { name: "← My requests" }).click();
    await expect(page).toHaveURL(/\/requests$/);
  });
});
