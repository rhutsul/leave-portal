// Посади й розклади на сторінках адміністратора (вимога PM 07; PR 3 плану impl-staff-management, задачі 3.1–3.2):
// нова основна посада з розкладом з дати й менеджером, друга основна, перетин розкладів, новий розклад з дати.
// AC називають teacher3@ і сталі дати — тут синтетичні staff-*@example.test і «сьогодні» за Києвом. Лише на
// одноразовому стеку CI (@writes). Знімки 1280 px для docs/img/ — у test-results/ (артефакт CI).
import { expect, test, type BrowserContext, type Page } from "@playwright/test";
import { kyivDate } from "../../src/lib/leave/time";
import { addRecord, cleanupRemembered } from "./support/admin";
import { clickDate } from "./support/calendar";
import { cleanupStaff, createEmployeeViaPage, setPasswordByLink, staffEmail, staffPassword } from "./support/staff";
import { cleanScreenshot } from "./support/uat";

test.use({ trace: "off", storageState: "playwright/.auth/admin.json", colorScheme: "light" });

const shot = (page: Page, name: string, fullPage = false) =>
  cleanScreenshot(page, test.info().outputPath(`ws11-staff-${name}-1280-light.png`), fullPage);

async function chooseDivision(page: Page, name: string) {
  await page.getByRole("combobox", { name: "Division" }).click();
  await page.getByRole("option", { name }).click();
}

/** Лише понеділок `start`–`end`: інші дні типового тижня прибираємо. */
async function onlyMonday(page: Page, start: string, end: string) {
  for (const day of ["Tue", "Wed", "Thu", "Fri"]) await page.getByRole("button", { name: `Remove ${day} period 1` }).click();
  await page.getByLabel("Mon period 1 start").fill(start);
  await page.getByLabel("Mon period 1 end").fill(end);
}

test.describe("positions and schedules @writes", () => {
  test.describe.configure({ mode: "serial" });
  let person: { context: BrowserContext; page: Page } | null = null;

  test.afterAll(async () => {
    await person?.context.close();
    await cleanupRemembered();
    await cleanupStaff();
  });

  const email = staffEmail("positions");
  const password = staffPassword();
  const today = kyivDate(new Date());
  let employee = { id: "", url: "" };

  test("AC-STAFF-04: the main position with a schedule from a date and manager1 shows in the employee's weekly schedule", async ({ browser, page }) => {
    employee = await createEmployeeViaPage(page, "Teacher Three", email);
    person = await setPasswordByLink(browser, employee.url, password);

    await page.goto(`/staff/${employee.id}/positions/new`);
    await chooseDivision(page, "Elementary school");
    await page.getByLabel("Job title").fill("Teacher");
    await clickDate(page, today);
    await page.getByTestId("position-form").getByText("manager1@example.test").click();
    await shot(page, "position-new", true);
    await page.getByRole("button", { name: "Save position" }).click();
    await expect(page).toHaveURL(new RegExp(`/staff/${employee.id}\\?saved=position$`));
    const card = page.getByTestId("staff-position").filter({ hasText: "Elementary school / Teacher" });
    await expect(card).toContainText("Main");
    await expect(card.getByTestId("position-schedule")).toHaveText("Mon–Fri 08:30–15:30");

    await person.page.goto("/requests/new");
    await expect(person.page.getByText("Elementary school / Teacher — Mon–Fri 08:30–15:30")).toBeVisible();
  });

  test("AC-STAFF-05: a second main position cannot be chosen, and the page says why", async ({ page }) => {
    await page.goto(`/staff/${employee.id}/positions/new`);
    await expect(page.getByRole("radio", { name: "Main" })).toBeDisabled();
    await expect(page.getByTestId("position-form")).toContainText("An employee has exactly one main position");
  });

  test("AC-STAFF-06: an additional position whose schedule overlaps the main one is not saved", async ({ page }) => {
    await page.goto(`/staff/${employee.id}/positions/new`);
    await chooseDivision(page, "High school");
    await page.getByLabel("Job title").fill("Math teacher");
    await clickDate(page, today);
    await onlyMonday(page, "15:00", "17:00");
    await page.getByRole("button", { name: "Save position" }).click();
    await expect(page.getByRole("alert").filter({ hasText: "This schedule overlaps" })).toHaveText(
      "This schedule overlaps the position Elementary school / Teacher: Mon 08:30–15:30",
    );
    await shot(page, "position-overlap", true);
    await expect(page).toHaveURL(/\/positions\/new$/);
  });

  test("AC-STAFF-07: a new schedule from today keeps the approved record and gives the new hours from its date", async ({ page }) => {
    await addRecord(email, { date: today, start: 510, end: 930, leaveType: "personal", status: "approved" });
    await page.goto(`/staff/${employee.id}`);
    const card = page.getByTestId("staff-position").filter({ hasText: "Elementary school / Teacher" });
    await card.getByRole("button", { name: /^Actions for / }).click();
    await page.getByRole("menuitem", { name: "Change schedule" }).click();
    await expect(page.getByTestId("schedule-form")).toBeVisible();
    await clickDate(page, today);
    for (const day of ["Mon", "Tue", "Wed", "Thu", "Fri"]) await page.getByLabel(`${day} period 1 end`).fill("12:30");
    await shot(page, "schedule", true);
    await page.getByRole("button", { name: "Save schedule" }).click();
    await expect(page).toHaveURL(/\?saved=schedule$/);
    await expect(card.getByTestId("position-schedule")).toHaveText("Mon–Fri 08:30–12:30");
    await shot(page, "employee-positions", true);

    // Запис, погоджений до зміни, — ті самі години; новий цілий день — уже за новим розкладом.
    await person!.page.goto("/requests");
    await expect(person!.page.getByTestId("leave-record")).toContainText("08:30–15:30");
    await person!.page.goto("/requests/new");
    await expect(person!.page.getByText("Elementary school / Teacher — Mon–Fri 08:30–12:30")).toBeVisible();
  });
});
