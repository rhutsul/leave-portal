// Помічники e2e зрізу 07 (керування працівниками): працівник, створений через сторінку адміністратора, одноразове
// посилання й пароль за ним. Лише синтетичні адреси staff-<run>-<n>@example.test; кожного створеного afterAll
// видаляє секретним ключем (одноразовий стек CI), а з ним каскадом — профіль, посади й записи.
import { randomBytes } from "node:crypto";
import { expect, type Browser, type Page } from "@playwright/test";
import { adminClient, hasAdminKey } from "./admin";

const created: string[] = [];

export function staffEmail(label: string): string {
  return `staff-${label}-${randomBytes(3).toString("hex")}@example.test`;
}

/** Пароль, що не виходить за межі тесту (trace у цих файлах вимкнено). */
export function staffPassword(): string {
  return `${randomBytes(9).toString("base64url")}7a`;
}

export async function cleanupStaff() {
  const supabase = adminClient();
  while (created.length > 0) {
    const id = created.pop()!;
    const { error } = await supabase.auth.admin.deleteUser(id);
    expect(error, `видалення ${id}`).toBeNull();
  }
}

/** «Add employee» на сторінці: повертає id і адресу одноразового посилання з картки. */
export async function createEmployeeViaPage(page: Page, name: string, email: string) {
  await page.goto("/staff/new");
  await page.getByLabel("Name").fill(name);
  await page.getByLabel("Email").fill(email);
  await page.getByRole("button", { name: "Create employee" }).click();
  const card = page.getByTestId("one-time-link");
  await expect(card).toBeVisible();
  const link = card.getByLabel("Link");
  await expect(link).toHaveValue(/\/auth\/set-password#token=/);
  const url = await link.inputValue();
  const href = await page.getByRole("link", { name: "Open employee" }).getAttribute("href");
  const id = href!.split("/").pop()!;
  created.push(id);
  return { id, url };
}

/** Гість відкриває посилання в окремому контексті й задає пароль; повертає сторінку (після входу — Overview). */
export async function setPasswordByLink(browser: Browser, url: string, password: string) {
  const context = await browser.newContext({ storageState: { cookies: [], origins: [] }, reducedMotion: "reduce" });
  const page = await context.newPage();
  await page.goto(url);
  await expect(page.getByTestId("set-password-form")).toBeVisible();
  await page.getByLabel("New password", { exact: true }).fill(password);
  await page.getByLabel("Repeat the new password").fill(password);
  await page.getByRole("button", { name: "Set password" }).click();
  return { context, page };
}

/** Головна посада «Elementary school / Teacher» з менеджером manager1@ — секретним ключем (сторінки посад — PR 3). */
export async function giveMainPosition(employeeId: string) {
  const supabase = adminClient();
  const { data: division } = await supabase.from("divisions").select("id").eq("code", "elementary").single();
  const { data: position, error } = await supabase
    .from("positions")
    .insert({ employee_id: employeeId, division_id: division!.id, title: "Teacher", kind: "main" })
    .select("id")
    .single();
  if (error) throw error;
  const { data: manager } = await supabase.from("profiles").select("id").eq("email", "manager1@example.test").single();
  await supabase.from("position_managers").insert({ position_id: position.id, manager_id: manager!.id });
  const blocks = [1, 2, 3, 4, 5].map((weekday) => ({ position_id: position.id, weekday, start_min: 510, end_min: 930 }));
  const { error: blocksError } = await supabase.from("schedule_blocks").insert(blocks);
  if (blocksError) throw blocksError;
}

export async function noSidewaysScroll(page: Page) {
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
  expect(overflow).toBeLessThanOrEqual(0);
}

/** Кількість профілів — секретним ключем, лише де він є (CI); на UAT проду — null (перевіряємо лише відмову). */
export async function profileCount(): Promise<number | null> {
  if (!hasAdminKey()) return null;
  const { count, error } = await adminClient().from("profiles").select("id", { count: "exact", head: true });
  if (error) throw error;
  return count;
}
