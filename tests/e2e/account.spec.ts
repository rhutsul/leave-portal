// Сторінка /account і зміна власного пароля (ADR 0011): вимога PM 07, AC-STAFF-16 і AC-STAFF-17
// (requirements/07-staff-management.md). AC ID у назвах — після PR «Специфікація» на зріз 07; кроків «Дано / Тоді» UAT поки немає.
//
// Зміна пароля — на ОДНОРАЗОВОМУ користувачі (createUatAccount, секретний ключ): паролі демо-акаунтів, на яких
// тримаються інші тести й UAT, не змінюємо. Тест сам вводить паролі у форми, тож trace у цьому файлі вимкнено (у
// трасі були б значення полів); на відео поля пароля — крапки. Користувача видаляє afterEach, залишок назве teardown.
// Перегляд сторінки ролями — лише читання, на станах входу з auth.setup.ts; там же знімки для docs/img/ (390 і 1280 px)
// — у test-results/, звідки їх бере артефакт CI.
import { randomBytes } from "node:crypto";
import { expect, test, type Page } from "@playwright/test";
import { cleanupRemembered, createUatAccount } from "./support/admin";
import { cleanScreenshot } from "./support/uat";

test.use({ trace: "off" });

const ROLES = [
  { role: "teacher1", email: "teacher1@example.test", label: "Employee" },
  { role: "manager1", email: "manager1@example.test", label: "Manager" },
  { role: "admin", email: "admin@example.test", label: "Administrator" },
] as const;

async function submitLogin(page: Page, email: string, password: string) {
  await page.goto("/login");
  await page.getByLabel("Email").fill(email);
  await page.getByLabel("Password", { exact: true }).fill(password);
  await page.getByRole("button", { name: "Sign in" }).click();
}

async function fillPasswords(page: Page, current: string, next: string, confirm = next) {
  await page.getByLabel("Current password").fill(current);
  await page.getByLabel("New password", { exact: true }).fill(next);
  await page.getByLabel("Confirm new password").fill(confirm);
}

for (const { role, email, label } of ROLES) {
  test.describe(`account page for ${role}`, () => {
    test.use({ storageState: `playwright/.auth/${role}.json` });

    test(`opens from the sidebar and shows the ${label.toLowerCase()} details read-only`, async ({ page }) => {
      await page.goto("/");
      await page.getByRole("link", { name: /^Account: / }).click();
      await expect(page).toHaveURL(/\/account$/);
      await expect(page.getByRole("heading", { level: 1, name: "Account" })).toBeVisible();
      const details = page.getByRole("definition");
      await expect(details.filter({ hasText: email })).toBeVisible();
      await expect(details.filter({ hasText: new RegExp(`^${label}$`) })).toBeVisible();
      // Ім'я й email лише для читання: полів, крім трьох паролів, на сторінці немає.
      await expect(page.locator("main input:not([type=hidden])")).toHaveCount(3);
      await expect(page.getByRole("button", { name: "Change password" })).toBeVisible();
      await cleanScreenshot(page, test.info().outputPath(`account-1280-${role}.png`));
    });
  });
}

// Два сценарії вимоги PM 07: AC-STAFF-16 (правильний поточний і новий пароль на 12 знаків) і AC-STAFF-17 (неправильний
// поточний). AC називають teacher1@example.test, але його пароль тримає UAT і інші тести, тож та сама поведінка — на
// одноразовому акаунті. AC ID у назвах з'являться після PR «Специфікація» на зріз 07 (інакше ac:coverage — ORPHAN).
test.describe("change own password", { tag: "@prod-writes" }, () => {
  test.afterEach(async () => {
    await cleanupRemembered();
  });

  test("correct current password and a 12-character new one: the change is confirmed, then only the new password signs in", async ({
    page,
  }) => {
    const user = await createUatAccount();
    const next = randomBytes(6).toString("hex");
    expect(next).toHaveLength(12);

    await submitLogin(page, user.email, user.password);
    await expect(page).not.toHaveURL(/\/login/);
    await page.goto("/account");

    await fillPasswords(page, user.password, next);
    await page.getByRole("button", { name: "Change password" }).click();
    await expect(page.getByText("Your password has been changed")).toBeVisible();
    await expect(page.getByLabel("Current password")).toHaveValue("");
    // Ця сесія лишається: сторінка після зміни відкривається без входу.
    await page.reload();
    await expect(page.getByRole("heading", { level: 1, name: "Account" })).toBeVisible();

    await page.getByRole("button", { name: "Sign out" }).click();
    await expect(page).toHaveURL(/\/login/);

    await submitLogin(page, user.email, user.password);
    await expect(page.getByText("Incorrect email or password.")).toBeVisible();

    await submitLogin(page, user.email, next);
    await expect(page).not.toHaveURL(/\/login/);
    await expect(page.getByTestId("user-email")).toHaveText(user.email);
  });

  test("wrong current password: the change is refused and the old password still signs in", async ({ page }) => {
    const user = await createUatAccount();

    await submitLogin(page, user.email, user.password);
    await expect(page).not.toHaveURL(/\/login/);
    await page.goto("/account");

    // Поля перевіряє форма ще до відправки (рішення розробника, ADR 0011).
    await fillPasswords(page, user.password, "short", "short");
    await page.getByRole("button", { name: "Change password" }).click();
    await expect(page.getByText("Use at least 8 characters.")).toBeVisible();

    await fillPasswords(page, `${user.password}-wrong`, `${user.password}-new`);
    await page.getByRole("button", { name: "Change password" }).click();
    await expect(page.getByText("The current password is incorrect")).toBeVisible();
    await expect(page.getByLabel("Current password")).toHaveAttribute("aria-invalid", "true");
    await expect(page.getByText("Your password has been changed")).toHaveCount(0);

    await page.getByRole("button", { name: "Sign out" }).click();
    await expect(page).toHaveURL(/\/login/);

    await submitLogin(page, user.email, user.password);
    await expect(page).not.toHaveURL(/\/login/);
    await expect(page.getByTestId("user-email")).toHaveText(user.email);
  });
});
