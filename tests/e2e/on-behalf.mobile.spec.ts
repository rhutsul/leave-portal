// Заявка від імені на телефоні 360 і 390 px (ADR 0008, DESIGN.md розділ 12; D11 openspec/changes/archive/2026-11-27-impl-on-behalf/design.md):
// список працівників — картки зі стрілкою, форма нової заявки з банером «хто погоджує» і колонкою «Status after
// submit» у картці запису, відмова — EmptyState. Світла й темна тема — лише токени; без прокрутки вбік. Без AC ID:
// вигляд — за розробником (поведінку доводить on-behalf.spec.ts). Знімки — у test-results/ (артефакт CI). Дані —
// синтетичні працівники (@prod-writes, прибирання за id).
import { expect, test, type Page } from "@playwright/test";
import { cleanupRemembered, hasAdminKey } from "./support/admin";
import { freeWeekdays, roleContext } from "./support/cancel";
import { addAdditionalPosition, openOnBehalf, pickDate, toSickSummary, withoutManager1 } from "./support/on-behalf";
import { weekEmployee } from "./support/substitutes";
import { expectNoSidewaysScroll } from "./support/layout";
import { cleanScreenshot } from "./support/uat";

test.afterEach(async () => {
  if (hasAdminKey()) await cleanupRemembered();
});

for (const [width, theme] of [
  [390, "light"],
  [390, "dark"],
  [360, "light"],
] as const) {
  test(`on-behalf states on a ${width} px phone, ${theme}`, { tag: ["@prod-writes"] }, async ({ browser }) => {
    const view = { width, height: 844, theme };
    const shot = (page: Page, name: string, fullPage = false) =>
      cleanScreenshot(page, test.info().outputPath(`behalf-${name}-${width}-${theme}.png`), fullPage);
    const employee = await weekEmployee();
    const other = await weekEmployee();
    await withoutManager1(other);
    const [date] = await freeWeekdays(1, 1, 3);
    await addAdditionalPosition(employee, date);
    const context = await roleContext(browser, "manager1", view);
    const page = await context.newPage();
    try {
      await page.goto("/on-behalf");
      await page.getByLabel("Find an employee").fill(employee.email);
      await expect(page.getByTestId("on-behalf-employee")).toHaveCount(1);
      await expectNoSidewaysScroll(page);
      await shot(page, "list");

      await openOnBehalf(page, employee);
      await expectNoSidewaysScroll(page);
      await shot(page, "form");
      await pickDate(page, date);
      await toSickSummary(page, date);
      await expect(page.getByTestId("status-after-submit")).toHaveText(["Approved", "Awaiting decision"]);
      await expectNoSidewaysScroll(page);
      await shot(page, "summary", true);

      await page.goto(`/on-behalf/${other.id}`);
      await expect(page.getByRole("heading", { name: "You can submit requests only for employees of your positions" })).toBeVisible();
      await expectNoSidewaysScroll(page);
      await shot(page, "not-yours");
    } finally {
      await context.close();
    }
  });
}
