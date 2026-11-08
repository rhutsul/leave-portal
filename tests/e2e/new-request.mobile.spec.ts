// Нова заявка на телефоні (ADR 0008, пункти 5, 6 і 8; проєкт Playwright «mobile», Pixel 7) — розкладка за розробником,
// не AC PM: тому без AC ID і без тегу @uat. Лише читає: форму проходимо до підсумку, але не подаємо.
import { expect, test, type Locator, type Page } from "@playwright/test";
import { showNovember2026 } from "./support/calendar";
import { attachRuntimeErrors } from "./support/uat";

test.afterEach(async ({ page }) => attachRuntimeErrors(page));

test.use({ storageState: "playwright/.auth/teacher1.json" });

async function noHorizontalScroll(page: Page) {
  const width = page.viewportSize()!.width;
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(width);
}

/** Дія кроку прикріплена до низу екрана: position fixed, низ панелі — низ вікна, кнопка у видимій частині. */
async function pinnedAtBottom(page: Page, action: Locator) {
  const bar = action.locator("..");
  expect(await bar.evaluate((el) => getComputedStyle(el).position)).toBe("fixed");
  const box = (await bar.boundingBox())!;
  expect(Math.round(box.y + box.height)).toBe(page.viewportSize()!.height);
  await expect(action).toBeInViewport();
}

function dayCells(page: Page) {
  return page.getByRole("main").getByRole("button", { name: /^\w{3}, \d{1,2} Nov 2026/ });
}

test("on a phone the calendar fills the card, the step action stays pinned at the bottom, nothing scrolls sideways", async ({ page }) => {
  await page.goto("/requests/new");
  await showNovember2026(page);

  // Клітинка дня — щонайменше 44 px від 390 px (Pixel 7 — 412 px).
  const cells = dayCells(page);
  const first = (await cells.first().boundingBox())!;
  expect(first.width).toBeGreaterThanOrEqual(44);
  expect(first.height).toBeGreaterThanOrEqual(44);
  // Сім колонок уміщаються в екран.
  const sunday = (await page.getByRole("button", { name: /^Sun, 1 Nov 2026/ }).boundingBox())!;
  expect(sunday.x + sunday.width).toBeLessThanOrEqual(page.viewportSize()!.width);
  await noHorizontalScroll(page);

  const continueButton = page.getByRole("button", { name: "Continue" });
  await pinnedAtBottom(page, continueButton);
  await page.evaluate(() => window.scrollTo(0, document.documentElement.scrollHeight));
  await pinnedAtBottom(page, continueButton);
  // Кінець сторінки (підсумок «Your request») не ховається під панеллю дій.
  const note = page.getByText("Each record goes to the manager of its position and is decided separately.");
  const bar = (await continueButton.locator("..").boundingBox())!;
  expect((await note.boundingBox())!.y + (await note.boundingBox())!.height).toBeLessThanOrEqual(bar.y);

  // Короткий підсумок ліворуч від дії: кількість дат.
  await page.getByRole("button", { name: /^Thu, 5 Nov 2026/ }).click();
  await expect(continueButton.locator("..").getByText("1 date", { exact: true })).toBeVisible();

  // Посади й години: поля часу вміщаються, 16 px на дотику (iOS не збільшує сторінку).
  await continueButton.click();
  await expect(page.getByRole("heading", { name: "Positions and hours" })).toBeInViewport();
  await page.getByRole("button", { name: "Specific hours" }).first().click();
  const from = page.getByLabel("From").first();
  await expect(from).toBeInViewport();
  expect(await from.evaluate((el) => getComputedStyle(el).fontSize)).toBe("16px");
  const to = (await page.getByLabel("to", { exact: true }).first().boundingBox())!;
  expect(to.x + to.width).toBeLessThanOrEqual(page.viewportSize()!.width);
  await page.getByRole("button", { name: "Whole day" }).first().click();
  await noHorizontalScroll(page);
  await pinnedAtBottom(page, continueButton);

  // Тип відсутності, далі підсумок: записи — картки, кнопка подання прикріплена внизу (не натискаємо).
  await continueButton.click();
  await page.getByText("Personal leave", { exact: true }).click();
  await noHorizontalScroll(page);
  await continueButton.click();
  await expect(page.getByRole("heading", { name: "Check and confirm" })).toBeVisible();
  await noHorizontalScroll(page);
  const submit = page.getByRole("button", { name: "Submit request" });
  await pinnedAtBottom(page, submit);
  await expect(submit.locator("..").getByText(/^1 record · /)).toBeVisible();
  // «Back to editing» на телефоні — кнопка-іконка з тією самою назвою, ціль дотику 44×44 px.
  const back = page.getByRole("button", { name: "Back to editing" });
  await expect(back).toBeInViewport();
  const backBox = (await back.boundingBox())!;
  expect(backBox.width).toBeGreaterThanOrEqual(44);
  expect(backBox.height).toBeGreaterThanOrEqual(44);
});

test.describe("at 360 px", () => {
  test.use({ viewport: { width: 360, height: 780 } });

  test("a calendar day is at least 40 px and the step bar scrolls inside itself", async ({ page }) => {
    await page.goto("/requests/new");
    await showNovember2026(page);
    const cell = (await dayCells(page).first().boundingBox())!;
    expect(cell.width).toBeGreaterThanOrEqual(40);
    expect(cell.height).toBeGreaterThanOrEqual(40);
    await noHorizontalScroll(page);
    // Кроки — один рядок, що прокручується вбік усередині смужки, а не переноситься й не обрізається.
    const steps = page.getByRole("navigation", { name: "Request steps" });
    expect((await steps.boundingBox())!.width).toBeLessThanOrEqual(360);
    expect(await steps.evaluate((el) => getComputedStyle(el).overflowX)).toMatch(/^(auto|scroll)$/);
    expect(await steps.evaluate((el) => el.scrollWidth > el.clientWidth)).toBe(true);
    const tops = await steps.getByRole("button").evaluateAll((buttons) => buttons.map((b) => b.getBoundingClientRect().top));
    expect(new Set(tops).size).toBe(1);
    await steps.evaluate((el) => el.scrollTo({ left: el.scrollWidth }));
    expect(await steps.evaluate((el) => el.scrollLeft)).toBeGreaterThan(0);
    await expect(steps.getByRole("button", { name: "Summary" })).toBeInViewport({ ratio: 1 });
  });
});
