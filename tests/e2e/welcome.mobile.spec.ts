// Landing /welcome і вхід /login на телефоні (ADR 0008, пункт 10; проєкт Playwright «mobile», Pixel 7) — розкладка за
// розробником, не AC PM: тому без AC ID і без тегу @uat. Лише читання: нічого не подаємо й не входимо.
import { expect, test, type Page } from "@playwright/test";
import { attachRuntimeErrors } from "./support/uat";

test.afterEach(async ({ page }) => attachRuntimeErrors(page));

test.use({ storageState: { cookies: [], origins: [] } });

/** Сторінка не ширша за екран: прокрутки вбік немає. */
async function expectNoSideScroll(page: Page) {
  const { scroll, width } = await page.evaluate(() => ({
    scroll: document.documentElement.scrollWidth,
    width: window.innerWidth,
  }));
  expect(scroll).toBeLessThanOrEqual(width);
}

test("the landing page fits a phone: sections in a menu, Sign in stays in the header", async ({ page }) => {
  await page.goto("/welcome");
  await expect(page.getByRole("heading", { level: 1, name: "Leave by your schedule, decided record by record" })).toBeVisible();
  const nav = page.getByRole("navigation", { name: "Main" });
  await expect(nav.getByRole("link", { name: "Sign in" })).toBeVisible();
  await expect(nav.getByRole("link", { name: "Balances" })).toBeHidden();
  await expectNoSideScroll(page);

  await nav.getByRole("button", { name: "Open menu" }).click();
  await page.getByRole("menuitem", { name: "Balances" }).click();
  await expect(page).toHaveURL(/#balances$/);
  await expect(page.getByRole("heading", { level: 2, name: "Counted in working days, to 0.01 day" })).toBeInViewport();

  // Кожна секція — у ширину екрана, і пісочниця «Try it» працює пальцем.
  await page.locator("#try").scrollIntoViewIfNeeded();
  await page.getByRole("button", { name: "Submit request" }).tap();
  await expect(page.getByRole("list", { name: "Records of your request" }).getByText("Approved")).toHaveCount(2);
  await page.mouse.wheel(0, 20_000);
  await expectNoSideScroll(page);
});

test("the sign-in page fits a phone and its form is usable by touch", async ({ page }) => {
  await page.goto("/login");
  await expectNoSideScroll(page);
  const email = page.getByLabel("Email");
  const password = page.getByLabel("Password", { exact: true });
  const submit = page.getByRole("button", { name: "Sign in" });
  for (const control of [email, password, submit]) await expect(control).toBeInViewport();

  // 16 px у полях на дотику: iOS не збільшує сторінку, коли поле отримує фокус.
  await expect(email).toHaveCSS("font-size", "16px");
  const box = await submit.boundingBox();
  expect(box?.height).toBeGreaterThanOrEqual(44);

  await email.tap();
  await email.fill("someone@example.test");
  await password.fill("not-a-real-password");
  await page.getByRole("button", { name: "Show password" }).tap();
  await expect(password).toHaveValue("not-a-real-password");
  await expect(password).toHaveAttribute("type", "text");
  await expect(submit).toBeEnabled();
  await expect(page.getByRole("link", { name: "What is Leave Portal?" })).toHaveAttribute("href", "/welcome");
});
