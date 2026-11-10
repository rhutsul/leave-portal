// DatePicker у формі «Add closure» і «New request» поза меню — вигляд і керування за розробником, не AC PM: тому без AC
// ID і без тегу @uat. Нічого не зберігає: форму не надсилаємо (правила дат — AC-CAL-10, -11 у calendar.spec.ts).
import { expect, test, type Page } from "@playwright/test";
import { clickDate, showMonth } from "./support/calendar";
import { attachRuntimeErrors } from "./support/uat";

test.afterEach(async ({ page }) => attachRuntimeErrors(page));

const picker = (page: Page) => page.getByTestId("date-picker");
const day = (page: Page, label: string) => picker(page).getByRole("button", { name: new RegExp(`^${label}`) });

async function openForm(page: Page) {
  await page.goto("/calendar/manage");
  await expect(page.getByRole("heading", { level: 1, name: "Add closure" })).toBeVisible();
}

test.describe("administrator picks closure dates by clicks", () => {
  test.use({ storageState: "playwright/.auth/admin.json" });

  test("a range: the first click starts, hover previews, the second click ends", async ({ page }) => {
    await openForm(page);
    // Цілі дні — вид за замовчуванням; старих полів дати більше немає.
    await expect(page.getByLabel("Start date", { exact: true })).toHaveCount(0);
    await expect(picker(page).getByRole("grid")).toHaveAccessibleName(/^Dates /);

    await clickDate(page, "2027-02-15");
    await expect(picker(page).getByRole("status")).toHaveText(
      "Selected Mon, 15 Feb 2027. Click another day to make it a range.",
    );
    // Попередній перегляд до дня під курсором — ще не вибір.
    await day(page, "Thu, 18 Feb 2027").hover();
    await expect(day(page, "Wed, 17 Feb 2027").locator("xpath=..")).toHaveAttribute("aria-selected", "false");
    await expect(day(page, "Wed, 17 Feb 2027")).toHaveClass(/border-dashed/);

    await day(page, "Fri, 19 Feb 2027").click();
    await expect(picker(page).getByRole("status")).toHaveText("Selected Mon, 15 Feb 2027 – Fri, 19 Feb 2027, 5 days");
    for (const d of ["Mon, 15 Feb 2027", "Wed, 17 Feb 2027", "Fri, 19 Feb 2027"])
      await expect(day(page, d).locator("xpath=..")).toHaveAttribute("aria-selected", "true");
    await expect(page.locator('input[name="start"]')).toHaveValue("2027-02-15");
    await expect(page.locator('input[name="end"]')).toHaveValue("2027-02-19");
    await expect(page.getByRole("complementary", { name: "Your closure" })).toContainText("2027-02-15 – 2027-02-19");
  });

  test("a single date: one click is a one-day closure; early dismissal picks one date", async ({ page }) => {
    await openForm(page);
    await clickDate(page, "2027-03-05");
    await expect(page.locator('input[name="start"]')).toHaveValue("2027-03-05");
    await expect(page.locator('input[name="end"]')).toHaveValue("2027-03-05");
    await expect(picker(page).getByRole("status")).toHaveText(
      "Selected Fri, 5 Mar 2027. Click another day to make it a range.",
    );

    await page.locator("label").filter({ hasText: "Early dismissal" }).click();
    await expect(picker(page).getByRole("grid")).toHaveAccessibleName(/^Date /);
    await clickDate(page, "2027-03-12");
    await clickDate(page, "2027-03-11");
    // single: кожен клік замінює дату.
    await expect(page.locator('input[name="date"]')).toHaveValue("2027-03-11");
    await expect(picker(page).getByRole("status")).toHaveText("Selected Thu, 11 Mar 2027");
    await expect(page.getByRole("complementary", { name: "Your closure" })).toContainText("2027-03-11");
  });

  test("the keyboard: arrows move, Enter picks, Esc cancels an unfinished range", async ({ page }) => {
    await openForm(page);
    await showMonth(page, 2027, 2);
    await day(page, "Mon, 15 Feb 2027").click();
    await day(page, "Fri, 19 Feb 2027").click();
    // Один день у Tab: фокус — на останньому вибраному.
    await expect(picker(page).getByRole("grid").locator('button[tabindex="0"]')).toHaveCount(1);

    await page.keyboard.press("ArrowDown");
    await expect(day(page, "Fri, 26 Feb 2027")).toBeFocused();
    await page.keyboard.press("Enter");
    await expect(picker(page).getByRole("status")).toHaveText(
      "Selected Fri, 26 Feb 2027. Click another day to make it a range.",
    );
    // Esc повертає діапазон, що був до нового початку.
    await page.keyboard.press("Escape");
    await expect(picker(page).getByRole("status")).toHaveText("Selected Mon, 15 Feb 2027 – Fri, 19 Feb 2027, 5 days");

    // Стрілка за край місяця гортає календар.
    await day(page, "Fri, 26 Feb 2027").focus();
    await page.keyboard.press("ArrowDown");
    await expect(day(page, "Fri, 5 Mar 2027")).toBeFocused();
    await expect(picker(page)).toContainText("March 2027");
    await page.keyboard.press("PageUp");
    await expect(day(page, "Fri, 5 Feb 2027")).toBeFocused();
  });

  test("without a date the form is not sent and asks for one", async ({ page }) => {
    await openForm(page);
    await page.getByLabel("Name").fill("Staff day");
    await page.getByRole("button", { name: "Add closure" }).click();
    await expect(page.getByRole("main").getByRole("alert")).toHaveText("Choose a date in the calendar");
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
