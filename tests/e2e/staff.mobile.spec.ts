// Працівники на телефоні 390 px (ADR 0008, DESIGN.md розділ 12; D13 openspec/changes/impl-staff-management/design.md):
// список карток, форма «Add employee» з карткою посилання (поле й «Copy link» одне під одним), сторінка працівника,
// сторінка пароля за посиланням. Світла й темна тема — лише токени; без прокрутки вбік; поля й кнопки — 44 px на дотику.
// Без AC ID: вигляд — за розробником (поведінку доводить staff.spec.ts). Знімки — у test-results/ (артефакт CI).
import { expect, test, type Page } from "@playwright/test";
import { roleContext } from "./support/cancel";
import { cleanupStaff, createEmployeeViaPage, staffEmail } from "./support/staff";
import { expectNoSidewaysScroll } from "./support/layout";
import { cleanScreenshot } from "./support/uat";

test.use({ trace: "off" });

test.afterAll(cleanupStaff);

for (const theme of ["light", "dark"] as const) {
  test(`employee pages on a 390 px phone, ${theme}`, { tag: ["@writes"] }, async ({ browser }) => {
    const view = { width: 390, height: 844, theme };
    const shot = (page: Page, name: string, fullPage = false) =>
      cleanScreenshot(page, test.info().outputPath(`ws11-staff-${name}-390-${theme}.png`), fullPage);
    const context = await roleContext(browser, "admin", view);
    const page = await context.newPage();
    const guestContext = await browser.newContext({
      storageState: { cookies: [], origins: [] },
      viewport: { width: view.width, height: view.height },
      colorScheme: theme,
      reducedMotion: "reduce",
    });
    await guestContext.addCookies([{ name: "theme", value: theme, url: test.info().project.use.baseURL! }]);
    const guest = await guestContext.newPage();
    try {
      const { id, url } = await createEmployeeViaPage(page, "Phone Person", staffEmail(`phone-${theme}`));
      const copy = page.getByRole("button", { name: "Copy link" });
      expect((await copy.boundingBox())!.height).toBeGreaterThanOrEqual(44);
      await expectNoSidewaysScroll(page);
      await shot(page, "new-link", true);

      await page.goto("/staff");
      await expect(page.getByTestId("staff-row").first()).toBeVisible();
      await expectNoSidewaysScroll(page);
      await shot(page, "list", true);

      await page.goto(`/staff/${id}`);
      await expect(page.getByRole("button", { name: "Deactivate" })).toBeVisible();
      await expectNoSidewaysScroll(page);
      await shot(page, "employee", true);

      await guest.goto(url);
      await expect(guest.getByTestId("set-password-form")).toBeVisible();
      const field = guest.getByLabel("New password", { exact: true });
      expect((await field.boundingBox())!.height).toBeGreaterThanOrEqual(44);
      await expectNoSidewaysScroll(guest);
      await shot(guest, "set-password");
    } finally {
      await context.close();
      await guestContext.close();
    }
  });
}
