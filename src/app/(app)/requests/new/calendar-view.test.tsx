import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { CalendarDay } from "@/components/ui/calendar-day";
import { positionsOnDate, type PositionSchedule } from "@/lib/leave/request";
import { calendarDay } from "./calendar-view";

const SATURDAY = "2026-11-07";
const MAIN: PositionSchedule = {
  id: 1,
  label: "Elementary school / Teacher",
  kind: "main",
  blocks: [1, 2, 3, 4, 5].map((weekday) => ({ weekday, start: 510, end: 930 })),
};

describe("New request calendar", () => {
  it("AC-LEAVE-06: Saturday without a schedule stays clickable and explains “You have no working hours on this day”", () => {
    const day = calendarDay(SATURDAY, { selected: [], recordDates: [], works: false });
    expect(day).toEqual({ state: "off", label: "Sat, 7 Nov 2026, no working hours" });
    // Не disabled: натискання доходить до перевірки дати, яка дає текст AC.
    expect(renderToStaticMarkup(<CalendarDay day={7} state={day.state} />)).not.toMatch(/\sdisabled=""/);
    expect(positionsOnDate([MAIN], SATURDAY)).toEqual({ ok: false, message: "You have no working hours on this day" });
  });

  it("AC-LEAVE-06: a day without hours that already has a record still shows the record", () => {
    expect(calendarDay(SATURDAY, { selected: [], recordDates: [SATURDAY], works: false })).toEqual({
      state: "record",
      label: "Sat, 7 Nov 2026, you already have a record, no working hours",
    });
  });

  it("AC-LEAVE-06: a working day is free, and a picked day is selected whatever else applies", () => {
    expect(calendarDay("2026-11-02", { selected: [], recordDates: [], works: true })).toEqual({
      state: "free",
      label: "Mon, 2 Nov 2026",
    });
    expect(calendarDay("2026-11-02", { selected: ["2026-11-02"], recordDates: ["2026-11-02"], works: true }).state).toBe(
      "selected",
    );
  });
});
