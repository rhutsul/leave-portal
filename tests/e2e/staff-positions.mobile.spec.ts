// Посади, редактор розкладу й заступники на телефоні 390 px (ADR 0008, DESIGN.md розділ 12; D13 impl-staff-management):
// форма «Add position» (день розкладу — блоком, поля на всю ширину), картка «Positions», сторінка «Deputies». Світла й
// темна тема — лише токени; без прокрутки вбік; поля й кнопки — 44 px на дотику. Без AC ID: вигляд — за розробником
// (поведінку доводять staff-positions.spec.ts і staff-deputies.spec.ts). Знімки — у test-results/ (артефакт CI).
import { expect, test, type Page } from "@playwright/test";
import { roleContext } from "./support/cancel";
import { expectNoSidewaysScroll } from "./support/layout";
import { cleanupStaff, createEmployeeViaPage, staffEmail } from "./support/staff";
import { cleanScreenshot } from "./support/uat";

test.use({ trace: "off" });

test.afterAll(cleanupStaff);

for (const theme of ["light", "dark"] as const) {
  test(`positions and deputies on a 390 px phone, ${theme}`, { tag: ["@writes"] }, async ({ browser }) => {
    const shot = (page: Page, name: string, fullPage = false) =>
      cleanScreenshot(page, test.info().outputPath(`ws11-staff-${name}-390-${theme}.png`), fullPage);
    const context = await roleContext(browser, "admin", { width: 390, height: 844, theme, touch: true });
    const page = await context.newPage();
    try {
      const { id } = await createEmployeeViaPage(page, "Phone Position", staffEmail(`pos-${theme}`));

      await page.goto(`/staff/${id}/positions/new`);
      await expect(page.getByTestId("position-form")).toBeVisible();
      const start = page.getByLabel("Mon period 1 start");
      expect((await start.boundingBox())!.height).toBeGreaterThanOrEqual(44);
      await expectNoSidewaysScroll(page);
      await shot(page, "position-new", true);

      await page.goto(`/staff/${id}`);
      await expect(page.getByTestId("positions-card")).toBeVisible();
      await expectNoSidewaysScroll(page);
      await shot(page, "employee-positions", true);

      await page.goto("/staff/deputies");
      await expect(page.getByTestId("assign-deputy-form")).toBeVisible();
      await expectNoSidewaysScroll(page);
      await shot(page, "deputies", true);
    } finally {
      await context.close();
    }
  });
}
