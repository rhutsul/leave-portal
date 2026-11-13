// Рух рішення в «Decisions» (ADR 0007) — вигляд за розробником, не AC PM: тому без AC ID і без тегу @uat. Тег
// @writes: заявку подаємо й вирішуємо лише в job e2e на одноразовому Supabase (playwright.config.ts не бере @writes на
// проді й поза CI). Перевіряємо саме те, що зламалось на проді: після «Approve» печатка встигає показатись, а потім
// запис іде з черги й відкривається наступний.
import { expect, test } from "@playwright/test";
import { addDays } from "../../src/lib/leave/overview";
import { isoWeekday, kyivDate } from "../../src/lib/leave/time";
import { showNovember2026 } from "./support/calendar";
import { attachRuntimeErrors } from "./support/uat";

test("after Approve the record panel shows the stamp, then the record leaves the queue", { tag: ["@writes"] }, async ({ browser }) => {
  // Працівник подає заявку на весь день — для кожної своєї посади на цю дату виходить запис «Awaiting decision».
  const employee = await browser.newContext({ storageState: "playwright/.auth/teacher1.json" });
  const form = await employee.newPage();
  await form.goto("/requests/new");
  await showNovember2026(form);
  await form.getByRole("button", { name: /^Wed, 4 Nov 2026/ }).click();
  await form.getByRole("button", { name: "Continue" }).click();
  await form.getByRole("button", { name: "Continue" }).click();
  await form.getByText("Personal leave", { exact: true }).click();
  await form.getByRole("button", { name: "Continue" }).click();
  await form.getByRole("button", { name: "Submit request" }).click();
  await expect(form.getByRole("main").getByText("Request submitted")).toBeVisible();
  await employee.close();

  // Адміністратор вирішує будь-який запис (матриця прав продукту).
  const admin = await browser.newContext({ storageState: "playwright/.auth/admin.json" });
  const queue = await admin.newPage();
  await queue.goto("/decisions");
  const rows = queue.getByTestId("decision-record").filter({ hasText: "2026-11-04" });
  await expect(rows.first()).toBeVisible();
  const before = await rows.count();

  await rows.first().getByRole("link").click();
  await expect(queue).toHaveURL(/record=\d+/);
  const opened = new URL(queue.url()).searchParams.get("record");
  await queue.getByRole("button", { name: "Approve", exact: true }).click();
  await queue.getByRole("dialog").getByRole("button", { name: "Approve", exact: true }).click();

  // Печатка рішення: жива область панелі каже «Approved», поки панель ще на цьому записі.
  await expect(queue.getByRole("status").filter({ hasText: "Approved" })).toBeAttached();
  // І сама печатка на екрані — саме її й не було на проді.
  await expect(queue.locator('[data-slot="sheet-content"] .animate-stamp')).toBeVisible();
  // Потім панель переходить далі, а запис іде з черги «Awaiting decision».
  await expect(queue).not.toHaveURL(new RegExp(`record=${opened}(?!\\d)`));
  await expect(rows).toHaveCount(before - 1);
  await attachRuntimeErrors(queue);
  await admin.close();
});

/** Сторінка діаграми Overview (`?weeks=`), на якій видно дату: два тижні від понеділка поточного тижня. */
function overviewWith(date: string): string {
  const monday = (d: string) => Date.parse(addDays(d, 1 - isoWeekday(d)));
  const page = Math.floor((monday(date) - monday(kyivDate(new Date()))) / (14 * 24 * 3600 * 1000));
  return page === 0 ? "/" : `/?weeks=${page}`;
}

// Діаграма двох тижнів і панель рішення v2 — вигляд, не AC PM: без AC ID. Смуга запису на Overview відкриває картку
// (наведення, клік, Esc), «Open record» веде в панель рішення; поле коментаря сховане, відкривається саме, коли
// «Return for revision» натиснуто без коментаря, а Esc із набраним коментарем панель не закриває.
test("a bar of the Overview diagram opens the record card, and the comment of a decision stays collapsed until needed", { tag: ["@writes"] }, async ({ browser }) => {
  const employee = await browser.newContext({ storageState: "playwright/.auth/teacher1.json" });
  const form = await employee.newPage();
  await form.goto("/requests/new");
  await showNovember2026(form);
  await form.getByRole("button", { name: /^Tue, 10 Nov 2026/ }).click();
  await form.getByRole("button", { name: "Continue" }).click();
  await form.getByRole("button", { name: "Continue" }).click();
  await form.getByText("Personal leave", { exact: true }).click();
  await form.getByRole("button", { name: "Continue" }).click();
  await form.getByRole("button", { name: "Submit request" }).click();
  await expect(form.getByRole("main").getByText("Request submitted")).toBeVisible();
  await employee.close();

  const admin = await browser.newContext({ storageState: "playwright/.auth/admin.json" });
  const page = await admin.newPage();
  await page.goto(overviewWith("2026-11-10"));
  // Смуга — кнопка з повною назвою: хто, дата, години, тип, статус.
  const bar = page.getByRole("button", { name: /, Tue, 10 Nov 2026, \d\d:\d\d–\d\d:\d\d, Personal leave, Awaiting decision$/ }).first();
  await expect(bar).toBeVisible();
  const card = page.getByRole("dialog", { name: "Record" });
  await bar.hover();
  await expect(card).toBeVisible();
  await expect(card).toContainText("Tue, 10 Nov 2026");
  await expect(card).toContainText("Personal leave");
  await expect(card).toContainText("Awaiting decision");
  await page.keyboard.press("Escape");
  await expect(card).toBeHidden();
  await bar.click();
  await expect(card).toBeVisible();
  await card.getByRole("link", { name: "Open record" }).click();
  await expect(page).toHaveURL(/\/decisions\?record=\d+/);
  const opened = new URL(page.url()).searchParams.get("record");

  const panel = page.locator('[data-slot="sheet-content"]');
  await expect(panel.getByRole("button", { name: "Add a comment for the employee" })).toBeVisible();
  await expect(panel.getByRole("textbox", { name: "Your comment" })).toHaveCount(0);
  // Без коментаря «Return for revision» не надсилає рішення: поле відкривається з поясненням.
  await panel.getByRole("button", { name: "Return for revision" }).click();
  const comment = panel.getByRole("textbox", { name: "Your comment" });
  await expect(comment).toBeFocused();
  await expect(panel.getByText("Tell the employee what to fix")).toBeVisible();
  await comment.fill("Please pick another day");
  await expect(panel.getByText("Tell the employee what to fix")).toBeHidden();
  // Набраний коментар: Esc панель не закриває.
  await page.keyboard.press("Escape");
  await expect(page).toHaveURL(new RegExp(`record=${opened}(?!\\d)`));
  await expect(comment).toHaveValue("Please pick another day");

  await panel.getByRole("button", { name: "Return for revision" }).click();
  await expect(page.getByRole("status").filter({ hasText: "Returned for revision" })).toBeAttached();
  await expect(page).not.toHaveURL(new RegExp(`record=${opened}(?!\\d)`));
  await attachRuntimeErrors(page);
  await admin.close();
});
