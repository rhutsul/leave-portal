// UAT правки запису до рішення в «Decisions» (requirements/08-on-behalf-and-edit.md, AC-BEHALF-06…10; крок 4 D9,
// D10–D12 openspec/changes/archive/2026-11-27-impl-on-behalf/design.md). «Дано» — синтетичний працівник uat-<run>-…@example.test з
// розкладом пн–пт 08:30–15:30 (менеджер основної посади — manager1@example.test, як у teacher1@) і заміна з його
// списку; AC називають teacher1@, teacher2@ і дати 2026-12-03 / 2026-12-04 — беремо вільні робочі дні від сьогодні, щоб
// «Дано» було правдою в будь-який день прогону. Записи пишемо секретним ключем, як їх пише submit_leave_request, і
// прибираємо за собою — @prod-writes. AC-BEHALF-13 (в обхід сторінок) — запит до Data API сесією manager2@ тут і PGlite
// (tests/db/on-behalf.test.ts).
import { expect, test, type Browser, type Page } from "@playwright/test";
import { formatDateLong } from "../../src/lib/leave/time";
import { addRecord, adminClient, cleanupRemembered, hasAdminKey, type UatEmployee } from "./support/admin";
import { employeeContext, freeWeekdays, myRecordRow, openMyRequests, roleContext, type View } from "./support/cancel";
import { asRole } from "./support/direct";
import { expectNoSidewaysScroll } from "./support/layout";
import { pickDate } from "./support/on-behalf";
import { giveList, weekEmployee } from "./support/substitutes";
import { attachRuntimeErrors, cleanScreenshot, given, thenStep, when } from "./support/uat";

const TAGS = { tag: ["@uat", "@prod-writes"] };
const WHOLE = { start: 510, end: 930 };

test.afterEach(async () => {
  if (hasAdminKey()) await cleanupRemembered();
});

async function shot(page: Page, name: string, view: View = { width: 1280, height: 800 }) {
  await cleanScreenshot(page, test.info().outputPath(`behalf-edit-${name}-${view.width}-${view.theme ?? "light"}.png`));
}

/** Запис «Awaiting decision» працівника на `date` 08:30–15:30 — як після submit_leave_request. */
function awaiting(employee: UatEmployee, date: string, leaveType: "sick" | "personal" = "sick", status = "awaiting") {
  return addRecord(employee.email, { date, ...WHOLE, leaveType, status });
}

/** Панель запису в «Decisions» і форма правки в ній. */
async function openEdit(page: Page, recordId: number) {
  await page.goto(`/decisions?record=${recordId}`);
  const panel = page.getByRole("dialog");
  await panel.getByRole("link", { name: "Edit record" }).click();
  await expect(panel.getByRole("region", { name: "Edit record" })).toBeVisible();
  return panel;
}

async function save(panel: ReturnType<Page["getByRole"]>) {
  await panel.getByRole("button", { name: "Save changes" }).click();
}

/** Рядок історії, як його бачить працівник у «My requests» → «View details». */
async function employeeHistory(page: Page, employee: UatEmployee, date: string) {
  await openMyRequests(page, employee);
  const row = myRecordRow(page, date);
  await row.getByRole("button", { name: /^Actions for record/ }).click();
  await page.getByRole("menuitem", { name: "View details" }).click();
  return page.getByRole("dialog", { name: "Record details" });
}

async function contexts(browser: Browser, employee: UatEmployee, view?: View) {
  const manager = await roleContext(browser, "manager1", view);
  const worker = await employeeContext(browser, employee, view);
  return { page: await manager.newPage(), employeePage: await worker.newPage(), close: () => Promise.all([manager.close(), worker.close()]) };
}

test.describe("changing a record before the decision", () => {
  test(
    "AC-BEHALF-06: manager1@ moves the awaiting record to the next working day — the employee sees the date line in its history",
    { ...TAGS, annotation: { type: "ac", description: "AC-BEHALF-06" } },
    async ({ browser }) => {
      const employee = await weekEmployee();
      const [from, to] = await freeWeekdays(2, 1, 3);
      const id = await awaiting(employee, from);
      const { page, employeePage, close } = await contexts(browser, employee);
      try {
        await given(`${employee.email} has a record ${from} "Sick leave" 08:30–15:30 with status "Awaiting decision" of manager1@example.test's position`, async () => {
          await page.goto(`/decisions?record=${id}`);
          await expect(page.getByRole("dialog").getByRole("link", { name: "Edit record" })).toBeVisible();
          await shot(page, "record");
        });

        await when(`manager1@example.test changes its date to ${to}`, async () => {
          const panel = await openEdit(page, id);
          await shot(page, "form");
          await panel.getByTestId("date-field").click();
          await pickDate(page, to);
          await save(panel);
        });

        await thenStep(
          employeePage,
          {
            clause: `the record shows ${to} 08:30–15:30 with status "Awaiting decision", and ${employee.email} sees in its history the line "manager1@example.test changed the date: ${from} → ${to}".`,
            visible: ["Record updated and the new date in the Decisions panel", "the history line in Record details"],
          },
          async () => {
            const panel = page.getByRole("dialog");
            await expect(panel.getByRole("status").filter({ hasText: "Record updated" })).toBeVisible();
            await expect(panel.getByRole("region", { name: "Record" })).toContainText(formatDateLong(to));
            await expect(panel).toContainText("Awaiting decision");
            await shot(page, "saved");
            const details = await employeeHistory(employeePage, employee, to);
            await expect(details).toContainText(`manager1@example.test changed the date: ${from} → ${to}`);
          },
        );
      } finally {
        await attachRuntimeErrors(page);
        await close();
      }
    },
  );

  test(
    "AC-BEHALF-07: manager1@ changes Sick leave to Personal leave — the history has the leave type line",
    { ...TAGS, annotation: { type: "ac", description: "AC-BEHALF-07" } },
    async ({ browser }) => {
      const employee = await weekEmployee();
      const [date] = await freeWeekdays(1, 1, 3);
      const id = await awaiting(employee, date);
      const { page, employeePage, close } = await contexts(browser, employee);
      try {
        await given(`the record ${date} with type "Sick leave"`, async () => {
          await page.goto(`/decisions?record=${id}`);
        });

        await when('manager1@example.test changes its leave type to "Personal leave"', async () => {
          const panel = await openEdit(page, id);
          await panel.getByLabel("Leave type").click();
          await page.getByRole("option", { name: "Personal leave" }).click();
          await save(panel);
        });

        await thenStep(
          employeePage,
          {
            clause: 'the record shows "Personal leave", and its history has the line "manager1@example.test changed the leave type: Sick leave → Personal leave".',
            visible: ["Personal leave in the Decisions panel", "the history line in Record details"],
          },
          async () => {
            const panel = page.getByRole("dialog");
            await expect(panel.getByRole("region", { name: "Record" })).toContainText("Personal leave");
            await expect(panel.getByRole("region", { name: "History" })).toContainText(
              "manager1@example.test changed the leave type: Sick leave → Personal leave",
            );
            const details = await employeeHistory(employeePage, employee, date);
            await expect(details).toContainText("manager1@example.test changed the leave type: Sick leave → Personal leave");
          },
        );
      } finally {
        await attachRuntimeErrors(page);
        await close();
      }
    },
  );

  test(
    "AC-BEHALF-08: manager1@ sets a substitute from the employee's list — the history has the substitute line",
    { ...TAGS, annotation: { type: "ac", description: "AC-BEHALF-08" } },
    async ({ browser }) => {
      const employee = await weekEmployee();
      const substitute = await weekEmployee();
      await giveList(employee, [substitute]);
      const [date] = await freeWeekdays(1, 1, 3);
      const id = await awaiting(employee, date);
      const { page, employeePage, close } = await contexts(browser, employee);
      try {
        await given(`a record ${date} 08:30–15:30 "Awaiting decision" with no substitute, and ${substitute.email} is on the employee's substitute list`, async () => {
          await page.goto(`/decisions?record=${id}`);
        });

        await when(`manager1@example.test sets the substitute ${substitute.email}`, async () => {
          const panel = await openEdit(page, id);
          await panel.getByLabel("Substitute").click();
          await page.getByRole("option", { name: substitute.email }).click();
          await save(panel);
        });

        await thenStep(
          employeePage,
          {
            clause: `the record shows the substitute ${substitute.email}, and its history has the line "manager1@example.test changed the substitute: No substitute → ${substitute.email}".`,
            visible: ["the substitute in the Decisions panel", "the history line in Record details"],
          },
          async () => {
            const panel = page.getByRole("dialog");
            await expect(panel.getByRole("region", { name: "Record" })).toContainText(substitute.email);
            const details = await employeeHistory(employeePage, employee, date);
            await expect(details).toContainText(`manager1@example.test changed the substitute: No substitute → ${substitute.email}`);
          },
        );
      } finally {
        await attachRuntimeErrors(page);
        await close();
      }
    },
  );

  test(
    "AC-BEHALF-09: hours 16:00–17:00 outside the Fri 08:30–15:30 schedule are not saved — the message names the schedule",
    { ...TAGS, annotation: { type: "ac", description: "AC-BEHALF-09" } },
    async ({ browser }) => {
      const employee = await weekEmployee();
      const [date] = await freeWeekdays(1, 1, 3);
      const id = await awaiting(employee, date);
      const { page, employeePage, close } = await contexts(browser, employee);
      try {
        await given(`a record ${date} of a position with the schedule 08:30–15:30 and status "Awaiting decision"`, async () => {
          await page.goto(`/decisions?record=${id}`);
        });

        await when("manager1@example.test changes its hours to 16:00–17:00", async () => {
          const panel = await openEdit(page, id);
          await panel.getByRole("button", { name: "Specific hours" }).click();
          await panel.getByLabel("From").fill("16:00");
          await panel.getByLabel("to", { exact: true }).fill("17:00");
          await save(panel);
        });

        await thenStep(
          page,
          {
            clause: 'the change is not saved, and manager1@example.test sees the message "Hours must be within the schedule: 08:30–15:30".',
            visible: ["the message above the form and at the hours field"],
          },
          async () => {
            const panel = page.getByRole("dialog");
            await expect(panel.getByRole("alert")).toHaveText("Hours must be within the schedule: 08:30–15:30");
            // Введене лишається, поле годин — з помилкою.
            await expect(panel.getByLabel("From")).toHaveValue("16:00");
            await expect(panel.getByLabel("From")).toHaveAttribute("aria-invalid", "true");
            await shot(page, "hours-error");
            await openMyRequests(employeePage, employee);
            await expect(myRecordRow(employeePage, date)).toContainText("08:30–15:30");
          },
        );
      } finally {
        await attachRuntimeErrors(page);
        await close();
      }
    },
  );

  test(
    "AC-BEHALF-10: a record approved meanwhile cannot be changed — the message says it is already decided",
    { ...TAGS, annotation: { type: "ac", description: "AC-BEHALF-10" } },
    async ({ browser }) => {
      const employee = await weekEmployee();
      const [from, to] = await freeWeekdays(2, 1, 3);
      const id = await awaiting(employee, from);
      const { page, employeePage, close } = await contexts(browser, employee);
      try {
        let panel!: ReturnType<Page["getByRole"]>;
        await given(`a record of ${employee.email} with status "Approved"`, async () => {
          // Форма відкрита, поки запис чекав; погоджує його інший менеджер у фоні (кнопки правки в погодженого немає).
          panel = await openEdit(page, id);
          const { error } = await adminClient().from("leave_records").update({ status: "approved" }).eq("id", id);
          if (error) throw error;
        });

        await when("manager1@example.test tries to change its date", async () => {
          await panel.getByTestId("date-field").click();
          await pickDate(page, to);
          await save(panel);
        });

        await thenStep(
          page,
          {
            clause: 'the change is not saved, and manager1@example.test sees the message "This record is already decided and cannot be changed".',
            visible: ["the message above the form"],
          },
          async () => {
            await expect(panel.getByRole("alert")).toHaveText("This record is already decided and cannot be changed");
            await shot(page, "decided");
            await openMyRequests(employeePage, employee);
            await expect(myRecordRow(employeePage, from)).toContainText("Approved");
          },
        );
      } finally {
        await attachRuntimeErrors(page);
        await close();
      }
    },
  );
});

/** Дата, години, тип, заміна й кількість рядків історії запису (читає секретний ключ; FK названо — PGRST201). */
async function recordSnapshot(id: number) {
  const { data, error } = await adminClient()
    .from("leave_records")
    .select("date, start_min, end_min, leave_type, substitute_id, leave_record_events!leave_record_events_record_id_fkey(count)")
    .eq("id", id)
    .single();
  if (error) throw error;
  return data;
}

test.describe("changing a record bypassing the pages", () => {
  test(
    "AC-BEHALF-13: manager2@ changes the date of a main-position record through the Data API — refused, nothing changes",
    { ...TAGS, annotation: { type: "ac", description: "AC-BEHALF-13" } },
    async () => {
      const employee = await weekEmployee();
      const [from, to] = await freeWeekdays(2, 1, 3);
      const id = await awaiting(employee, from);
      const snapshot = () => recordSnapshot(id);
      const before = await snapshot();

      await when(`manager2@example.test changes the date of the record to ${to} directly, bypassing the portal's pages`, async () => {
        const rpc = await asRole("manager2", "rpc/edit_leave_record", {
          method: "POST",
          body: { p_record_id: id, p_date: to, p_start_min: 510, p_end_min: 930, p_leave_type: "sick", p_relationship: null, p_substitute_id: null },
        });
        expect(rpc).toMatchObject({ code: "42501", message: "You can't change this record" });
        const patch = await asRole("manager2", `leave_records?id=eq.${id}`, { method: "PATCH", body: { date: to } });
        expect(patch.code).toBe("42501");
      });

      // «Тоді» — дата, години, тип, заміна й кількість рядків історії ті самі (читає секретний ключ).
      expect(await snapshot()).toEqual(before);
    },
  );
});

test.describe("edit form screenshots for docs/img", () => {
  for (const view of [
    { width: 390, height: 844, theme: "light", touch: true },
    { width: 390, height: 844, theme: "dark", touch: true },
    { width: 1280, height: 800, theme: "light" },
    { width: 1280, height: 800, theme: "dark" },
  ] satisfies View[]) {
    test(`the edit form at ${view.width} px, ${view.theme} theme`, { tag: ["@prod-writes"] }, async ({ browser }) => {
      const employee = await weekEmployee();
      const [date] = await freeWeekdays(1, 1, 3);
      const id = await awaiting(employee, date);
      const { page, close } = await contexts(browser, employee, view);
      try {
        await openEdit(page, id);
        await expect(page.getByRole("button", { name: "Save changes" })).toBeVisible();
        await shot(page, "form", view);
        // Панель (на телефоні — на весь екран) без бічної прокрутки сторінки.
        await expectNoSidewaysScroll(page);
      } finally {
        await close();
      }
    });
  }
});
