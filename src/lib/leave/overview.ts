// Overview v3 (ADR 0007): чиста логіка головної — два робочі тижні, рядки діаграми, позначки місяця, найближчі
// відпустки. Дані приходять уже відфільтровані правами бази (my_leave_records, decision_records); тут лише форма.
import { closureOn, formatClosureTime, type Closure } from "./calendar";
import { BLOCKING_STATUSES } from "./request";
import { formatDateLong, formatDateShort, isoWeekday, monthGrid, monthShort, WEEKDAY_SHORT } from "./time";

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

/**
 * Робочі дні (Mon–Fri) двох тижнів: 10 дат від понеділка тижня, у який потрапляє `today`; `page` гортає по два
 * тижні (1 — наступні два, -1 — попередні).
 */
export function twoWeeks(today: string, page = 0): string[] {
  const monday = addDays(today, 1 - isoWeekday(today) + 14 * page);
  return [0, 1, 2, 3, 4, 7, 8, 9, 10, 11].map((n) => addDays(monday, n));
}

/** Як далеко гортається діаграма: рік у кожен бік (26 сторінок по два тижні). */
export const MAX_TIMELINE_PAGE = 26;

/** Сторінка діаграми з `?weeks=` у посиланні: ціле в межах ±MAX_TIMELINE_PAGE, усе інше — 0 (цей тиждень і наступний). */
export function timelinePage(param: string | string[] | undefined): number {
  const raw = Array.isArray(param) ? param[0] : param;
  if (!raw || !/^-?\d{1,3}$/.test(raw)) return 0;
  return Math.min(MAX_TIMELINE_PAGE, Math.max(-MAX_TIMELINE_PAGE, Number(raw))) || 0;
}

/** Посилання на сторінку діаграми: 0 — без параметра; за межею гортання — null (кнопка вимкнена). */
export function timelineHref(page: number): string | null {
  if (Math.abs(page) > MAX_TIMELINE_PAGE) return null;
  return page === 0 ? "/" : `/?weeks=${page}`;
}

/** "9 Nov – 20 Nov 2026"; на межі років — "28 Dec 2026 – 8 Jan 2027". */
export function rangeLabel(days: readonly string[]): string {
  const first = days[0];
  const last = days[days.length - 1];
  const part = (d: string) => `${Number(d.slice(8))} ${monthShort(d)}`;
  const year = (d: string) => d.slice(0, 4);
  return `${part(first)}${year(first) === year(last) ? "" : ` ${year(first)}`} – ${part(last)} ${year(last)}`;
}

/**
 * Діапазон дат головної: поточний місяць (для місяця з точок) і цей та наступний тиждень — `from`…`to` (рядок про
 * закриття школи каже саме про них); `days` — показані два тижні діаграми (сторінка `page`), а `loadFrom`…`loadTo`
 * охоплює і їх — стільки треба завантажити. Останній день місяця — справжня дата: "2026-11-31" база відхилила б.
 */
export function overviewRange(today: string, page = 0) {
  const month = today.slice(0, 7);
  const days = twoWeeks(today, page);
  const current = twoWeeks(today);
  const first = `${month}-01`;
  const last = monthGrid(month).at(-1)!;
  const from = current[0] < first ? current[0] : first;
  const to = current[9] > last ? current[9] : last;
  return { month, days, from, to, loadFrom: days[0] < from ? days[0] : from, loadTo: days[9] > to ? days[9] : to };
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

/** Клітинка дня в рядку діаграми: записи цього дня за часом початку. */
export interface TimelineCell<T> {
  /** Індекс дня в `days` (0–9). */
  col: number;
  records: T[];
}

export interface TimelineRow<T> {
  key: string;
  name: string;
  sub: string;
  cells: TimelineCell<T>[];
}

/**
 * Рядки діаграми на два тижні: записи групуються за ключем рядка (людина й посада в менеджера, посада в працівника —
 * записи різних посад не зливаються), у рядку — клітинка на день із записами за часом. Записи поза `days` і не
 * блокуючі не потрапляють. Рядки — за першою датою, потім за назвою й підписом.
 */
export function timelineRows<T extends TimedRecord>(
  records: readonly T[],
  days: readonly string[],
  rowOf: (record: T) => { key: string; name: string; sub: string },
): TimelineRow<T>[] {
  const col = new Map(days.map((d, i) => [d, i]));
  const rows = new Map<string, { head: { key: string; name: string; sub: string }; cells: Map<number, T[]> }>();
  for (const r of records) {
    const c = col.get(r.date);
    if (c === undefined || !isBlocking(r.status)) continue;
    const head = rowOf(r);
    const entry = rows.get(head.key) ?? { head, cells: new Map<number, T[]>() };
    entry.cells.set(c, [...(entry.cells.get(c) ?? []), r]);
    rows.set(head.key, entry);
  }
  const out = [...rows.values()].map(({ head, cells }) => ({
    ...head,
    cells: [...cells.entries()]
      .sort(([a], [b]) => a - b)
      .map(([c, list]) => ({ col: c, records: [...list].sort((a, b) => a.start_min - b.start_min || a.end_min - b.end_min) })),
  }));
  return out.sort((a, b) => a.cells[0].col - b.cells[0].col || a.name.localeCompare(b.name) || a.sub.localeCompare(b.sub));
}

/** Від скількох записів клітинка показує лічильник («3 records») замість окремих смуг. */
export const COLLAPSE_FROM = 3;

/** Шкала клітинки діаграми: робочий день посади на цю дату, хвилини від півночі. */
export interface DayScale {
  start: number;
  end: number;
}

/** Робочий день посади на дату: від початку першого блоку розкладу до кінця останнього; без блоків — null. */
export function positionScale(blocks: readonly { weekday: number; start: number; end: number }[], date: string): DayScale | null {
  const today = blocks.filter((b) => b.weekday === isoWeekday(date));
  if (today.length === 0) return null;
  return { start: Math.min(...today.map((b) => b.start)), end: Math.max(...today.map((b) => b.end)) };
}

const share = (minutes: number, scale: DayScale) => Math.min(1, Math.max(0, (minutes - scale.start) / Math.max(1, scale.end - scale.start)));

/**
 * Де в клітинці стоїть смуга запису (частки 0–1) на шкалі робочого дня посади; без розкладу — на загальній шкалі
 * 08:00–18:00. Запис на весь день посади заповнює клітинку (`whole`). Скорочений день (`closesAt`, хвилини) — смуга
 * лише до години закриття. Дуже короткий запис — не вужчий за `MIN_SEGMENT`, щоб його було видно.
 */
export function barBox(
  record: { start_min: number; end_min: number },
  scale: DayScale | null,
  closesAt: number | null = null,
): { left: number; width: number; whole: boolean } {
  const s = scale ?? { start: SCALE_START, end: SCALE_END };
  const from = share(record.start_min, s);
  const to = closesAt === null ? share(record.end_min, s) : Math.min(share(record.end_min, s), share(closesAt, s));
  const left = Math.min(from, 1 - MIN_SEGMENT);
  const whole = scale !== null && record.start_min <= scale.start && record.end_min >= scale.end;
  return { left, width: Math.max(MIN_SEGMENT, to - left), whole };
}

/** Частка клітинки, з якої школа закрита, на шкалі дня посади: цілий день — 0; без `closesAt` — частка з 08:00–18:00. */
export function closureShare(closure: DayClosure, scale: DayScale | null): number {
  if (closure.closesAt == null || scale === null) return closure.from;
  return share(closure.closesAt, scale);
}

export type CellLayout<T> =
  | { collapsed: false; bars: ({ record: T } & ReturnType<typeof barBox>)[] }
  | { collapsed: true; count: number; statuses: BlockingStatus[] };

/**
 * Що намалювати в клітинці дня: один чи два записи — кожен своєю смугою на своїх годинах шкали дня посади
 * (`barBox`); три й більше — лічильник, тло якого поділене кольорами статусів записів за часом.
 */
export function cellLayout<T extends { start_min: number; end_min: number; status: BlockingStatus }>(
  records: readonly T[],
  scale: DayScale | null = null,
  closesAt: number | null = null,
): CellLayout<T> {
  if (records.length >= COLLAPSE_FROM) return { collapsed: true, count: records.length, statuses: records.map((r) => r.status) };
  return { collapsed: false, bars: records.map((record) => ({ record, ...barBox(record, scale, closesAt) })) };
}

/** Рядок над діаграмою: "6 records of your positions · 3 awaiting decision"; працівнику — "2 records · 1 awaiting decision". */
export function timelineSummary(statuses: readonly BlockingStatus[], decider: boolean): string | null {
  if (statuses.length === 0) return null;
  const awaiting = statuses.filter((s) => s === "awaiting").length;
  return `${count(statuses.length, "record", "records")}${decider ? " of your positions" : ""} · ${awaiting} awaiting decision`;
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
  /** З якої хвилини закрито (скорочений день); null чи немає — цілий день. Для шкали дня посади на діаграмі. */
  closesAt?: number | null;
  /** "Winter break", "Teachers' meeting from 12:00". */
  label: string;
  /** Скорочений день — "from 12:00"; цілий день — null. */
  time: string | null;
}

function dayClosure(closures: readonly Closure[], date: string): DayClosure | null {
  const c = closureOn(closures, date);
  return c ? { from: closedShare(c), closesAt: c.closesAt, label: closureLabel(c), time: formatClosureTime(c) } : null;
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
