// Дані «Дано» для e2e заявки від імені (requirements/08-on-behalf-and-edit.md): синтетичні працівники
// uat-<run>-…@example.test з розкладом пн–пт 08:30–15:30 (createUatEmployee — менеджер основної посади
// manager1@example.test, як у teacher1@). AC називають teacher1@, teacher3@, manager3@ і дати 2026-12-03 / 2026-12-05:
// беремо синтетичних людей і дати від сьогодні, щоб «Дано» було правдою в будь-який день прогону й на будь-якій базі.
// Прибирання — cleanupRemembered (користувач за id, каскад — посади, розклад, заявки, записи, історія).
import { expect, type Page } from "@playwright/test";
import { formatDateLong } from "../../../src/lib/leave/time";
import { adminClient, type UatEmployee } from "./admin";
import { showMonth } from "./calendar";

/** Додаткова посада працівника, якою керує manager2@ (AC-BEHALF-02): у день тижня `date` 15:45–17:00. */
export async function addAdditionalPosition(employee: UatEmployee, date: string): Promise<void> {
  const supabase = adminClient();
  const { data: division, error: divisionError } = await supabase.from("divisions").select("id").order("id").limit(1).single();
  if (divisionError) throw divisionError;
  const { data: position, error } = await supabase
    .from("positions")
    .insert({ employee_id: employee.id, division_id: division.id, title: "UAT math teacher", kind: "additional" })
    .select("id")
    .single();
  if (error) throw error;
  const { data: manager2, error: managerError } = await supabase
    .from("profiles")
    .select("id")
    .eq("email", "manager2@example.test")
    .single();
  if (managerError) throw managerError;
  const { error: pmError } = await supabase.from("position_managers").insert({ position_id: position.id, manager_id: manager2.id });
  if (pmError) throw pmError;
  const weekday = ((new Date(`${date}T00:00:00Z`).getUTCDay() + 6) % 7) + 1;
  const { error: blockError } = await supabase
    .from("schedule_blocks")
    .insert({ position_id: position.id, employee_id: employee.id, weekday, start_min: 945, end_min: 1020 });
  if (blockError) throw blockError;
}

/** AC-BEHALF-11: жодна посада працівника не належить manager1@. */
export async function withoutManager1(employee: UatEmployee): Promise<void> {
  const supabase = adminClient();
  const { data: positions, error } = await supabase.from("positions").select("id").eq("employee_id", employee.id);
  if (error) throw error;
  const { error: deleteError } = await supabase
    .from("position_managers")
    .delete()
    .in(
      "position_id",
      (positions ?? []).map((p) => p.id),
    );
  if (deleteError) throw deleteError;
}

/** AC-BEHALF-15: роль manager без жодної посади, якою він керує (як manager3@). */
export async function makeManager(employee: UatEmployee): Promise<void> {
  const { error } = await adminClient().from("profiles").update({ role: "manager" }).eq("id", employee.id);
  if (error) throw error;
}

/** Найближча субота після сьогодні (Київ) — день без годин у розкладі пн–пт. */
export function nextSaturday(): string {
  const today = new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Kyiv", year: "numeric", month: "2-digit", day: "2-digit" }).format(
    new Date(),
  );
  const d = new Date(`${today}T00:00:00Z`);
  do d.setUTCDate(d.getUTCDate() + 1);
  while (d.getUTCDay() !== 6);
  return d.toISOString().slice(0, 10);
}

/** Форма від імені: зі списку /on-behalf до кроку «Dates» для працівника. */
export async function openOnBehalf(page: Page, employee: UatEmployee): Promise<void> {
  await page.goto("/on-behalf");
  await page.getByLabel("Find an employee").fill(employee.email);
  await page.getByTestId("on-behalf-employee").filter({ hasText: employee.email }).getByRole("link").click();
  await expect(page.getByRole("heading", { level: 1, name: `New request for ${employee.email}` })).toBeVisible();
}

/** Дата в календарі форми (місяць гортається). */
export async function pickDate(page: Page, date: string): Promise<void> {
  const [year, month] = date.split("-").map(Number);
  await showMonth(page, year, month);
  await page.getByRole("button", { name: new RegExp(`^${formatDateLong(date)}`) }).click();
}

/** Від вибраної дати до підсумку: усі посади цілим днем, «Sick leave», без коментаря. */
export async function toSickSummary(page: Page, date: string): Promise<void> {
  await page.getByRole("button", { name: "Continue" }).click();
  await expect(page.getByRole("region", { name: formatDateLong(date) })).toBeVisible();
  await page.getByRole("button", { name: "Continue" }).click();
  await page.getByText("Sick leave", { exact: true }).click();
  await page.getByRole("button", { name: "Continue" }).click();
  await expect(page.getByRole("heading", { name: "Check and confirm" })).toBeVisible();
}
