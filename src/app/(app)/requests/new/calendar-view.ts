import type { DayState } from "@/components/ui/calendar-day";
import { formatDateLong } from "@/lib/leave/time";

/**
 * Стан і доступна назва дня в календарі заявки (DESIGN.md, розділ 6). Пріоритет: вибрано → уже є запис → немає годин →
 * робочий. Запис важливіший за «немає годин»: розклад міг змінитися після подання, а чинний запис має лишатися видимим.
 * День без годин лишається кнопкою: натискання пояснює причину текстом AC-LEAVE-06, а не мовчить.
 */
export function calendarDay(
  date: string,
  { selected, recordDates, works }: { selected: readonly string[]; recordDates: readonly string[]; works: boolean },
): { state: DayState; label: string } {
  const hasRecord = recordDates.includes(date);
  const state: DayState = selected.includes(date) ? "selected" : hasRecord ? "record" : works ? "free" : "off";
  const notes = [hasRecord && "you already have a record", !works && "no working hours"].filter(Boolean);
  return { state, label: [formatDateLong(date), ...notes].join(", ") };
}
