// Реєстр погоджених відсутностей (ADR 0012, ініціатива розробника до вимог PM): параметри сторінки, рядки для таблиці
// й CSV, підсумок. Доступ і набір записів вирішує база (public.approved_register); тут лише форма показу.
import { daysToHundredths, formatDays } from "@/lib/leave/balance";
import { formatDateLong, formatDuration, formatKyivDateTime, formatRange, formatTime } from "@/lib/leave/time";
import { isLeaveType, LEAVE_TYPES } from "@/lib/leave/request";

/** Рядок public.approved_register, як його повертає supabase.rpc. */
export interface RegisterRow {
  record_id: number;
  employee_name: string | null;
  employee_email: string | null;
  position_title: string;
  position_kind: string;
  date: string;
  start_min: number;
  end_min: number;
  minutes: number;
  whole_day: boolean;
  leave_type: string;
  paid_days: number | string | null;
  unpaid_days: number | string | null;
  approved_at: string | null;
  approved_by_name: string | null;
}

export interface RegisterDivision {
  id: number;
  code: string;
  name: string;
}

const MONTH = /^(\d{4})-(0[1-9]|1[0-2])$/;
/** Межі гортання: рік назад і вперед від поточного місяця — далі записів у порталі немає й не буде (ADR 0012). */
export const MONTH_RANGE = 12;

/** "2026-11" з дати "2026-11-24". */
export function monthOf(date: string): string {
  return date.slice(0, 7);
}

/** Різниця в місяцях між "YYYY-MM". */
function monthDistance(a: string, b: string): number {
  const [ay, am] = a.split("-").map(Number);
  const [by, bm] = b.split("-").map(Number);
  return ay * 12 + am - (by * 12 + bm);
}

/**
 * Параметри адреси `?division=<code>&month=YYYY-MM` → вибір. Невідомий підрозділ чи його немає — перший доступний;
 * місяць не за форматом чи поза межами — поточний за Києвом.
 */
export function registerQuery(
  params: { division?: string | string[]; month?: string | string[] },
  divisions: readonly RegisterDivision[],
  currentMonth: string,
): { division: RegisterDivision | null; month: string } {
  const one = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v);
  const code = one(params.division);
  const division = divisions.find((d) => d.code === code) ?? divisions[0] ?? null;
  const raw = one(params.month);
  const month =
    raw && MONTH.test(raw) && Math.abs(monthDistance(raw, currentMonth)) <= MONTH_RANGE ? raw : currentMonth;
  return { division, month };
}

/** Адреса сторінки реєстру з вибором. */
export function registerHref(division: string | null, month: string): string {
  const params = new URLSearchParams();
  if (division) params.set("division", division);
  params.set("month", month);
  return `/register?${params}`;
}

/** Адреса CSV для того самого вибору. */
export function exportHref(division: string, month: string): string {
  return `/register/export?${new URLSearchParams({ division, month })}`;
}

/** Ім'я файлу: register-<code>-<YYYY-MM>.csv; код — лише безпечні символи. */
export function exportFileName(division: string, month: string): string {
  const safe = division.replace(/[^a-z0-9_-]+/gi, "-").replace(/^-+|-+$/g, "") || "division";
  return `register-${safe}-${month}.csv`;
}

/** Чи можна гортати до місяця: у межах MONTH_RANGE від поточного. */
export function monthInRange(month: string, currentMonth: string): boolean {
  return Math.abs(monthDistance(month, currentMonth)) <= MONTH_RANGE;
}

/** Години для таблиці й CSV: "Whole day" або "08:30–12:00". */
export function hoursLabel(row: Pick<RegisterRow, "whole_day" | "start_min" | "end_min">): string {
  return row.whole_day ? "Whole day" : formatRange(row.start_min, row.end_min);
}

/** Тривалість у годинах до сотих: 210 хв → "3.50". */
export function hoursDecimal(minutes: number): string {
  return formatDays(Math.round((minutes * 100) / 60));
}

/** Ім'я працівника; без імені — email. */
export function employeeLabel(row: Pick<RegisterRow, "employee_name" | "employee_email">): string {
  return row.employee_name?.trim() || row.employee_email || "Employee";
}

export function leaveTypeLabel(type: string): string {
  return isLeaveType(type) ? LEAVE_TYPES[type] : type;
}

export function positionKindLabel(kind: string): string {
  return kind === "main" ? "Main" : kind === "additional" ? "Additional" : kind;
}

export interface RegisterTotals {
  records: number;
  minutes: number;
  /** Соті дня. */
  paid: number;
  unpaid: number;
}

export function registerTotals(rows: readonly RegisterRow[]): RegisterTotals {
  return rows.reduce<RegisterTotals>(
    (t, r) => ({
      records: t.records + 1,
      minutes: t.minutes + r.minutes,
      paid: t.paid + daysToHundredths(r.paid_days ?? 0),
      unpaid: t.unpaid + daysToHundredths(r.unpaid_days ?? 0),
    }),
    { records: 0, minutes: 0, paid: 0, unpaid: 0 },
  );
}

/** Підсумок під таблицею: "3 records · 17 h 30 min · 2.50 paid days · 0.00 unpaid days". */
export function totalsLabel(t: RegisterTotals): string {
  return [
    recordsLabel(t.records),
    formatDuration(t.minutes),
    `${formatDays(t.paid)} paid days`,
    `${formatDays(t.unpaid)} unpaid days`,
  ].join(" · ");
}

/** Записи: "1 record", "3 records". */
export function recordsLabel(count: number): string {
  return `${count} ${count === 1 ? "record" : "records"}`;
}

/** Комірки рядка реєстру текстом — однакові для таблиці й CSV. */
export interface RegisterCells {
  employee: string;
  email: string;
  position: string;
  kind: string;
  /** "2026-11-03" — для CSV і сортування в таблиці бухгалтерії. */
  date: string;
  /** "Tue, 3 Nov 2026". */
  dateLong: string;
  hours: string;
  from: string;
  to: string;
  /** Час під «Whole day» у таблиці; для частини дня — порожньо (час уже в hours). */
  hoursDetail: string;
  duration: string;
  durationHours: string;
  type: string;
  paid: string;
  unpaid: string;
  /** Хто й коли погодив; невідоме — порожньо. */
  approvedBy: string;
  approvedOn: string;
}

export function registerCells(row: RegisterRow): RegisterCells {
  const range = formatRange(row.start_min, row.end_min);
  const approvedBy = row.approved_by_name?.trim() ?? "";
  return {
    employee: employeeLabel(row),
    email: row.employee_email ?? "",
    position: row.position_title,
    kind: positionKindLabel(row.position_kind),
    date: row.date,
    dateLong: formatDateLong(row.date),
    hours: hoursLabel(row),
    from: formatTime(row.start_min),
    to: formatTime(row.end_min),
    hoursDetail: row.whole_day ? range : "",
    duration: formatDuration(row.minutes),
    durationHours: hoursDecimal(row.minutes),
    type: leaveTypeLabel(row.leave_type),
    paid: formatDays(daysToHundredths(row.paid_days ?? 0)),
    unpaid: formatDays(daysToHundredths(row.unpaid_days ?? 0)),
    approvedBy,
    approvedOn: row.approved_at ? formatKyivDateTime(row.approved_at) : "",
  };
}
