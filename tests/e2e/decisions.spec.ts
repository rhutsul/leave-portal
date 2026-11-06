// Рух рішення в «Decisions» (ADR 0007) — вигляд за розробником, не AC PM: тому без AC ID і без тегу @uat. Тег
// @writes: заявку подаємо й вирішуємо лише в job e2e на одноразовому Supabase (playwright.config.ts не бере @writes на
// проді й поза CI). Перевіряємо саме те, що зламалось на проді: після «Approve» печатка встигає показатись, а потім
// запис іде з черги й відкривається наступний.
import { expect, test } from "@playwright/test";
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
  // Потім панель переходить далі, а запис іде з черги «Awaiting decision».
  await expect(queue).not.toHaveURL(new RegExp(`record=${opened}(?!\\d)`));
  await expect(rows).toHaveCount(before - 1);
  await attachRuntimeErrors(queue);
  await admin.close();
});
