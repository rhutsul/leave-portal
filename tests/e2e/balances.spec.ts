// AC-BALANCE-13 — відмова в браузері: чужі залишки за прямим посиланням. Лише читання: безпечно на проді.
// «Тоді» PM — про відсутність («the balances are not shown»), тож доказ — сильні твердження про приховане: жодної
// картки залишку й жодного числа днів, ні імені, ні email другого працівника, ні рядка «<ім'я> · School year».
// Текст порожнього стану «These balances are not available to you.» — наш, не PM: його лише фіксуємо як те, що
// сторінка показує замість залишків, а не як текст вимоги.
import { expect, test, type Page } from "@playwright/test";
import { attachRuntimeErrors, given, thenStep, when } from "./support/uat";

const TEACHER1 = "teacher1@example.test";
const TEACHER2 = "teacher2@example.test";
// Заголовки карток залишків (src/components/balance-cards.tsx) і число днів на картці: «22.00 days».
const BALANCE_CARD_TITLES = ["Sick leave left", "Personal leave left", "Unpaid leave used", "Family celebration used"];
const DAYS = /\d+\.\d{2}\s*days/;

/** Id і ім'я працівника teacher2 — з вибору працівника на /balances в адміністратора (лише читання). */
async function otherEmployee(page: Page): Promise<{ id: string; name: string }> {
  await page.goto("/balances");
  await page.getByLabel("Employee").click();
  const option = page.getByRole("option").filter({ hasText: TEACHER2 });
  const name = (await option.locator("span.truncate").first().innerText()).trim();
  await option.click();
  await page.waitForURL((url) => url.searchParams.has("employee"));
  return { id: new URL(page.url()).searchParams.get("employee")!, name };
}

test.use({ storageState: "playwright/.auth/teacher1.json" });

test.afterEach(async ({ page }) => attachRuntimeErrors(page));

test(
  "AC-BALANCE-13: teacher1@example.test opens another employee's balances by a direct link — the balances are not shown",
  { tag: ["@uat"], annotation: { type: "ac", description: "AC-BALANCE-13" } },
  async ({ browser, page }) => {
    let other = { id: "", name: "" };

    await given("employee teacher1@example.test", async () => {
      // Id другого працівника знає адміністратор: окремий контекст із його сесією, лише перегляд.
      const admin = await browser.newContext({ storageState: "playwright/.auth/admin.json" });
      other = await otherEmployee(await admin.newPage());
      await admin.close();
      expect(other.id).toMatch(/^[0-9a-f-]{36}$/);
      expect(other.name).not.toBe("");

      await page.goto("/balances");
      await expect(page.getByTestId("user-email")).toHaveText(TEACHER1);
    });

    await when("teacher1@example.test tries to view another employee's balances (teacher2@example.test, direct link)", async () => {
      await page.goto(`/balances?employee=${other.id}`);
      await expect(page).toHaveURL((url) => url.searchParams.get("employee") === other.id);
    });

    await thenStep(
      page,
      {
        clause: "the balances are not shown.",
        visible: [
          "the Balances page shows no balance cards and no numbers of days; instead it says «These balances are not available to you.»",
        ],
        hidden: [
          "no balance card (Sick leave left, Personal leave left, Unpaid leave used, Family celebration used) and no «… days» number anywhere on the page",
          "neither the name nor the email of teacher2@example.test is on the page, and there is no «<name> · School year» line",
          "the link on the page is the direct link to teacher2@example.test's balances (?employee=<teacher2 id>)",
        ],
      },
      async () => {
        const main = page.getByRole("main");
        await expect(main.getByRole("heading", { level: 1, name: "Balances" })).toBeVisible();
        await expect(main.getByText("These balances are not available to you.")).toBeVisible();
        for (const title of BALANCE_CARD_TITLES) await expect(page.getByText(title)).toHaveCount(0);
        await expect(page.getByText(DAYS)).toHaveCount(0);
        await expect(page.getByText(other.name)).toHaveCount(0);
        await expect(page.getByText(TEACHER2)).toHaveCount(0);
        await expect(main.getByText(/ · School year/)).toHaveCount(0);
        await expect(main.getByRole("heading", { level: 2 })).toHaveText(/^School year \d{4}–\d{4}$/);
      },
    );
  },
);
