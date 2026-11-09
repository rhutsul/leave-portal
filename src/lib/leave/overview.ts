// Overview v3 (ADR 0007): чиста логіка головної — два робочі тижні, рядки діаграми, позначки місяця, найближчі
// відпустки. Дані приходять уже відфільтровані правами бази (my_leave_records, decision_records); тут лише форма.
import { closureOn, formatClosureTime, type Closure } from "./calendar";
import { BLOCKING_STATUSES } from "./request";
import { formatDateLong, formatDateShort, formatRange, isoWeekday, monthGrid, WEEKDAY_SHORT } from "./time";

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
 * Діапазон дат головної: поточний місяць (для місяця з точок) і два робочі тижні (для діаграми). Останній день
 * місяця — справжня дата: "2026-11-31" база відхилила б, і запит повернув би порожньо.
 */
export function overviewRange(today: string) {
  const month = today.slice(0, 7);
  const days = twoWeeks(today);
  const first = `${month}-01`;
  const last = monthGrid(month).at(-1)!;
  return { month, days, from: days[0] < first ? days[0] : first, to: days[9] > last ? days[9] : last };
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

/** Один запис у клітинці дня діаграми: свій сегмент на своїх годинах, кольором свого статусу. */
export interface TimelineSegment {
  start_min: number;
  end_min: number;
  status: BlockingStatus;
  /** "08:30–12:00". */
  hours: string;
}

export interface TimelineBar {
  /** Індекс дня в `days` (0–9). */
  col: number;
  /** Статус, що веде клітинку (leadStatus): колір смуги, коли запис один. */
  status: BlockingStatus;
  /** Години записів цієї клітинки через кому: "08:30–12:00, 12:30–14:00". */
  hours: string;
  /** Записи клітинки за часом початку; кілька — кожен своїм сегментом. */
  segments: TimelineSegment[];
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
          segments: sorted.map((r) => ({
            start_min: r.start_min,
            end_min: r.end_min,
            status: r.status,
            hours: formatRange(r.start_min, r.end_min),
          })),
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

/**
 * Шкала робочого дня на Overview (вигляд, DESIGN.md `DotMonth`, `WeekTimeline`): 08:00–18:00, однакова для всіх
 * клітинок, щоб сегменти записів і штриховка скороченого дня різних людей стояли на тих самих годинах. Розклад посад
 * тут не потрібен — це лише де в клітинці намалювати.
 */
const SCALE_START = 8 * 60;
const SCALE_END = 18 * 60;

/** Частка шкали дня (0–1) для хвилин від півночі; поза 08:00–18:00 — до краю. */
export function dayShare(minutes: number): number {
  return Math.min(1, Math.max(0, (minutes - SCALE_START) / (SCALE_END - SCALE_START)));
}

/** Частка дня, з якої школа закрита: 0 — закрито цілий день, 0.4 — з 12:00. */
export function closedShare(closure: Pick<Closure, "closesAt">): number {
  return closure.closesAt == null ? 0 : dayShare(closure.closesAt);
}

/**
 * Де в клітинці дня стоїть сегмент запису (частки шкали, `left` і `width`). Скорочений день (`closedFrom`) — сегмент
 * лише до години закриття; закритий цілий день сегмент не обрізає (запис, що вже є, лишається видно). Дуже короткий
 * запис — не вужчий за `MIN_SEGMENT`, щоб його було видно.
 */
const MIN_SEGMENT = 0.06;

export function segmentBox(segment: { start_min: number; end_min: number }, closedFrom: number | null = null) {
  const from = dayShare(segment.start_min);
  let to = dayShare(segment.end_min);
  if (closedFrom !== null && closedFrom > 0) to = Math.min(to, closedFrom);
  const left = Math.min(from, 1 - MIN_SEGMENT);
  return { left, width: Math.max(MIN_SEGMENT, to - left) };
}

/** Як назвати закриття в підписі: "Winter break"; скорочений день — "Teachers' meeting from 12:00". */
export function closureLabel(closure: Pick<Closure, "name" | "closesAt">): string {
  const time = formatClosureTime(closure);
  return time ? `${closure.name} ${time}` : closure.name;
}

export interface DayClosure {
  /** Частка дня, з якої закрито (closedShare): 0 — цілий день. */
  from: number;
  /** "Winter break", "Teachers' meeting from 12:00". */
  label: string;
  /** Скорочений день — "from 12:00"; цілий день — null. */
  time: string | null;
}

function dayClosure(closures: readonly Closure[], date: string): DayClosure | null {
  const c = closureOn(closures, date);
  return c ? { from: closedShare(c), label: closureLabel(c), time: formatClosureTime(c) } : null;
}

/** Закриті й скорочені дні місяця "YYYY-MM": день місяця → позначка. */
export function monthClosures(closures: readonly Closure[], month: string): Record<number, DayClosure> {
  const out: Record<number, DayClosure> = {};
  for (const date of monthGrid(month)) {
    const c = date && dayClosure(closures, date);
    if (c) out[Number(date.slice(8))] = c;
  }
  return out;
}

/** Закриття для кожного дня діаграми (той самий порядок, що `days`); null — школа відкрита. */
export function dayClosures(closures: readonly Closure[], days: readonly string[]): (DayClosure | null)[] {
  return days.map((d) => dayClosure(closures, d));
}

/**
 * Текстовий рядок Overview про найближче закриття школи (DotMonth — декор, `aria-hidden`, тож той самий факт має бути в
 * тексті): закриття, що ще не скінчилося й починається не пізніше `until` (кінець того, що показує Overview: місяць і
 * два тижні — overviewRange().to), найраніше за початком; null — нічого.
 * "School closed: Winter break, Mon 28 Dec – Fri 8 Jan"; "School closes early: Teachers' meeting, Fri 20 Nov from
 * 12:00"; ще кілька — " · 2 more by Mon 30 Nov".
 */
export function nextClosureLine(closures: readonly Closure[], today: string, until: string): string | null {
  const ahead = closuresBetween(closures, today, until);
  if (ahead.length === 0) return null;
  const text = describeClosure(ahead[0]);
  return ahead.length > 1 ? `${text} · ${ahead.length - 1} more by ${formatDateShort(until)}` : text;
}

/** Закриття, що перетинають from…to, за датою початку. */
function closuresBetween(closures: readonly Closure[], from: string, to: string): Closure[] {
  return closures
    .filter((c) => c.endDate >= from && c.startDate <= to)
    .sort((a, b) => a.startDate.localeCompare(b.startDate) || a.id - b.id);
}

/** "School closed: Winter break, Mon 28 Dec – Fri 8 Jan"; "School closes early: Teachers' meeting, Fri 20 Nov from 12:00". */
export function describeClosure(c: Closure): string {
  const dates = c.startDate === c.endDate ? formatDateShort(c.startDate) : `${formatDateShort(c.startDate)} – ${formatDateShort(c.endDate)}`;
  return c.closesAt == null ? `School closed: ${c.name}, ${dates}` : `School closes early: ${c.name}, ${dates} ${formatClosureTime(c)}`;
}

/**
 * Усі закриття показаного на Overview (місяць і два тижні, from…to) — текстом для зчитувача екрана: місяць із точок і
 * штриховка діаграми — графіка, а DESIGN.md вимагає ті самі дані в тексті сторінки.
 */
export function closuresText(closures: readonly Closure[], from: string, to: string): string[] {
  return closuresBetween(closures, from, to).map(describeClosure);
}
