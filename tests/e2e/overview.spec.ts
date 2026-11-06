// Overview v3 (ADR 0007) — вигляд головної за роллю, не AC PM: тому без AC ID і без тегу @uat. Лише читання.
// Працівник бачить свої блоки й не бачить блоків менеджера; адміністратор (рішення щодо будь-якого запису) — «To decide».
import { expect, test } from "@playwright/test";
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
