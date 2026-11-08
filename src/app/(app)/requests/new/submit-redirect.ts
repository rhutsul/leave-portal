import { encodeOverBalance, requestOverBalance, type LimitedType } from "@/lib/leave/balance";
import type { Closure } from "@/lib/leave/calendar";
import type { ScheduleBlock } from "@/lib/leave/request";
import { isCalendarDate } from "@/lib/leave/time";
import type { RemainingByYear } from "../../balances/load-balances";

export interface SubmitRedirectInput {
  /** Тип заявки, якщо він з лімітом («Sick leave», «Personal leave»), інакше null. */
  limitedType: LimitedType | null;
  /** Залишок на момент подання — як повертає loadRemaining; null — не завантажився. */
  remaining: RemainingByYear | null;
  records: readonly { date: string; minutes: number }[];
  /** Блоки розкладу всіх посад працівника — знаменник частки дня. */
  blocks: readonly ScheduleBlock[];
  /** Закриття шкільного календаря на дати заявки — скорочений день зменшує знаменник частки (AC-CAL-06). */
  closures?: readonly Closure[];
  /** Дати без робочих годин, які не прийнято (AC-LEAVE-21). */
  skipped: readonly string[];
}

/**
 * Адреса «My requests» після подання заявки. Дати без робочих годин — у `skipped` (AC-LEAVE-21); перевищення залишку —
 * у `over` лише числами (текст будує employeeWarning на сторінці; AC-BALANCE-08, AC-BALANCE-15, AC-BALANCE-17); залишок
 * не завантажився — `balance=unchecked`, щоб сторінка сказала, що його не перевірено, а не мовчала.
 */
export function submitRedirect({ limitedType, remaining, records, blocks, closures = [], skipped }: SubmitRedirectInput): string {
  const params = new URLSearchParams({ submitted: "1" });
  const skippedDates = skipped.filter(isCalendarDate);
  if (skippedDates.length) params.set("skipped", skippedDates.join(","));
  if (limitedType && !remaining) params.set("balance", "unchecked");
  if (limitedType && remaining) {
    const over = requestOverBalance(
      limitedType,
      records,
      blocks,
      (year) => remaining.get(year)?.[limitedType] ?? null,
      closures,
    );
    if (over.length) params.set("over", encodeOverBalance(limitedType, over));
  }
  return `/requests?${params}`;
}
