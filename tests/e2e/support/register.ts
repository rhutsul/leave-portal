// Дані для e2e реєстру погоджених відсутностей (ADR 0012): синтетичний працівник uat-<run>-…@example.test
// (createUatEmployee — посада в першому підрозділі, менеджер manager1@example.test) і його погоджені записи, вставлені
// секретним ключем, з подією «approved» від manager1@. Прибирання — cleanupRemembered: видаляє користувача, а каскад —
// посаду, заявки й записи. Значень ключів не друкуємо.
import type { Page } from "@playwright/test";
import { adminClient, createUatEmployee, type UatEmployee } from "./admin";

export type RegisterFixture = { employee: UatEmployee; divisionCode: string; divisionName: string; month: string };

/** Місяць за Києвом через n місяців від поточного: "YYYY-MM". */
export function kyivMonth(offset = 0): string {
  const today = new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Kyiv", year: "numeric", month: "2-digit" }).format(
    new Date(),
  );
  const [y, m] = today.split("-").map(Number);
  const index = y * 12 + (m - 1) + offset;
  return `${Math.floor(index / 12)}-${String((index % 12) + 1).padStart(2, "0")}`;
}

/** Перші n робочих днів (пн–пт) місяця "YYYY-MM". */
function weekdays(month: string, n: number): string[] {
  const dates: string[] = [];
  const d = new Date(`${month}-01T00:00:00Z`);
  while (dates.length < n) {
    const wd = d.getUTCDay();
    if (wd !== 0 && wd !== 6) dates.push(d.toISOString().slice(0, 10));
    d.setUTCDate(d.getUTCDate() + 1);
  }
  return dates;
}

/**
 * Працівник із розкладом пн–пт 08:30–15:30 і двома погодженими записами наступного місяця: цілий день «Sick leave»
 * (1.00 оплачуваний) і 08:30–12:00 «Unpaid leave» (0.50 неоплачуваного). Наступний місяць — щоб не перетинатися з
 * даними інших тестів поточного місяця й не залежати від дня, коли йде прогін.
 */
export async function registerFixture(): Promise<RegisterFixture> {
  const supabase = adminClient();
  const employee = await createUatEmployee({
    mon: [[510, 930]],
    tue: [[510, 930]],
    wed: [[510, 930]],
    thu: [[510, 930]],
    fri: [[510, 930]],
  });
  const month = kyivMonth(1);
  const [whole, half] = weekdays(month, 2);

  const { data: position, error: positionError } = await supabase
    .from("positions")
    .select("id, division_id, divisions (code, name)")
    .eq("employee_id", employee.id)
    .single();
  if (positionError) throw positionError;
  const division = position.divisions as unknown as { code: string; name: string };
  const { data: manager, error: managerError } = await supabase
    .from("profiles")
    .select("id")
    .eq("email", "manager1@example.test")
    .single();
  if (managerError) throw managerError;

  for (const rec of [
    { date: whole, start: 510, end: 930, type: "sick", paid: 1, unpaid: 0 },
    { date: half, start: 510, end: 720, type: "unpaid", paid: null, unpaid: null },
  ]) {
    const { data: request, error: requestError } = await supabase
      .from("leave_requests")
      .insert({ employee_id: employee.id, leave_type: rec.type })
      .select("id")
      .single();
    if (requestError) throw requestError;
    const { data: record, error } = await supabase
      .from("leave_records")
      .insert({
        request_id: request.id,
        position_id: position.id,
        employee_id: employee.id,
        date: rec.date,
        start_min: rec.start,
        end_min: rec.end,
        minutes: rec.end - rec.start,
        leave_type: rec.type,
        status: "approved",
        paid_days: rec.paid,
        unpaid_days: rec.unpaid,
      })
      .select("id")
      .single();
    if (error) throw error;
    const { error: eventError } = await supabase
      .from("leave_record_events")
      .insert({ record_id: record.id, actor_id: manager.id, action: "approved" });
    if (eventError) throw eventError;
  }

  return { employee, divisionCode: division.code, divisionName: division.name, month };
}

/**
 * Знімок сторінки для docs/img/ без накладок відео (назва тесту, підказки дій, курсор): вони вбудовані в сторінку й
 * потрапили б у page.screenshot(). Після знімка накладки повертаються.
 */
export async function screenshotWithoutOverlays(page: Page, path: string, fullPage = false) {
  await page.screencast.hideOverlays().catch(() => {});
  await page.screencast.hideActions().catch(() => {});
  await page.mouse.move(0, 0);
  await page.screenshot({ path, fullPage });
  await page.screencast.showOverlays().catch(() => {});
}
