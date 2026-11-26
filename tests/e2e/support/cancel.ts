// Дані «Дано» для e2e скасування погодженого запису (requirements/09-cancel-approved.md): синтетичний працівник
// uat-<run>-…@example.test з розкладом пн–пт 08:30–15:30 (createUatEmployee — менеджер посади manager1@example.test),
// його погоджені записи (addRecord) і, де AC починається з «the request from AC-CANCEL-01», — відкрите прохання,
// вставлене секретним ключем так само, як його пише request_record_cancellation: спершу подія, потім обидві колонки.
// AC називають teacher1@ і дати 2026-12-10 / 2026-11-27 відносно «today is 2026-12-01»: беремо синтетичного
// працівника й дати відносно справжнього сьогодні, щоб «today or later» і «in the past» лишались правдою в будь-який
// день прогону. Прибирання — cleanupRemembered (користувач за id, каскад — посада, заявки, записи, історія).
import type { Browser, BrowserContext, Page } from "@playwright/test";
import { expect, test } from "@playwright/test";
import { addRecord, adminClient, createUatEmployee, type UatEmployee } from "./admin";

const WHOLE: [number, number][] = [[8 * 60 + 30, 15 * 60 + 30]];

export async function cancelEmployee(): Promise<UatEmployee> {
  return createUatEmployee({ mon: WHOLE, tue: WHOLE, wed: WHOLE, thu: WHOLE, fri: WHOLE });
}

function kyivToday(): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Kyiv", year: "numeric", month: "2-digit", day: "2-digit" }).format(
    new Date(),
  );
}

/**
 * Робочі дні (пн–пт) без закриттів шкільного календаря: n днів після сьогодні (step 1) або до нього (step −1),
 * починаючи з `skip`-го дня. Закриття на проді чи staging (канікули) не мають зробити запис неможливим.
 */
export async function freeWeekdays(n: number, step: 1 | -1 = 1, skip = 2): Promise<string[]> {
  const { data: closures, error } = await adminClient().from("school_closures").select("start_date, end_date");
  if (error) throw error;
  const closed = (date: string) => (closures ?? []).some((c) => c.start_date <= date && date <= c.end_date);
  const dates: string[] = [];
  const d = new Date(`${kyivToday()}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + step * skip);
  while (dates.length < n) {
    const date = d.toISOString().slice(0, 10);
    const wd = d.getUTCDay();
    if (wd !== 0 && wd !== 6 && !closed(date)) dates.push(date);
    d.setUTCDate(d.getUTCDate() + step);
  }
  return dates;
}

/** Погоджений цілий день «Personal leave» працівника; повертає id запису. */
export async function approvedRecord(employee: UatEmployee, date: string): Promise<number> {
  return addRecord(employee.email, { date, start: 510, end: 930, leaveType: "personal", status: "approved" });
}

/** Відкрите прохання працівника про скасування — як після request_record_cancellation. */
export async function openRequest(employee: UatEmployee, recordId: number, reason: string): Promise<void> {
  const supabase = adminClient();
  const { data: event, error } = await supabase
    .from("leave_record_events")
    .insert({ record_id: recordId, actor_id: employee.id, action: "cancellation_requested", comment: reason })
    .select("id")
    .single();
  if (error) throw error;
  const { error: updateError } = await supabase
    .from("leave_records")
    .update({ cancel_reason: reason, cancel_request_id: event.id })
    .eq("id", recordId);
  if (updateError) throw updateError;
}

/** Відхилене прохання — як після decide_record_cancellation('decline'). */
export async function declinedRequest(recordId: number, comment: string): Promise<void> {
  const { error } = await adminClient().from("leave_records").update({ cancel_declined_comment: comment }).eq("id", recordId);
  if (error) throw error;
}

/** Скасований менеджером з приміткою — як після cancel_approved_record. */
export async function cancelledWithNote(recordId: number, note: string): Promise<void> {
  const { error } = await adminClient()
    .from("leave_records")
    .update({ status: "cancelled", cancel_note: note, paid_days: null, unpaid_days: null })
    .eq("id", recordId);
  if (error) throw error;
}

/** `touch: true` вмикає дотик (`pointer: coarse`, 44 px, ADR 0008); без нього — дотик із налаштувань проєкту (Pixel 7 у `mobile`). */
export type View = { width: number; height: number; theme?: "light" | "dark"; touch?: boolean };

/** Браузерний контекст синтетичного працівника: лише куки сесії (пароль у браузер і trace.zip не потрапляє). */
export async function employeeContext(browser: Browser, employee: UatEmployee, view?: View): Promise<BrowserContext> {
  const baseURL = test.info().project.use.baseURL!;
  const context = await browser.newContext({
    storageState: { cookies: [], origins: [] },
    ...(view ? { viewport: { width: view.width, height: view.height } } : {}),
    ...(view?.touch ? { hasTouch: true } : {}),
    colorScheme: view?.theme ?? "light",
    reducedMotion: "reduce",
  });
  const now = Math.floor(Date.now() / 1000);
  await context.addCookies([
    ...employee.session.map(({ name, value, maxAge }) => ({
      name,
      value,
      url: baseURL,
      sameSite: "Lax" as const,
      expires: maxAge ? now + maxAge : -1,
    })),
    { name: "theme", value: view?.theme ?? "light", url: baseURL },
  ]);
  return context;
}

/** Контекст демо-акаунта ролі (playwright/.auth/<role>.json) у потрібній темі й розмірі. */
export async function roleContext(browser: Browser, role: string, view?: View): Promise<BrowserContext> {
  const baseURL = test.info().project.use.baseURL!;
  const context = await browser.newContext({
    storageState: `playwright/.auth/${role}.json`,
    ...(view ? { viewport: { width: view.width, height: view.height } } : {}),
    ...(view?.touch ? { hasTouch: true } : {}),
    colorScheme: view?.theme ?? "light",
    reducedMotion: "reduce",
  });
  await context.addCookies([{ name: "theme", value: view?.theme ?? "light", url: baseURL }]);
  return context;
}

/** Рядок запису в «My requests» за датою. */
export function myRecordRow(page: Page, date: string) {
  return page.getByTestId("leave-record").filter({ has: page.getByRole("button", { name: new RegExp(`record ${date} `) }) });
}

/** Чекає «My requests» працівника. */
export async function openMyRequests(page: Page, employee: UatEmployee, query = "") {
  await page.goto(`/requests${query}`);
  await expect(page.getByTestId("user-email")).toHaveText(employee.email);
}
