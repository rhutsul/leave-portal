// Дані «Дано» для e2e замін (requirements/06-substitutes.md): синтетичні працівники uat-<run>-…@example.test з
// розкладом пн–пт 08:30–15:30 (createUatEmployee — менеджер посади manager1@example.test, як у teacher1@): відсутній
// із посадою «UAT teacher» (назва містить «teacher») і заміни — «Assistant» (асистент) чи «UAT teacher». Список замін і
// записи пишемо секретним ключем так само, як їх пишуть сторінки й submit_leave_request. AC називають teacher1@,
// assistant1@ і дату 2026-12-02: беремо синтетичних людей і вільні робочі дні від сьогодні, щоб «Дано» було правдою в
// будь-який день прогону й на будь-якій базі. Прибирання — cleanupRemembered (спершу записи із заміною, потім люди).
import { expect, type Page } from "@playwright/test";
import { formatDateLong } from "../../../src/lib/leave/time";
import { addRecord, adminClient, createUatEmployee, type UatEmployee } from "./admin";
import { showMonth } from "./calendar";

const WHOLE: [number, number][] = [[8 * 60 + 30, 15 * 60 + 30]];
const WEEK = { mon: WHOLE, tue: WHOLE, wed: WHOLE, thu: WHOLE, fri: WHOLE };

/** Відсутній працівник (посада «UAT teacher») чи заміна з основною посадою `title`. */
export function weekEmployee(title?: string): Promise<UatEmployee> {
  return createUatEmployee(WEEK, title ? { title } : {});
}

/** Список замін працівника — як після «Add to list» на /substitutes/<id>. */
export async function giveList(employee: UatEmployee, substitutes: UatEmployee[]): Promise<void> {
  const { error } = await adminClient()
    .from("substitute_lists")
    .insert(substitutes.map((s) => ({ employee_id: employee.id, substitute_id: s.id })));
  if (error) throw error;
}

/** Запис працівника для «Дано» (власний запис заміни чи запис, де вона вже замінює). */
export function givenRecord(
  employee: UatEmployee,
  rec: { date: string; start: number; end: number; status: string; substitute?: UatEmployee; upgrade?: boolean },
): Promise<number> {
  return addRecord(employee.email, {
    date: rec.date,
    start: rec.start,
    end: rec.end,
    leaveType: "personal",
    status: rec.status,
    substituteId: rec.substitute?.id,
    upgradeMinutes: rec.upgrade ? rec.end - rec.start : undefined,
  });
}

/** Нова заявка: дата → крок «Positions and hours» (регіон дати вже видно). */
export async function openPositionsStep(page: Page, date: string): Promise<void> {
  await page.goto("/requests/new");
  const [year, month] = date.split("-").map(Number);
  await showMonth(page, year, month);
  await page.getByRole("button", { name: new RegExp(`^${formatDateLong(date)}`) }).click();
  await page.getByRole("button", { name: "Continue" }).click();
  await expect(page.getByRole("region", { name: formatDateLong(date) })).toBeVisible();
}

/** Вибір у полі «Substitute» картки посади (Select з @/components/ui). */
export async function chooseSubstitute(page: Page, label: string): Promise<void> {
  await page.getByRole("combobox", { name: "Substitute" }).click();
  await page.getByRole("option", { name: new RegExp(`^${label.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}`) }).click();
  await expect(page.getByRole("combobox", { name: "Substitute" })).toContainText(label);
}

/** Від кроку «Positions and hours» до підсумку: «Personal leave», без коментаря. */
export async function toSummary(page: Page): Promise<void> {
  await page.getByRole("button", { name: "Continue" }).click();
  await page.getByText("Personal leave", { exact: true }).click();
  await page.getByRole("button", { name: "Continue" }).click();
  await expect(page.getByRole("heading", { name: "Check and confirm" })).toBeVisible();
}

/** Години запису замість цілого дня. */
export async function specificHours(page: Page, from: string, to: string): Promise<void> {
  await page.getByRole("button", { name: "Specific hours" }).click();
  await page.getByLabel("From").fill(from);
  await page.getByLabel("to", { exact: true }).fill(to);
}
