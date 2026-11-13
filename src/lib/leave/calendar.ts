import { formatTime, isCalendarDate, parseTime } from "@/lib/leave/time";

/**
 * Шкільний календар (openspec/specs/school-calendar/spec.md, design.md D5): закриття цілими днями або скорочений день.
 * Дати — "YYYY-MM-DD" за Києвом; closesAt — хвилини від півночі, з яких школа закрита (null — цілі дні).
 */
export interface Closure {
  id: number;
  name: string;
  startDate: string;
  endDate: string;
  closesAt: number | null;
}

export const CALENDAR_MESSAGES = {
  adminOnly: "Only an administrator can change the school calendar",
  endBeforeStart: "The end date cannot be earlier than the start date",
  closedDay: (name: string) => `The school is closed on this day: ${name}`,
  // Обов'язкові поля закриття (AC-CAL-18, AC-CAL-19, Assumptions 04-school-calendar) — ті самі тексти в
  // private.add_school_closure.
  nameRequired: "Enter a name for the closure",
  nameTooLong: "The name can be at most 100 characters",
  datesRequired: "Enter the start and end dates",
  timeRequired: "Enter the closing time",
} as const;

/** Найдовша назва закриття (Assumptions 04-school-calendar, AC-CAL-19). */
export const CLOSURE_NAME_MAX = 100;

/**
 * Закриття навчального року (1 вересня schoolYear — 31 серпня schoolYear + 1) за датою початку (AC-CAL-02). Закриття
 * цілими днями, що перетинає 31 серпня, потрапляє в обидва роки (Assumptions 04-school-calendar).
 */
export function closuresInSchoolYear(closures: readonly Closure[], schoolYear: number): Closure[] {
  const from = `${schoolYear}-09-01`;
  const to = `${schoolYear + 1}-08-31`;
  return closures
    .filter((c) => c.startDate <= to && c.endDate >= from)
    .sort((a, b) => a.startDate.localeCompare(b.startDate) || a.id - b.id);
}

/** "2026-12-28 – 2027-01-08"; одна дата — "2026-11-20" (AC-CAL-01, AC-CAL-02). */
export function formatClosureDates(c: Pick<Closure, "startDate" | "endDate">): string {
  return c.startDate === c.endDate ? c.startDate : `${c.startDate} – ${c.endDate}`;
}

/** Час скороченого дня: "from 12:00"; цілі дні — null. */
export function formatClosureTime(c: Pick<Closure, "closesAt">): string | null {
  return c.closesAt == null ? null : `from ${formatTime(c.closesAt)}`;
}

/** Порожній навчальний рік (AC-CAL-15): "No closed days in school year 2026–2027". */
export function emptyCalendarMessage(schoolYear: number): string {
  // Той самий формат, що formatSchoolYear у balance.ts; без імпорту — balance.ts сам бере clipBlocks звідси.
  return `No closed days in school year ${schoolYear}–${schoolYear + 1}`;
}

/** Рядок бази → Closure. */
export function toClosure(row: {
  id: number;
  name: string;
  start_date: string;
  end_date: string;
  closes_at: number | null;
}): Closure {
  return { id: row.id, name: row.name, startDate: row.start_date, endDate: row.end_date, closesAt: row.closes_at };
}

/** Що адміністратор ввів у формі «Add closure»: назва й або цілі дні, або скорочений день. */
export interface ClosureInput {
  name: string;
  start: string;
  end: string;
  closesAt: number | null;
}

export type ClosureCheck =
  | { ok: true; input: ClosureInput }
  | { ok: false; field: "name" | "dates" | "time"; message: string };

/** Довжина назви в знаках (як char_length у Postgres), без пробілів на краях. */
export function closureNameLength(name: string): number {
  return [...name.trim()].length;
}

/** Помилка назви закриття текстом PM або null: порожня (AC-CAL-18) чи довша за 100 знаків (AC-CAL-19). */
export function closureNameError(name: string): string | null {
  const length = closureNameLength(name);
  if (length === 0) return CALENDAR_MESSAGES.nameRequired;
  return length > CLOSURE_NAME_MAX ? CALENDAR_MESSAGES.nameTooLong : null;
}

/**
 * Помилки обов'язкових полів форми «Add closure» текстами PM (null — поле гаразд): назва (AC-CAL-18, AC-CAL-19), дати
 * й час скороченого дня (Assumptions 04-school-calendar). Форма показує їх під полями до надсилання.
 */
export function closureFieldErrors(form: { name: string; hasDates: boolean; early: boolean; time: string }): {
  name: string | null;
  dates: string | null;
  time: string | null;
} {
  return {
    name: closureNameError(form.name),
    dates: form.hasDates ? null : CALENDAR_MESSAGES.datesRequired,
    time: form.early && parseTime(form.time) == null ? CALENDAR_MESSAGES.timeRequired : null,
  };
}

/**
 * Поля форми «Add closure» → дані для add_school_closure або перша помилка поля текстом PM: назва порожня чи довша за
 * 100 знаків (AC-CAL-18, AC-CAL-19), немає дат, скорочений день без часу (Assumptions 04-school-calendar). Решту
 * правил (AC-CAL-07, -10, -11, -17) перевіряє база; вона ж повторює й ці перевірки для виклику напряму.
 */
export function parseClosureForm(field: (name: string) => string): ClosureCheck {
  const name = field("name").trim();
  const early = field("kind") === "early";
  const start = field(early ? "date" : "start");
  const end = early ? start : field("end");
  const closesAt = early ? parseTime(field("time")) : null;
  const nameError = closureNameError(name);
  if (nameError) return { ok: false, field: "name", message: nameError };
  if (!isCalendarDate(start) || !isCalendarDate(end)) {
    return { ok: false, field: "dates", message: CALENDAR_MESSAGES.datesRequired };
  }
  if (early && closesAt == null) return { ok: false, field: "time", message: CALENDAR_MESSAGES.timeRequired };
  return { ok: true, input: { name, start, end, closesAt } };
}

/** Закриття, що охоплює дату, або null (два закриття не мають спільної дати — AC-CAL-11). */
export function closureOn(closures: readonly Closure[], date: string): Closure | null {
  return closures.find((c) => c.startDate <= date && date <= c.endDate) ?? null;
}

/**
 * Блоки розкладу дати з урахуванням закриття (design.md D3; те саме правило — private.blocks_on_date у базі): без
 * закриття — як є; закриття цілими днями — жодного; скорочений день із X — блоки, що починаються до X, а блок, що
 * триває о X, закінчується о X (Assumptions 04-school-calendar; AC-CAL-04, AC-CAL-05).
 */
export function clipBlocks<B extends { start: number; end: number }>(
  blocks: readonly B[],
  closure: Pick<Closure, "closesAt"> | null,
): B[] {
  if (!closure) return [...blocks];
  const closesAt = closure.closesAt;
  // Еквівалентний мутант Stryker (if (false)): без цього рядка фільтр `b.start < null` теж дає [] через приведення
  // null до 0 — рядок лишаємо, бо він каже правило прямо, а не через приведення типів.
  if (closesAt == null) return [];
  return blocks.filter((b) => b.start < closesAt).map((b) => ({ ...b, end: Math.min(b.end, closesAt) }));
}
