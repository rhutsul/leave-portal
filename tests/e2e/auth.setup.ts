// Вхід кожної ролі один раз за прогін → playwright/.auth/<role>.json (у .gitignore: там живі cookie сесії).
// Тести ролей беруть стан через test.use({ storageState: "playwright/.auth/<role>.json" }).
// У цьому проєкті запис вимкнено (playwright.config.ts: setup — video, trace і screenshot "off"): тут вводиться пароль.
//
// Змінні з паролями (лише назви; значення — у .env.local локально або в secrets CI, ніколи в коді):
//   DEMO_USER_PASSWORD           — спільний пароль акаунтів із supabase/demo-users.json (npm run users:demo);
//   UAT_PASSWORD_<РОЛЬ>          — необов'язково: окремий пароль для ролі, напр. UAT_PASSWORD_ADMIN.
//
// Джерело: матеріали курсу WS8 (materials/uat/tests/e2e/auth.setup.ts). ROLES — наші акаунти на проді
// (supabase/demo-users.json, accounts.zip): два працівники для AC зрізу 1 і адміністратор, який лише читає —
// дає id другого працівника для прямого посилання в AC-BALANCE-13.
import { expect, test as setup } from "@playwright/test";
import { signIn } from "./support/uat";

const ROLES = {
  teacher1: "teacher1@example.test",
  teacher2: "teacher2@example.test",
  admin: "admin@example.test",
} as const;

for (const [role, email] of Object.entries(ROLES)) {
  setup(`вхід: ${role}`, async ({ page }) => {
    const password = process.env[`UAT_PASSWORD_${role.toUpperCase()}`] ?? process.env.DEMO_USER_PASSWORD;
    expect(password, `немає пароля для ролі ${role}: DEMO_USER_PASSWORD або UAT_PASSWORD_${role.toUpperCase()}`).toBeTruthy();
    await signIn(page, email, password!);
    // Бокова навігація показує email того, хто увійшов (data-testid="user-email").
    await expect(page.getByTestId("user-email")).toHaveText(email);
    await page.context().storageState({ path: `playwright/.auth/${role}.json` });
  });
}
