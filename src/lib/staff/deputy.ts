// Заступники (вимога PM 07, AC-STAFF-09, -10, -14, -19; D9 openspec/changes/impl-staff-management/design.md). Право й
// правила — у базі (private.assign_deputy, private.acting_manager_ids); тут — стан призначення словом і тексти.

import { isCalendarDate } from "@/lib/leave/time";

export const DEPUTY_MESSAGES = {
  // AC-STAFF-19
  none: "No deputies assigned",
  // Розробник (D9) — ті самі тексти, що в базі.
  noDates: "Choose the dates of the deputy assignment",
  noManager: "Choose the absent manager",
  noDeputy: "Choose the deputy",
} as const;

export type DeputyState = "current" | "upcoming" | "ended";

/** Права заступника діють, поки сьогодні (Київ) у межах періоду, обидві дати включно (уточнення 2026-11-24). */
export function deputyState(start: string, end: string, today: string): DeputyState {
  if (today < start) return "upcoming";
  if (today > end) return "ended";
  return "current";
}

export const DEPUTY_STATE_LABELS: Record<DeputyState, string> = {
  current: "Current",
  upcoming: "Upcoming",
  ended: "Ended",
};

/**
 * Кінець періоду з поля форми: відсутнє чи порожнє поле — одноденне призначення (день початку); будь-що інше, що не є
 * датою календаря (зокрема файл), — null, і дія відповідає «noDates», а не тихо зберігає один день.
 */
export function deputyEnd(start: string | null, raw: FormDataEntryValue | null): string | null {
  if (raw === null || raw === "") return start;
  return typeof raw === "string" && isCalendarDate(raw) ? raw : null;
}
