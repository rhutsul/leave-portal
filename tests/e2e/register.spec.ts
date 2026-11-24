// Реєстр погоджених відсутностей /register і його CSV (ADR 0012). Вимог PM до фічі ще немає (requirements/product.md:
// матриця прав і дорожня карта, «later»), тож тести — без AC ID і без кроків «Дано / Тоді» UAT.
//
// Manager і admin: синтетичний працівник uat-<run>-…@example.test з двома погодженими записами наступного місяця
// (tests/e2e/support/register.ts, секретний ключ, @prod-writes); afterEach видаляє його разом із записами, залишок
// назве teardown. Employee — лише читання: відмова й немає пункту меню. Знімок 1280 px для docs/img/ — у
// test-results/, звідки його бере артефакт CI.
import { readFile } from "node:fs/promises";
import { expect, test, type Page } from "@playwright/test";
import { cleanupRemembered } from "./support/admin";
import { kyivMonth, registerFixture, screenshotWithoutOverlays, type RegisterFixture } from "./support/register";
import { attachRuntimeErrors } from "./support/uat";

const MONTHS = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];
const monthLabel = (month: string) => `${MONTHS[Number(month.slice(5)) - 1]} ${month.slice(0, 4)}`;

/** Сторінка з даними фікстури: рядки працівника, підсумок і завантажений CSV. */
async function checkRegister(page: Page, fx: RegisterFixture) {
  await page.goto(`/register?division=${fx.divisionCode}&month=${fx.month}`);
  await expect(page.getByRole("heading", { level: 1, name: "Register" })).toBeVisible();
  await expect(page.getByRole("heading", { level: 2, name: `${fx.divisionName} · ${monthLabel(fx.month)}` })).toBeVisible();

  const rows = page.getByTestId("register-row").filter({ hasText: fx.employee.email });
  await expect(rows).toHaveCount(2);
  await expect(rows.first()).toContainText(fx.employee.fullName);
  await expect(rows.first()).toContainText("Whole day");
  await expect(rows.first()).toContainText("Sick leave");
  await expect(rows.nth(1)).toContainText("08:30–12:00");
  await expect(rows.nth(1)).toContainText("Unpaid leave");
  await expect(page.getByTestId("register-totals")).toContainText(/\d+ records? · /);

  const [download] = await Promise.all([
    page.waitForEvent("download"),
    page.getByRole("link", { name: "Download CSV" }).click(),
  ]);
  expect(download.suggestedFilename()).toBe(`register-${fx.divisionCode}-${fx.month}.csv`);
  const csv = await readFile((await download.path())!, "utf8");
  expect(csv.codePointAt(0)).toBe(0xfeff);
  const lines = csv.slice(1).split("\r\n");
  // Чиста таблиця: перший рядок — шапка, без заголовка над нею й без рядка «Total».
  expect(lines[0]).toBe(
    "Employee,Email,Position,Position type,Date,Hours,From,To,Duration (h),Leave type,Paid days,Unpaid days,Approved by,Approved on",
  );
  const mine = lines.filter((l) => l.includes(fx.employee.email));
  expect(mine).toHaveLength(2);
  expect(mine[0]).toMatch(new RegExp(`^${fx.employee.fullName},${fx.employee.email},UAT teacher,Main,\\d{4}-\\d{2}-\\d{2},Whole day,08:30,15:30,7\\.00,Sick leave,1\\.00,0\\.00,`));
  expect(mine[1]).toMatch(/,08:30–12:00,08:30,12:00,3\.50,Unpaid leave,0\.00,0\.50,/);
  expect(lines.some((l) => l.startsWith("Total"))).toBe(false);
  expect(lines.at(-1)).toBe("");
}

test.describe("register for a manager", { tag: "@prod-writes" }, () => {
  test.use({ storageState: "playwright/.auth/manager1.json" });

  test.afterEach(async ({ page }) => {
    await attachRuntimeErrors(page);
    await cleanupRemembered();
  });

  test("opens from the menu, shows the approved records of own positions and downloads them as CSV", async ({ page }) => {
    const fx = await registerFixture();

    await page.goto("/");
    await page.getByRole("navigation", { name: "Main" }).getByRole("link", { name: "Register" }).click();
    await expect(page).toHaveURL(/\/register$/);
    // Менеджер бачить лише підрозділи, де веде посаду: manager1@ — лише свій.
    await page.getByLabel("Division").click();
    await expect(page.getByRole("option", { name: fx.divisionName })).toBeVisible();
    await expect(page.getByRole("option")).toHaveCount(1);
    await page.keyboard.press("Escape");

    await checkRegister(page, fx);
    await screenshotWithoutOverlays(page, test.info().outputPath("register-1280-light.png"), true);

    // Місяць гортається посиланнями; у поточному місяці записів фікстури немає.
    await page.getByRole("link", { name: "Previous month" }).click();
    await expect(page).toHaveURL(new RegExp(`month=${kyivMonth(0)}`));
    await expect(page.getByTestId("register-row").filter({ hasText: fx.employee.email })).toHaveCount(0);
  });
});

test.describe("register for an administrator", { tag: "@prod-writes" }, () => {
  test.use({ storageState: "playwright/.auth/admin.json" });

  test.afterEach(async ({ page }) => {
    await attachRuntimeErrors(page);
    await cleanupRemembered();
  });

  test("chooses any division and downloads its register", async ({ page }) => {
    const fx = await registerFixture();

    await page.goto(`/register?month=${fx.month}`);
    await page.getByLabel("Division").click();
    for (const name of ["Administration", "Elementary school", "High school"]) {
      await expect(page.getByRole("option", { name })).toBeVisible();
    }
    await page.getByRole("option", { name: fx.divisionName }).click();
    await expect(page).toHaveURL(new RegExp(`division=${fx.divisionCode}`));

    await checkRegister(page, fx);
  });
});

test.describe("register for an employee", () => {
  test.use({ storageState: "playwright/.auth/teacher1.json" });

  test.afterEach(async ({ page }) => attachRuntimeErrors(page));

  test("has no menu item, the page refuses access and the CSV is forbidden", async ({ page }) => {
    await page.goto("/");
    const nav = page.getByRole("navigation", { name: "Main" });
    await expect(nav.getByRole("link", { name: "My requests" })).toBeVisible();
    await expect(nav.getByRole("link", { name: "Register" })).toHaveCount(0);

    await page.goto("/register");
    await expect(page.getByText("You can't see the register")).toBeVisible();
    await expect(page.getByRole("link", { name: "Download CSV" })).toHaveCount(0);
    await expect(page.getByTestId("register-row")).toHaveCount(0);

    const response = await page.request.get(`/register/export?division=elementary&month=${kyivMonth(0)}`);
    expect(response.status()).toBe(403);
    expect(response.headers()["content-type"]).not.toContain("text/csv");
  });
});
