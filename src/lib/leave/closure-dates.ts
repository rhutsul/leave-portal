/**
 * Дати форми «Add closure» з кліків у DatePicker (вигляд за розробником; правила — у базі й calendar.ts). Закриття —
 * один проміжок (requirements/04-school-calendar.md, Assumptions), тож форма бере одну дату або діапазон.
 */
import { rangeOf, type DayNote, type PickValue } from "../date-picker";
import { closureOn, formatClosureTime, type Closure } from "./calendar";
import type { DateSelection } from "./calendar-grid";

export interface ClosurePick {
  /** Поля форми — у порядку кліків: кінець може бути раніше за початок (його відхиляє база, AC-CAL-10). */
  start: string;
  end: string;
  reversed: boolean;
  /** Що показати в перегляді «Your closure»: кінець раніше за початок — лише день початку. */
  preview: DateSelection;
}

export function closurePick(value: PickValue): ClosurePick | null {
  const range = rangeOf(value);
  if (!range) return null;
  const reversed = range.end < range.start;
  return { ...range, reversed, preview: { start: range.start, end: reversed ? range.start : range.end } };
}

/** Позначка дня в календарі форми: уже закрито — штриховка (скорочений день — нижня половина) і назва закриття. */
export function closureNote(closures: readonly Closure[], date: string): DayNote | null {
  const c = closureOn(closures, date);
  if (!c) return null;
  const time = formatClosureTime(c);
  return time
    ? { label: `already closed: ${c.name} ${time}`, hatch: "half" }
    : { label: `already closed: ${c.name}`, hatch: "full" };
}

/** Сховані поля форми, які читає parseClosureForm: цілі дні — start і end, скорочений день — date. */
export function closureFields(kind: "days" | "early", pick: ClosurePick | null): Record<string, string> {
  const start = pick?.start ?? "";
  return kind === "days" ? { start, end: pick?.end ?? "" } : { date: start };
}
