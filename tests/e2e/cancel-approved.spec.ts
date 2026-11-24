// UAT зрізу «скасування погодженого запису через менеджера» (requirements/09-cancel-approved.md, AC-CANCEL-01…13;
// openspec/changes/impl-cancel-approved/design.md). «Дано» — синтетичний працівник uat-<run>-…@example.test
// (менеджер посади — manager1@example.test, як у teacher1@) і дати відносно справжнього сьогодні: «today or later» і
// «in the past» лишаються правдою в будь-який день прогону (tests/e2e/support/cancel.ts). Створює й прибирає за собою
// секретним ключем — @prod-writes. AC-CANCEL-06, -07, -11 і -13 доводять тести PGlite (tests/db/leave-cancellation.test.ts):
// повтор прохання, розподіл, виклик в обхід сторінок і закриття дня — без сторінок.
import { expect, test, type Page } from "@playwright/test";
import { cleanupRemembered, hasAdminKey } from "./support/admin";
import {
  approvedRecord,
  cancelEmployee,
  cancelledWithNote,
  declinedRequest,
  employeeContext,
  freeWeekdays,
  myRecordRow,
  openMyRequests,
  openRequest,
  roleContext,
  type View,
} from "./support/cancel";
import { attachRuntimeErrors, cleanScreenshot, given, thenStep, when } from "./support/uat";

const TAGS = { tag: ["@uat", "@prod-writes"] };

test.afterEach(async () => {
  if (hasAdminKey()) await cleanupRemembered();
});

/** Панель запису менеджера: /decisions?record=<id>. */
async function openDecision(page: Page, recordId: number, tab: "awaiting" | "history" = "awaiting") {
  await page.goto(tab === "history" ? `/decisions?tab=history&record=${recordId}` : `/decisions?record=${recordId}`);
  const sheet = page.getByRole("dialog");
  await expect(sheet).toBeVisible();
  return sheet;
}

/** Знімок стану для docs/img/ без накладок відео — у test-results/ (артефакт CI). */
async function shot(page: Page, name: string, view: View = { width: 1280, height: 800 }) {
  await cleanScreenshot(page, test.info().outputPath(`cancel-${name}-${view.width}-${view.theme ?? "light"}.png`), false);
}

test.describe("cancelling an approved record through the manager", () => {
  test(
    "AC-CANCEL-01: the employee asks to cancel an approved record with «Plans changed»; the manager sees it in Awaiting decision",
    { ...TAGS, annotation: { type: "ac", description: "AC-CANCEL-01" } },
    async ({ browser }) => {
      const employee = await cancelEmployee();
      const [date] = await freeWeekdays(1, 1, 9);
      const recordId = await approvedRecord(employee, date);
      const context = await employeeContext(browser, employee);
      const page = await context.newPage();
      const managerContext = await roleContext(browser, "manager1");
      const managerPage = await managerContext.newPage();
      try {
        await given(`${employee.email} has an approved «Personal leave» record ${date} 08:30–15:30`, async () => {
          await openMyRequests(page, employee, "?status=approved");
          await expect(myRecordRow(page, date)).toContainText("Approved");
        });

        await when("the employee asks to cancel it with the reason «Plans changed»", async () => {
          await myRecordRow(page, date).getByRole("button", { name: /^Actions for record/ }).click();
          await page.getByRole("menuitem", { name: "Request cancellation" }).click();
          await expect(page.getByRole("heading", { level: 1, name: "Request cancellation" })).toBeVisible();
          await shot(page, "request-form");
          await page.getByLabel("Reason").fill("Plans changed");
          await page.getByRole("button", { name: "Request cancellation" }).click();
        });

        await thenStep(
          page,
          {
            clause: 'the employee sees the record with status "Approved" and the mark "Cancellation requested"',
            visible: ["the record in My requests: «Approved» and «Cancellation requested»"],
          },
          async () => {
            await expect(page.getByRole("main").getByText("Cancellation requested").first()).toBeVisible();
            const row = myRecordRow(page, date);
            await expect(row).toContainText("Approved");
            await expect(row.getByTestId("cancellation-mark")).toHaveText("Cancellation requested");
            await shot(page, "my-requests-requested");
          },
        );

        await thenStep(
          managerPage,
          {
            clause: 'manager1@example.test sees it in "Awaiting decision" with "Cancellation requested: Plans changed".',
            visible: ["the record in Awaiting decision with the mark", "«Cancellation requested: Plans changed» in the panel"],
          },
          async () => {
            await managerPage.goto("/decisions");
            const row = managerPage.getByTestId("decision-record").filter({ hasText: employee.fullName });
            await expect(row).toHaveCount(1);
            await expect(row.getByTestId("cancellation-mark")).toHaveText("Cancellation requested");
            await row.getByRole("link").click();
            const sheet = managerPage.getByRole("dialog");
            await expect(sheet.getByText("Cancellation requested: Plans changed")).toBeVisible();
            await expect(sheet.getByRole("button", { name: "Confirm cancellation" })).toBeVisible();
            await shot(managerPage, "decisions-request");
          },
        );
        expect(recordId).toBeGreaterThan(0);
      } finally {
        await attachRuntimeErrors(page);
        await context.close();
        await managerContext.close();
      }
    },
  );

  test(
    "AC-CANCEL-02: the manager confirms the cancellation — Cancelled, Personal leave used 3.00 → 2.00, remaining 15.00 → 16.00",
    { ...TAGS, annotation: { type: "ac", description: "AC-CANCEL-02" } },
    async ({ browser }) => {
      const employee = await cancelEmployee();
      const dates = await freeWeekdays(3, 1, 9);
      const [recordId] = await Promise.all(dates.map((d) => approvedRecord(employee, d)));
      await openRequest(employee, recordId, "Plans changed");
      const context = await employeeContext(browser, employee);
      const page = await context.newPage();
      const managerContext = await roleContext(browser, "manager1");
      const managerPage = await managerContext.newPage();
      const personal = page.getByRole("group", { name: "Personal leave left" });
      try {
        await given('the request from AC-CANCEL-01 and «Personal leave» shows used 3.00, remaining 15.00', async () => {
          await page.goto("/balances");
          await expect(personal).toContainText("3.00 of 18.00 used");
          await expect(personal).toContainText("15.00");
        });

        await when("manager1@example.test confirms the cancellation", async () => {
          const sheet = await openDecision(managerPage, recordId);
          await sheet.getByRole("button", { name: "Confirm cancellation" }).click();
          const dialog = managerPage.getByRole("dialog", { name: "Confirm the cancellation?" });
          await expect(dialog.getByText("The record becomes Cancelled and its days return to the balance.")).toBeVisible();
          await shot(managerPage, "confirm-dialog");
          await dialog.getByRole("button", { name: "Confirm cancellation" }).click();
          await expect(managerPage.getByText("The record is now Cancelled.")).toBeVisible();
        });

        await thenStep(
          page,
          {
            clause: 'the record has status "Cancelled", and «Personal leave» shows used 2.00, remaining 16.00.',
            visible: ["«Personal leave left» 16.00 days, «2.00 of 18.00 used»"],
            hidden: ["the record is «Cancelled» in My requests"],
          },
          async () => {
            await page.goto("/balances");
            await expect(personal).toContainText("2.00 of 18.00 used");
            await expect(personal).toContainText("16.00");
            await openMyRequests(page, employee, "?status=closed");
            await expect(myRecordRow(page, dates[0])).toContainText("Cancelled");
          },
        );
      } finally {
        await attachRuntimeErrors(page);
        await context.close();
        await managerContext.close();
      }
    },
  );

  test(
    "AC-CANCEL-03: the manager declines with «Exam week» — still Approved, the employee sees «Cancellation declined: Exam week»",
    { ...TAGS, annotation: { type: "ac", description: "AC-CANCEL-03" } },
    async ({ browser }) => {
      const employee = await cancelEmployee();
      const [date] = await freeWeekdays(1, 1, 9);
      const recordId = await approvedRecord(employee, date);
      await openRequest(employee, recordId, "Plans changed");
      const context = await employeeContext(browser, employee);
      const page = await context.newPage();
      const managerContext = await roleContext(browser, "manager1");
      const managerPage = await managerContext.newPage();
      try {
        await given("the request from AC-CANCEL-01", async () => {
          const sheet = await openDecision(managerPage, recordId);
          await expect(sheet.getByText("Cancellation requested: Plans changed")).toBeVisible();
        });

        await when("manager1@example.test declines it with the comment «Exam week»", async () => {
          const sheet = managerPage.getByRole("dialog");
          await sheet.getByRole("button", { name: "Add a comment for the employee" }).click();
          await sheet.getByLabel("Comment for the employee").fill("Exam week");
          await sheet.getByRole("button", { name: "Decline cancellation" }).click();
          await expect(managerPage.getByText("Cancellation declined").first()).toBeVisible();
        });

        await thenStep(
          page,
          {
            clause:
              'the record keeps status "Approved" without the mark "Cancellation requested", and teacher1@example.test sees "Cancellation declined: Exam week" on it.',
            visible: ["the record «Approved» with «Cancellation declined: Exam week» under the status"],
          },
          async () => {
            await openMyRequests(page, employee, "?status=approved");
            const row = myRecordRow(page, date);
            await expect(row).toContainText("Approved");
            await expect(row.getByTestId("cancellation-mark")).toHaveText("Cancellation declined: Exam week");
            await expect(row.getByText("Cancellation requested", { exact: true })).toHaveCount(0);
            await shot(page, "my-requests-declined");
          },
        );
      } finally {
        await attachRuntimeErrors(page);
        await context.close();
        await managerContext.close();
      }
    },
  );

  test(
    "AC-CANCEL-04: the manager declines without a comment — still requested, «Tell the employee why the cancellation is declined»",
    { ...TAGS, annotation: { type: "ac", description: "AC-CANCEL-04" } },
    async ({ browser }) => {
      const employee = await cancelEmployee();
      const [date] = await freeWeekdays(1, 1, 9);
      const recordId = await approvedRecord(employee, date);
      await openRequest(employee, recordId, "Plans changed");
      const managerContext = await roleContext(browser, "manager1");
      const managerPage = await managerContext.newPage();
      try {
        await given("the request from AC-CANCEL-01", async () => {
          await openDecision(managerPage, recordId);
        });

        await when("manager1@example.test declines it without a comment", async () => {
          await managerPage.getByRole("dialog").getByRole("button", { name: "Decline cancellation" }).click();
        });

        await thenStep(
          managerPage,
          {
            clause:
              'the record still shows "Cancellation requested", and manager1@example.test sees the message "Tell the employee why the cancellation is declined".',
            visible: ["the message under the comment field", "the mark «Cancellation requested» in the panel header"],
          },
          async () => {
            const sheet = managerPage.getByRole("dialog");
            await expect(sheet.getByText("Tell the employee why the cancellation is declined")).toBeVisible();
            await expect(sheet.getByTestId("cancellation-mark")).toHaveText("Cancellation requested");
            await shot(managerPage, "decline-error");
            await managerPage.reload();
            await expect(managerPage.getByRole("dialog").getByTestId("cancellation-mark")).toHaveText("Cancellation requested");
          },
        );
      } finally {
        await attachRuntimeErrors(managerPage);
        await managerContext.close();
      }
    },
  );

  test(
    "AC-CANCEL-05: a record in the past — no request, still Approved, «Records in the past cannot be cancelled»",
    { ...TAGS, annotation: { type: "ac", description: "AC-CANCEL-05" } },
    async ({ browser }) => {
      const employee = await cancelEmployee();
      const [past] = await freeWeekdays(1, -1, 2);
      const recordId = await approvedRecord(employee, past);
      const context = await employeeContext(browser, employee);
      const page = await context.newPage();
      try {
        await given(`${employee.email} has a record ${past} (in the past) with status "Approved"`, async () => {
          await openMyRequests(page, employee, "?status=approved");
          await expect(myRecordRow(page, past)).toContainText("Approved");
          // Пункту меню немає: запис у минулому.
          await myRecordRow(page, past).getByRole("button", { name: /^Actions for record/ }).click();
          await expect(page.getByRole("menuitem", { name: "Request cancellation" })).toHaveCount(0);
          await page.keyboard.press("Escape");
        });

        await when("the employee tries to ask to cancel it by the direct link", async () => {
          await page.goto(`/requests/${recordId}/cancel`);
        });

        await thenStep(
          page,
          {
            clause:
              'no cancellation is requested, the record keeps status "Approved", and the employee sees the message "Records in the past cannot be cancelled".',
            visible: ["the message «Records in the past cannot be cancelled»", "status «Approved»", "no Reason field"],
          },
          async () => {
            const main = page.getByRole("main");
            await expect(main.getByRole("alert")).toHaveText("Records in the past cannot be cancelled");
            await expect(main).toContainText("Approved");
            await expect(main.getByLabel("Reason")).toHaveCount(0);
            await shot(page, "past-error");
          },
        );
      } finally {
        await attachRuntimeErrors(page);
        await context.close();
      }
    },
  );

  test(
    "AC-CANCEL-08: the manager cancels with the note «Event moved to January» — Cancelled, the employee sees the note in My requests",
    { ...TAGS, annotation: { type: "ac", description: "AC-CANCEL-08" } },
    async ({ browser }) => {
      const employee = await cancelEmployee();
      const [date] = await freeWeekdays(1, 1, 9);
      const recordId = await approvedRecord(employee, date);
      const context = await employeeContext(browser, employee);
      const page = await context.newPage();
      const managerContext = await roleContext(browser, "manager1");
      const managerPage = await managerContext.newPage();
      try {
        await given(`${employee.email} has a record ${date} with status "Approved"`, async () => {
          const sheet = await openDecision(managerPage, recordId, "history");
          await expect(sheet.getByRole("button", { name: "Cancel record" })).toBeVisible();
        });

        await when("manager1@example.test cancels it with the note «Event moved to January»", async () => {
          await managerPage.getByRole("dialog").getByRole("button", { name: "Cancel record" }).click();
          const dialog = managerPage.getByRole("dialog", { name: "Cancel this record?" });
          await dialog.getByLabel("Note for the employee").fill("Event moved to January");
          await shot(managerPage, "cancel-with-note-dialog");
          await dialog.getByRole("button", { name: "Cancel record" }).click();
          await expect(managerPage.getByText("The record is now Cancelled.")).toBeVisible();
        });

        await thenStep(
          page,
          {
            clause: 'the record has status "Cancelled", and the employee sees the note "Event moved to January" on it in "My requests".',
            visible: ["the record «Cancelled» with «Manager: “Event moved to January”»"],
          },
          async () => {
            await openMyRequests(page, employee, "?status=closed");
            const row = myRecordRow(page, date);
            await expect(row).toContainText("Cancelled");
            await expect(row.getByTestId("cancellation-mark")).toHaveText("Manager: “Event moved to January”");
            await shot(page, "my-requests-note");
          },
        );
      } finally {
        await attachRuntimeErrors(page);
        await context.close();
        await managerContext.close();
      }
    },
  );

  test(
    "AC-CANCEL-09: the manager tries to cancel without a note — still Approved, «Tell the employee why the record is cancelled»",
    { ...TAGS, annotation: { type: "ac", description: "AC-CANCEL-09" } },
    async ({ browser }) => {
      const employee = await cancelEmployee();
      const [date] = await freeWeekdays(1, 1, 9);
      const recordId = await approvedRecord(employee, date);
      const managerContext = await roleContext(browser, "manager1");
      const managerPage = await managerContext.newPage();
      try {
        await given(`the record from AC-CANCEL-08 with status "Approved"`, async () => {
          await openDecision(managerPage, recordId, "history");
        });

        await when("manager1@example.test tries to cancel it without a note", async () => {
          await managerPage.getByRole("dialog").getByRole("button", { name: "Cancel record" }).click();
          await managerPage.getByRole("dialog", { name: "Cancel this record?" }).getByRole("button", { name: "Cancel record" }).click();
        });

        await thenStep(
          managerPage,
          {
            clause: 'the record keeps status "Approved", and manager1@example.test sees the message "Tell the employee why the record is cancelled".',
            visible: ["the message under the note field"],
            hidden: ["after reload the record is still «Approved»"],
          },
          async () => {
            const dialog = managerPage.getByRole("dialog", { name: "Cancel this record?" });
            await expect(dialog.getByText("Tell the employee why the record is cancelled")).toBeVisible();
            await shot(managerPage, "cancel-note-error");
            await managerPage.reload();
            await expect(managerPage.getByRole("dialog")).toContainText("Approved");
          },
        );
      } finally {
        await attachRuntimeErrors(managerPage);
        await managerContext.close();
      }
    },
  );

  test(
    "AC-CANCEL-10: teacher2@ opens the cancellation of another employee's record by a direct link — «You can cancel only your own records»",
    { ...TAGS, annotation: { type: "ac", description: "AC-CANCEL-10" } },
    async ({ browser }) => {
      const employee = await cancelEmployee();
      const [date] = await freeWeekdays(1, 1, 9);
      const recordId = await approvedRecord(employee, date);
      const context = await roleContext(browser, "teacher2");
      const page = await context.newPage();
      try {
        await given(`${employee.email} has a record ${date} with status "Approved"`, async () => {
          expect(recordId).toBeGreaterThan(0);
        });

        await when("teacher2@example.test opens the cancellation of that record by a direct link", async () => {
          await page.goto(`/requests/${recordId}/cancel`);
        });

        await thenStep(
          page,
          {
            clause:
              'teacher2@example.test sees the message "You can cancel only your own records", and the record keeps status "Approved" without a cancellation request.',
            visible: ["the message «You can cancel only your own records»", "no record data and no Reason field"],
          },
          async () => {
            const main = page.getByRole("main");
            await expect(main.getByRole("heading", { name: "You can cancel only your own records" })).toBeVisible();
            await expect(main.getByLabel("Reason")).toHaveCount(0);
            await expect(main).not.toContainText("08:30–15:30");
            await shot(page, "not-own");
          },
        );
      } finally {
        await attachRuntimeErrors(page);
        await context.close();
      }
    },
  );

  test(
    "AC-CANCEL-12: a visitor who is not signed in opens the cancellation of a record by a direct link — the sign-in page",
    { ...TAGS, annotation: { type: "ac", description: "AC-CANCEL-12" } },
    async ({ browser }) => {
      const employee = await cancelEmployee();
      const [date] = await freeWeekdays(1, 1, 9);
      const recordId = await approvedRecord(employee, date);
      const context = await browser.newContext({ storageState: { cookies: [], origins: [] } });
      const page = await context.newPage();
      try {
        await given("nobody is signed in", async () => {
          expect(recordId).toBeGreaterThan(0);
        });

        await when("a visitor opens the cancellation of a record by a direct link", async () => {
          await page.goto(`/requests/${recordId}/cancel`);
        });

        await thenStep(
          page,
          {
            clause: "the visitor sees the sign-in page, and no record is shown.",
            visible: ["the sign-in form"],
            hidden: ["no date of the record on the page"],
          },
          async () => {
            await expect(page).toHaveURL(/\/login/);
            await expect(page.getByRole("button", { name: "Sign in" })).toBeVisible();
            await expect(page.locator("body")).not.toContainText(date);
          },
        );
      } finally {
        await context.close();
      }
    },
  );
});

// Знімки нових станів у темній темі на 1280 px (D12): лише токени, тож вигляд має триматися без власних значень. Без
// AC ID — вигляд за розробником; поведінку доводять тести вище.
test("cancellation states at 1280 px in the dark theme", { tag: ["@prod-writes"] }, async ({ browser }) => {
  const view = { width: 1280, height: 800, theme: "dark" as const };
  const employee = await cancelEmployee();
  const [requested, declined, noted] = await freeWeekdays(3, 1, 9);
  const requestedId = await approvedRecord(employee, requested);
  const declinedId = await approvedRecord(employee, declined);
  const notedId = await approvedRecord(employee, noted);
  await openRequest(employee, requestedId, "Plans changed");
  await declinedRequest(declinedId, "Exam week");
  await cancelledWithNote(notedId, "Event moved to January");
  const context = await employeeContext(browser, employee, view);
  const page = await context.newPage();
  const managerContext = await roleContext(browser, "manager1", view);
  const managerPage = await managerContext.newPage();
  try {
    await openMyRequests(page, employee);
    await expect(myRecordRow(page, requested).getByTestId("cancellation-mark")).toHaveText("Cancellation requested");
    await expect(myRecordRow(page, declined).getByTestId("cancellation-mark")).toHaveText("Cancellation declined: Exam week");
    await expect(myRecordRow(page, noted).getByTestId("cancellation-mark")).toHaveText("Manager: “Event moved to January”");
    await shot(page, "my-requests", view);

    const sheet = await openDecision(managerPage, requestedId);
    await expect(sheet.getByText("Cancellation requested: Plans changed")).toBeVisible();
    await shot(managerPage, "decisions-request", view);
    await sheet.getByRole("button", { name: "Decline cancellation" }).click();
    await expect(sheet.getByText("Tell the employee why the cancellation is declined")).toBeVisible();
    await shot(managerPage, "decline-error", view);
  } finally {
    await context.close();
    await managerContext.close();
  }
});
