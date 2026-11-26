// Заміни на телефоні 390 px (ADR 0008, DESIGN.md розділ 12; D8 openspec/changes/impl-substitutes/design.md): поле
// «Substitute» на картці посади на всю ширину й 44 px на дотику, повідомлення порожнього списку, підсумок із
// позначкою підвищення, картки «My requests» і «My substitutions», редактор списку менеджера. Світла й темна тема —
// лише токени; без прокрутки вбік. Без AC ID: вигляд — за розробником (поведінку доводить substitutes.spec.ts).
// Знімки — у test-results/ (артефакт CI). Дані — синтетичні працівники (@prod-writes, прибирання за id).
import { expect, test, type Page } from "@playwright/test";
import { cleanupRemembered, hasAdminKey } from "./support/admin";
import { employeeContext, freeWeekdays, roleContext } from "./support/cancel";
import {
  chooseSubstitute,
  givenRecord,
  giveList,
  openPositionsStep,
  specificHours,
  toSummary,
  weekEmployee,
} from "./support/substitutes";
import { cleanScreenshot } from "./support/uat";
import { expectNoSidewaysScroll } from "./support/layout";

test.afterEach(async () => {
  if (hasAdminKey()) await cleanupRemembered();
});

for (const theme of ["light", "dark"] as const) {
  test(`substitutes states on a 390 px phone, ${theme}`, { tag: ["@prod-writes"] }, async ({ browser }) => {
    const view = { width: 390, height: 844, theme };
    const shot = (page: Page, name: string, fullPage = false) =>
      cleanScreenshot(page, test.info().outputPath(`subst-${name}-390-${theme}.png`), fullPage);
    const absent = await weekEmployee();
    const lonely = await weekEmployee();
    const assistant = await weekEmployee("Assistant");
    const teacher = await weekEmployee();
    await giveList(absent, [assistant, teacher]);
    const [requested, covered] = await freeWeekdays(2, 1, 5);
    await givenRecord(absent, { date: covered, start: 510, end: 720, status: "approved", substitute: assistant, upgrade: true });

    const context = await employeeContext(browser, absent, view);
    const page = await context.newPage();
    const lonelyContext = await employeeContext(browser, lonely, view);
    const lonelyPage = await lonelyContext.newPage();
    const assistantContext = await employeeContext(browser, assistant, view);
    const assistantPage = await assistantContext.newPage();
    const managerContext = await roleContext(browser, "manager1", view);
    const managerPage = await managerContext.newPage();
    try {
      // Нова заявка: поле «Substitute» на всю ширину картки, 44 px на дотику; відкритий список.
      await openPositionsStep(page, requested);
      await specificHours(page, "08:30", "12:00");
      const trigger = page.getByRole("combobox", { name: "Substitute" });
      const box = (await trigger.boundingBox())!;
      expect(box.height).toBeGreaterThanOrEqual(44);
      await trigger.click();
      await expect(page.getByRole("option")).toHaveCount(3);
      await shot(page, "options");
      await page.keyboard.press("Escape");
      await chooseSubstitute(page, assistant.email);
      await expectNoSidewaysScroll(page);
      await shot(page, "choose", true);
      await toSummary(page);
      await expect(page.getByRole("main").getByTestId("upgrade-mark")).toHaveText("With upgrade: 210 min");
      await expectNoSidewaysScroll(page);
      await shot(page, "summary", true);

      // Порожній список: повідомлення над картками кроку.
      await openPositionsStep(lonelyPage, requested);
      await expect(lonelyPage.getByTestId("substitutes-empty")).toBeVisible();
      await expectNoSidewaysScroll(lonelyPage);
      await shot(lonelyPage, "empty-list");

      // My requests: картка запису з заміною й позначкою.
      await page.goto("/requests");
      await expect(page.getByTestId("leave-record").getByTestId("upgrade-mark")).toHaveText("With upgrade: 210 min");
      await expectNoSidewaysScroll(page);
      await shot(page, "my-requests", true);

      // My substitutions: картка з датою, годинами, працівником і статусом.
      await assistantPage.goto("/substitutions");
      await expect(assistantPage.getByTestId("substitution")).toHaveCount(1);
      await expectNoSidewaysScroll(assistantPage);
      await shot(assistantPage, "my-substitutions", true);

      // Редактор списку менеджера: картки з «⋯», форма додавання під списком.
      await managerPage.goto(`/substitutes/${absent.id}`);
      await expect(managerPage.getByTestId("substitute-member")).toHaveCount(2);
      const add = (await managerPage.getByRole("button", { name: "Add to list" }).boundingBox())!;
      expect(add.height).toBeGreaterThanOrEqual(44);
      await expectNoSidewaysScroll(managerPage);
      await shot(managerPage, "editor", true);
    } finally {
      await context.close();
      await lonelyContext.close();
      await assistantContext.close();
      await managerContext.close();
    }
  });
}
