// Overview на телефоні (ADR 0008, проєкт Playwright «mobile») з закриттями школи — вигляд за розробником, не AC PM:
// тому без AC ID. На 360 px сторінка не прокручується вбік, смуга двох тижнів прокручується всередині своєї картки,
// рядок про найближче закриття видно. Закриття для «Дано» створює секретним ключем і прибирає за id (@prod-writes).
import { expect, test } from "@playwright/test";
import { addClosure, cleanupRemembered, freeOverviewDates } from "./support/admin";
import { attachRuntimeErrors } from "./support/uat";

test.use({ storageState: "playwright/.auth/teacher1.json", viewport: { width: 360, height: 780 } });

test.afterEach(async ({ page }) => {
  await attachRuntimeErrors(page);
  await cleanupRemembered();
});

test("on a 360 px phone Overview does not scroll sideways, the two weeks scroll inside their card, and the nearest closure is in text", { tag: ["@prod-writes"] }, async ({ page }) => {
  const dates = await freeOverviewDates();
  expect(dates, "two working days of the shown weeks without closures and conflicting records").not.toBeNull();
  await addClosure("Overview phone meeting", dates!.early, dates!.early, 12 * 60);

  await page.goto("/");
  await expect(page.getByRole("main").getByText(/^School (closed|closes early): .+ · School calendar$/)).toBeVisible();
  await expect(
    page.getByRole("list", { name: "School closures this month and the next two weeks" }).getByText(/^School closes early: Overview phone meeting, .+ from 12:00$/),
  ).toHaveCount(1);
  await expect(page.getByRole("main").getByRole("link", { name: "School calendar" })).toBeVisible();

  // Сторінка — не ширша за екран.
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(360);

  // Діаграма ширша за картку й прокручується всередині неї; сама картка — в межах екрана.
  const table = page.getByRole("table", { name: "Your leave this week and next" });
  const card = table.locator("xpath=..");
  const box = (await card.boundingBox())!;
  expect(box.x).toBeGreaterThanOrEqual(0);
  expect(box.x + box.width).toBeLessThanOrEqual(360);
  const scroll = await card.evaluate((el) => ({ scrollWidth: el.scrollWidth, clientWidth: el.clientWidth, overflowX: getComputedStyle(el).overflowX }));
  expect(scroll.overflowX).toBe("auto");
  expect(scroll.scrollWidth).toBeGreaterThan(scroll.clientWidth);

  // Заголовок скороченого дня у вузькій колонці: «· 12:00» під датою, повний текст — у назві заголовка.
  const header = table.getByRole("columnheader", { name: /School closes early: Overview phone meeting from 12:00$/ });
  await expect(header).toContainText("· 12:00");
});
