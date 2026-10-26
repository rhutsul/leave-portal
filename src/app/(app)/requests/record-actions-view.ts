import type { EmployeeAction } from "@/lib/leave/decision";

export type Panel = "details" | "hours" | "cancel";

/**
 * Що показують дії із записом у «My requests»: який діалог видно і де помилка дії.
 * Деталі видно завжди; зміну годин і скасування — лише поки їх дозволяє статус: якщо запис тим часом погодили
 * (AC-DECIDE-12), діалог зникає разом із дією. Помилка — у видимому діалозі, а без нього — під меню рядка: Resubmit
 * діалогу не має, а діалог зміни годин чи скасування міг зникнути, поки дія йшла, — текст помилки не має загубитися.
 */
export function recordActionsView(
  open: Panel | null,
  actions: readonly EmployeeAction[],
  error: string,
): { panel: Panel | null; inDialog: string; underRow: string } {
  const panel =
    open === "details" ||
    (open === "hours" && actions.includes("changeHours")) ||
    (open === "cancel" && actions.includes("cancel"))
      ? open
      : null;
  if (!error) return { panel, inDialog: "", underRow: "" };
  return panel === null ? { panel, inDialog: "", underRow: error } : { panel, inDialog: error, underRow: "" };
}
