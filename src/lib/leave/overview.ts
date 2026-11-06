// Overview v3 (ADR 0007): чиста логіка головної — два робочі тижні, рядки діаграми, позначки місяця, найближчі
// відпустки. Дані приходять уже відфільтровані правами бази (my_leave_records, decision_records); тут лише форма.
import { BLOCKING_STATUSES } from "./request";
import { formatDateLong, formatRange, isoWeekday, WEEKDAY_SHORT } from "./time";

/** Статус, що блокує час (BLOCKING_STATUSES) — лише такі записи видно на діаграмі й у місяці. */
export type BlockingStatus = (typeof BLOCKING_STATUSES)[number];

export function isBlocking(status: string | null | undefined): status is BlockingStatus {
  return (BLOCKING_STATUSES as readonly string[]).includes(status ?? "");
}

/** Календарна дата "YYYY-MM-DD" плюс n днів. */
export function addDays(date: string, n: number): string {
  const [y, m, d] = date.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d + n)).toISOString().slice(0, 10);
}

/** Робочі дні (Mon–Fri) цього й наступного тижня: 10 дат від понеділка тижня, у який потрапляє `today`. */
export function twoWeeks(today: string): string[] {
  const monday = addDays(today, 1 - isoWeekday(today));
  return [0, 1, 2, 3, 4, 7, 8, 9, 10, 11].map((n) => addDays(monday, n));
}

/**
 * Який статус показати, коли на одну клітинку припадає кілька записів: той, що ще чекає дії, — «Awaiting decision»
 * перед «Returned for revision», ті — перед «Approved».
 */
const PRIORITY: Record<BlockingStatus, number> = { awaiting: 0, returned: 1, approved: 2 };

export function leadStatus(statuses: readonly BlockingStatus[]): BlockingStatus {
  return [...statuses].sort((a, b) => PRIORITY[a] - PRIORITY[b])[0];
}

export interface TimedRecord {
  date: string;
  start_min: number;
  end_min: number;
  status: BlockingStatus;
}

export interface TimelineBar {
  /** Індекс дня в `days` (0–9). */
  col: number;
  status: BlockingStatus;
  /** Години записів цієї клітинки через кому: "08:30–12:00, 12:30–14:00". */
  hours: string;
  count: number;
}

export interface TimelineRow {
  key: string;
  name: string;
  sub: string;
  bars: TimelineBar[];
}

/**
 * Рядки діаграми на два тижні: записи групуються за ключем рядка (людина в менеджера, посада в працівника), у рядку —
 * одна смуга на день. Записи поза `days` і не блокуючі не потрапляють. Рядки — за першою датою, потім за назвою.
 */
export function timelineRows<T extends TimedRecord>(
  records: readonly T[],
  days: readonly string[],
  rowOf: (record: T) => { key: string; name: string; sub: string },
): TimelineRow[] {
  const col = new Map(days.map((d, i) => [d, i]));
  const rows = new Map<string, { row: TimelineRow; cells: Map<number, T[]> }>();
  for (const r of records) {
    const c = col.get(r.date);
    if (c === undefined || !isBlocking(r.status)) continue;
    const head = rowOf(r);
    const entry = rows.get(head.key) ?? { row: { ...head, bars: [] }, cells: new Map<number, T[]>() };
    entry.cells.set(c, [...(entry.cells.get(c) ?? []), r]);
    rows.set(head.key, entry);
  }
  const out = [...rows.values()].map(({ row, cells }) => ({
    ...row,
    bars: [...cells.entries()]
      .sort(([a], [b]) => a - b)
      .map(([c, list]) => {
        const sorted = [...list].sort((a, b) => a.start_min - b.start_min);
        return {
          col: c,
          status: leadStatus(sorted.map((r) => r.status)),
          hours: sorted.map((r) => formatRange(r.start_min, r.end_min)).join(", "),
          count: sorted.length,
        };
      }),
  }));
  return out.sort((a, b) => a.bars[0].col - b.bars[0].col || a.name.localeCompare(b.name));
}

/** Позначки місяця "YYYY-MM": день → статус, що показати (за `leadStatus`). */
export function monthMarks(records: readonly { date: string; status: string | null }[], month: string): Map<number, BlockingStatus> {
  const byDay = new Map<number, BlockingStatus[]>();
  for (const r of records) {
    if (!r.date.startsWith(`${month}-`) || !isBlocking(r.status)) continue;
    const day = Number(r.date.slice(8));
    byDay.set(day, [...(byDay.get(day) ?? []), r.status]);
  }
  return new Map([...byDay.entries()].map(([day, list]) => [day, leadStatus(list)]));
}

/** Одна заявка на одну дату — одна відпустка в «Next leave», навіть якщо в ній кілька посад. Порядок — як у вхідних. */
export function groupByRequestDate<T extends { request_id: number | null; date: string | null }>(records: readonly T[]): T[][] {
  const groups = new Map<string, T[]>();
  for (const r of records) {
    const key = `${r.request_id}|${r.date}`;
    groups.set(key, [...(groups.get(key) ?? []), r]);
  }
  return [...groups.values()];
}

/** Дні діаграми з підписами: "Mon 2" у шапці, "Mon, 2 Nov 2026" для зчитувача екрана. */
export function timelineDays(days: readonly string[], today: string) {
  return days.map((date) => ({
    date,
    label: `${WEEKDAY_SHORT[isoWeekday(date) - 1]} ${Number(date.slice(8))}`,
    long: formatDateLong(date),
    today: date === today,
  }));
}

/** "1 record", "3 records". */
export function count(n: number, one: string, many: string): string {
  return `${n} ${n === 1 ? one : many}`;
}

/**
 * Рядок під привітанням: менеджеру — скільки записів чекає його рішення і скільки людей відсутні цього тижня;
 * працівнику — коли найближча відпустка і чи є повернені записи.
 */
export function headline(
  input:
    | { decider: true; toDecide: number; awayThisWeek: number }
    | { decider: false; nextDate: string | null; returned: number },
): string {
  if (input.decider) {
    const verb = input.toDecide === 1 ? "awaits" : "await";
    const away = input.awayThisWeek === 1 ? "1 person is" : `${input.awayThisWeek} people are`;
    return `${count(input.toDecide, "record", "records")} of your positions ${verb} your decision. ${away} away this week.`;
  }
  if (!input.nextDate) return "You have no upcoming leave.";
  const returned = input.returned
    ? ` ${input.returned === 1 ? "1 record was" : `${input.returned} records were`} returned for revision.`
    : "";
  return `Your next leave is on ${formatDateLong(input.nextDate)}.${returned}`;
}
