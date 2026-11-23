// Сторінка /account і зміна власного пароля (ADR 0011). Вимог PM до фічі ще немає (requirements/product.md, «later»),
// тож тести — без AC ID і без кроків «Дано / Тоді» UAT.
//
// Зміна пароля — на ОДНОРАЗОВОМУ користувачі (createUatAccount, секретний ключ): паролі демо-акаунтів, на яких
// тримаються інші тести й UAT, не змінюємо. Тест сам вводить паролі у форми, тож trace у цьому файлі вимкнено (у
// трасі були б значення полів); на відео поля пароля — крапки. Користувача видаляє afterEach, залишок назве teardown.
// Перегляд сторінки ролями — лише читання, на станах входу з auth.setup.ts; там же знімки для docs/img/ (390 і 1280 px)
// — у test-results/, звідки їх бере артефакт CI.
import { expect, test, type Page } from "@playwright/test";
import { cleanupRemembered, createUatAccount } from "./support/admin";

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
      await page.screenshot({ path: test.info().outputPath(`account-1280-${role}.png`) });
    });
  });
}

test.describe("change own password", { tag: "@prod-writes" }, () => {
  test.afterEach(async () => {
    await cleanupRemembered();
  });

  test("wrong current password is refused; after a change only the new password signs in", async ({ page }) => {
    const user = await createUatAccount();
    const next = `${user.password}-new`;

    await submitLogin(page, user.email, user.password);
    await expect(page).not.toHaveURL(/\/login/);
    await page.goto("/account");

    // Поля перевіряє форма до відправки.
    await fillPasswords(page, user.password, "short", "short");
    await page.getByRole("button", { name: "Change password" }).click();
    await expect(page.getByText("Use at least 8 characters.")).toBeVisible();

    // Неправильний поточний пароль — загальний текст під полем, пароль не змінено.
    await fillPasswords(page, `${user.password}-wrong`, next);
    await page.getByRole("button", { name: "Change password" }).click();
    await expect(page.getByText("Current password is incorrect.")).toBeVisible();
    await expect(page.getByLabel("Current password")).toHaveAttribute("aria-invalid", "true");

    await fillPasswords(page, user.password, next);
    await page.getByRole("button", { name: "Change password" }).click();
    await expect(page.getByText("Password changed")).toBeVisible();
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
});
