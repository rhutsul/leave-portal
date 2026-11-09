// Дані «Дано» для UAT шкільного календаря і прибирання за ними — секретним ключем Supabase (обходить RLS).
// Лише в тестах і лише на машині розробника (.env.local) або в CI на одноразовому стеку (e2e.yml). У GitHub Secrets
// основного репо SUPABASE_SECRET_KEY не додаємо. Значень ключів і паролів не друкуємо.
//
// Чому не синтетичні uat-*@example.test, як у матеріалах курсу: «Тоді» AC календаря дослівно називає
// teacher1@example.test (AC-CAL-07) і закриття «Winter break» / «Teachers' meeting», а закриття діють на всю школу.
// Тож тест працює з цими акаунтами й назвами, але:
//   * перед кожним тестом перевіряє, що на датах AC немає чужих закриттів і записів (assertCalendarClean) —
//     інакше зупиняється, а не ламає справжні дані;
//   * усе, що створив (закриття, заявки з записами), записує в журнал і видаляє за id в afterEach,
//     а teardown «cleanup» після прогону видаляє все, що лишилось у вікнах дат AC, і падає, якщо щось лишилось.
//
// Джерело каркаса (adminClient, hasAdminKey, журнал прибирання): матеріали курсу WS9,
// materials/uat/tests/e2e/support/admin.ts. Помічники календаря — наші.
import { appendFileSync, existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";

export function hasAdminKey(): boolean {
  return Boolean(process.env.NEXT_PUBLIC_SUPABASE_URL && process.env.SUPABASE_SECRET_KEY);
}

export function adminClient(): SupabaseClient {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const secret = process.env.SUPABASE_SECRET_KEY;
  if (!url || !secret) {
    throw new Error("Для даних UAT календаря потрібні NEXT_PUBLIC_SUPABASE_URL і SUPABASE_SECRET_KEY (.env.local)");
  }
  return createClient(url, secret, { auth: { persistSession: false, autoRefreshToken: false } });
}

/** Вікна дат AC календаря: лише тут тест створює й прибирає рядки. */
export const AC_WINDOWS = [
  { from: "2026-11-20", to: "2026-11-20" }, // «Teachers' meeting», скорочений день (AC-CAL-04 … -06)
  { from: "2026-11-27", to: "2026-11-27" }, // спроба менеджера (AC-CAL-13)
  { from: "2026-12-28", to: "2027-01-08" }, // «Winter break» (AC-CAL-01 … -03, -07 … -11)
] as const;

const BLOCKING = ["awaiting", "returned", "approved"];
const LOG = "test-results/uat-calendar-rows.jsonl";
const DELETED_LOG = "test-results/uat-calendar-deleted.jsonl";

type Row = { table: "school_closures" | "leave_requests"; id: number; what: string };

function remember(row: Row) {
  mkdirSync("test-results", { recursive: true });
  appendFileSync(LOG, `${JSON.stringify(row)}\n`);
}

function remembered(): Row[] {
  if (!existsSync(LOG)) return [];
  return readFileSync(LOG, "utf8")
    .split(/\r?\n/)
    .filter(Boolean)
    .map((l) => JSON.parse(l) as Row);
}

async function profileId(supabase: SupabaseClient, email: string): Promise<string> {
  const { data, error } = await supabase.from("profiles").select("id").eq("email", email).single();
  if (error) throw error;
  return data.id as string;
}

async function mainPositionId(supabase: SupabaseClient, employeeId: string): Promise<number> {
  const { data, error } = await supabase
    .from("positions")
    .select("id")
    .eq("employee_id", employeeId)
    .eq("kind", "main")
    .single();
  if (error) throw error;
  return data.id as number;
}

/** Закриття для «Дано» (AC каже, що його вже додав адміністратор). */
export async function addClosure(name: string, start: string, end: string, closesAt: number | null = null) {
  const supabase = adminClient();
  const { data, error } = await supabase
    .from("school_closures")
    .insert({ name, start_date: start, end_date: end, closes_at: closesAt })
    .select("id")
    .single();
  if (error) throw error;
  remember({ table: "school_closures", id: data.id, what: `закриття «${name}» ${start}…${end}` });
  return data.id as number;
}

/**
 * Запис працівника на основній посаді для «Дано» (AC-CAL-06 … -08): заявка з одним записом у потрібному статусі.
 * Повертає id запису. Подія «submitted» — як після справжнього подання, щоб історія запису не була порожньою.
 */
export async function addRecord(
  email: string,
  rec: { date: string; start: number; end: number; leaveType: "sick" | "personal"; status: string },
) {
  const supabase = adminClient();
  const employeeId = await profileId(supabase, email);
  const positionId = await mainPositionId(supabase, employeeId);
  const { data: request, error: requestError } = await supabase
    .from("leave_requests")
    .insert({ employee_id: employeeId, leave_type: rec.leaveType })
    .select("id")
    .single();
  if (requestError) throw requestError;
  remember({ table: "leave_requests", id: request.id, what: `заявка ${email} ${rec.date}` });
  const { data: record, error } = await supabase
    .from("leave_records")
    .insert({
      request_id: request.id,
      position_id: positionId,
      employee_id: employeeId,
      date: rec.date,
      start_min: rec.start,
      end_min: rec.end,
      minutes: rec.end - rec.start,
      leave_type: rec.leaveType,
      status: rec.status,
    })
    .select("id")
    .single();
  if (error) throw error;
  await supabase.from("leave_record_events").insert({ record_id: record.id, actor_id: employeeId, action: "submitted" });
  return record.id as number;
}

/** Заявки працівника на дату, створені через сторінки під час тесту (AC-CAL-04): записати в журнал прибирання. */
export async function rememberRequestsOn(email: string, date: string) {
  const supabase = adminClient();
  const employeeId = await profileId(supabase, email);
  const { data, error } = await supabase
    .from("leave_records")
    .select("request_id")
    .eq("employee_id", employeeId)
    .eq("date", date);
  if (error) throw error;
  for (const id of new Set((data ?? []).map((r) => r.request_id as number))) {
    remember({ table: "leave_requests", id, what: `заявка ${email} ${date} (зі сторінки)` });
  }
}

/**
 * Закриття, які адміністратор додав через сторінку під час тесту (AC-CAL-01, -08): записати в журнал прибирання.
 * Лише у вікнах дат AC: після assertCalendarClean будь-яке закриття там створив цей тест, а закриття з тією самою
 * назвою на інші дати (наступні зимові канікули) — справжні, їх не чіпаємо.
 */
export async function rememberClosuresNamed(name: string) {
  const supabase = adminClient();
  for (const w of AC_WINDOWS) {
    const { data, error } = await supabase
      .from("school_closures")
      .select("id, start_date, end_date")
      .eq("name", name)
      .lte("start_date", w.to)
      .gte("end_date", w.from);
    if (error) throw error;
    for (const c of data ?? []) {
      remember({ table: "school_closures", id: c.id, what: `закриття «${name}» ${c.start_date}…${c.end_date} (зі сторінки)` });
    }
  }
}

/**
 * Передумова кожного тесту: у вікнах дат AC немає закриттів і чинних записів, яких не створив цей прогін, і жодного
 * запису teacher1@example.test у будь-якому статусі (прибирання видаляє всі його заявки на ці дати, тож і Rejected
 * чи Cancelled там мають бути нашими). Інакше тест не доводить AC, а може зламати чужі дані — зупиняємось із поясненням.
 */
export async function assertCalendarClean() {
  const supabase = adminClient();
  const problems: string[] = [];
  const teacher1 = await profileId(supabase, "teacher1@example.test");
  for (const w of AC_WINDOWS) {
    const { data: closures, error } = await supabase
      .from("school_closures")
      .select("name, start_date, end_date")
      .lte("start_date", w.to)
      .gte("end_date", w.from);
    if (error) throw error;
    for (const c of closures ?? []) problems.push(`закриття «${c.name}» ${c.start_date}…${c.end_date}`);
    const { data: records, error: recordsError } = await supabase
      .from("leave_records")
      .select("date, status, employee_id")
      .gte("date", w.from)
      .lte("date", w.to)
      .in("status", BLOCKING);
    if (recordsError) throw recordsError;
    for (const r of records ?? []) problems.push(`запис ${r.date} (${r.status})`);
    const { data: own, error: ownError } = await supabase
      .from("leave_records")
      .select("date, status")
      .eq("employee_id", teacher1)
      .gte("date", w.from)
      .lte("date", w.to);
    if (ownError) throw ownError;
    for (const r of own ?? []) problems.push(`запис teacher1@example.test ${r.date} (${r.status})`);
  }
  if (problems.length) {
    throw new Error(
      `Дати AC календаря на проді не чисті — тест зупинено, нічого не змінено: ${[...new Set(problems)].join("; ")}. ` +
        "Приберіть ці рядки або перенесіть перевірку на іншу дату.",
    );
  }
}

/** Видаляє все, що створив цей прогін (журнал), — afterEach кожного тесту, що пише. */
export async function cleanupRemembered(): Promise<string[]> {
  const supabase = adminClient();
  const deleted: string[] = [];
  // Один рядок може потрапити в журнал двічі (addClosure і rememberClosuresNamed) — лишаємо перший опис.
  const unique = remembered().filter(
    (row, i, all) => all.findIndex((r) => r.table === row.table && r.id === row.id) === i,
  );
  for (const row of unique.reverse()) {
    const { data, error } = await supabase.from(row.table).delete().eq("id", row.id).select("id");
    if (error) throw error;
    if (data?.length) deleted.push(row.what);
  }
  // Журнал створеного — порожній, видалене — у журнал прогону (його підсумовує teardown для звіту).
  mkdirSync("test-results", { recursive: true });
  writeFileSync(LOG, "");
  for (const what of deleted) appendFileSync(DELETED_LOG, `${JSON.stringify(what)}\n`);
  return deleted;
}

function deletedThisRun(): string[] {
  if (!existsSync(DELETED_LOG)) return [];
  return readFileSync(DELETED_LOG, "utf8")
    .split(/\r?\n/)
    .filter(Boolean)
    .map((l) => JSON.parse(l) as string);
}

/**
 * Teardown після прогону: прибирає журнал і перевіряє, що у вікнах дат AC не лишилось закриттів із назвами AC
 * і записів teacher1@example.test, створених цим прогоном (created_at ≥ UAT_RUN_STARTED). Рядки, що були там до
 * прогону, — не наші: через них assertCalendarClean зупиняє тести, а teardown їх не рахує й не чіпає.
 * Те, що лишилось від прогону, — у `remaining` / `leftoverRequests` (teardown тоді падає).
 */
export async function cleanupCalendar(): Promise<{ deleted: string[]; remaining: string[]; leftoverRequests: number }> {
  await cleanupRemembered();
  const deleted = deletedThisRun();
  const supabase = adminClient();
  const remaining: string[] = [];
  let leftoverRequests = 0;
  const since = process.env.UAT_RUN_STARTED ?? new Date(0).toISOString();
  const teacher1 = await profileId(supabase, "teacher1@example.test");
  for (const w of AC_WINDOWS) {
    const { data: closures, error } = await supabase
      .from("school_closures")
      .select("name, start_date")
      .in("name", ["Winter break", "Teachers' meeting", "Staff day"])
      .gte("created_at", since)
      .lte("start_date", w.to)
      .gte("end_date", w.from);
    if (error) throw error;
    for (const c of closures ?? []) remaining.push(`закриття «${c.name}» ${c.start_date}`);
    const { count, error: countError } = await supabase
      .from("leave_records")
      .select("*", { count: "exact", head: true })
      .eq("employee_id", teacher1)
      .gte("created_at", since)
      .gte("date", w.from)
      .lte("date", w.to);
    if (countError) throw countError;
    leftoverRequests += count ?? 0;
  }
  return { deleted, remaining, leftoverRequests };
}

/**
 * Дві дати для перевірки закриттів на Overview: робочі дні показаних двох тижнів, не раніше сьогодні (за Києвом), без
 * чужих закриттів; краще — поза вікнами дат AC календаря (AC_WINDOWS). whole — найпізніша, early — найраніша (щоб рядок Overview назвав саме її); null — таких
 * днів немає.
 */
export async function freeOverviewDates(): Promise<{ whole: string; early: string } | null> {
  const iso = (d: Date) => d.toISOString().slice(0, 10);
  const today = new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Kyiv" }).format(new Date());
  const t = new Date(`${today}T00:00:00Z`);
  const monday = new Date(t);
  monday.setUTCDate(t.getUTCDate() - ((t.getUTCDay() + 6) % 7));
  const shown = [0, 1, 2, 3, 4, 7, 8, 9, 10, 11].map((n) => {
    const d = new Date(monday);
    d.setUTCDate(monday.getUTCDate() + n);
    return iso(d);
  });
  const candidates = shown.filter((d) => d >= today);
  const supabase = adminClient();
  const { data, error } = await supabase
    .from("school_closures")
    .select("start_date, end_date")
    .lte("start_date", candidates.at(-1)!)
    .gte("end_date", candidates[0]);
  if (error) throw error;
  const free = candidates.filter((d) => !(data ?? []).some((c) => c.start_date <= d && d <= c.end_date));
  const outsideAc = free.filter((d) => !AC_WINDOWS.some((w) => w.from <= d && d <= w.to));
  const pool = outsideAc.length >= 2 ? outsideAc : free;
  return pool.length < 2 ? null : { whole: pool.at(-1)!, early: pool[0] };
}
