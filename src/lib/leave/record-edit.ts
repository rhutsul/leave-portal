// Правка запису до рішення в «Decisions» (крок 4 D9, D7 і D10 openspec/changes/archive/2026-11-27-impl-on-behalf/design.md; вимога PM
// requirements/08-on-behalf-and-edit.md, AC-BEHALF-06…10). Що можна змінити й хто, вирішує база
// (private.edit_leave_record); тут — розбір полів форми й куди показати відповідь.
import { forEmployee } from "./on-behalf";
import { checkLeaveType, type LeaveType, type Relationship } from "./request";
import { NO_SUBSTITUTE } from "./substitutes";
import { parseTime, TIME_MESSAGES } from "./time";

/** Власні тексти правки (розробник, D11). */
export const EDIT_MESSAGES = {
  chooseDate: "Choose a date",
  saved: "Record updated",
  failed: "The record could not be saved. Please try again.",
  /** Хтось змінив запис, поки форму було відкрито (як recordChanged у рішенні, D9). */
  changed: "This record has been changed. Check it again before changing it",
} as const;

export interface EditFields {
  date: string;
  /** «Whole day»: години — від початку до кінця робочого дня посади на нову дату (їх дає сервер). */
  wholeDay: boolean;
  start: number | null;
  end: number | null;
  leaveType: LeaveType;
  relationship: Relationship | null;
  substituteId: string | null;
}

export type EditParse = { ok: true; fields: EditFields } | { ok: false; message: string };

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function text(value: FormDataEntryValue | null): string {
  return typeof value === "string" ? value : "";
}

/**
 * Поля форми правки → значення для edit_leave_record. Форма завжди шле всі поля (поточні для незмінених, D7).
 * Перевіряємо лише формат — розклад, закриття школи, перетин і список замін звіряє база з текстами PM.
 */
export function parseEditForm(get: (name: string) => FormDataEntryValue | null): EditParse {
  const date = text(get("date"));
  if (!ISO_DATE.test(date) || Number.isNaN(Date.parse(`${date}T00:00:00Z`))) {
    return { ok: false, message: EDIT_MESSAGES.chooseDate };
  }
  const type = checkLeaveType(text(get("leave_type")), text(get("relationship")));
  if (!type.ok) return { ok: false, message: type.message };

  const substitute = text(get("substitute_id"));
  if (substitute && substitute !== NO_SUBSTITUTE && !UUID.test(substitute)) return { ok: false, message: EDIT_MESSAGES.failed };
  const substituteId = substitute && substitute !== NO_SUBSTITUTE ? substitute.toLowerCase() : null;

  const wholeDay = get("whole_day") === "1";
  const start = wholeDay ? null : parseTime(text(get("start")));
  const end = wholeDay ? null : parseTime(text(get("end")));
  if (!wholeDay && (start === null || end === null)) return { ok: false, message: TIME_MESSAGES.step };
  if (!wholeDay && end! <= start!) return { ok: false, message: TIME_MESSAGES.endBeforeStart };

  return {
    ok: true,
    fields: { date, wholeDay, start, end, leaveType: type.leaveType, relationship: type.relationship, substituteId },
  };
}

/** Тексти про години — під полем годин (межа destructive, aria-describedby); решта — лише в Alert над формою. */
const HOURS_MESSAGES = [
  TIME_MESSAGES.step,
  TIME_MESSAGES.endBeforeStart,
  forEmployee("Hours must be within your schedule: "),
  " is the end of working time and can only be chosen as the end of leave",
];

export function isHoursMessage(message: string): boolean {
  return HOURS_MESSAGES.some((m) => (m.startsWith(" ") ? message.endsWith(m) : message.startsWith(m)));
}

/**
 * Відповідь edit_leave_record → текст над формою. P0001 — тексти PM з функції бази (AC-BEHALF-09, AC-BEHALF-10…);
 * 42501 — немає права змінювати цей запис (текст функції), але технічне «permission denied» Postgres (немає гранту) не
 * показуємо; решта — загальний збій.
 */
export function editErrorMessage(error: { code?: string | null; message: string }): string {
  if (error.code === "P0001") return error.message;
  if (error.code === "42501" && !/permission denied/i.test(error.message)) return error.message;
  return EDIT_MESSAGES.failed;
}
