/**
 * Чиста логіка DatePicker (src/components/ui/date-picker.tsx, DESIGN.md розділ 5): що робить клік, як позначити день,
 * куди йде фокус від клавіш і що каже підсумок вибору. Окремо від компонента, щоб перевірити тестами без DOM.
 * Дати — "YYYY-MM-DD", місяці — "YYYY-MM".
 */
import { addDays } from "./leave/overview";
import { addMonths, formatDateLong, isoWeekday } from "./leave/time";

/** single — одна дата; range — від першого кліку до другого; multiple — кілька окремих дат. */
export type PickMode = "single" | "range" | "multiple";

/**
 * Значення — дати в порядку кліків: single — [дата]; range — [початок] (кінець ще не вибрано) або [початок, кінець];
 * multiple — відсортовані без повторів. Кінець діапазону може бути раніше за початок: порядок кліків зберігаємо, а
 * чи можна так, вирішує форма (у «Add closure» — AC-CAL-10).
 */
export type PickValue = readonly string[];

/** Нове значення після кліку на дату. */
export function pickDate(mode: PickMode, value: PickValue, date: string): string[] {
  if (mode === "single") return [date];
  if (mode === "range") return value.length === 1 ? [value[0], date] : [date];
  return value.includes(date) ? value.filter((d) => d !== date) : [...value, date].sort();
}

/**
 * Як позначити день: single — вибраний окремо; start / end / inside — краї й середина діапазону; preview — день між
 * початком і днем під курсором (чи фокусом), поки кінця ще немає; null — не вибраний.
 */
export type DayMark = "single" | "start" | "end" | "inside" | "preview" | null;

export function dayMark(mode: PickMode, value: PickValue, date: string, hover: string | null = null): DayMark {
  if (mode !== "range") return value.includes(date) ? "single" : null;
  if (value.length === 0) return null;
  return value.length === 1 ? pendingMark(value[0], date, hover) : rangeMark(value[0], value[1], date);
}

/** Діапазон без кінця: початок і попередній перегляд до дня під курсором, якщо той пізніше за початок. */
export function pendingMark(start: string, date: string, hover: string | null): DayMark {
  const until = hover !== null && hover > start ? hover : null;
  if (date === start) return until ? "start" : "single";
  return until && date > start && date <= until ? "preview" : null;
}

/** Готовий діапазон. Один день або кінець раніше за початок — два окремі дні без смуги між ними. */
export function rangeMark(start: string, end: string, date: string): DayMark {
  if (end <= start) return date === start || date === end ? "single" : null;
  if (date === start) return "start";
  if (date === end) return "end";
  return date > start && date < end ? "inside" : null;
}

/** Чи день входить у вибір (aria-selected): попередній перегляд — ще ні. */
export function isSelected(mark: DayMark): boolean {
  return mark !== null && mark !== "preview";
}

/** Початок і кінець діапазону: один клік — один день; кінець може бути раніше за початок (порядок кліків). */
export function rangeOf(value: PickValue): { start: string; end: string } | null {
  if (value.length === 0) return null;
  return { start: value[0], end: value[1] ?? value[0] };
}

/** Кількість днів від a до b включно (a ≤ b). */
export function daysInclusive(a: string, b: string): number {
  return Math.round((Date.parse(`${b}T00:00:00Z`) - Date.parse(`${a}T00:00:00Z`)) / 86_400_000) + 1;
}

function daysInMonth(month: string): number {
  const [y, m] = month.split("-").map(Number);
  return new Date(Date.UTC(y, m, 0)).getUTCDate();
}

/** Та сама дата на n місяців далі; день, якого там немає (31-ше), — останній день місяця. */
export function shiftMonth(date: string, n: number): string {
  const month = addMonths(date.slice(0, 7), n);
  const day = Math.min(Number(date.slice(8)), daysInMonth(month));
  return `${month}-${String(day).padStart(2, "0")}`;
}

/**
 * Куди йде фокус від клавіші в сітці (як у шаблоні WAI-ARIA «Date picker»): стрілки — день і тиждень, Home / End —
 * понеділок і неділя тижня, PageUp / PageDown — місяць. Інша клавіша — null.
 */
export function moveFocus(date: string, key: string): string | null {
  switch (key) {
    case "ArrowLeft":
      return addDays(date, -1);
    case "ArrowRight":
      return addDays(date, 1);
    case "ArrowUp":
      return addDays(date, -7);
    case "ArrowDown":
      return addDays(date, 7);
    case "Home":
      return addDays(date, 1 - isoWeekday(date));
    case "End":
      return addDays(date, 7 - isoWeekday(date));
    case "PageUp":
      return shiftMonth(date, -1);
    case "PageDown":
      return shiftMonth(date, 1);
    default:
      return null;
  }
}

/** День, з якого починається фокус у показаному місяці: вибраний, сьогодні або 1-ше число. */
export function focusStart(month: string, value: PickValue, today: string | null): string {
  return value.find((d) => d.startsWith(month)) ?? (today?.startsWith(month) ? today : `${month}-01`);
}

/** Позначка дня поверх вибору (наприклад, уже закрито школою): штриховка всього дня чи нижньої половини й підпис. */
export interface DayNote {
  label: string;
  hatch: "full" | "half";
}

/** Назва дня для зчитувача: повна дата, далі позначка й «today» — «Mon, 28 Dec 2026, already closed: Winter break». */
export function dayLabel(date: string, note: DayNote | null, today: string | null): string {
  const parts = [formatDateLong(date)];
  if (note) parts.push(note.label);
  if (date === today) parts.push("today");
  return parts.join(", ");
}

/** id для aria-describedby: лише задані, через пробіл. */
export function joinIds(...ids: (string | false | null | undefined)[]): string {
  return ids.filter(Boolean).join(" ");
}

/** Підсумок вибору — видимий текст і жива область для зчитувача екрана. */
export function pickSummary(mode: PickMode, value: PickValue): string {
  if (value.length === 0) return mode === "multiple" ? "No dates selected" : "No date selected";
  if (mode === "multiple") {
    const n = value.length;
    return `${n} ${n === 1 ? "date" : "dates"} selected: ${value.map(formatDateLong).join("; ")}`;
  }
  if (mode === "single") return `Selected ${formatDateLong(value[0])}`;
  const [start, end] = value;
  if (end === undefined) return `Selected ${formatDateLong(start)}. Click another day to make it a range.`;
  if (end === start) return `Selected ${formatDateLong(start)}`;
  if (end < start) return `Selected from ${formatDateLong(start)} to ${formatDateLong(end)}`;
  return `Selected ${formatDateLong(start)} – ${formatDateLong(end)}, ${daysInclusive(start, end)} days`;
}

/**
 * Текст поля DatePickerField (кнопка, що відкриває календар): коротко, без «Selected». null — нічого не вибрано
 * (поле показує свою підказку). Діапазон без кінця — одна дата: в «Add closure» один клік — закриття на один день.
 */
export function fieldText(mode: PickMode, value: PickValue): string | null {
  if (value.length === 0) return null;
  if (mode === "multiple") return value.length === 1 ? formatDateLong(value[0]) : `${value.length} dates`;
  const [start, end = start] = mode === "range" ? value : [value[0]];
  if (end === start) return formatDateLong(start);
  const span = `${formatDateLong(start)} – ${formatDateLong(end)}`;
  return end < start ? span : `${span}, ${daysInclusive(start, end)} days`;
}

/** Чи вибір завершено й панель можна закрити: одна дата — одразу, діапазон — після кінця, кілька дат — ніколи. */
export function pickDone(mode: PickMode, value: PickValue): boolean {
  if (mode === "single") return value.length === 1;
  return mode === "range" && value.length === 2;
}
