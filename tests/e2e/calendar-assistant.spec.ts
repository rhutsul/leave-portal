// UAT помічника календаря (openspec/specs/calendar-assistant/spec.md, design.md D9 impl-calendar-assistant): один AC —
// один test, «Тоді» — дослівно з AC PM (requirements/05-calendar-assistant.md), невидиме — твердженнями й у hidden.
//
// Які AC тут і чому:
//   * AC-ASSIST-03 і AC-ASSIST-06 кличуть справжню модель — тег @live-model, тож вибираються лише на проді
//     (UAT_BASE_URL, ключ у Vercel); у CI і локальній збірці живого виклику немає (playwright.config.ts). Кожен —
//     один запит до безкоштовного ліміту OpenRouter.
//   * AC-ASSIST-03 ще й пише в шкільний календар, тож @prod-writes, як UAT шкільного календаря: перед тестом
//     assertCalendarClean (на датах AC немає чужих закриттів і записів), після — прибирання створеного за назвою й
//     датами (afterEach), teardown cleanup перевіряє, що нічого не лишилось.
//   * AC-ASSIST-10 і AC-ASSIST-11 модель не кличуть — @uat, тож ідуть і в CI (job e2e, обов'язковий у ruleset).
// Решта AC зрізу доведені нижчими рівнями (golden на записах живого прогону, тести дій і PGlite) — docs/conformance.md.
import { expect, test, type Page } from "@playwright/test";
import { assertCalendarClean, cleanupRemembered, hasAdminKey, rememberClosuresNamed } from "./support/admin";
import { attachRuntimeErrors, given, thenStep, when } from "./support/uat";

const ac = (id: string) => ({ annotation: { type: "ac", description: id } });

const AC01_TEXT = "Winter break 28.12–08.01; Teachers' meeting 20.11 from 12:00";
const NOT_ADMIN = "Only an administrator can change the school calendar";
const REFUSED = "The calendar assistant only helps to add school closures. Paste the text of the school calendar.";
const TOO_LONG = "The text can be at most 2000 characters";

let windowsClean = false;

test.beforeEach(async ({}, info) => {
  windowsClean = false;
  if (!info.tags.includes("@prod-writes")) return;
  await assertCalendarClean();
  windowsClean = true;
});

test.afterEach(async ({ page }, info) => {
  await attachRuntimeErrors(page);
  // Прибираємо лише тоді, коли перевірка «чисто» пройшла: інакше рядки на датах AC — чужі.
  if (!info.tags.includes("@prod-writes") || !hasAdminKey() || !windowsClean) return;
  for (const name of ["Winter holidays", "Winter break", "Teachers' meeting"]) await rememberClosuresNamed(name);
  await cleanupRemembered();
});

const panel = (page: Page) => page.getByRole("dialog", { name: "Calendar assistant" });
const closureRow = (page: Page, name: string) => page.getByTestId("closure").filter({ hasText: name });

/** «School calendar» 2026–2027 і панель помічника кнопкою «Add from text», як людина. */
async function openAssistant(page: Page) {
  await page.goto("/calendar?year=2026");
  await expect(page.getByRole("heading", { level: 1, name: "School calendar" })).toBeVisible();
  await page.getByRole("link", { name: "Add from text" }).click();
  await expect(panel(page)).toBeVisible();
}

async function askFor(page: Page, text: string) {
  await panel(page).getByLabel("Paste the text of the school calendar").fill(text);
  await panel(page).getByRole("button", { name: "Suggest closures" }).click();
}

test.describe("admin@example.test", () => {
  test.use({ storageState: "playwright/.auth/admin.json" });

  test(
    'AC-ASSIST-03: removes "Teachers\' meeting", renames "Winter break" to "Winter holidays" and saves — the calendar shows only "Winter holidays"',
    { tag: ["@uat", "@prod-writes", "@live-model"], ...ac("AC-ASSIST-03") },
    async ({ page }) => {
      await given("the 2 suggested closures from AC-ASSIST-01", async () => {
        await openAssistant(page);
        await askFor(page, AC01_TEXT);
        // Один виклик моделі: відповідь — до 30 с (AC-ASSIST-09), далі сторінка показала б «unavailable».
        await expect(panel(page).getByRole("heading", { name: "2 suggested closures" })).toBeVisible({ timeout: 45_000 });
        await expect(panel(page).getByLabel("Name")).toHaveCount(2);
        await expect(panel(page).getByLabel("Name").nth(0)).toHaveValue("Teachers' meeting");
        await expect(panel(page).getByLabel("Name").nth(1)).toHaveValue("Winter break");
      });

      await when('the administrator removes "Teachers\' meeting", changes the name "Winter break" to "Winter holidays" and saves', async () => {
        await panel(page).getByRole("button", { name: "Remove suggestion Teachers' meeting" }).click();
        await expect(panel(page).getByLabel("Name")).toHaveCount(1);
        await panel(page).getByLabel("Name").fill("Winter holidays");
        await panel(page).getByRole("button", { name: "Save closures" }).click();
      });

      await thenStep(
        page,
        {
          clause: 'the school calendar shows only "Winter holidays" 2026-12-28 – 2027-01-08.',
          visible: ["«Winter holidays» with the dates 2026-12-28 – 2027-01-08 in the list of closures", "no «Teachers' meeting» and no «Winter break» in the list"],
          hidden: ["the panel closed after saving: every suggestion was saved (checked)"],
        },
        async () => {
          await expect(page).toHaveURL(/\/calendar\?year=2026$/);
          await expect(panel(page)).toBeHidden();
          await expect(closureRow(page, "Winter holidays")).toHaveCount(1);
          await expect(closureRow(page, "Winter holidays")).toContainText("2026-12-28 – 2027-01-08");
          await expect(closureRow(page, "Teachers' meeting")).toHaveCount(0);
          await expect(closureRow(page, "Winter break")).toHaveCount(0);
        },
      );
    },
  );

  test(
    "AC-ASSIST-06: a poem request — no closures suggested, the refusal message",
    { tag: ["@uat", "@live-model"], ...ac("AC-ASSIST-06") },
    async ({ page }) => {
      await given("the administrator is signed in", async () => {
        await openAssistant(page);
      });

      await when('the administrator asks for suggestions for the text "Write a short poem about the winter holidays"', async () => {
        await askFor(page, "Write a short poem about the winter holidays");
      });

      await thenStep(
        page,
        {
          clause: `no closures are suggested, and the administrator sees the message "${REFUSED}"`,
          visible: [`the message «${REFUSED}»`, "no suggested closures and no «Save closures»"],
        },
        async () => {
          await expect(panel(page).getByRole("alert")).toHaveText(REFUSED, { timeout: 45_000 });
          await expect(panel(page).getByLabel("Name")).toHaveCount(0);
          await expect(panel(page).getByRole("button", { name: "Save closures" })).toHaveCount(0);
        },
      );
    },
  );

  test(
    "AC-ASSIST-10: a text of 2001 characters — the assistant is not asked, the length message",
    { tag: ["@uat"], ...ac("AC-ASSIST-10") },
    async ({ page }) => {
      const text = "Winter break 28.12–08.01. ".padEnd(2001, "x");
      await given("the administrator pastes a text of 2001 characters", async () => {
        await openAssistant(page);
        await panel(page).getByLabel("Paste the text of the school calendar").fill(text);
        await expect(panel(page).getByText("2001 / 2000")).toBeVisible();
      });

      await when("the administrator asks for suggestions", async () => {
        await panel(page).getByRole("button", { name: "Suggest closures" }).click();
      });

      await thenStep(
        page,
        {
          clause: `the calendar assistant is not asked, and the administrator sees the message "${TOO_LONG}".`,
          visible: [`the message «${TOO_LONG}»`, "the counter «2001 / 2000»"],
          hidden: [
            "the calendar assistant is not asked: the server checks the length before calling the model (tests/calendar-assistant-actions.test.ts, AC-ASSIST-10); no suggestions appear (checked)",
          ],
        },
        async () => {
          await expect(panel(page).getByRole("alert")).toHaveText(TOO_LONG);
          await expect(panel(page).getByLabel("Name")).toHaveCount(0);
        },
      );
    },
  );
});

test.describe("teacher1@example.test", () => {
  test.use({ storageState: "playwright/.auth/teacher1.json" });

  test(
    "AC-ASSIST-11: teacher1@example.test opens the calendar assistant by a direct link — «Only an administrator can change the school calendar»",
    { tag: ["@uat"], ...ac("AC-ASSIST-11") },
    async ({ page }) => {
      let before = 0;
      await given("teacher1@example.test is signed in and has only the employee role", async () => {
        await page.goto("/calendar?year=2026");
        await expect(page.getByTestId("user-email")).toHaveText("teacher1@example.test");
        await expect(page.getByRole("link", { name: "Add from text" })).toHaveCount(0);
        before = await page.getByTestId("closure").count();
      });

      await when("teacher1@example.test opens the calendar assistant by a direct link", async () => {
        await page.goto("/calendar/assistant");
      });

      await thenStep(
        page,
        {
          clause: `teacher1@example.test sees the message "${NOT_ADMIN}", and no closures are suggested or saved.`,
          visible: [`the message «${NOT_ADMIN}»`, "no text field, no «Suggest closures» and no «Save closures»"],
          hidden: [
            "no closures are saved: the same number of closures before and after (checked after the frame); the actions and the database check the role again (tests/calendar-assistant-actions.test.ts)",
          ],
        },
        async () => {
          await expect(panel(page)).toContainText(NOT_ADMIN);
          await expect(panel(page).getByLabel("Paste the text of the school calendar")).toHaveCount(0);
          await expect(panel(page).getByRole("button", { name: "Suggest closures" })).toHaveCount(0);
          await expect(panel(page).getByRole("button", { name: "Save closures" })).toHaveCount(0);
        },
      );
      await page.goto("/calendar?year=2026");
      await expect(page.getByTestId("closure")).toHaveCount(before);
    },
  );
});
