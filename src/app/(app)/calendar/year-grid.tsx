"use client";

import { createContext, useContext, useMemo, useState, type ReactNode } from "react";
import { Card } from "@/components/ui/card";
import { SchoolCalendarLegend, SchoolYearCalendar } from "@/components/ui/school-calendar";
import type { Closure } from "@/lib/leave/calendar";
import { buildSchoolYear, type DateSelection } from "@/lib/leave/calendar-grid";

/**
 * Пропозиції помічника календаря, ще не збережені, — на сітці року під панеллю помічника (design.md D1
 * impl-calendar-assistant): адміністратор бачить, куди ляже кожне закриття і чи не перетинає воно наявне, до
 * «Save closures». Панель і сітка — різні частини сторінки, тож дати передає контекст.
 */
const PreviewContext = createContext<{ dates: readonly DateSelection[]; setDates: (dates: readonly DateSelection[]) => void }>({
  dates: [],
  setDates: () => {},
});

export function AssistantPreviewProvider({ children }: { children: ReactNode }) {
  const [dates, setDates] = useState<readonly DateSelection[]>([]);
  const value = useMemo(() => ({ dates, setDates }), [dates]);
  return <PreviewContext.Provider value={value}>{children}</PreviewContext.Provider>;
}

/** Помічник повідомляє, які дати зараз запропоновано (порожній список — нічого не показувати). */
export function useSetAssistantPreview() {
  return useContext(PreviewContext).setDates;
}

/** Сітка 12 місяців навчального року з легендою; запропоновані дати — як вибрані дати форми «Add closure». */
export function YearGrid({ year, closures, today }: { year: number; closures: readonly Closure[]; today: string }) {
  const { dates } = useContext(PreviewContext);
  const months = useMemo(() => buildSchoolYear(year, closures, today, dates.length > 0 ? dates : null), [year, closures, today, dates]);
  const shown = months.flatMap((m) => m.cells).filter((d) => d?.selected);
  const legend: ("closed" | "early" | "today" | "selected" | "overlap")[] = ["closed", "early", "today"];
  if (shown.length > 0) legend.push("selected");
  if (shown.some((d) => d?.closure)) legend.push("overlap");
  return (
    <Card className="gap-5 px-3 md:px-5">
      <SchoolYearCalendar months={months} />
      <SchoolCalendarLegend items={legend} className="border-t border-border pt-4" />
    </Card>
  );
}
