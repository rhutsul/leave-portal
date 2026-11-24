// Скасування погодженого запису на телефоні 390 px (ADR 0008, DESIGN.md розділ 12; D12
// openspec/changes/impl-cancel-approved/design.md): картка запису «My requests» з позначкою під статусом, форма
// прохання з кнопкою внизу екрана, панель запису менеджера на весь екран із смугою дій. Світла й темна тема — лише
// токени. Без AC ID: вигляд — за розробником (поведінку доводить cancel-approved.spec.ts). Знімки — у test-results/
// (артефакт CI). Дані — синтетичний працівник (@prod-writes, прибирання за id).
import { expect, test, type Page } from "@playwright/test";
import { cleanupRemembered, hasAdminKey } from "./support/admin";
import {
  approvedRecord,
  cancelEmployee,
  declinedRequest,
  employeeContext,
  freeWeekdays,
  myRecordRow,
  openRequest,
  roleContext,
  cancelledWithNote,
} from "./support/cancel";
import { cleanScreenshot } from "./support/uat";

test.afterEach(async () => {
  if (hasAdminKey()) await cleanupRemembered();
});

async function noSidewaysScroll(page: Page) {
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
  expect(overflow).toBeLessThanOrEqual(0);
}

for (const theme of ["light", "dark"] as const) {
  test(`cancellation states on a 390 px phone, ${theme}`, { tag: ["@prod-writes"] }, async ({ browser }) => {
    const view = { width: 390, height: 844, theme };
    const employee = await cancelEmployee();
    const [requested, declined, noted, free] = await freeWeekdays(4, 1, 9);
    const requestedId = await approvedRecord(employee, requested);
    const declinedId = await approvedRecord(employee, declined);
    const notedId = await approvedRecord(employee, noted);
    await approvedRecord(employee, free);
    await openRequest(employee, requestedId, "Plans changed");
    await declinedRequest(declinedId, "Exam week");
    await cancelledWithNote(notedId, "Event moved to January");

    const context = await employeeContext(browser, employee, view);
    const page = await context.newPage();
    const managerContext = await roleContext(browser, "manager1", view);
    const managerPage = await managerContext.newPage();
    try {
      // My requests: картки з позначкою, відхиленням і приміткою під статусом.
      await page.goto("/requests");
      await expect(myRecordRow(page, requested).getByTestId("cancellation-mark")).toHaveText("Cancellation requested");
      await expect(myRecordRow(page, declined).getByTestId("cancellation-mark")).toHaveText("Cancellation declined: Exam week");
      await expect(myRecordRow(page, noted).getByTestId("cancellation-mark")).toHaveText("Manager: “Event moved to January”");
      await noSidewaysScroll(page);
      await cleanScreenshot(page, test.info().outputPath(`cancel-my-requests-390-${theme}.png`), true);

      // Форма прохання: кнопка «Request cancellation» прикріплена внизу екрана.
      await myRecordRow(page, free).getByRole("button", { name: /^Actions for record/ }).click();
      await page.getByRole("menuitem", { name: "Request cancellation" }).click();
      await expect(page.getByRole("heading", { level: 1, name: "Request cancellation" })).toBeVisible();
      await page.getByRole("button", { name: "Request cancellation" }).click();
      await expect(page.getByText("Tell the manager why you want to cancel the record")).toBeVisible();
      const submit = (await page.getByRole("button", { name: "Request cancellation" }).boundingBox())!;
      expect(submit.y + submit.height).toBeGreaterThan(844 - 120);
      expect(submit.height).toBeGreaterThanOrEqual(44);
      await noSidewaysScroll(page);
      await cleanScreenshot(page, test.info().outputPath(`cancel-request-form-390-${theme}.png`));

      // Панель менеджера на весь екран: прохання, смуга дій унизу, діалог підтвердження.
      await managerPage.goto(`/decisions?record=${requestedId}`);
      const sheet = managerPage.getByRole("dialog");
      await expect(sheet.getByText("Cancellation requested: Plans changed")).toBeVisible();
      const confirm = (await sheet.getByRole("button", { name: "Confirm cancellation" }).boundingBox())!;
      expect(confirm.height).toBeGreaterThanOrEqual(44);
      await cleanScreenshot(managerPage, test.info().outputPath(`cancel-decisions-sheet-390-${theme}.png`));
      await sheet.getByRole("button", { name: "Confirm cancellation" }).click();
      await expect(managerPage.getByRole("dialog", { name: "Confirm the cancellation?" })).toBeVisible();
      await cleanScreenshot(managerPage, test.info().outputPath(`cancel-confirm-dialog-390-${theme}.png`));
    } finally {
      await context.close();
      await managerContext.close();
    }
  });
}
