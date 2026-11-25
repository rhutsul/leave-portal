// UAT зрізу «заміни й підвищення асистента» (requirements/06-substitutes.md, AC-SUBST-01…15;
// openspec/changes/impl-substitutes/design.md). «Дано» — синтетичні працівники uat-<run>-…@example.test (менеджер
// посади — manager1@example.test, як у teacher1@): відсутній з посадою «UAT teacher» і заміни — «Assistant» чи «UAT
// teacher» (tests/e2e/support/substitutes.ts), дати — вільні робочі дні від сьогодні. Створює й прибирає за собою
// секретним ключем — @prod-writes. AC-SUBST-06, -07, -09 і -13 доводять тести PGlite (tests/db/substitutes.test.ts):
// зайнятість іншою заміною, «Rejected», інші поєднання посад і запис в обхід сторінок — без нових станів сторінок.
import { expect, test, type Page } from "@playwright/test";
import { cleanupRemembered, hasAdminKey } from "./support/admin";
import { employeeContext, freeWeekdays, roleContext, type View } from "./support/cancel";
import {
  chooseSubstitute,
  givenRecord,
  giveList,
  openPositionsStep,
  specificHours,
  toSummary,
  weekEmployee,
} from "./support/substitutes";
import { attachRuntimeErrors, cleanScreenshot, given, thenStep, when } from "./support/uat";

const TAGS = { tag: ["@uat", "@prod-writes"] };

test.afterEach(async () => {
  if (hasAdminKey()) await cleanupRemembered();
});

/** Знімок стану для docs/img/ без накладок відео — у test-results/ (артефакт CI). */
async function shot(page: Page, name: string, view: View = { width: 1280, height: 800 }, fullPage = false) {
  await cleanScreenshot(page, test.info().outputPath(`subst-${name}-${view.width}-${view.theme ?? "light"}.png`), fullPage);
}

/** Рядок черги менеджера за ім'ям синтетичного працівника. */
function decisionRow(page: Page, fullName: string) {
  return page.getByTestId("decision-record").filter({ hasText: fullName });
}

test.describe("substitute list", () => {
  test(
    "AC-SUBST-01: the manager adds an assistant and a teacher to the employee's empty substitute list",
    { ...TAGS, annotation: { type: "ac", description: "AC-SUBST-01" } },
    async ({ browser }) => {
      const absent = await weekEmployee();
      const assistant = await weekEmployee("Assistant");
      const teacher = await weekEmployee();
      const context = await roleContext(browser, "manager1");
      const page = await context.newPage();
      try {
        await given(`manager1@example.test manages the position of ${absent.email}, whose substitute list is empty`, async () => {
          await page.goto(`/substitutes/${absent.id}`);
          await expect(page.getByRole("heading", { level: 1, name: absent.email })).toBeVisible();
          await expect(page.getByText("No substitutes yet")).toBeVisible();
        });

        await when(`manager1@example.test adds ${assistant.email} and ${teacher.email}`, async () => {
          for (const person of [assistant, teacher]) {
            await page.getByRole("combobox", { name: "Person" }).click();
            await page.getByRole("option", { name: new RegExp(`^${person.email}`) }).click();
            await page.getByRole("button", { name: "Add to list" }).click();
            await expect(page.getByText(`${person.email} added`)).toBeVisible();
          }
        });

        await thenStep(
          page,
          {
            clause: `the substitute list shows exactly ${assistant.email} and ${teacher.email}.`,
            visible: ["two rows in the Substitute list: the assistant and the teacher"],
          },
          async () => {
            const rows = page.getByTestId("substitute-member");
            await expect(rows).toHaveCount(2);
            await expect(rows.filter({ hasText: assistant.email })).toHaveCount(1);
            await expect(rows.filter({ hasText: teacher.email })).toHaveCount(1);
            await shot(page, "editor");
          },
        );

        await page.goto("/substitutes");
        await expect(page.getByTestId("substitute-employee").filter({ hasText: absent.email })).toContainText("2 substitutes");
        await shot(page, "index");
      } finally {
        await attachRuntimeErrors(page);
        await context.close();
      }
    },
  );

  test(
    "AC-SUBST-12: an employee opens another employee's substitute list by a direct link — the AC message, the list unchanged",
    { ...TAGS, annotation: { type: "ac", description: "AC-SUBST-12" } },
    async ({ browser }) => {
      const absent = await weekEmployee();
      const assistant = await weekEmployee("Assistant");
      await giveList(absent, [assistant]);
      const context = await roleContext(browser, "teacher1");
      const page = await context.newPage();
      try {
        await given("teacher1@example.test is signed in and has only the employee role", async () => {
          await page.goto("/");
          await expect(page.getByTestId("user-email")).toHaveText("teacher1@example.test");
        });

        await when(`teacher1@example.test opens the substitute list of ${absent.email} by a direct link`, async () => {
          await page.goto(`/substitutes/${absent.id}`);
        });

        await thenStep(
          page,
          {
            clause:
              "teacher1@example.test sees the message \"Only the manager of this employee's position can change the substitute list\", and the list is unchanged.",
            visible: ["the AC message", "no emails of the employee or the list, no form"],
            hidden: ["the list still has exactly one person"],
          },
          async () => {
            await expect(
              page.getByRole("heading", { name: "Only the manager of this employee's position can change the substitute list" }),
            ).toBeVisible();
            await expect(page.getByRole("main")).not.toContainText(absent.email);
            await expect(page.getByRole("main")).not.toContainText(assistant.email);
            await expect(page.getByRole("button", { name: "Add to list" })).toHaveCount(0);
            await shot(page, "denied");
          },
        );
        // Головна сторінка списків — та сама відмова; пункту меню «Substitutes» працівник не бачить.
        await page.goto("/substitutes");
        await expect(page.getByRole("heading", { name: "Only the manager of this employee's position can change the substitute list" })).toBeVisible();
        await expect(page.getByRole("link", { name: "Substitutes" })).toHaveCount(0);
      } finally {
        await context.close();
      }
    },
  );
});

test.describe("choosing a substitute for a record", () => {
  test(
    "AC-SUBST-02: a whole-day Personal leave record with the substitute; the manager sees it in Awaiting decision",
    { ...TAGS, annotation: { type: "ac", description: "AC-SUBST-02" } },
    async ({ browser }) => {
      const absent = await weekEmployee();
      const assistant = await weekEmployee("Assistant");
      const teacher = await weekEmployee();
      await giveList(absent, [assistant, teacher]);
      const [date] = await freeWeekdays(1, 1, 5);
      const context = await employeeContext(browser, absent);
      const page = await context.newPage();
      const managerContext = await roleContext(browser, "manager1");
      const managerPage = await managerContext.newPage();
      try {
        await given(`the substitute list of ${absent.email} from AC-SUBST-01 and the schedule Mon–Fri 08:30–15:30`, async () => {
          await openPositionsStep(page, date);
        });

        await when(`the employee requests «Personal leave» for the whole day ${date}, chooses ${assistant.email} and confirms`, async () => {
          await chooseSubstitute(page, assistant.email);
          await shot(page, "choose");
          await toSummary(page);
          await expect(page.getByRole("main").getByTestId("substitute-note")).toContainText(`Substitute: ${assistant.email}`);
          await page.getByRole("button", { name: "Submit request" }).click();
          await expect(page.getByText("Request submitted")).toBeVisible();
        });

        await thenStep(
          page,
          {
            clause: `1 record ${date} 08:30–15:30 is created with status "Awaiting decision" and the substitute ${assistant.email}`,
            visible: ["one record in My requests: Awaiting decision and «Substitute: …»"],
          },
          async () => {
            const rows = page.getByTestId("leave-record");
            await expect(rows).toHaveCount(1);
            await expect(rows).toContainText("Awaiting decision");
            await expect(rows).toContainText("08:30–15:30");
            await expect(rows.getByTestId("substitute-note")).toContainText(`Substitute: ${assistant.email}`);
          },
        );

        await thenStep(
          managerPage,
          {
            clause: `manager1@example.test sees the substitute on that record in "Awaiting decision".`,
            visible: ["the record in Awaiting decision with «Substitute: …»", "the same line in the record panel"],
          },
          async () => {
            await managerPage.goto("/decisions");
            const row = decisionRow(managerPage, absent.fullName);
            await expect(row).toHaveCount(1);
            await expect(row.getByTestId("substitute-note")).toContainText(`Substitute: ${assistant.email}`);
            await row.getByRole("link").click();
            const sheet = managerPage.getByRole("dialog");
            await expect(sheet.getByTestId("substitute-note")).toContainText(`Substitute: ${assistant.email}`);
            await shot(managerPage, "decisions");
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
    "AC-SUBST-03: without choosing a substitute — the employee and the manager see No substitute",
    { ...TAGS, annotation: { type: "ac", description: "AC-SUBST-03" } },
    async ({ browser }) => {
      const absent = await weekEmployee();
      const assistant = await weekEmployee("Assistant");
      await giveList(absent, [assistant]);
      const [date] = await freeWeekdays(1, 1, 5);
      const context = await employeeContext(browser, absent);
      const page = await context.newPage();
      const managerContext = await roleContext(browser, "manager1");
      const managerPage = await managerContext.newPage();
      try {
        await given(`the substitute list of ${absent.email} is not empty`, async () => {
          await openPositionsStep(page, date);
          await expect(page.getByRole("combobox", { name: "Substitute" })).toContainText("No substitute");
        });

        await when(`the employee requests the whole day ${date} without choosing a substitute and confirms`, async () => {
          await toSummary(page);
          await page.getByRole("button", { name: "Submit request" }).click();
          await expect(page.getByText("Request submitted")).toBeVisible();
        });

        await thenStep(
          page,
          {
            clause: 'the record is created, and both the employee and manager1@example.test see "No substitute" on it.',
            visible: ["«No substitute» on the record in My requests", "«No substitute» on the record in Decisions"],
          },
          async () => {
            await expect(page.getByTestId("leave-record").getByTestId("substitute-note")).toHaveText("No substitute");
            await managerPage.goto("/decisions");
            await expect(decisionRow(managerPage, absent.fullName).getByTestId("substitute-note")).toHaveText("No substitute");
          },
        );
      } finally {
        await context.close();
        await managerContext.close();
      }
    },
  );

  test(
    "AC-SUBST-04: the choice offers exactly the people on the list",
    { ...TAGS, annotation: { type: "ac", description: "AC-SUBST-04" } },
    async ({ browser }) => {
      const absent = await weekEmployee();
      const assistant = await weekEmployee("Assistant");
      const teacher = await weekEmployee();
      const outsider = await weekEmployee();
      await giveList(absent, [assistant, teacher]);
      const [date] = await freeWeekdays(1, 1, 5);
      const context = await employeeContext(browser, absent);
      const page = await context.newPage();
      try {
        await given(`the list of ${absent.email} has the assistant and the teacher, and ${outsider.email} is not on it`, async () => {
          await openPositionsStep(page, date);
        });

        await when("the employee chooses a substitute for a record", async () => {
          await page.getByRole("combobox", { name: "Substitute" }).click();
        });

        await thenStep(
          page,
          {
            clause: `the choice offers exactly ${assistant.email} and ${teacher.email}, and ${outsider.email} is not offered.`,
            visible: ["the open list: No substitute and the two people"],
          },
          async () => {
            const options = page.getByRole("option");
            await expect(options).toHaveCount(3);
            await expect(options.nth(0)).toHaveText("No substitute");
            await expect(page.getByRole("option", { name: new RegExp(`^${assistant.email}`) })).toBeVisible();
            await expect(page.getByRole("option", { name: new RegExp(`^${teacher.email}`) })).toBeVisible();
            await expect(page.getByRole("option", { name: new RegExp(`^${outsider.email}`) })).toHaveCount(0);
            await shot(page, "options");
          },
        );
      } finally {
        await context.close();
      }
    },
  );

  test(
    "AC-SUBST-11: an empty substitute list — the AC message instead of a choice, and the request is still submitted",
    { ...TAGS, annotation: { type: "ac", description: "AC-SUBST-11" } },
    async ({ browser }) => {
      const absent = await weekEmployee();
      const [date] = await freeWeekdays(1, 1, 5);
      const context = await employeeContext(browser, absent);
      const page = await context.newPage();
      try {
        await given(`the substitute list of ${absent.email} is empty`, async () => {
          await openPositionsStep(page, date);
        });

        await when(`the employee requests the whole day ${date}`, async () => {
          await expect(page.getByRole("combobox", { name: "Substitute" })).toHaveCount(0);
        });

        await thenStep(
          page,
          {
            clause:
              'instead of a choice of substitutes the employee sees the message "Your manager has not added substitutes for you yet", and the request can still be confirmed with "No substitute".',
            visible: ["the AC message on the step «Positions and hours»", "«No substitute» in the summary"],
            hidden: ["after Submit request: the record in My requests with «No substitute»"],
          },
          async () => {
            await expect(page.getByTestId("substitutes-empty")).toHaveText("Your manager has not added substitutes for you yet");
            await shot(page, "empty-list");
            await toSummary(page);
            await expect(page.getByRole("main").getByTestId("substitute-note")).toHaveText("No substitute");
            await page.getByRole("button", { name: "Submit request" }).click();
            await expect(page.getByText("Request submitted")).toBeVisible();
            await expect(page.getByTestId("leave-record").getByTestId("substitute-note")).toHaveText("No substitute");
          },
        );
      } finally {
        await context.close();
      }
    },
  );

  test(
    "AC-SUBST-05: the substitute has an own Awaiting decision record 09:00–11:00 — no request, the AC message",
    { ...TAGS, annotation: { type: "ac", description: "AC-SUBST-05" } },
    async ({ browser }) => {
      const absent = await weekEmployee();
      const assistant = await weekEmployee("Assistant");
      await giveList(absent, [assistant]);
      const [date] = await freeWeekdays(1, 1, 5);
      await givenRecord(assistant, { date, start: 540, end: 660, status: "awaiting" });
      const context = await employeeContext(browser, absent);
      const page = await context.newPage();
      const message = `${assistant.email} is not available at this time: ${date} 09:00–11:00`;
      try {
        await given(`${assistant.email} has an own record ${date} 09:00–11:00 with status "Awaiting decision"`, async () => {
          await openPositionsStep(page, date);
        });

        await when(`the employee chooses ${assistant.email} for the record ${date} 08:30–15:30 and confirms`, async () => {
          await chooseSubstitute(page, assistant.email);
          await toSummary(page);
          await page.getByRole("button", { name: "Submit request" }).click();
        });

        await thenStep(
          page,
          {
            clause: `no request is created, and the employee sees the message "${message}".`,
            visible: ["the AC message above Submit request in the summary"],
            hidden: ["My requests has no records"],
          },
          async () => {
            await expect(page.getByRole("alert").filter({ hasText: message })).toBeVisible();
            await shot(page, "busy");
            await page.goto("/requests");
            await expect(page.getByTestId("leave-record")).toHaveCount(0);
          },
        );
      } finally {
        await context.close();
      }
    },
  );

  test(
    "AC-SUBST-08: an assistant substitutes a teacher 08:30–12:00 — the mark With upgrade: 210 min",
    { ...TAGS, annotation: { type: "ac", description: "AC-SUBST-08" } },
    async ({ browser }) => {
      const absent = await weekEmployee();
      const assistant = await weekEmployee("Assistant");
      await giveList(absent, [assistant]);
      const [date] = await freeWeekdays(1, 1, 5);
      const context = await employeeContext(browser, absent);
      const page = await context.newPage();
      try {
        await given(`the position of ${absent.email} is a teacher's («UAT teacher») and ${assistant.email}'s main position is «Assistant»`, async () => {
          await openPositionsStep(page, date);
        });

        await when(`the employee requests ${date} from 08:30 to 12:00 with the substitute ${assistant.email} and confirms`, async () => {
          await specificHours(page, "08:30", "12:00");
          await chooseSubstitute(page, assistant.email);
          await toSummary(page);
          await expect(page.getByRole("main").getByTestId("upgrade-mark")).toHaveText("With upgrade: 210 min");
          await shot(page, "summary-upgrade");
          await page.getByRole("button", { name: "Submit request" }).click();
          await expect(page.getByText("Request submitted")).toBeVisible();
        });

        await thenStep(
          page,
          {
            clause: `the record shows the substitute ${assistant.email} and the mark "With upgrade: 210 min".`,
            visible: ["the record in My requests: «Substitute: …» and «With upgrade: 210 min»"],
          },
          async () => {
            const row = page.getByTestId("leave-record");
            await expect(row.getByTestId("substitute-note")).toContainText(`Substitute: ${assistant.email}`);
            await expect(row.getByTestId("upgrade-mark")).toHaveText("With upgrade: 210 min");
            await shot(page, "my-requests");
          },
        );
      } finally {
        await context.close();
      }
    },
  );
});

test.describe("My substitutions", () => {
  test(
    "AC-SUBST-10: the substitute sees one line — date, hours, the absent employee and Awaiting decision",
    { ...TAGS, annotation: { type: "ac", description: "AC-SUBST-10" } },
    async ({ browser }) => {
      const absent = await weekEmployee();
      const assistant = await weekEmployee("Assistant");
      await giveList(absent, [assistant]);
      const [date] = await freeWeekdays(1, 1, 5);
      await givenRecord(absent, { date, start: 510, end: 930, status: "awaiting", substitute: assistant });
      const context = await employeeContext(browser, assistant);
      const page = await context.newPage();
      try {
        await given(`the record from AC-SUBST-02: ${absent.email} ${date} 08:30–15:30 with the substitute ${assistant.email}`, async () => {
          expect(date).toMatch(/^\d{4}-\d{2}-\d{2}$/);
        });

        await when(`${assistant.email} opens "My substitutions"`, async () => {
          await page.goto("/");
          await page.getByRole("link", { name: "My substitutions" }).first().click();
          await expect(page.getByRole("heading", { level: 1, name: "My substitutions" })).toBeVisible();
        });

        await thenStep(
          page,
          {
            clause: `the substitute sees 1 line: ${date} 08:30–15:30, ${absent.email}, status "Awaiting decision".`,
            visible: ["one line with the date, 08:30–15:30, the absent employee's email and Awaiting decision"],
          },
          async () => {
            const rows = page.getByTestId("substitution");
            await expect(rows).toHaveCount(1);
            await expect(rows).toContainText(date);
            await expect(rows).toContainText("08:30–15:30");
            await expect(rows).toContainText(absent.email);
            await expect(rows).toContainText("Awaiting decision");
            await shot(page, "my-substitutions");
          },
        );
      } finally {
        await context.close();
      }
    },
  );

  test(
    "AC-SUBST-15: no substitutions in Awaiting decision, Returned for revision or Approved — You are not covering for anyone",
    { ...TAGS, annotation: { type: "ac", description: "AC-SUBST-15" } },
    async ({ browser }) => {
      const absent = await weekEmployee();
      const assistant = await weekEmployee("Assistant");
      await giveList(absent, [assistant]);
      const [date] = await freeWeekdays(1, 1, 5);
      await givenRecord(absent, { date, start: 510, end: 930, status: "rejected", substitute: assistant });
      const context = await employeeContext(browser, assistant);
      const page = await context.newPage();
      try {
        await given(`${assistant.email} is the substitute only in a Rejected record`, async () => {
          expect(date).toBeTruthy();
        });

        await when(`${assistant.email} opens "My substitutions"`, async () => {
          await page.goto("/substitutions");
        });

        await thenStep(
          page,
          {
            clause: 'the substitute sees the message "You are not covering for anyone".',
            visible: ["the AC message"],
          },
          async () => {
            await expect(page.getByText("You are not covering for anyone")).toBeVisible();
            await expect(page.getByTestId("substitution")).toHaveCount(0);
            await shot(page, "not-covering");
          },
        );
      } finally {
        await context.close();
      }
    },
  );

  test(
    "AC-SUBST-14: a visitor who is not signed in opens My substitutions by a direct link — the sign-in page, no records or names",
    { ...TAGS, annotation: { type: "ac", description: "AC-SUBST-14" } },
    async ({ browser }) => {
      const absent = await weekEmployee();
      const assistant = await weekEmployee("Assistant");
      const [date] = await freeWeekdays(1, 1, 5);
      await givenRecord(absent, { date, start: 510, end: 930, status: "awaiting", substitute: assistant });
      const context = await browser.newContext({ storageState: { cookies: [], origins: [] } });
      const page = await context.newPage();
      try {
        await given("nobody is signed in", async () => {
          expect(date).toBeTruthy();
        });

        await when('a visitor opens "My substitutions" by a direct link', async () => {
          await page.goto("/substitutions");
        });

        await thenStep(
          page,
          {
            clause: "the visitor sees the sign-in page, and no records or names are shown.",
            visible: ["the sign-in form"],
            hidden: ["no dates or emails of the substitution on the page"],
          },
          async () => {
            await expect(page).toHaveURL(/\/login/);
            await expect(page.getByRole("button", { name: "Sign in" })).toBeVisible();
            await expect(page.locator("body")).not.toContainText(absent.email);
            await expect(page.locator("body")).not.toContainText(date);
          },
        );
      } finally {
        await context.close();
      }
    },
  );
});

// Знімки станів у темній темі на 1280 px (D8): редактор списку, «My substitutions» і відмова. Без AC ID — вигляд за
// розробником; поведінку доводять тести вище.
test("substitutes states on 1280 px, dark", { tag: ["@prod-writes"] }, async ({ browser }) => {
  const view: View = { width: 1280, height: 800, theme: "dark" };
  const absent = await weekEmployee();
  const assistant = await weekEmployee("Assistant");
  const teacher = await weekEmployee();
  await giveList(absent, [assistant, teacher]);
  const [date] = await freeWeekdays(1, 1, 5);
  await givenRecord(absent, { date, start: 510, end: 720, status: "approved", substitute: assistant, upgrade: true });
  const managerContext = await roleContext(browser, "manager1", view);
  const managerPage = await managerContext.newPage();
  const assistantContext = await employeeContext(browser, assistant, view);
  const assistantPage = await assistantContext.newPage();
  try {
    await managerPage.goto(`/substitutes/${absent.id}`);
    await expect(managerPage.getByTestId("substitute-member")).toHaveCount(2);
    await shot(managerPage, "editor", view);
    await assistantPage.goto("/substitutions");
    await expect(assistantPage.getByTestId("substitution")).toHaveCount(1);
    await shot(assistantPage, "my-substitutions", view);
    await assistantPage.goto(`/substitutes/${absent.id}`);
    await expect(assistantPage.getByRole("heading", { name: "Only the manager of this employee's position can change the substitute list" })).toBeVisible();
    await shot(assistantPage, "denied", view);
  } finally {
    await managerContext.close();
    await assistantContext.close();
  }
});
