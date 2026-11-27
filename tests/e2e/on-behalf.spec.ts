// UAT зрізу «заявка від імені працівника» (requirements/08-on-behalf-and-edit.md, AC-BEHALF-01, -02, -05, -11, -12, -14,
// -15; openspec/changes/archive/2026-11-27-impl-on-behalf/design.md, D10–D12). «Дано» — синтетичні працівники uat-<run>-…@example.test
// (менеджер основної посади — manager1@example.test, як у teacher1@; tests/e2e/support/on-behalf.ts), дати — вільні
// робочі дні від сьогодні. Створює й прибирає за собою секретним ключем — @prod-writes. AC-BEHALF-03, -04 і -13 (база)
// доводять тести PGlite (tests/db/on-behalf.test.ts): адміністратор, залишок і обхід сторінок — без нових станів
// сторінок; правка запису (AC-BEHALF-06…10) з'являється в «Decisions» на кроці 4 D9.
import { expect, test, type Page } from "@playwright/test";
import { adminClient, cleanupRemembered, hasAdminKey } from "./support/admin";
import { employeeContext, freeWeekdays, myRecordRow, openMyRequests, roleContext, type View } from "./support/cancel";
import {
  addAdditionalPosition,
  makeManager,
  nextSaturday,
  openOnBehalf,
  pickDate,
  toSickSummary,
  withoutManager1,
} from "./support/on-behalf";
import { weekEmployee } from "./support/substitutes";
import { attachRuntimeErrors, cleanScreenshot, given, thenStep, when } from "./support/uat";

const TAGS = { tag: ["@uat", "@prod-writes"] };

test.afterEach(async () => {
  if (hasAdminKey()) await cleanupRemembered();
});

/** Знімок стану для docs/img/ без накладок відео — у test-results/ (артефакт CI). */
async function shot(page: Page, name: string, view: View = { width: 1280, height: 800 }, fullPage = false) {
  await cleanScreenshot(page, test.info().outputPath(`behalf-${name}-${view.width}-${view.theme ?? "light"}.png`), fullPage);
}

async function statusesOf(employeeId: string) {
  const { data, error } = await adminClient()
    .from("leave_records")
    .select("status")
    .eq("employee_id", employeeId)
    .order("start_min");
  if (error) throw error;
  return (data ?? []).map((r) => r.status);
}

test.describe("submitting on behalf of an employee", () => {
  test(
    "AC-BEHALF-01: manager1@ submits Sick leave for the employee's main position — the employee sees Approved and who submitted it",
    { ...TAGS, annotation: { type: "ac", description: "AC-BEHALF-01" } },
    async ({ browser }) => {
      const employee = await weekEmployee();
      const [date] = await freeWeekdays(1, 1, 3);
      const context = await roleContext(browser, "manager1");
      const page = await context.newPage();
      const employeeCtx = await employeeContext(browser, employee);
      const employeePage = await employeeCtx.newPage();
      try {
        await given(`manager1@example.test is the manager of ${employee.email}'s main position (Mon–Fri 08:30–15:30)`, async () => {
          await page.goto("/on-behalf");
          await expect(page.getByRole("link", { name: "On behalf" })).toBeVisible();
          await shot(page, "list");
        });

        await when(`manager1@example.test submits on behalf of ${employee.email} Sick leave for the whole day ${date}`, async () => {
          await openOnBehalf(page, employee);
          await pickDate(page, date);
          await toSickSummary(page, date);
          await expect(page.getByTestId("status-after-submit")).toHaveText("Approved");
          await shot(page, "summary");
          await page.getByRole("button", { name: "Submit request" }).click();
          await expect(page.getByTestId("on-behalf-submitted")).toContainText("Request submitted: 1 approved");
          await shot(page, "submitted");
        });

        await thenStep(
          employeePage,
          {
            clause: `${employee.email} sees in "My requests" the record ${date} 08:30–15:30 "Sick leave" with status "Approved", and its history has the line "Submitted by manager1@example.test on behalf of ${employee.email}".`,
            visible: ["the record with status Approved in My requests", "the history line in Record details"],
          },
          async () => {
            await openMyRequests(employeePage, employee);
            const row = myRecordRow(employeePage, date);
            await expect(row).toContainText("Approved");
            await expect(row).toContainText("08:30–15:30");
            await expect(row).toContainText("Sick leave");
            await row.getByRole("button", { name: /^Actions for record/ }).click();
            await employeePage.getByRole("menuitem", { name: "View details" }).click();
            const dialog = employeePage.getByRole("dialog", { name: "Record details" });
            await expect(dialog).toContainText(`Submitted by manager1@example.test on behalf of ${employee.email}`);
            await shot(employeePage, "history");
          },
        );
      } finally {
        await attachRuntimeErrors(page);
        await context.close();
        await employeeCtx.close();
      }
    },
  );

  test(
    "AC-BEHALF-02: the main-position record is Approved, the additional one (another manager) awaits decision",
    { ...TAGS, annotation: { type: "ac", description: "AC-BEHALF-02" } },
    async ({ browser }) => {
      const employee = await weekEmployee();
      const [date] = await freeWeekdays(1, 1, 4);
      await addAdditionalPosition(employee, date);
      const context = await roleContext(browser, "manager1");
      const page = await context.newPage();
      try {
        await given(`${employee.email} has the main position (manager1@) and the additional one (manager2@) on ${date}`, async () => {
          await openOnBehalf(page, employee);
        });

        await when(`manager1@example.test submits on behalf of ${employee.email} the whole day ${date} for both positions`, async () => {
          await pickDate(page, date);
          await toSickSummary(page, date);
          await expect(page.getByTestId("status-after-submit")).toHaveText(["Approved", "Awaiting decision"]);
          await shot(page, "summary-two");
          await page.getByRole("button", { name: "Submit request" }).click();
        });

        await thenStep(
          page,
          {
            clause:
              'the main-position record has status "Approved", and the additional-position record has status "Awaiting decision" and is in manager2@example.test\'s "Awaiting decision" list.',
            visible: ["«Request submitted: 1 approved, 1 awaiting decision»"],
            hidden: ["the statuses of the two records in the database: approved (main), awaiting (additional)"],
          },
          async () => {
            await expect(page.getByTestId("on-behalf-submitted")).toContainText("Request submitted: 1 approved, 1 awaiting decision");
            expect(await statusesOf(employee.id)).toEqual(["approved", "awaiting"]);
          },
        );
      } finally {
        await attachRuntimeErrors(page);
        await context.close();
      }
    },
  );

  test(
    "AC-BEHALF-05: Saturday is not accepted — «This employee has no working hours on this day»",
    { ...TAGS, annotation: { type: "ac", description: "AC-BEHALF-05" } },
    async ({ browser }) => {
      const employee = await weekEmployee();
      const saturday = await nextSaturday();
      const context = await roleContext(browser, "manager1");
      const page = await context.newPage();
      try {
        await given(`${employee.email}'s position has no Saturday in its schedule`, async () => {
          await openOnBehalf(page, employee);
          await expect(page.getByText("Weekly schedule")).toBeVisible();
        });

        await when(`manager1@example.test tries to choose Saturday ${saturday}`, async () => {
          await pickDate(page, saturday);
        });

        await thenStep(
          page,
          {
            clause: 'the date is not accepted, and manager1@example.test sees the message "This employee has no working hours on this day".',
            visible: ["the message «This employee has no working hours on this day»", "no selected dates"],
          },
          async () => {
            const main = page.getByRole("main");
            await expect(main.getByRole("alert")).toHaveText("This employee has no working hours on this day");
            await expect(main.getByText("No dates yet — pick them in the calendar.")).toBeVisible();
            await shot(page, "saturday");
          },
        );
      } finally {
        await attachRuntimeErrors(page);
        await context.close();
      }
    },
  );
});

test.describe("who may submit on behalf", () => {
  test(
    "AC-BEHALF-11: manager1@ opens the request for an employee of no position of theirs — the AC message, no record",
    { ...TAGS, annotation: { type: "ac", description: "AC-BEHALF-11" } },
    async ({ browser }) => {
      const other = await weekEmployee();
      await withoutManager1(other);
      const context = await roleContext(browser, "manager1");
      const page = await context.newPage();
      try {
        await when(`manager1@example.test opens the request on behalf of ${other.email} by a direct link`, async () => {
          await page.goto(`/on-behalf/${other.id}`);
        });
        await thenStep(
          page,
          {
            clause: `manager1@example.test sees the message "You can submit requests only for employees of your positions", and no record of ${other.email} is created.`,
            visible: ["the AC message", "no email of the employee and no form"],
            hidden: ["no records of the employee in the database"],
          },
          async () => {
            await expect(page.getByRole("heading", { name: "You can submit requests only for employees of your positions" })).toBeVisible();
            await expect(page.getByRole("main")).not.toContainText(other.email);
            await expect(page.getByRole("button", { name: "Continue" })).toHaveCount(0);
            expect(await statusesOf(other.id)).toEqual([]);
            await shot(page, "not-yours");
          },
        );
      } finally {
        await attachRuntimeErrors(page);
        await context.close();
      }
    },
  );

  test(
    "AC-BEHALF-12: an employee opens the request on behalf of another employee — the AC message, no record",
    { ...TAGS, annotation: { type: "ac", description: "AC-BEHALF-12" } },
    async ({ browser }) => {
      const other = await weekEmployee();
      const context = await roleContext(browser, "teacher1");
      const page = await context.newPage();
      try {
        await given("teacher1@example.test is signed in and has only the employee role", async () => {
          await page.goto("/");
          await expect(page.getByTestId("user-email")).toHaveText("teacher1@example.test");
          await expect(page.getByRole("link", { name: "On behalf" })).toHaveCount(0);
        });
        await when(`teacher1@example.test opens the request on behalf of ${other.email} by a direct link`, async () => {
          await page.goto(`/on-behalf/${other.id}`);
        });
        await thenStep(
          page,
          {
            clause: `teacher1@example.test sees the message "Only a manager or an administrator can submit a request on behalf of an employee", and no record of ${other.email} is created.`,
            visible: ["the AC message", "no email and no form"],
            hidden: ["no records of the employee in the database"],
          },
          async () => {
            await expect(
              page.getByRole("heading", { name: "Only a manager or an administrator can submit a request on behalf of an employee" }),
            ).toBeVisible();
            await expect(page.getByRole("main")).not.toContainText(other.email);
            expect(await statusesOf(other.id)).toEqual([]);
            await shot(page, "employee");
          },
        );
        await page.goto("/on-behalf");
        await expect(
          page.getByRole("heading", { name: "Only a manager or an administrator can submit a request on behalf of an employee" }),
        ).toBeVisible();
      } finally {
        await context.close();
      }
    },
  );

  test(
    "AC-BEHALF-14: a visitor opens the request on behalf by a direct link — the sign-in page, no names or records",
    { ...TAGS, annotation: { type: "ac", description: "AC-BEHALF-14" } },
    async ({ browser }) => {
      const employee = await weekEmployee();
      const context = await browser.newContext({ storageState: { cookies: [], origins: [] } });
      const page = await context.newPage();
      try {
        await when("a visitor who is not signed in opens /on-behalf/<id> by a direct link", async () => {
          await page.goto(`/on-behalf/${employee.id}`);
        });
        await thenStep(
          page,
          {
            clause: "the visitor sees the sign-in page, and no names or records are shown.",
            visible: ["the sign-in page"],
            hidden: ["no email of the employee in the page"],
          },
          async () => {
            await expect(page).toHaveURL(/\/login/);
            await expect(page.locator("body")).not.toContainText(employee.email);
          },
        );
      } finally {
        await context.close();
      }
    },
  );

  test(
    "AC-BEHALF-15: a manager with no positions opens the request on behalf — «You have no employees to submit requests for»",
    { ...TAGS, annotation: { type: "ac", description: "AC-BEHALF-15" } },
    async ({ browser }) => {
      const manager = await weekEmployee();
      await makeManager(manager);
      const context = await employeeContext(browser, manager);
      const page = await context.newPage();
      try {
        await given(`${manager.email} is a manager but no position is assigned to them`, async () => {
          await page.goto("/");
          await expect(page.getByRole("link", { name: "On behalf" })).toBeVisible();
        });
        await when(`${manager.email} opens the request on behalf of an employee`, async () => {
          await page.getByRole("link", { name: "On behalf" }).click();
        });
        await thenStep(
          page,
          {
            clause: `${manager.email} sees the message "You have no employees to submit requests for".`,
            visible: ["the AC message, no list"],
          },
          async () => {
            await expect(page.getByRole("heading", { name: "You have no employees to submit requests for" })).toBeVisible();
            await expect(page.getByTestId("on-behalf-employee")).toHaveCount(0);
            await shot(page, "no-employees");
          },
        );
      } finally {
        await attachRuntimeErrors(page);
        await context.close();
      }
    },
  );
});
