// Overview v3 (ADR 0007) — вигляд головної за роллю, не AC PM: тому без AC ID і без тегу @uat. Блоки ролей —
// лише читання; блок «school closures» пише (@prod-writes) і прибирає за собою.
// Працівник бачить свої блоки й не бачить блоків менеджера; адміністратор (рішення щодо будь-якого запису) — «To decide».
import { expect, test } from "@playwright/test";
import { addClosure, cleanupRemembered, freeOverviewDates } from "./support/admin";
import { attachRuntimeErrors } from "./support/uat";

test.afterEach(async ({ page }) => attachRuntimeErrors(page));

test.describe("employee", () => {
  test.use({ storageState: "playwright/.auth/teacher1.json" });

  test("Overview shows the summary, the two-week diagram, the next leave and the activity, without decision blocks", async ({ page }) => {
    await page.goto("/");
    await expect(page.getByRole("region", { name: "Summary" })).toContainText("Sick leave left");
    await expect(page.getByRole("region", { name: "Summary" })).toContainText("Returned for revision");
    await expect(page.getByRole("table", { name: "Your leave this week and next" })).toBeVisible();
    await expect(page.getByRole("heading", { name: "Next leave" })).toBeVisible();
    await expect(page.getByRole("heading", { name: "Activity" })).toBeVisible();
    await expect(page.getByRole("heading", { name: /^To decide/ })).toHaveCount(0);
    await expect(page.getByRole("link", { name: "Open Decisions" })).toHaveCount(0);
  });
});

test.describe("administrator", () => {
  test.use({ storageState: "playwright/.auth/admin.json" });

  test("Overview shows records to decide and who is away", async ({ page }) => {
    await page.goto("/");
    await expect(page.getByRole("region", { name: "Summary" })).toContainText("To decide");
    await expect(page.getByRole("heading", { name: /^To decide/ })).toBeVisible();
    await expect(page.getByRole("table", { name: "Leave of your positions this week and next" })).toBeVisible();
  });
});

// Закриття школи на Overview (вигляд, не AC PM): рядок про найближче закриття з посиланням на School calendar і
// позначка в заголовку колонки діаграми. Пише (закриття — для всієї школи), тож @prod-writes: дати — з показаних
// двох тижнів, на них не має бути чужих закриттів, а створене прибирається за id.
test.describe("school closures", { tag: ["@prod-writes"] }, () => {
  test.use({ storageState: "playwright/.auth/teacher1.json" });

  test.afterEach(async () => {
    await cleanupRemembered();
  });

  test("Overview tells the nearest school closure and marks it on the two-week diagram", async ({ page }) => {
    const dates = await freeOverviewDates();
    expect(dates, "two working days of the shown weeks without closures and conflicting records").not.toBeNull();
    const { whole, early } = dates!;
    await addClosure("Overview check break", whole, whole);
    await addClosure("Overview check meeting", early, early, 12 * 60);

    await page.goto("/");
    // Видимий рядок — найближче закриття (на проді це може бути й чуже); усі закриття показаного — списком для
    // зчитувача екрана, бо місяць із точок і штриховка — лише графіка.
    await expect(page.getByRole("main").getByText(/^School (closed|closes early): .+ · School calendar$/)).toBeVisible();
    const list = page.getByRole("list", { name: "School closures this month and the next two weeks" });
    await expect(list.getByRole("listitem").filter({ hasText: /^School closes early: Overview check meeting, .+ from 12:00$/ })).toHaveCount(1);
    await expect(list.getByRole("listitem").filter({ hasText: /^School closed: Overview check break, / })).toHaveCount(1);
    await expect(page.getByRole("main").getByRole("link", { name: "School calendar" })).toHaveAttribute("href", "/calendar");
    const table = page.getByRole("table", { name: "Your leave this week and next" });
    await expect(table.getByRole("columnheader", { name: /School closed: Overview check break$/ })).toBeVisible();
    await expect(table.getByRole("columnheader", { name: /School closes early: Overview check meeting from 12:00$/ })).toBeVisible();
  });
});
