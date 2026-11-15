// НЕГАТИВНІ КОНТРОЛІ — навмисно хибні очікування: показують, що наш UAT уміє падати. Не AC-тести: назви починаються
// з NC-, а не з AC ID, тож ac:coverage їх не рахує. У звичайному прогоні їх немає (проєкт chromium має grepInvert
// @negative-control); запуск: npm run uat:nc -- --url … (проєкт negative-controls). Лише читання: безпечно на проді.
//   NC-1 — у твердженні інший текст повідомлення AC-LEAVE-06 → перевірка падає → FAIL (R1), хоч би що сказав агент;
//   NC-2 — текст «Тоді» AC-LEAVE-19 «уточнено» (анотація ac-text), а тест і застосунок — ні → перевірки зелені, агент
//          звіряє кадр із новим текстом і не погоджується → NEEDS-HUMAN (R3).
//   NC-3 — зріз 3: AC-CAL-17 з навмисно зміненим порядком частин повідомлення (спершу «Staff day», потім «Winter
//          break») → перевірка падає → FAIL (R1). Пише на проді (два закриття «Дано» у вікнах дат AC) — тому, як і
//          @prod-writes у calendar.spec.ts, лише з SUPABASE_SECRET_KEY, з перевіркою «дати чисті» до і прибиранням за id
//          після.
import { expect, test } from "@playwright/test";
import { addClosure, assertCalendarClean, cleanupRemembered, hasAdminKey, rememberClosuresNamed } from "./support/admin";
import { clickDate, showNovember2026 } from "./support/calendar";
import { attachRuntimeErrors, given, thenStep, when } from "./support/uat";

const WRONG_NO_WORKING_HOURS = "You have no working hours on that day";
const OUTSIDE_SCHEDULE = "Hours must be within your schedule: 08:30–12:00, 12:30–15:30";
const CLARIFIED_OUTSIDE_SCHEDULE = "Hours must be within your schedule: 08:30–12:00 and 12:30–15:30";
// AC-CAL-17: частини — за датами перетину; тут навмисно навпаки.
const WRONG_ORDER_OVERLAPS = "2027-01-12 is already closed: Staff day, 2027-01-05 is already closed: Winter break";

test.afterEach(async ({ page }) => attachRuntimeErrors(page));

test.describe("teacher1@example.test", () => {
  test.use({ storageState: "playwright/.auth/teacher1.json" });

  test(
    "NC-1 (AC-LEAVE-06, deliberately wrong expectation in the test: another message text)",
    {
      tag: ["@negative-control"],
      annotation: [
        { type: "ac", description: "AC-LEAVE-06" },
        { type: "case", description: "NC-1" },
      ],
    },
    async ({ page }) => {
      await given("an employee whose position has no Saturday in its schedule (teacher1@example.test)", async () => {
        await page.goto("/requests/new");
        await showNovember2026(page);
      });
      await when("the employee tries to choose Saturday 2026-11-07", async () => {
        await page.getByRole("button", { name: /^Sat, 7 Nov 2026/ }).click();
      });
      await thenStep(
        page,
        {
          clause: 'the date is not accepted, and the employee sees the message "You have no working hours on this day".',
          visible: ["the message «You have no working hours on this day»"],
        },
        async () => {
          await expect(page.getByRole("main").getByRole("alert")).toHaveText(WRONG_NO_WORKING_HOURS, { timeout: 5_000 });
        },
      );
    },
  );
});

test.describe("teacher2@example.test", () => {
  test.use({ storageState: "playwright/.auth/teacher2.json" });

  test(
    "NC-2 (AC-LEAVE-19, the «Then» text was clarified in the requirement, the test and the app were not)",
    {
      tag: ["@negative-control"],
      annotation: [
        { type: "ac", description: "AC-LEAVE-19" },
        { type: "case", description: "NC-2" },
        {
          type: "ac-text",
          description: `AC-LEAVE-19: Given a position with the schedule blocks Tue 08:30–12:00 and 12:30–15:30. When the employee enters the hours 07:30–09:00 on 2026-11-03. Then no request is created, and the employee sees the message "${CLARIFIED_OUTSIDE_SCHEDULE}".`,
        },
      ],
    },
    async ({ page }) => {
      const position = page.getByRole("listitem").filter({ hasText: "Schedule: 08:30–12:00, 12:30–15:30" });
      await given("a position with the schedule blocks Tue 08:30–12:00 and 12:30–15:30 (teacher2@example.test)", async () => {
        await page.goto("/requests/new");
        await showNovember2026(page);
        await page.getByRole("button", { name: /^Tue, 3 Nov 2026/ }).click();
        await page.getByRole("button", { name: "Continue" }).click();
      });
      await when("the employee enters the hours 07:30–09:00 on 2026-11-03", async () => {
        await position.getByRole("button", { name: "Specific hours" }).click();
        await position.getByLabel("From").fill("07:30");
        await position.getByLabel("to", { exact: true }).fill("09:00");
        await page.getByRole("button", { name: "Continue" }).click();
      });
      await thenStep(
        page,
        {
          clause: `no request is created, and the employee sees the message "${CLARIFIED_OUTSIDE_SCHEDULE}".`,
          visible: [`the message «${CLARIFIED_OUTSIDE_SCHEDULE}»`],
        },
        async () => {
          // Тест не оновили разом із вимогою: перевіряє старий текст, і застосунок його показує.
          await expect(position.getByRole("alert")).toHaveText(OUTSIDE_SCHEDULE);
        },
      );
    },
  );
});

test.describe("admin@example.test", () => {
  test.use({ storageState: "playwright/.auth/admin.json" });

  let windowsClean = false;

  test.beforeEach(async () => {
    windowsClean = false;
    if (!hasAdminKey()) throw new Error("NC-3 створює закриття «Дано» — потрібен SUPABASE_SECRET_KEY (.env.local)");
    await assertCalendarClean();
    windowsClean = true;
  });

  test.afterEach(async () => {
    if (!hasAdminKey() || !windowsClean) return;
    for (const name of ["Winter break", "Staff day", "Extra break"]) await rememberClosuresNamed(name);
    await cleanupRemembered();
  });

  test(
    "NC-3 (AC-CAL-17, deliberately wrong expectation in the test: the message parts in the reverse order)",
    {
      tag: ["@negative-control"],
      annotation: [
        { type: "ac", description: "AC-CAL-17" },
        { type: "case", description: "NC-3" },
      ],
    },
    async ({ page }) => {
      await given('"Winter break" 2026-12-28 – 2027-01-08 and "Staff day" 2027-01-12', async () => {
        await addClosure("Winter break", "2026-12-28", "2027-01-08");
        await addClosure("Staff day", "2027-01-12", "2027-01-12");
      });
      await when('the administrator tries to add "Extra break" from 2027-01-05 to 2027-01-15', async () => {
        await page.goto("/calendar/manage");
        await expect(page.getByRole("heading", { level: 1, name: "Add closure" })).toBeVisible();
        await page.getByLabel("Name").fill("Extra break");
        await page.locator("label").filter({ hasText: "Whole days" }).click();
        await clickDate(page, "2027-01-05");
        await clickDate(page, "2027-01-15");
        await page.getByRole("button", { name: "Add closure" }).click();
      });
      await thenStep(
        page,
        {
          clause:
            'the closure is not saved, and the administrator sees the message "2027-01-05 is already closed: Winter break, 2027-01-12 is already closed: Staff day".',
          visible: ["the message «2027-01-05 is already closed: Winter break, 2027-01-12 is already closed: Staff day»"],
        },
        async () => {
          await expect(page.getByRole("main").getByRole("alert")).toHaveText(WRONG_ORDER_OVERLAPS, { timeout: 5_000 });
        },
      );
    },
  );
});
