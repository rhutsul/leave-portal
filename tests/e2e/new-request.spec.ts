// Стани форми нової заявки: AC-LEAVE-06 (день без годин) і AC-LEAVE-19 (години поза розкладом) лише читають: форму
// не подаємо, тож на проді нічого не створюється. AC-LEAVE-22 подає заявку (тег @writes) — лише в job e2e на
// одноразовому Supabase: playwright.config.ts не бере @writes на проді (UAT_BASE_URL) і поза CI (.env.local — спільна база). Повідомлення — дослівно з AC; точне коротке тире
// «–» у годинах кадр не доводить, тому воно лише в твердженні й у hidden.
import { expect, test, type Browser } from "@playwright/test";
import { cleanupRemembered, createUatEmployee, hasAdminKey, type UatEmployee } from "./support/admin";
import { showMonth, showNovember2026 } from "./support/calendar";
import { attachRuntimeErrors, given, thenStep, when } from "./support/uat";

const NO_WORKING_HOURS = "You have no working hours on this day";
const OUTSIDE_SCHEDULE = "Hours must be within your schedule: 08:30–12:00, 12:30–15:30";

test.afterEach(async ({ page }) => attachRuntimeErrors(page));

test.describe("teacher1@example.test", () => {
  test.use({ storageState: "playwright/.auth/teacher1.json" });

  test(
    "AC-LEAVE-06: Saturday 2026-11-07 is not accepted — «You have no working hours on this day»",
    { tag: ["@uat"], annotation: { type: "ac", description: "AC-LEAVE-06" } },
    async ({ page }) => {
      await given("an employee whose position has no Saturday in its schedule (teacher1@example.test)", async () => {
        await page.goto("/requests/new");
        await expect(page.getByTestId("user-email")).toHaveText("teacher1@example.test");
        // Розклад посад працівника — на кроці «Dates»: жодного блоку в суботу.
        await expect(page.getByText("Your weekly schedule")).toBeVisible();
        await showNovember2026(page);
      });

      await when("the employee tries to choose Saturday 2026-11-07", async () => {
        await page.getByRole("button", { name: /^Sat, 7 Nov 2026/ }).click();
      });

      await thenStep(
        page,
        {
          clause: 'the date is not accepted, and the employee sees the message "You have no working hours on this day".',
          visible: [
            "the message «You have no working hours on this day»",
            "Sat 7 Nov is not among the selected dates («No dates yet — pick them in the calendar.»)",
          ],
          hidden: [
            "the date is not accepted: the day 7 stays a day without working hours and is not selected (no «Remove Sat, 7 Nov 2026» button)",
          ],
        },
        // Без дій тут: кадр знімається після перевірок, і, скажімо, натискання Continue замінило б повідомлення AC
        // на «Choose at least one date» — кадр показав би не той стан, який перевірено.
        async () => {
          const main = page.getByRole("main");
          await expect(main.getByRole("alert")).toHaveText(NO_WORKING_HOURS);
          await expect(main.getByText("No dates yet — pick them in the calendar.")).toBeVisible();
          await expect(main.getByRole("button", { name: "Remove Sat, 7 Nov 2026" })).toHaveCount(0);
          await expect(main.getByRole("button", { name: "Sat, 7 Nov 2026, no working hours" })).toBeVisible();
          await expect(main.getByRole("heading", { name: "Dates" })).toBeVisible();
        },
      );
    },
  );
});

test.describe("teacher2@example.test", () => {
  test.use({ storageState: "playwright/.auth/teacher2.json" });

  test(
    "AC-LEAVE-19: hours 07:30–09:00 on Tue 2026-11-03 — no request, «Hours must be within your schedule: 08:30–12:00, 12:30–15:30»",
    { tag: ["@uat"], annotation: { type: "ac", description: "AC-LEAVE-19" } },
    async ({ page }) => {
      // Посада з розкладом у вівторок 08:30–12:00 і 12:30–15:30 — картка цієї посади на кроці «Positions and hours».
      const position = page.getByRole("listitem").filter({ hasText: "Schedule: 08:30–12:00, 12:30–15:30" });

      await given("a position with the schedule blocks Tue 08:30–12:00 and 12:30–15:30 (teacher2@example.test)", async () => {
        await page.goto("/requests/new");
        await expect(page.getByTestId("user-email")).toHaveText("teacher2@example.test");
        await showNovember2026(page);
        await page.getByRole("button", { name: /^Tue, 3 Nov 2026/ }).click();
        await page.getByRole("button", { name: "Continue" }).click();
        await expect(page.getByRole("heading", { name: "Positions and hours" })).toBeVisible();
        await expect(position).toHaveCount(1);
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
          clause:
            'no request is created, and the employee sees the message "Hours must be within your schedule: 08:30–12:00, 12:30–15:30".',
          visible: [
            "the message «Hours must be within your schedule: 08:30–12:00, 12:30–15:30» under the hours 07:30–09:00",
            "the form stays on the step «Positions and hours»: no Submit request",
          ],
          hidden: [
            "the exact characters of the message, including the en dashes «–» in 08:30–12:00 and 12:30–15:30",
            "no request is created: the form did not move on from «Positions and hours», and there is no Submit request button",
          ],
        },
        async () => {
          const main = page.getByRole("main");
          await expect(position.getByRole("alert")).toHaveText(OUTSIDE_SCHEDULE);
          await expect(position.getByLabel("From")).toHaveValue("07:30");
          await expect(position.getByLabel("to", { exact: true })).toHaveValue("09:00");
          await expect(main.getByRole("heading", { name: "Positions and hours" })).toBeVisible();
          await expect(main.getByRole("button", { name: "Submit request" })).toHaveCount(0);
        },
      );
    },
  );

  test(
    "AC-LEAVE-22: Personal leave 09:00–12:30 on Tue 2026-11-03 — 1 record 09:00–12:30 of 3 h, the gap 12:00–12:30 not counted",
    { tag: ["@writes"], annotation: { type: "ac", description: "AC-LEAVE-22" } },
    async ({ page }) => {
      const position = page.getByRole("listitem").filter({ hasText: "Schedule: 08:30–12:00, 12:30–15:30" });

      await given("a position with the schedule blocks Tue 08:30–12:00 and 12:30–15:30 (teacher2@example.test)", async () => {
        await page.goto("/requests/new");
        await expect(page.getByTestId("user-email")).toHaveText("teacher2@example.test");
        await showNovember2026(page);
        await page.getByRole("button", { name: /^Tue, 3 Nov 2026/ }).click();
        await page.getByRole("button", { name: "Continue" }).click();
        await expect(position).toHaveCount(1);
      });

      await when('the employee requests "Personal leave" on 2026-11-03 from 09:00 to 12:30', async () => {
        await position.getByRole("button", { name: "Specific hours" }).click();
        await position.getByLabel("From").fill("09:00");
        await position.getByLabel("to", { exact: true }).fill("12:30");
        await page.getByRole("button", { name: "Continue" }).click();
        await page.getByText("Personal leave", { exact: true }).click();
        await page.getByRole("button", { name: "Continue" }).click();
        // Підсумок перед підтвердженням: один запис 09:00–12:30 тривалістю 3 h.
        const summary = page.getByRole("main").getByRole("row").filter({ hasText: "09:00–12:30" });
        await expect(summary).toHaveCount(1);
        await expect(summary).toContainText("3 h");
        await expect(page.getByText("3 h in 1 record")).toBeVisible();
        await page.getByRole("button", { name: "Submit request" }).click();
      });

      await thenStep(
        page,
        {
          clause: "1 record 2026-11-03 09:00–12:30 is created with a duration of 3 h (the gap 12:00–12:30 is not counted).",
          visible: [
            "«Request submitted» above My requests",
            "one record Tue 3 with the hours 09:00–12:30, Personal leave, Awaiting decision",
          ],
          hidden: [
            "the duration 3 h — shown in the summary before Submit request («3 h in 1 record»), checked in the When step",
          ],
        },
        async () => {
          const main = page.getByRole("main");
          await expect(main.getByText("Request submitted")).toBeVisible();
          const record = main.getByTestId("leave-record").filter({ hasText: "09:00–12:30" });
          await expect(record).toHaveCount(1);
          await expect(record).toContainText("Personal leave");
          await expect(record).toContainText("Awaiting decision");
        },
      );
    },
  );
});

// AC-LEAVE-23 і AC-LEAVE-24 не називають акаунта («an employee with the schedule Mon–Fri 08:30–15:30»): у teacher1@ є
// ще додаткова посада в понеділок, тож беремо синтетичного працівника uat-<run>-…@example.test з рівно цим розкладом
// (createUatEmployee). Він сам створює дані «Дано», а прибирання видаляє його разом із записами — тому @prod-writes.
const REMINDER = "Personal leave of 2 days or more: please talk to the administrator before you go";
const MON_FRI_WHOLE_DAY: [number, number][] = [[8 * 60 + 30, 15 * 60 + 30]];

/** Браузерний контекст синтетичного працівника: лише куки сесії, пароль у браузер і trace.zip не потрапляє. */
async function signedInAs(browser: Browser, employee: UatEmployee) {
  const baseURL = test.info().project.use.baseURL;
  if (!baseURL) throw new Error("немає baseURL у playwright.config.ts");
  const context = await browser.newContext({ storageState: { cookies: [], origins: [] } });
  const now = Math.floor(Date.now() / 1000);
  await context.addCookies(
    employee.session.map(({ name, value, maxAge }) => ({
      name,
      value,
      url: baseURL,
      sameSite: "Lax" as const,
      expires: maxAge ? now + maxAge : -1,
    })),
  );
  const page = await context.newPage();
  await page.goto("/requests/new");
  await expect(page.getByTestId("user-email")).toHaveText(employee.email);
  return { context, page };
}

test.describe("an employee with the schedule Mon–Fri 08:30–15:30", () => {
  test.afterEach(async () => {
    if (hasAdminKey()) await cleanupRemembered();
  });

  test(
    "AC-LEAVE-23: Personal leave for the whole days 2026-12-07 and 2026-12-08 (2.00 days) — the reminder, then 2 records",
    { tag: ["@uat", "@prod-writes"], annotation: { type: "ac", description: "AC-LEAVE-23" } },
    async ({ browser }) => {
      const employee = await createUatEmployee({
        mon: MON_FRI_WHOLE_DAY,
        tue: MON_FRI_WHOLE_DAY,
        wed: MON_FRI_WHOLE_DAY,
        thu: MON_FRI_WHOLE_DAY,
        fri: MON_FRI_WHOLE_DAY,
      });
      const { context, page } = await signedInAs(browser, employee);
      try {
        await given("an employee with the schedule Mon–Fri 08:30–15:30", async () => {
          await expect(page.getByText("Your weekly schedule")).toBeVisible();
          await showMonth(page, 2026, 12);
        });

        await when(
          'the employee requests "Personal leave" for the whole days Monday 2026-12-07 and Tuesday 2026-12-08 (2.00 days) and opens the summary',
          async () => {
            await page.getByRole("button", { name: /^Mon, 7 Dec 2026/ }).click();
            await page.getByRole("button", { name: /^Tue, 8 Dec 2026/ }).click();
            await page.getByRole("button", { name: "Continue" }).click();
            await expect(page.getByRole("region", { name: "Mon, 7 Dec 2026" })).toBeVisible();
            await page.getByRole("button", { name: "Continue" }).click();
            await page.getByText("Personal leave", { exact: true }).click();
            await page.getByRole("button", { name: "Continue" }).click();
          },
        );

        await thenStep(
          page,
          {
            clause:
              'the employee sees the reminder "Personal leave of 2 days or more: please talk to the administrator before you go", and after confirming, the request is created with 2 records.',
            visible: ["the reminder in the summary before Submit request"],
            hidden: ["after Submit request: «Request submitted» and two records 7 and 8 Dec in My requests"],
          },
          async () => {
            const main = page.getByRole("main");
            await expect(main.getByTestId("personal-leave-reminder")).toHaveText(REMINDER);
            await expect(main.getByRole("button", { name: "Submit request" })).toBeEnabled();
            await main.getByRole("button", { name: "Submit request" }).click();
            await expect(main.getByText("Request submitted")).toBeVisible();
            const records = main.getByTestId("leave-record").filter({ hasText: "Personal leave" });
            await expect(records).toHaveCount(2);
          },
        );
      } finally {
        await context.close();
      }
    },
  );

  test(
    "AC-LEAVE-24: Personal leave for the whole day 2026-12-07 and 08:30–12:00 on 2026-12-08 (1.50 days) — no reminder",
    { tag: ["@uat", "@prod-writes"], annotation: { type: "ac", description: "AC-LEAVE-24" } },
    async ({ browser }) => {
      const employee = await createUatEmployee({
        mon: MON_FRI_WHOLE_DAY,
        tue: MON_FRI_WHOLE_DAY,
        wed: MON_FRI_WHOLE_DAY,
        thu: MON_FRI_WHOLE_DAY,
        fri: MON_FRI_WHOLE_DAY,
      });
      const { context, page } = await signedInAs(browser, employee);
      try {
        await given("an employee with the schedule Mon–Fri 08:30–15:30", async () => {
          await expect(page.getByText("Your weekly schedule")).toBeVisible();
          await showMonth(page, 2026, 12);
        });

        await when(
          'the employee requests "Personal leave" for the whole day 2026-12-07 and for 2026-12-08 from 08:30 to 12:00 in one request (1.50 days in total) and opens the summary',
          async () => {
            await page.getByRole("button", { name: /^Mon, 7 Dec 2026/ }).click();
            await page.getByRole("button", { name: /^Tue, 8 Dec 2026/ }).click();
            await page.getByRole("button", { name: "Continue" }).click();
            const tuesday = page.getByRole("region", { name: "Tue, 8 Dec 2026" }).getByRole("listitem");
            await tuesday.getByRole("button", { name: "Specific hours" }).click();
            await tuesday.getByLabel("From").fill("08:30");
            await tuesday.getByLabel("to", { exact: true }).fill("12:00");
            await page.getByRole("button", { name: "Continue" }).click();
            await page.getByText("Personal leave", { exact: true }).click();
            await page.getByRole("button", { name: "Continue" }).click();
          },
        );

        await thenStep(
          page,
          {
            clause: "the employee does not see the reminder about Personal leave of 2 days or more.",
            visible: ["the summary with 2 records (7 Dec whole day, 8 Dec 08:30–12:00) and no reminder"],
            hidden: ["the reminder text is nowhere on the page"],
          },
          async () => {
            const main = page.getByRole("main");
            await expect(main.getByRole("row").filter({ hasText: "08:30–12:00" })).toHaveCount(1);
            await expect(main.getByRole("button", { name: "Submit request" })).toBeVisible();
            // Вартові: це саме підсумок «Personal leave» на 1.50 дні (10 h 30 min), тож відсутність нагадування — не випадкова.
            await expect(main.getByRole("definition").filter({ hasText: "Personal leave" })).toHaveCount(1);
            await expect(main.getByRole("definition").filter({ hasText: "10 h 30 min" })).toHaveCount(1);
            await expect(main.getByTestId("personal-leave-reminder")).toHaveCount(0);
            await expect(main.getByText(REMINDER)).toHaveCount(0);
          },
        );
      } finally {
        await context.close();
      }
    },
  );
});
