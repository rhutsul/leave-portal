// UAT шкільного календаря (openspec/specs/school-calendar/spec.md, AC-CAL-01 … AC-CAL-15): один AC — один test,
// «Тоді» — дослівно з AC PM (requirements/04-school-calendar.md), невидиме — твердженнями й у hidden.
//
// Дані. AC називають teacher1@example.test, manager1@example.test і закриття «Winter break» 2026-12-28 – 2027-01-08 /
// «Teachers' meeting» 2026-11-20 з 12:00 — для всієї школи. Тому тести з тегом @prod-writes (рішення людини 08.11):
//   * перед тестом перевіряють, що на датах AC немає чужих закриттів і чинних записів (assertCalendarClean), інакше
//     зупиняються, нічого не змінивши;
//   * дані «Дано» створюють секретним ключем (tests/e2e/support/admin.ts), а все створене — і в «Дано», і на
//     сторінках — видаляють за id в afterEach; teardown cleanup після прогону перевіряє, що нічого не лишилось.
// @prod-writes вибирається лише з SUPABASE_SECRET_KEY (playwright.config.ts): на проді з .env.local розробника і в
// CI на одноразовому Supabase. AC-CAL-12 і AC-CAL-15 лише читають (@uat).
import { expect, test, type Page } from "@playwright/test";
import {
  addClosure,
  addRecord,
  assertCalendarClean,
  cleanupRemembered,
  hasAdminKey,
  rememberClosuresNamed,
  rememberRequestsOn,
} from "./support/admin";
import { showMonth } from "./support/calendar";
import { asRole } from "./support/direct";
import { attachRuntimeErrors, given, thenStep, when } from "./support/uat";

const WRITES = { tag: ["@uat", "@prod-writes"] };
const ac = (id: string) => ({ annotation: { type: "ac", description: id } });

const TEACHER1 = "teacher1@example.test";
const NOON = 12 * 60;
const WHOLE_DAY = { start: 8 * 60 + 30, end: 15 * 60 + 30 };

// Тести з записом: перевірка «чисто» до і прибирання після (навіть якщо тест упав). Прибираємо лише тоді, коли
// перевірка пройшла: Playwright виконує afterEach і після помилки в beforeEach, а тоді рядки у вікнах AC — чужі.
let windowsClean = false;

test.beforeEach(async ({}, info) => {
  windowsClean = false;
  if (!info.tags.includes("@prod-writes")) return;
  await assertCalendarClean();
  windowsClean = true;
});

test.afterEach(async ({ page }, info) => {
  await attachRuntimeErrors(page);
  if (!info.tags.includes("@prod-writes") || !hasAdminKey() || !windowsClean) return;
  for (const name of ["Winter break", "Teachers' meeting", "Staff day"]) await rememberClosuresNamed(name);
  for (const date of ["2026-11-20", "2026-11-27", "2026-12-29"]) await rememberRequestsOn(TEACHER1, date);
  await cleanupRemembered();
});

/** «N of M used» на картці балансу: використані дні N. */
function usedDays(cardText: string): number {
  const m = /(?:^|[^\d.])(\d+\.\d{2}) of [\d.]+ used/.exec(cardText);
  if (!m) throw new Error(`на картці балансу немає «… of … used»: ${cardText}`);
  return Number(m[1]);
}

/**
 * Стартове «used» для AC-CAL-06. Локально й у CI (одноразова база, у teacher1 немає лікарняних) — рівно 0.00, як у
 * «Дано» AC; на проді (UAT_BASE_URL) там можуть бути справжні погоджені лікарняні — тоді лише запам'ятовуємо значення.
 */
function expectStartUsed(used: number) {
  if (process.env.UAT_BASE_URL) return;
  expect(used, "«Дано» AC-CAL-06: Sick leave used 0.00").toBe(0);
}

/** Шаблон «N of … used» для точного числа днів (не збігається з частиною більшого числа). */
const usedPattern = (days: number) =>
  new RegExp(String.raw`(^|[^\d.])` + days.toFixed(2).replace(".", "\\.") + String.raw` of [\d.]+ used`);

/** Рядок закриття в таблиці «School calendar» (картка на телефоні). */
const closureRow = (page: Page, name: string) => page.getByTestId("closure").filter({ hasText: name });

async function openCalendar(page: Page, year = 2026) {
  await page.goto(`/calendar?year=${year}`);
  await expect(page.getByRole("heading", { level: 1, name: "School calendar" })).toBeVisible();
}

async function fillWholeDays(page: Page, name: string, start: string, end: string) {
  await page.goto("/calendar/manage");
  await expect(page.getByRole("heading", { level: 1, name: "Add closure" })).toBeVisible();
  await page.getByLabel("Name").fill(name);
  await page.locator("label").filter({ hasText: "Whole days" }).click();
  await page.getByLabel("Start date", { exact: true }).fill(start);
  await page.getByLabel("End date", { exact: true }).fill(end);
}

// ── Адміністратор додає й видаляє закриття ─────────────────────────────────────

test.describe("admin@example.test", () => {
  test.use({ storageState: "playwright/.auth/admin.json" });

  test(
    'AC-CAL-01: the administrator adds "Winter break" for whole days 2026-12-28 – 2027-01-08 and the calendar shows it',
    { ...WRITES, ...ac("AC-CAL-01") },
    async ({ page }) => {
      await given("the school calendar has no closures (on the dates of the AC)", async () => {
        await openCalendar(page);
        await expect(closureRow(page, "Winter break")).toHaveCount(0);
      });

      await when('the administrator adds the closure "Winter break" for whole days from 2026-12-28 to 2027-01-08', async () => {
        await fillWholeDays(page, "Winter break", "2026-12-28", "2027-01-08");
        await page.getByRole("button", { name: "Add closure" }).click();
      });

      await thenStep(
        page,
        {
          clause: 'the school calendar shows "Winter break" with the dates 2026-12-28 – 2027-01-08.',
          visible: ["the school calendar page with the row «Winter break» and the dates «2026-12-28 – 2027-01-08»"],
          hidden: ["exactly one closure named «Winter break» is shown"],
        },
        async () => {
          await expect(page).toHaveURL(/\/calendar\?year=2026/);
          const row = closureRow(page, "Winter break");
          await expect(row).toHaveCount(1);
          await expect(row).toContainText("2026-12-28 – 2027-01-08");
        },
      );
    },
  );

  test(
    'AC-CAL-07: teacher1@example.test\'s Approved record on 2026-12-29 — "Winter break" is not saved, the message lists the record',
    { ...WRITES, ...ac("AC-CAL-07") },
    async ({ page }) => {
      await given('teacher1@example.test has a record 2026-12-29 08:30–15:30 with status "Approved"', async () => {
        await addRecord(TEACHER1, { date: "2026-12-29", ...WHOLE_DAY, leaveType: "personal", status: "approved" });
      });

      await when('the administrator tries to add "Winter break" from 2026-12-28 to 2027-01-08', async () => {
        await fillWholeDays(page, "Winter break", "2026-12-28", "2027-01-08");
        await page.getByRole("button", { name: "Add closure" }).click();
      });

      await thenStep(
        page,
        {
          clause:
            'the closure is not saved, the school calendar has no "Winter break", and the administrator sees the message "These days have leave records and cannot be closed: 2026-12-29 teacher1@example.test".',
          visible: [
            "the message «These days have leave records and cannot be closed: 2026-12-29 teacher1@example.test»",
            "the form «Add closure» is still open with «Winter break» in the name",
          ],
          hidden: ["the school calendar has no «Winter break» (checked on /calendar after the frame)"],
        },
        async () => {
          await expect(page.getByRole("main").getByRole("alert")).toHaveText(
            "These days have leave records and cannot be closed: 2026-12-29 teacher1@example.test",
          );
          await expect(page.getByLabel("Name")).toHaveValue("Winter break");
          await expect(page).toHaveURL(/\/calendar\/manage/);
        },
      );
      // «Що не змінилося» — після кадру, щоб кадр показав саме повідомлення AC.
      await openCalendar(page);
      await expect(closureRow(page, "Winter break")).toHaveCount(0);
    },
  );

  test(
    'AC-CAL-08: the only record on 2026-12-29 is Rejected — "Winter break" is saved and shown',
    { ...WRITES, ...ac("AC-CAL-08") },
    async ({ page }) => {
      await given('the only record on 2026-12-29 has status "Rejected"', async () => {
        await addRecord(TEACHER1, { date: "2026-12-29", ...WHOLE_DAY, leaveType: "personal", status: "rejected" });
      });

      await when('the administrator adds "Winter break" from 2026-12-28 to 2027-01-08', async () => {
        await fillWholeDays(page, "Winter break", "2026-12-28", "2027-01-08");
        await page.getByRole("button", { name: "Add closure" }).click();
      });

      await thenStep(
        page,
        {
          clause: 'the closure is saved, and the school calendar shows "Winter break" with the dates 2026-12-28 – 2027-01-08.',
          visible: ["«Closure added»", "the row «Winter break» with the dates «2026-12-28 – 2027-01-08»"],
        },
        async () => {
          await expect(page.getByText("Closure added")).toBeVisible();
          await expect(closureRow(page, "Winter break")).toContainText("2026-12-28 – 2027-01-08");
        },
      );
    },
  );

  test(
    'AC-CAL-10: an end date 2026-12-28 before the start date 2027-01-08 — not saved, «The end date cannot be earlier than the start date»',
    { ...WRITES, ...ac("AC-CAL-10") },
    async ({ page }) => {
      await given("the administrator adds a closure", async () => {
        await page.goto("/calendar/manage");
        await expect(page.getByRole("heading", { level: 1, name: "Add closure" })).toBeVisible();
      });

      await when("the administrator enters the start date 2027-01-08 and the end date 2026-12-28", async () => {
        await fillWholeDays(page, "Winter break", "2027-01-08", "2026-12-28");
        await page.getByRole("button", { name: "Add closure" }).click();
      });

      await thenStep(
        page,
        {
          clause: 'the closure is not saved, and the administrator sees the message "The end date cannot be earlier than the start date".',
          visible: ["the message «The end date cannot be earlier than the start date»"],
          hidden: [
            "the form keeps the start date 2027-01-08 and the end date 2026-12-28 (the date fields show them in the browser's format)",
            "the closure is not saved: the calendar has no «Winter break» (checked after the frame)",
          ],
        },
        async () => {
          await expect(page.getByRole("main").getByRole("alert")).toHaveText("The end date cannot be earlier than the start date");
          await expect(page.getByLabel("Start date", { exact: true })).toHaveValue("2027-01-08");
          await expect(page.getByLabel("End date", { exact: true })).toHaveValue("2026-12-28");
        },
      );
      await openCalendar(page);
      await expect(closureRow(page, "Winter break")).toHaveCount(0);
    },
  );

  test(
    'AC-CAL-11: "Staff day" on 2026-12-30 inside "Winter break" — not saved, «2026-12-30 is already closed: Winter break»',
    { ...WRITES, ...ac("AC-CAL-11") },
    async ({ page }) => {
      await given('"Winter break" 2026-12-28 – 2027-01-08', async () => {
        await addClosure("Winter break", "2026-12-28", "2027-01-08");
        await openCalendar(page);
        await expect(closureRow(page, "Winter break")).toHaveCount(1);
      });

      await when('the administrator tries to add the closure "Staff day" for 2026-12-30', async () => {
        await fillWholeDays(page, "Staff day", "2026-12-30", "2026-12-30");
        await page.getByRole("button", { name: "Add closure" }).click();
      });

      await thenStep(
        page,
        {
          clause: 'the closure is not saved, and the administrator sees the message "2026-12-30 is already closed: Winter break".',
          visible: ["the message «2026-12-30 is already closed: Winter break»"],
          hidden: ["the closure is not saved: the calendar has no «Staff day» (checked after the frame)"],
        },
        async () => {
          await expect(page.getByRole("main").getByRole("alert")).toHaveText("2026-12-30 is already closed: Winter break");
          await expect(page).toHaveURL(/\/calendar\/manage/);
        },
      );
      await openCalendar(page);
      await expect(closureRow(page, "Staff day")).toHaveCount(0);
    },
  );
});

// ── Працівник бачить календар і закриття в заявці ──────────────────────────────

test.describe("teacher1@example.test", () => {
  test.use({ storageState: "playwright/.auth/teacher1.json" });

  test(
    'AC-CAL-02: teacher1@example.test opens the school calendar and sees "Winter break" 2026-12-28 – 2027-01-08',
    { ...WRITES, ...ac("AC-CAL-02") },
    async ({ page }) => {
      await given('the administrator added "Winter break" 2026-12-28 – 2027-01-08', async () => {
        await addClosure("Winter break", "2026-12-28", "2027-01-08");
      });

      await when("teacher1@example.test opens the school calendar", async () => {
        await page.goto("/");
        await expect(page.getByTestId("user-email")).toHaveText(TEACHER1);
        await page.getByRole("navigation", { name: "Main" }).getByRole("link", { name: /^School calendar/ }).click();
        await expect(page.getByRole("heading", { level: 1, name: "School calendar" })).toBeVisible();
      });

      await thenStep(
        page,
        {
          clause: 'teacher1@example.test sees "Winter break" with the dates 2026-12-28 – 2027-01-08.',
          visible: ["the row «Winter break» with the dates «2026-12-28 – 2027-01-08»"],
          hidden: [
            "the signed-in user is teacher1@example.test (account menu; on screen the menu may shorten the address)",
            "the shown school year is 2026–2027 — the current one on the run dates (November 2026)",
          ],
        },
        async () => {
          await expect(closureRow(page, "Winter break")).toContainText("2026-12-28 – 2027-01-08");
          await expect(page.getByTestId("user-email")).toHaveText(TEACHER1);
        },
      );
    },
  );

  test(
    'AC-CAL-03: Tuesday 2026-12-29 in "Winter break" is not accepted — «The school is closed on this day: Winter break»',
    { ...WRITES, ...ac("AC-CAL-03") },
    async ({ page }) => {
      await given('"Winter break" 2026-12-28 – 2027-01-08 and an employee with the schedule Mon–Fri 08:30–15:30', async () => {
        await addClosure("Winter break", "2026-12-28", "2027-01-08");
        await page.goto("/requests/new");
        await expect(page.getByText("Your weekly schedule")).toBeVisible();
        await showMonth(page, 2026, 12);
      });

      await when("the employee tries to choose Tuesday 2026-12-29 in a new request", async () => {
        await page.getByRole("button", { name: /^Tue, 29 Dec 2026/ }).click();
      });

      await thenStep(
        page,
        {
          clause: 'the date is not accepted, and the employee sees the message "The school is closed on this day: Winter break".',
          visible: [
            "the message «The school is closed on this day: Winter break»",
            "no selected dates («No dates yet — pick them in the calendar.»)",
          ],
          hidden: ["the date is not accepted: no «Remove Tue, 29 Dec 2026» button"],
        },
        async () => {
          const main = page.getByRole("main");
          await expect(main.getByRole("alert")).toHaveText("The school is closed on this day: Winter break");
          await expect(main.getByText("No dates yet — pick them in the calendar.")).toBeVisible();
          await expect(main.getByRole("button", { name: "Remove Tue, 29 Dec 2026" })).toHaveCount(0);
        },
      );
    },
  );

  test(
    'AC-CAL-04: Personal leave for the whole day on the early dismissal 2026-11-20 — 1 record 2026-11-20 08:30–12:00',
    { ...WRITES, ...ac("AC-CAL-04") },
    async ({ page }) => {
      await given('an early dismissal "Teachers\' meeting" on Friday 2026-11-20 from 12:00 and an employee with the schedule Mon–Fri 08:30–15:30', async () => {
        await addClosure("Teachers' meeting", "2026-11-20", "2026-11-20", NOON);
        await page.goto("/requests/new");
        await showMonth(page, 2026, 11);
      });

      await when('the employee requests "Personal leave" for the whole day 2026-11-20 and confirms the summary', async () => {
        await page.getByRole("button", { name: /^Fri, 20 Nov 2026/ }).click();
        await page.getByRole("button", { name: "Continue" }).click();
        await page.getByRole("button", { name: "Continue" }).click();
        await page.getByText("Personal leave", { exact: true }).click();
        await page.getByRole("button", { name: "Continue" }).click();
        await page.getByRole("button", { name: "Submit request" }).click();
        await expect(page.getByText("Request submitted")).toBeVisible();
      });

      await thenStep(
        page,
        {
          clause: "1 record 2026-11-20 08:30–12:00 is created.",
          visible: ["one record on Fri 20 (November 2026) with the hours «08:30–12:00»"],
          hidden: ["«Request submitted» was shown after submitting", "exactly one record on 2026-11-20, from 08:30 to 12:00"],
        },
        async () => {
          const records = page.getByTestId("leave-record").filter({ hasText: "Fri 20" });
          await expect(records).toHaveCount(1);
          await expect(records).toContainText("08:30–12:00");
          // Кадр — лише видима частина сторінки: у teacher1 на проді є й інші записи, тож показуємо саме цей рядок.
          await records.scrollIntoViewIfNeeded();
        },
      );
    },
  );

  test(
    "AC-CAL-05: hours 13:00–14:00 on the early dismissal 2026-11-20 — no request, «Hours must be within your schedule: 08:30–12:00»",
    { ...WRITES, ...ac("AC-CAL-05") },
    async ({ page }) => {
      const position = page.getByRole("listitem").filter({ hasText: "Schedule: 08:30–12:00" });

      await given("the early dismissal from AC-CAL-04 and the same employee", async () => {
        await addClosure("Teachers' meeting", "2026-11-20", "2026-11-20", NOON);
        await page.goto("/requests/new");
        await showMonth(page, 2026, 11);
        await page.getByRole("button", { name: /^Fri, 20 Nov 2026/ }).click();
        await page.getByRole("button", { name: "Continue" }).click();
        await expect(position).toHaveCount(1);
      });

      await when("the employee enters the hours 13:00–14:00 on 2026-11-20", async () => {
        await position.getByRole("button", { name: "Specific hours" }).click();
        await position.getByLabel("From").fill("13:00");
        await position.getByLabel("to", { exact: true }).fill("14:00");
        await page.getByRole("button", { name: "Continue" }).click();
      });

      await thenStep(
        page,
        {
          clause: 'no request is created, and the employee sees the message "Hours must be within your schedule: 08:30–12:00".',
          visible: [
            "the message «Hours must be within your schedule: 08:30–12:00» under the hours 13:00–14:00",
            "the form stays on «Positions and hours»: no Submit request",
          ],
          hidden: ["the exact characters of the message, including the en dash «–»", "no request is created"],
        },
        async () => {
          await expect(position.getByRole("alert")).toHaveText("Hours must be within your schedule: 08:30–12:00");
          await expect(page.getByRole("heading", { name: "Positions and hours" })).toBeVisible();
          await expect(page.getByRole("button", { name: "Submit request" })).toHaveCount(0);
        },
      );
    },
  );

  test(
    'AC-CAL-09: after the administrator removes "Winter break", Tuesday 2026-12-29 is accepted with the hours 08:30–15:30',
    { ...WRITES, ...ac("AC-CAL-09") },
    async ({ page, browser }) => {
      await given('"Winter break" 2026-12-28 – 2027-01-08 and an employee with the schedule Mon–Fri 08:30–15:30', async () => {
        await addClosure("Winter break", "2026-12-28", "2027-01-08");
      });

      await when('the administrator removes "Winter break" and the employee then chooses Tuesday 2026-12-29 in a new request', async () => {
        const adminContext = await browser.newContext({ storageState: "playwright/.auth/admin.json" });
        const admin = await adminContext.newPage();
        await openCalendar(admin);
        await closureRow(admin, "Winter break").getByRole("button", { name: "Actions for closure Winter break" }).click();
        await admin.getByRole("menuitem", { name: "Remove closure" }).click();
        await admin.getByRole("dialog").getByRole("button", { name: "Remove closure" }).click();
        await expect(closureRow(admin, "Winter break")).toHaveCount(0);
        await adminContext.close();

        await page.goto("/requests/new");
        await showMonth(page, 2026, 12);
        await page.getByRole("button", { name: /^Tue, 29 Dec 2026/ }).click();
        await page.getByRole("button", { name: "Continue" }).click();
      });

      await thenStep(
        page,
        {
          clause: 'the school calendar no longer shows "Winter break", and 2026-12-29 is accepted with the hours 08:30–15:30.',
          visible: ["the step «Positions and hours» for Tue 29 Dec 2026 with «Schedule: 08:30–15:30» and «Whole day»"],
          hidden: ["the school calendar no longer shows «Winter break» (checked on /calendar after the frame)"],
        },
        async () => {
          await expect(page.getByRole("heading", { name: "Positions and hours" })).toBeVisible();
          await expect(page.getByRole("listitem").filter({ hasText: "Schedule: 08:30–15:30" }).first()).toBeVisible();
        },
      );
      await openCalendar(page);
      await expect(closureRow(page, "Winter break")).toHaveCount(0);
    },
  );

  test(
    "AC-CAL-12: teacher1@example.test opens the page for changing the school calendar — «Only an administrator can change the school calendar»",
    { tag: ["@uat"], ...ac("AC-CAL-12") },
    async ({ page }) => {
      let before = 0;
      await given("teacher1@example.test is signed in and has only the employee role", async () => {
        await openCalendar(page);
        await expect(page.getByTestId("user-email")).toHaveText(TEACHER1);
        before = await page.getByTestId("closure").count();
      });

      await when("teacher1@example.test opens the page for changing the school calendar by a direct link", async () => {
        await page.goto("/calendar/manage");
      });

      await thenStep(
        page,
        {
          clause: 'teacher1@example.test sees the message "Only an administrator can change the school calendar", and the school calendar is unchanged.',
          visible: ["the message «Only an administrator can change the school calendar»", "no form to add a closure"],
          hidden: ["the school calendar is unchanged: the same number of closures before and after (checked after the frame)"],
        },
        async () => {
          await expect(page.getByText("Only an administrator can change the school calendar")).toBeVisible();
          await expect(page.getByLabel("Name")).toHaveCount(0);
          await expect(page.getByRole("button", { name: "Add closure" })).toHaveCount(0);
        },
      );
      await openCalendar(page);
      await expect(page.getByTestId("closure")).toHaveCount(before);
    },
  );

  test(
    "AC-CAL-15: no closures in school year 2026–2027 — «No closed days in school year 2026–2027»",
    { tag: ["@uat"], ...ac("AC-CAL-15") },
    async ({ page }) => {
      await given("the school calendar has no closures in school year 2026–2027", async () => {
        await page.goto("/");
        await expect(page.getByTestId("user-email")).toHaveText(TEACHER1);
      });

      await when("an employee opens the school calendar for school year 2026–2027", async () => {
        await openCalendar(page, 2026);
      });

      await thenStep(
        page,
        {
          clause: 'the employee sees the message "No closed days in school year 2026–2027".',
          visible: ["the message «No closed days in school year 2026–2027»"],
          hidden: ["no closure rows are shown"],
        },
        async () => {
          await expect(page.getByText("No closed days in school year 2026–2027")).toBeVisible();
          await expect(page.getByTestId("closure")).toHaveCount(0);
        },
      );
    },
  );
});

// ── Менеджер погоджує запис і пробує змінити календар напряму ─────────────────

test.describe("manager1@example.test", () => {
  test.use({ storageState: "playwright/.auth/manager1.json" });

  test(
    'AC-CAL-06: the manager approves the whole-day "Sick leave" 2026-11-20 08:30–12:00 — balances show "Sick leave" used 1.00, not 0.50',
    { ...WRITES, ...ac("AC-CAL-06") },
    async ({ page, browser }) => {
      const employee = await browser.newContext({ storageState: "playwright/.auth/teacher1.json" });
      const balances = await employee.newPage();
      const sick = balances.getByRole("group", { name: "Sick leave left" });
      // AC: «Sick leave» used 0.00 до рішення. На проді в teacher1 вже можуть бути погоджені лікарняні цього року,
      // тож тест запам'ятовує стартове «used» і перевіряє різницю: +1.00, а не +0.50.
      let usedBefore = 0;

      await given('the early dismissal from AC-CAL-04, an employee with a single position (schedule Fri 08:30–15:30) and "Sick leave" used 0.00 (on prod: the used value before the decision is noted, the check is +1.00)', async () => {
        await addClosure("Teachers' meeting", "2026-11-20", "2026-11-20", NOON);
        await addRecord(TEACHER1, { date: "2026-11-20", start: WHOLE_DAY.start, end: NOON, leaveType: "sick", status: "awaiting" });
        await balances.goto("/balances?year=2026");
        await expect(sick).toContainText(/ of [\d.]+ used/);
        usedBefore = usedDays((await sick.textContent()) ?? "");
        expectStartUsed(usedBefore);
      });

      await when('the manager approves the whole-day "Sick leave" record 2026-11-20 08:30–12:00', async () => {
        await page.goto("/decisions");
        await page.getByTestId("decision-record").filter({ hasText: "Fri, 20 Nov 2026" }).first().getByRole("link").click();
        await expect(page).toHaveURL(/record=\d+/);
        await page.getByRole("button", { name: "Approve", exact: true }).click();
        await page.getByRole("dialog").getByRole("button", { name: "Approve", exact: true }).click();
        await expect(page.getByRole("status").filter({ hasText: "Approved" })).toBeAttached();
      });

      await thenStep(
        balances,
        {
          clause: 'the employee\'s balances show "Sick leave" used 1.00 (210 of 210 working minutes that day), not 0.50.',
          visible: ["the card «Sick leave left» with «… of … used»"],
          hidden: [
            "used grew by exactly 1.00, not 0.50: 210 of 210 working minutes on the early dismissal day",
            "AC starts from used 0.00; on prod the test takes the starting value it finds and checks the difference",
          ],
        },
        async () => {
          await balances.goto("/balances?year=2026");
          await expect(sick).toContainText(usedPattern(usedBefore + 1));
          await expect(sick).not.toContainText(usedPattern(usedBefore + 0.5));
        },
      );
      await employee.close();
    },
  );

  test(
    "AC-CAL-13: manager1@example.test tries to close 2026-11-27 directly — the calendar is unchanged and 2026-11-27 is still accepted",
    { ...WRITES, ...ac("AC-CAL-13") },
    async ({ page, browser }) => {
      let before = 0;
      const attempts: { status: number; code: string | null }[] = [];

      await given("manager1@example.test is signed in and is not an administrator", async () => {
        await openCalendar(page);
        await expect(page.getByTestId("user-email")).toHaveText("manager1@example.test");
        before = await page.getByTestId("closure").count();
      });

      await when("manager1@example.test tries to close 2026-11-27 directly, bypassing the portal's pages", async () => {
        // Те, що зробив би менеджер із консолі браузера: функція бази й запис у таблицю з його сесією.
        attempts.push(
          await asRole("manager1", "rpc/add_school_closure", {
            method: "POST",
            body: { p_name: "Staff day", p_start: "2026-11-27", p_end: "2026-11-27" },
          }),
          await asRole("manager1", "school_closures", {
            method: "POST",
            body: { name: "Staff day", start_date: "2026-11-27", end_date: "2026-11-27" },
          }),
        );
      });

      const employee = await browser.newContext({ storageState: "playwright/.auth/teacher1.json" });
      const form = await employee.newPage();
      await thenStep(
        form,
        {
          clause: "the school calendar is unchanged, and 2026-11-27 is still accepted in a new request.",
          visible: ["«Fri 27 Nov» under «Selected dates» in a new request"],
          hidden: [
            "both direct attempts were refused by the database (code 42501 for both: the function and the table insert)",
            "2026-11-27 is accepted: the button «Remove Fri, 27 Nov 2026» is there (its name is for screen readers)",
            "the school calendar is unchanged: the same number of closures, no «Staff day»",
          ],
        },
        async () => {
          for (const a of attempts) expect(a.code, JSON.stringify(a)).toBe("42501");
          await openCalendar(page);
          await expect(page.getByTestId("closure")).toHaveCount(before);
          await expect(closureRow(page, "Staff day")).toHaveCount(0);
          await form.goto("/requests/new");
          await showMonth(form, 2026, 11);
          await form.getByRole("button", { name: /^Fri, 27 Nov 2026/ }).click();
          await expect(form.getByRole("button", { name: "Remove Fri, 27 Nov 2026" })).toBeVisible();
        },
      );
      await employee.close();
    },
  );
});

// ── Гість ─────────────────────────────────────────────────────────────────────

test(
  "AC-CAL-14: a visitor who is not signed in opens the school calendar by a direct link — the sign-in page, no closure names or dates",
  { ...WRITES, ...ac("AC-CAL-14") },
  async ({ browser }) => {
    const guest = await browser.newContext({ storageState: { cookies: [], origins: [] } });
    const page = await guest.newPage();

    await given("nobody is signed in (and the school calendar has a closure, so there is something to hide)", async () => {
      await addClosure("Winter break", "2026-12-28", "2027-01-08");
    });

    await when("a visitor opens the school calendar by a direct link", async () => {
      await page.goto("/calendar?year=2026");
    });

    await thenStep(
      page,
      {
        clause: "the visitor sees the sign-in page, and no closure names or dates are shown.",
        visible: ["the sign-in page: «Email», «Password», «Sign in»"],
        hidden: ["no «Winter break» and no «2026-12-28» anywhere on the page"],
      },
      async () => {
        await expect(page).toHaveURL(/\/login/);
        await expect(page.getByRole("button", { name: "Sign in" })).toBeVisible();
        await expect(page.getByText("Winter break")).toHaveCount(0);
        await expect(page.getByText("2026-12-28")).toHaveCount(0);
      },
    );
    await guest.close();
  },
);
