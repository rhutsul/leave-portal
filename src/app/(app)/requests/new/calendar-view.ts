import type { DayState } from "@/components/ui/calendar-day";
import { formatDateLong } from "@/lib/leave/time";

/**
 * Стан і доступна назва дня в календарі заявки (DESIGN.md, розділ 6). Пріоритет: вибрано → уже є запис → закрито школою
 * (AC-CAL-03) → немає годин → робочий. Запис важливіший за «немає годин»: розклад міг змінитися після подання, а чинний запис має лишатися видимим.
 * День без годин лишається кнопкою: натискання пояснює причину текстом AC-LEAVE-06, а не мовчить.
 */
export function calendarDay(
  date: string,
  {
    selected,
    recordDates,
    works,
    closed = null,
    owner = "you",
  }: {
    selected: readonly string[];
    recordDates: readonly string[];
    works: boolean;
    closed?: string | null;
    /** Чий календар: «you» — власна заявка, «employee» — заявка від імені (D6 impl-on-behalf). */
    owner?: "you" | "employee";
  },
): { state: DayState; label: string } {
  const hasRecord = recordDates.includes(date);
  const state: DayState = selected.includes(date)
    ? "selected"
    : hasRecord
      ? "record"
      : closed
        ? "closed"
        : works
          ? "free"
          : "off";
  const notes = [
    hasRecord && (owner === "you" ? "you already have a record" : "this employee already has a record"),
    closed && `the school is closed: ${closed}`,
    !closed && !works && "no working hours",
  ].filter(Boolean);
  return { state, label: [formatDateLong(date), ...notes].join(", ") };
}
