// Landing /welcome і редирект гостя (ADR 0007) — маршрут і вигляд за розробником, не AC PM: тому без AC ID і без
// тегу @uat. Лише читання: пісочниця «Try it» нічого не зберігає.
import { expect, test } from "@playwright/test";
import { attachRuntimeErrors } from "./support/uat";

test.afterEach(async ({ page }) => attachRuntimeErrors(page));

test.describe("guest", () => {
  test.use({ storageState: { cookies: [], origins: [] } });

  test("a guest who opens the root sees the landing page with Sign in", async ({ page }) => {
    await page.goto("/");
    await expect(page).toHaveURL(/\/welcome$/);
    await expect(page.getByRole("heading", { level: 1, name: "Leave by your schedule, decided record by record" })).toBeVisible();
    await expect(page.getByRole("navigation", { name: "Main" }).getByRole("link", { name: "Sign in" })).toHaveAttribute("href", "/login");
  });

  test("a guest on any other protected path still sees the sign-in page", async ({ page }) => {
    for (const path of ["/requests", "/decisions", "/calendar"]) {
      await page.goto(path);
      await expect(page).toHaveURL(/\/login$/);
    }
    await expect(page.getByRole("link", { name: "What is Leave Portal?" })).toHaveAttribute("href", "/welcome");
  });

  test("the Try it playground splits a request into records and decides each one", async ({ page }) => {
    await page.goto("/welcome");
    const records = page.getByRole("list", { name: "Records of your request" });
    // Thursday with both positions: one record per position, 1.00 day in total.
    await expect(records.getByRole("listitem")).toHaveCount(2);
    await expect(page.getByText("2 records · 1.00 days")).toBeVisible();
    await page.getByRole("button", { name: "Submit request" }).click();
    await expect(records.getByText("Approved")).toHaveCount(2);
    await expect(page.getByText("15.64")).toBeVisible();
    await page.getByRole("button", { name: "Start over" }).click();
    await expect(records.getByText("Not submitted")).toHaveCount(2);
  });
});

test.describe("signed-in employee", () => {
  test.use({ storageState: "playwright/.auth/teacher1.json" });

  test("sees the landing page with Open the portal and keeps Overview on the root", async ({ page }) => {
    await page.goto("/welcome");
    await expect(page.getByRole("navigation", { name: "Main" }).getByRole("link", { name: "Open the portal" })).toHaveAttribute("href", "/");
    await page.goto("/");
    await expect(page).not.toHaveURL(/\/welcome$/);
    await expect(page.getByRole("region", { name: "Summary" })).toBeVisible();
  });
});
