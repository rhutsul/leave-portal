import { closureOn, formatClosureTime, type Closure } from "@/lib/leave/calendar";
import { addMonths, formatDateLong, formatMonth, monthGrid } from "@/lib/leave/time";

/**
 * Сітка шкільного календаря (вигляд за розробником, DESIGN.md розділи 5–6): місяці з понеділка, у кожному дні — чи
 * закрито школою цілий день (closed), скорочений день (early) або звичайний (open). Правила закриттів не тут, а в
 * calendar.ts (closureOn); тут лише розкладка для показу.
 */
export type GridDayKind = "open" | "closed" | "early";

export interface GridDay {
  date: string;
  day: number;
  kind: GridDayKind;
  closure: Closure | null;
  today: boolean;
  /** Дата з діапазону, який адміністратор вводить у формі «Add closure» (лише в попередньому перегляді). */
  selected: boolean;
}

export interface GridMonth {
  /** "YYYY-MM". */
  month: string;
  /** "September 2026". */
  label: string;
  /** null — порожні клітинки до 1-го числа (тиждень з понеділка). */
  cells: (GridDay | null)[];
}

/** Дати, вибрані у формі (включно); end раніше за start — лише start (помилку покаже база, AC-CAL-10). */
export interface DateSelection {
  start: string;
  end: string;
}

/** Місяці навчального року: вересень schoolYear — серпень schoolYear + 1 ("YYYY-MM"). */
export function schoolYearMonths(schoolYear: number): string[] {
  return Array.from({ length: 12 }, (_, i) => addMonths(`${schoolYear}-09`, i));
}

function inSelection(date: string, selection: DateSelection | null): boolean {
  if (!selection) return false;
  const end = selection.end < selection.start ? selection.start : selection.end;
  return selection.start <= date && date <= end;
}

/** Один місяць сітки. */
export function buildMonth(
  month: string,
  closures: readonly Closure[],
  today: string,
  selection: DateSelection | null = null,
): GridMonth {
  return {
    month,
    label: formatMonth(month),
    cells: monthGrid(month).map((date) => {
      if (!date) return null;
      const closure = closureOn(closures, date);
      return {
        date,
        day: Number(date.slice(8)),
        kind: !closure ? "open" : closure.closesAt == null ? "closed" : "early",
        closure,
        today: date === today,
        selected: inSelection(date, selection),
      };
    }),
  };
}

/** 12 місяців навчального року для сторінки «School calendar». */
export function buildSchoolYear(schoolYear: number, closures: readonly Closure[], today: string): GridMonth[] {
  return schoolYearMonths(schoolYear).map((m) => buildMonth(m, closures, today));
}

/**
 * Місяці для попереднього перегляду в формі: від місяця start до місяця end, не більше `max`; без дат — місяць
 * `fallback`. `more` — скільки місяців діапазону не показано.
 */
export function previewMonths(
  selection: DateSelection | null,
  fallback: string,
  max = 3,
): { months: string[]; more: number } {
  if (!selection) return { months: [fallback.slice(0, 7)], more: 0 };
  const first = selection.start.slice(0, 7);
  const last = (selection.end < selection.start ? selection.start : selection.end).slice(0, 7);
  // Кількість місяців — арифметикою, а цикл не довший за max: кінцева дата може бути дуже далекою (рік 9999).
  const index = (m: string) => Number(m.slice(0, 4)) * 12 + Number(m.slice(5, 7));
  const total = index(last) - index(first) + 1;
  const months = Array.from({ length: Math.min(total, max) }, (_, i) => addMonths(first, i));
  return { months, more: total - months.length };
}

/** Назва закриття дня для підказки й зчитувача: "Winter break" або "Teachers' meeting from 12:00". */
export function closureCaption(closure: Closure): string {
  const time = formatClosureTime(closure);
  return time ? `${closure.name} ${time}` : closure.name;
}

/** Повна назва дня для aria-label: "Mon, 28 Dec 2026: Winter break"; "Today, Mon, 9 Nov 2026". */
export function dayLabel(day: GridDay): string {
  const date = formatDateLong(day.date);
  const prefix = day.today ? `Today, ${date}` : date;
  return day.closure ? `${prefix}: ${closureCaption(day.closure)}` : prefix;
}

/**
 * Наявні закриття, що перетинають вибрані дати (лише підказка в перегляді: сам перетин відхиляє база, AC-CAL-11),
 * за датою початку.
 */
export function overlappingClosures(closures: readonly Closure[], selection: DateSelection | null): Closure[] {
  if (!selection) return [];
  const end = selection.end < selection.start ? selection.start : selection.end;
  return closures
    .filter((c) => c.startDate <= end && c.endDate >= selection.start)
    .sort((a, b) => a.startDate.localeCompare(b.startDate) || a.id - b.id);
}
