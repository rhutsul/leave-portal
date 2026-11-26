// Працівники й вхід (вимога PM 07; PR 2 плану openspec/changes/impl-staff-management/tasks.md, задачі 2.1–2.4):
// адміністратор створює працівника й бачить одноразове посилання, людина задає пароль і входить, адміністратор змінює
// ім'я й email, деактивує й не змінює собі роль; не адміністратор і гість — відмова.
// AC називають teacher3@example.test і сталі дати — тут синтетичні адреси staff-*@example.test (у демоданих teacher3@
// уже є, D11) і «сьогодні» за Києвом. Лише на одноразовому стеку CI (@writes): створює й видаляє облікові записи.
// Паролі вводить сам тест — trace вимкнено. Знімки 1280 px для docs/img/ — у test-results/ (артефакт CI).
import { expect, test } from "@playwright/test";
import { formatDateLong, kyivDate } from "../../src/lib/leave/time";
import { linkValidUntil } from "../../src/lib/staff/link";
import { adminClient, addRecord } from "./support/admin";
import { roleContext } from "./support/cancel";
import {
  cleanupStaff,
  createEmployeeViaPage,
  giveMainPosition,
  profileCount,
  setPasswordByLink,
  staffEmail,
  staffPassword,
} from "./support/staff";
import { expectNoSidewaysScroll } from "./support/layout";
import { cleanScreenshot } from "./support/uat";

test.use({ trace: "off", storageState: "playwright/.auth/admin.json", colorScheme: "light" });

const shot = (page: import("@playwright/test").Page, name: string, fullPage = false) =>
  cleanScreenshot(page, test.info().outputPath(`ws11-staff-${name}-1280-light.png`), fullPage);

test.describe("employees and sign-in @writes", () => {
  test.describe.configure({ mode: "serial" });

  test.afterAll(cleanupStaff);

  const email = staffEmail("three");
  const renamed = staffEmail("renamed");
  const password = staffPassword();
  let employee = { id: "", url: "" };

  test("AC-STAFF-01: the administrator creates an employee, sees Invited and a one-time link valid until today + 7", async ({ page }) => {
    employee = await createEmployeeViaPage(page, "Teacher Three", email);
    const until = formatDateLong(linkValidUntil(kyivDate(new Date())));
    await expect(page.getByTestId("link-valid-until")).toHaveText(`Valid until ${until}`);
    await expect(page.getByRole("status").filter({ hasText: "Employee created" })).toBeVisible();
    await expectNoSidewaysScroll(page);
    await shot(page, "new-link", true);

    await page.goto("/staff");
    const row = page.getByTestId("staff-row").filter({ hasText: email });
    await expect(row).toContainText("Teacher Three");
    await expect(row).toContainText("Invited");
    await expectNoSidewaysScroll(page);
    await shot(page, "list");
  });

  test("AC-STAFF-02: the person opens the link, sets a 10-character password, is signed in and becomes Active", async ({ browser, page }) => {
    const { context, page: person } = await setPasswordByLink(browser, employee.url, "ten-chars!");
    try {
      await expect(person).toHaveURL(/\/\?notice=password-set$/);
      await expect(person.getByTestId("password-set")).toContainText("Your password is set");
      await expect(person.getByTestId("user-email")).toHaveText(email);
    } finally {
      await context.close();
    }
    await page.goto("/staff");
    await expect(page.getByTestId("staff-row").filter({ hasText: email })).toContainText("Active");
  });

  test("AC-STAFF-02: the link works once — opened again it sets no password", async ({ browser }) => {
    const context = await browser.newContext({ storageState: { cookies: [], origins: [] }, reducedMotion: "reduce" });
    const guest = await context.newPage();
    try {
      await guest.goto(employee.url);
      await expect(guest.getByTestId("link-closed")).toHaveText(
        "This link is no longer valid. Ask the administrator for a new one",
      );
      await expect(guest.getByTestId("set-password-form")).toHaveCount(0);
      // Фрагмент із токеном прибрано з адреси.
      expect(new URL(guest.url()).hash).toBe("");
      await cleanScreenshot(guest, test.info().outputPath("ws11-staff-link-closed-1280-light.png"));
    } finally {
      await context.close();
    }
  });

  test("AC-STAFF-11: after the administrator changes the name and the email, the person signs in with the new email and the same password", async ({ browser, page }) => {
    // Пароль, який знає тест: нове посилання й пароль за ним.
    await page.goto(`/staff/${employee.id}`);
    await page.getByRole("button", { name: "Create a sign-in link" }).click();
    const fresh = await page.getByTestId("one-time-link").getByLabel("Link").inputValue();
    const { context } = await setPasswordByLink(browser, fresh, password);
    await context.close();

    await page.goto(`/staff/${employee.id}`);
    const details = page.getByTestId("employee-details-form");
    await details.getByLabel("Name").fill("Teacher Three-Smith");
    await details.getByLabel("Email").fill(renamed);
    await details.getByRole("button", { name: "Save changes" }).click();
    await expect(details.getByRole("status")).toContainText("Saved");
    await expectNoSidewaysScroll(page);
    await shot(page, "employee", true);

    await page.goto("/staff");
    const row = page.getByTestId("staff-row").filter({ hasText: renamed });
    await expect(row).toContainText("Teacher Three-Smith");

    const signIn = await browser.newContext({ storageState: { cookies: [], origins: [] }, reducedMotion: "reduce" });
    const person = await signIn.newPage();
    try {
      await person.goto("/login");
      await person.getByLabel("Email").fill(renamed);
      await person.getByLabel("Password", { exact: true }).fill(password);
      await person.getByRole("button", { name: "Sign in" }).click();
      await expect(person.getByTestId("user-email")).toHaveText(renamed);
    } finally {
      await signIn.close();
    }
  });

  test("AC-STAFF-08: a deactivated employee cannot sign in, and the manager still sees their approved record in History", async ({ browser, page }) => {
    await giveMainPosition(employee.id);
    const today = kyivDate(new Date());
    await addRecord(renamed, { date: today, start: 510, end: 930, leaveType: "personal", status: "approved" });

    await page.goto(`/staff/${employee.id}`);
    await page.getByRole("button", { name: "Deactivate" }).click();
    const dialog = page.getByRole("dialog");
    await expect(dialog).toContainText("Deactivate Teacher Three-Smith?");
    await dialog.getByRole("button", { name: "Deactivate" }).click();
    await expect(page.getByText("This person cannot sign in.")).toBeVisible();

    const signIn = await browser.newContext({ storageState: { cookies: [], origins: [] }, reducedMotion: "reduce" });
    const person = await signIn.newPage();
    try {
      await person.goto("/login");
      await person.getByLabel("Email").fill(renamed);
      await person.getByLabel("Password", { exact: true }).fill(password);
      await person.getByRole("button", { name: "Sign in" }).click();
      await expect(person).toHaveURL(/\/login\?error=deactivated$/);
      // Рядок «role=alert» на сторінці не один (оголошувач маршруту Next) — шукаємо Alert за текстом AC.
      await expect(
        person.getByRole("alert").filter({ hasText: "Your account is deactivated. Contact the administrator" }),
      ).toBeVisible();
      await cleanScreenshot(person, test.info().outputPath("ws11-staff-login-deactivated-1280-light.png"));
    } finally {
      await signIn.close();
    }

    const managerContext = await roleContext(browser, "manager1");
    const manager = await managerContext.newPage();
    try {
      await manager.goto("/decisions?tab=history");
      // Рядок «History» називає працівника на ім'я (email — у панелі запису).
      await expect(manager.getByTestId("decision-record").filter({ hasText: "Teacher Three-Smith" })).toBeVisible();
    } finally {
      await managerContext.close();
    }

    // Реактивація — той самий пароль знову працює (кроки за розробником, Out of scope PM).
    await page.getByRole("button", { name: "Reactivate" }).click();
    await expect(page.getByRole("button", { name: "Deactivate" })).toBeVisible();
  });

  test("AC-STAFF-18: the administrator cannot change their own role", async ({ page }) => {
    const { data } = await adminClient().from("profiles").select("id").eq("email", "admin@example.test").single();
    await page.goto(`/staff/${data!.id}`);
    const role = page.getByTestId("role-form");
    await expect(role.getByRole("combobox", { name: "Role" })).toBeDisabled();
    await expect(role).toContainText("You cannot change your own role");
    await expect(page.getByRole("button", { name: "Deactivate" })).toHaveCount(0);
  });
});

test.describe("who may manage employees", () => {
  test("AC-STAFF-13: a manager who opens the page for creating employees sees the refusal and the list stays the same", async ({ browser }) => {
    const before = await profileCount();
    const context = await roleContext(browser, "manager1");
    const page = await context.newPage();
    try {
      await page.goto("/staff/new");
      await expect(page.getByRole("heading", { level: 2 })).toHaveText("Only an administrator can manage employees");
      await expect(page.getByTestId("new-employee-form")).toHaveCount(0);
      await expect(page.getByRole("link", { name: "Employees" })).toHaveCount(0);
      await cleanScreenshot(page, test.info().outputPath("ws11-staff-denied-1280-light.png"));
    } finally {
      await context.close();
    }
    expect(await profileCount()).toBe(before);
  });

  test("AC-STAFF-15: a visitor who opens the employee list sees the sign-in page and no names or emails", async ({ browser }) => {
    const context = await browser.newContext({ storageState: { cookies: [], origins: [] } });
    const page = await context.newPage();
    try {
      const response = await page.goto("/staff");
      await expect(page).toHaveURL(/\/login$/);
      await expect(page.getByRole("heading", { name: "Sign in" })).toBeVisible();
      const html = (await response?.text()) ?? "";
      expect(html).not.toContain("teacher1@example.test");
      expect(await page.content()).not.toContain("teacher1@example.test");
    } finally {
      await context.close();
    }
  });

  test("AC-STAFF-12: an employee sees who changes names and emails, and cannot change their own", async ({ browser }) => {
    const context = await roleContext(browser, "teacher1");
    const page = await context.newPage();
    try {
      await page.goto("/account");
      await expect(page.getByTestId("names-note")).toHaveText("Only an administrator can change names and emails");
      const emailField = page.getByLabel("Email");
      await expect(emailField).toHaveValue("teacher1@example.test");
      await expect(emailField).not.toBeEditable();
      await expect(page.getByLabel("Name")).not.toBeEditable();
      await emailField.click();
      await page.keyboard.type("x");
      await expect(emailField).toHaveValue("teacher1@example.test");
    } finally {
      await context.close();
    }
  });
});
