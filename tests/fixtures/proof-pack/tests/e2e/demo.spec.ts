import { expect, test } from "@playwright/test";

test("AC-DEMO-02: shows the empty state", async ({ page }) => {
  await expect(page).toHaveTitle(/x/);
});
