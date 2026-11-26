// Посади, розклади й менеджери (вимога PM 07, AC-STAFF-04…07; D7, D8 openspec/changes/impl-staff-management/design.md).
// Редактор тижневого розкладу й перевірка до відправки; ті самі правила й тексти — у private.parse_schedule і
// private.create_position у базі (міграція 20261125082128_staff_management.sql), яка має останнє слово.
import { formatTime, parseTime, WEEKDAY_SHORT } from "@/lib/leave/time";

/** Тексти PM — дослівно з AC; тексти розробника — ті самі, що в базі (D7, D8). */
export const POSITION_MESSAGES = {
  // AC-STAFF-05
  oneMain: "An employee has exactly one main position",
  // Розробник (D7, D8)
  noPeriods: "Add at least one working period",
  badPeriod: "Each working period needs a start before its end, in 5-minute steps",
  overlap: "Working periods of one day must not overlap",
  noDate: "Choose the date the schedule applies from",
  titleInvalid: "Enter a job title of up to 120 characters",
  noDivision: "Choose a division",
} as const;

/** Період дня в редакторі: «HH:MM» з поля часу. */
export interface Period {
  start: string;
  end: string;
}

/** Тиждень редактора: індекс 0 — понеділок … 6 — неділя. */
export type WeekDraft = Period[][];

export const DAY_NAMES = WEEKDAY_SHORT;

// Тип, а не interface: так масив блоків — це Json для supabase.rpc.
export type BlockRow = { weekday: number; start_min: number; end_min: number };

export function emptyWeek(): WeekDraft {
  return Array.from({ length: 7 }, () => []);
}

/** Тиждень з блоків (наприклад, розклад, що діє сьогодні) — для редагування. */
export function weekFromBlocks(blocks: readonly { weekday: number; start: number; end: number }[]): WeekDraft {
  const week = emptyWeek();
  for (const b of [...blocks].sort((x, y) => x.start - y.start)) {
    week[b.weekday - 1].push({ start: formatTime(b.start), end: formatTime(b.end) });
  }
  return week;
}

/** Типовий робочий тиждень для нової посади: Mon–Fri 08:30–15:30 (як у прикладах AC). */
export function defaultWeek(): WeekDraft {
  const week = emptyWeek();
  for (let d = 0; d < 5; d++) week[d] = [{ start: "08:30", end: "15:30" }];
  return week;
}

/** Понеділок у вівторок–п'ятницю (зручність редактора). */
export function copyMondayToWeekdays(week: WeekDraft): WeekDraft {
  return week.map((day, i) => (i >= 1 && i <= 4 ? week[0].map((p) => ({ ...p })) : day));
}

export type ScheduleCheck = { ok: true; blocks: BlockRow[] } | { ok: false; message: string };

/** Тиждень → блоки для бази з тими самими перевірками, що private.parse_schedule. */
export function blocksFromWeek(week: WeekDraft): ScheduleCheck {
  const blocks: BlockRow[] = [];
  for (const [i, day] of week.entries()) {
    for (const period of day) {
      const start = parseTime(period.start);
      const end = parseTime(period.end);
      if (start == null || end == null || start >= end || start % 5 !== 0 || end % 5 !== 0) {
        return { ok: false, message: POSITION_MESSAGES.badPeriod };
      }
      blocks.push({ weekday: i + 1, start_min: start, end_min: end });
    }
  }
  if (blocks.length === 0) return { ok: false, message: POSITION_MESSAGES.noPeriods };
  const overlaps = blocks.some((a, i) =>
    blocks.some((b, j) => j > i && a.weekday === b.weekday && a.start_min < b.end_min && b.start_min < a.end_min),
  );
  if (overlaps) return { ok: false, message: POSITION_MESSAGES.overlap };
  return { ok: true, blocks };
}

/** Блоки з поля форми (JSON): лише масив об'єктів із числами — решту перевіряє база. */
export function readBlocks(raw: unknown): BlockRow[] | null {
  if (typeof raw !== "string") return null;
  try {
    const value: unknown = JSON.parse(raw);
    if (!Array.isArray(value)) return null;
    const rows = value.filter(
      (b): b is BlockRow =>
        typeof b === "object" &&
        b !== null &&
        typeof (b as BlockRow).weekday === "number" &&
        typeof (b as BlockRow).start_min === "number" &&
        typeof (b as BlockRow).end_min === "number",
    );
    return rows.length === value.length ? rows : null;
  } catch {
    return null;
  }
}

export type PositionKind = "main" | "additional";

export function isPositionKind(value: unknown): value is PositionKind {
  return value === "main" || value === "additional";
}

export function kindLabel(kind: string): string {
  return kind === "main" ? "Main" : "Additional";
}
