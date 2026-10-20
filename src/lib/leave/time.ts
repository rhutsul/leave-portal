// Час заявки за розкладом посади — чисті функції (D5 openspec/changes/impl-leave-ws6/design.md).
// Час — хвилини від півночі за Києвом, крок 5 хв. Блок розкладу містить свій початок і не містить кінця:
// у блоці 08:30–13:00 найпізніший початок відпустки — 12:55, а 13:00 — лише кінець (Assumptions 01-leave-request).
// Ті самі правила й тексти перевіряє ще раз private.submit_leave_request у базі.

export interface TimeBlock {
  /** Хвилини від півночі, включно. */
  start: number;
  /** Хвилини від півночі, не включно. */
  end: number;
}

export const STEP_MINUTES = 5;

/** Тексти PM з AC — дослівно. */
export const TIME_MESSAGES = {
  noWorkingHours: "You have no working hours on this day",
  endBeforeStart: "The end must be later than the start",
  /** Формат часу: PM задає крок 5 хв (Assumptions), окремого тексту в AC немає. */
  step: "Enter times in 5-minute steps",
  outsideSchedule: (blocks: TimeBlock[]) => `Hours must be within your schedule: ${formatBlocks(blocks)}`,
  blockEnd: (minutes: number) =>
    `${formatTime(minutes)} is the end of working time and can only be chosen as the end of leave`,
} as const;

/** "HH:MM" → хвилини від півночі; 24:00 = 1440. Інакше — null. */
export function parseTime(value: string): number | null {
  const match = /^(\d{2}):(\d{2})$/.exec(value.trim());
  if (!match) return null;
  const hours = Number(match[1]);
  const minutes = Number(match[2]);
  if (minutes > 59 || hours > 24 || (hours === 24 && minutes > 0)) return null;
  return hours * 60 + minutes;
}

export function formatTime(minutes: number): string {
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
}

export function formatRange(start: number, end: number): string {
  return `${formatTime(start)}–${formatTime(end)}`;
}

/** Усі блоки дня в порядку часу через ", " (AC-LEAVE-19). */
export function formatBlocks(blocks: TimeBlock[]): string {
  return sortBlocks(blocks)
    .map((b) => formatRange(b.start, b.end))
    .join(", ");
}

/** Тривалість до хвилини: "2 h 30 min", "7 h", "45 min". */
export function formatDuration(minutes: number): string {
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  if (h === 0) return `${m} min`;
  if (m === 0) return `${h} h`;
  return `${h} h ${m} min`;
}

/** День тижня календарної дати "YYYY-MM-DD": 1 = понеділок … 7 = неділя (як weekday у schedule_blocks). */
export function isoWeekday(date: string): number {
  const [y, m, d] = date.split("-").map(Number);
  const day = new Date(Date.UTC(y, m - 1, d)).getUTCDay();
  return day === 0 ? 7 : day;
}

export const WEEKDAY_SHORT = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"] as const;
const WEEKDAY_LONG = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"] as const;
const MONTH_SHORT = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"] as const;

function dateParts(date: string) {
  const [y, m, d] = date.split("-").map(Number);
  return { year: y, month: MONTH_SHORT[m - 1], day: d, weekday: isoWeekday(date) };
}

/** "Mon, 2 Nov 2026". */
export function formatDateLong(date: string): string {
  const p = dateParts(date);
  return `${WEEKDAY_SHORT[p.weekday - 1]}, ${p.day} ${p.month} ${p.year}`;
}

/** "Mon 2 Nov". */
export function formatDateShort(date: string): string {
  const p = dateParts(date);
  return `${WEEKDAY_SHORT[p.weekday - 1]} ${p.day} ${p.month}`;
}

export function weekdayName(date: string): string {
  return WEEKDAY_LONG[isoWeekday(date) - 1];
}

export function monthShort(date: string): string {
  return dateParts(date).month;
}

const MONTH_LONG = [
  "January",
  "February",
  "March",
  "April",
  "May",
  "June",
  "July",
  "August",
  "September",
  "October",
  "November",
  "December",
] as const;

/** Місяць календаря "YYYY-MM" плюс n місяців. */
export function addMonths(month: string, n: number): string {
  const [y, m] = month.split("-").map(Number);
  const index = y * 12 + (m - 1) + n;
  return `${Math.floor(index / 12)}-${String((index % 12) + 1).padStart(2, "0")}`;
}

/** "November 2026". */
export function formatMonth(month: string): string {
  const [y, m] = month.split("-").map(Number);
  return `${MONTH_LONG[m - 1]} ${y}`;
}

/** Клітинки місяця для календаря з понеділка: null — порожні клітинки до 1-го числа, далі дати "YYYY-MM-DD". */
export function monthGrid(month: string): (string | null)[] {
  const [y, m] = month.split("-").map(Number);
  const days = new Date(Date.UTC(y, m, 0)).getUTCDate();
  const blanks = isoWeekday(`${month}-01`) - 1;
  return [
    ...Array.from({ length: blanks }, () => null),
    ...Array.from({ length: days }, (_, i) => `${month}-${String(i + 1).padStart(2, "0")}`),
  ];
}

const KYIV = "Europe/Kyiv";

/** Календарна дата за Києвом "YYYY-MM-DD" (усі дати PM — Europe/Kyiv). */
export function kyivDate(now: Date): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: KYIV, year: "numeric", month: "2-digit", day: "2-digit" }).format(
    now,
  );
}

export function kyivHour(now: Date): number {
  return Number(new Intl.DateTimeFormat("en-GB", { timeZone: KYIV, hour: "2-digit", hourCycle: "h23" }).format(now));
}

/** Дата моменту за Києвом: "20 Oct 2026". */
export function formatKyivDay(timestamp: string | Date): string {
  return new Intl.DateTimeFormat("en-GB", { timeZone: KYIV, day: "numeric", month: "short", year: "numeric" }).format(
    new Date(timestamp),
  );
}

/** Вісь смуги розкладу дня: від цілої години перед першим блоком до цілої години після останнього. */
export function dayAxis(blocks: TimeBlock[]): { start: number; end: number; ticks: number[] } {
  const start = Math.floor(Math.min(...blocks.map((b) => b.start)) / 60) * 60;
  const end = Math.ceil(Math.max(...blocks.map((b) => b.end)) / 60) * 60;
  const step = end - start > 360 ? 120 : 60;
  const ticks: number[] = [];
  for (let t = start; t <= end; t += step) ticks.push(t);
  return { start, end, ticks };
}

export function sortBlocks(blocks: TimeBlock[]): TimeBlock[] {
  return [...blocks].sort((a, b) => a.start - b.start);
}

/** Хвилини відпустки всередині блоків; проміжок між блоками не рахується (AC-LEAVE-15). */
export function scheduledMinutes(blocks: TimeBlock[], start: number, end: number): number {
  return blocks.reduce((sum, b) => sum + Math.max(0, Math.min(end, b.end) - Math.max(start, b.start)), 0);
}

/** Блоки цілого дня: від початку першого до кінця останнього, хвилини — лише в блоках. */
export function wholeDay(blocks: TimeBlock[]): { start: number; end: number; minutes: number } {
  const sorted = sortBlocks(blocks);
  const start = sorted[0].start;
  const end = sorted[sorted.length - 1].end;
  return { start, end, minutes: scheduledMinutes(sorted, start, end) };
}

export type HoursCheck = { ok: true; minutes: number } | { ok: false; message: string };

/**
 * Години відпустки за блоками розкладу посади на дату. Порядок перевірок — як у private.submit_leave_request:
 * формат і крок → початок у кінці блоку (AC-LEAVE-08, AC-LEAVE-20) → кінець пізніше за початок (AC-LEAVE-09) →
 * початок і кінець усередині блоків (AC-LEAVE-07, AC-LEAVE-19).
 */
export function checkHours(blocks: TimeBlock[], start: number | null, end: number | null): HoursCheck {
  if (blocks.length === 0) return { ok: false, message: TIME_MESSAGES.noWorkingHours };
  if (
    start === null ||
    end === null ||
    start < 0 ||
    end > 1440 ||
    start % STEP_MINUTES !== 0 ||
    end % STEP_MINUTES !== 0
  ) {
    return { ok: false, message: TIME_MESSAGES.step };
  }

  const startInside = blocks.some((b) => start >= b.start && start < b.end);
  if (!startInside && blocks.some((b) => b.end === start)) {
    return { ok: false, message: TIME_MESSAGES.blockEnd(start) };
  }
  if (end <= start) return { ok: false, message: TIME_MESSAGES.endBeforeStart };

  const endInside = blocks.some((b) => end > b.start && end <= b.end);
  if (!startInside || !endInside) return { ok: false, message: TIME_MESSAGES.outsideSchedule(blocks) };

  return { ok: true, minutes: scheduledMinutes(blocks, start, end) };
}
