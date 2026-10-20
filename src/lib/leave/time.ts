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
