// Landing /welcome і вхід /login на телефоні (ADR 0008, пункт 10; проєкт Playwright «mobile», Pixel 7) — розкладка за
// розробником, не AC PM: тому без AC ID і без тегу @uat. Лише читання: нічого не подаємо й не входимо.
import { expect, test, type Page } from "@playwright/test";
import { attachRuntimeErrors } from "./support/uat";

test.afterEach(async ({ page }) => attachRuntimeErrors(page));

test.use({ storageState: { cookies: [], origins: [] } });

/** Сторінка не ширша за екран: прокрутки вбік немає — і вгорі, і внизу сторінки. */
async function expectNoSideScroll(page: Page) {
  for (const y of [0, Number.MAX_SAFE_INTEGER]) {
    await page.evaluate((top) => window.scrollTo(0, top), y);
    const { scroll, width } = await page.evaluate(() => ({
      scroll: document.documentElement.scrollWidth,
      width: window.innerWidth,
    }));
    expect(scroll).toBeLessThanOrEqual(width);
  }
}

test("the landing page fits a phone: sections in a menu, Sign in stays in the header", async ({ page }) => {
  await page.goto("/welcome");
  await expect(page.getByRole("heading", { level: 1, name: "Leave by your schedule, decided record by record" })).toBeVisible();
  const nav = page.getByRole("navigation", { name: "Main" });
  await expect(nav.getByRole("link", { name: "Sign in" })).toBeVisible();
  await expect(nav.getByRole("link", { name: "Balances" })).toBeHidden();
  await expectNoSideScroll(page);

  // Вибір розділу в меню веде до нього й ставить фокус на його заголовок.
  await page.evaluate(() => window.scrollTo(0, 0));
  await nav.getByRole("button", { name: "Open menu" }).click();
  await page.getByRole("menuitem", { name: "Balances" }).click();
  await expect(page).toHaveURL(/#balances$/);
  const heading = page.getByRole("heading", { level: 2, name: "Counted in working days, to 0.01 day" });
  await expect(heading).toBeInViewport();
  await expect(heading).toBeFocused();

  // Пісочниця «Try it» працює пальцем: кожен запис заявки схвалює менеджер його посади.
  await page.locator("#try").scrollIntoViewIfNeeded();
  const records = page.getByRole("list", { name: "Records of your request" });
  const count = await records.getByRole("listitem").count();
  expect(count).toBeGreaterThan(0);
  await page.getByRole("button", { name: "Submit request" }).tap();
  await expect(records.getByText("Approved")).toHaveCount(count);
});

test("the sign-in page fits a phone and its form is usable by touch", async ({ page }) => {
  await page.goto("/login");
  await expectNoSideScroll(page);
  await page.evaluate(() => window.scrollTo(0, 0));
  const email = page.getByLabel("Email");
  const password = page.getByLabel("Password", { exact: true });
  const submit = page.getByRole("button", { name: "Sign in" });
  for (const control of [email, password, submit]) await expect(control).toBeInViewport();

  // 16 px у полях на дотику: iOS не збільшує сторінку, коли поле отримує фокус; поля й кнопка — від 44 px.
  await expect(email).toHaveCSS("font-size", "16px");
  for (const control of [email, password, submit]) {
    expect((await control.boundingBox())?.height).toBeGreaterThanOrEqual(44);
  }

  await email.tap();
  await email.fill("someone@example.test");
  await password.fill("not-a-real-password");
  await page.getByRole("button", { name: "Show password" }).tap();
  await expect(password).toHaveValue("not-a-real-password");
  await expect(password).toHaveAttribute("type", "text");
  await expect(submit).toBeEnabled();
  await expect(page.getByRole("link", { name: "What is Leave Portal?" })).toHaveAttribute("href", "/welcome");
});

test.describe("the narrowest phone, 360 px", () => {
  test.use({ viewport: { width: 360, height: 740 } });

  for (const path of ["/welcome", "/login"]) {
    test(`${path} has no horizontal scroll at 360 px`, async ({ page }) => {
      await page.goto(path);
      await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
      await expectNoSideScroll(page);
    });
  }
});

test.describe("with reduced motion", () => {
  test.use({ reducedMotion: "reduce" });

  for (const path of ["/welcome", "/login"]) {
    test(`${path} does not load the particle field`, async ({ page }) => {
      // Файл three — єдиний, де є WebGLRenderer: ловимо всі скрипти сторінки й шукаємо його в них.
      const scripts: Promise<string>[] = [];
      page.on("response", (response) => {
        if (response.request().resourceType() === "script") scripts.push(response.text().catch(() => ""));
      });
      await page.goto(path, { waitUntil: "load" });
      // Рівень поля відомий після гідратації; легке поле почало б вантажитись після `load`, у вільну хвилину браузера —
      // чекаємо дві такі хвилини.
      await expect(page.locator("[data-field-tier]")).toHaveAttribute("data-field-tier", "none");
      for (let i = 0; i < 2; i++) {
        await page.evaluate(() => new Promise((done) => requestIdleCallback(() => done(null), { timeout: 1000 })));
      }
      const bodies = await Promise.all(scripts);
      expect(bodies.length).toBeGreaterThan(0);
      expect(bodies.some((body) => body.includes("WebGLRenderer"))).toBe(false);
      await expect(page.locator("canvas")).toHaveCount(0);
    });
  }
});
