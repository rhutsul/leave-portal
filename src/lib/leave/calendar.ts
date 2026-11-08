import { formatSchoolYear } from "@/lib/leave/balance";
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
} as const;

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
  return `No closed days in school year ${formatSchoolYear(schoolYear)}`;
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

/**
 * Поля форми «Add closure» → дані для add_school_closure; нечитабельні — null. Межі й тексти помилок (AC-CAL-07, -10,
 * -11) перевіряє база; тут — лише те, без чого виклик не має сенсу: назва, дати й час скороченого дня.
 */
export function parseClosureForm(field: (name: string) => string): ClosureInput | null {
  const name = field("name").trim();
  const early = field("kind") === "early";
  const start = field(early ? "date" : "start");
  const end = early ? start : field("end");
  const closesAt = early ? parseTime(field("time")) : null;
  if (!name || !isCalendarDate(start) || !isCalendarDate(end) || (early && closesAt == null)) return null;
  return { name, start, end, closesAt };
}
