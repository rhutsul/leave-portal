import type { EmployeeAction } from "@/lib/leave/decision";

export type Panel = "details" | "hours" | "cancel";

/**
 * Який діалог дій із записом видно: деталі — завжди; зміну годин і скасування — лише поки їх дозволяє статус. Якщо
 * запис тим часом погодили (AC-DECIDE-12), діалог зникає разом із дією.
 */
export function visiblePanel(open: Panel | null, actions: readonly EmployeeAction[]): Panel | null {
  if (open === "details") return open;
  if (open === "hours") return actions.includes("changeHours") ? open : null;
  if (open === "cancel") return actions.includes("cancel") ? open : null;
  return null;
}

/**
 * Де показати помилку дії: у відкритому діалозі, а без нього — під меню рядка. Resubmit діалогу не має, а діалог зміни
 * годин чи скасування міг зникнути, поки дія йшла, — текст помилки (AC-DECIDE-12) не має загубитися.
 */
export function errorPlacement(panel: Panel | null, error: string): { inDialog: string; underRow: string } {
  if (!error) return { inDialog: "", underRow: "" };
  return panel === null ? { inDialog: "", underRow: error } : { inDialog: error, underRow: "" };
}
