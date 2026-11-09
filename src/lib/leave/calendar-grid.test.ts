// Сітка шкільного календаря — вигляд за розробником (DESIGN.md, розділи 5–6), не AC PM: тому без AC ID у назвах.
// Правила закриттів (що закрито, межі навчального року за датою початку) доводять тести calendar.test.ts з AC ID.
import { describe, expect, it } from "vitest";
import type { Closure } from "./calendar";
import {
  buildMonth,
  buildSchoolYear,
  closureCaption,
  dayLabel,
  overlappingClosures,
  previewMonths,
  schoolYearMonths,
} from "./calendar-grid";

const WINTER: Closure = { id: 1, name: "Winter break", startDate: "2026-12-28", endDate: "2027-01-08", closesAt: null };
const MEETING: Closure = { id: 2, name: "Teachers' meeting", startDate: "2026-11-20", endDate: "2026-11-20", closesAt: 720 };
const SUMMER: Closure = { id: 3, name: "Summer break", startDate: "2027-08-16", endDate: "2027-09-03", closesAt: null };
const CLOSURES = [WINTER, MEETING, SUMMER];

function day(months: ReturnType<typeof buildSchoolYear>, date: string) {
  const cell = months.find((m) => m.month === date.slice(0, 7))?.cells.find((c) => c?.date === date);
  if (!cell) throw new Error(`no cell for ${date}`);
  return cell;
}

describe("schoolYearMonths", () => {
  it("lists September of the school year to August of the next year", () => {
    const months = schoolYearMonths(2026);
    expect(months).toHaveLength(12);
    expect(months[0]).toBe("2026-09");
    expect(months[3]).toBe("2026-12");
    expect(months[4]).toBe("2027-01");
    expect(months[11]).toBe("2027-08");
  });
});

describe("buildMonth", () => {
  it("starts the week on Monday with blank cells before the 1st", () => {
    // 1 Sep 2026 — вівторок: одна порожня клітинка; 1 Nov 2026 — неділя: шість.
    expect(buildMonth("2026-09", [], "2026-11-09").cells.slice(0, 2)).toEqual([null, expect.objectContaining({ day: 1 })]);
    const nov = buildMonth("2026-11", [], "2026-11-09");
    expect(nov.cells.filter((c) => c === null)).toHaveLength(6);
    expect(nov.cells.filter((c) => c !== null)).toHaveLength(30);
    expect(nov.label).toBe("November 2026");
  });

  it("marks whole closed days, an early dismissal and today", () => {
    const nov = buildMonth("2026-11", CLOSURES, "2026-11-09");
    const at = (d: number) => nov.cells.find((c) => c?.day === d)!;
    expect(at(20)).toMatchObject({ kind: "early", closure: MEETING, today: false });
    expect(at(19)).toMatchObject({ kind: "open", closure: null });
    expect(at(9)).toMatchObject({ kind: "open", today: true });
    expect(nov.cells.filter((c) => c?.today)).toHaveLength(1);
  });

  it("marks the selected range and keeps the closure of an already closed day", () => {
    const dec = buildMonth("2026-12", CLOSURES, "2026-11-09", { start: "2026-12-24", end: "2026-12-29" });
    const at = (d: number) => dec.cells.find((c) => c?.day === d)!;
    expect(at(23).selected).toBe(false);
    expect(at(24)).toMatchObject({ selected: true, kind: "open" });
    expect(at(28)).toMatchObject({ selected: true, kind: "closed", closure: WINTER });
    expect(at(29).selected).toBe(true);
    expect(at(30).selected).toBe(false);
  });

  it("selects only the start date when the end is earlier than the start", () => {
    const dec = buildMonth("2026-12", [], "2026-11-09", { start: "2026-12-10", end: "2026-12-05" });
    expect(dec.cells.filter((c) => c?.selected).map((c) => c!.date)).toEqual(["2026-12-10"]);
  });
});

describe("buildSchoolYear", () => {
  it("closes a break across the new year in both months", () => {
    const months = buildSchoolYear(2026, CLOSURES, "2026-11-09");
    expect(day(months, "2026-12-27").kind).toBe("open");
    expect(day(months, "2026-12-28").kind).toBe("closed");
    expect(day(months, "2027-01-01").kind).toBe("closed");
    expect(day(months, "2027-01-08").kind).toBe("closed");
    expect(day(months, "2027-01-09").kind).toBe("open");
  });

  it("shows a break crossing 31 August only inside the school year it is drawn for", () => {
    const year2026 = buildSchoolYear(2026, CLOSURES, "2026-11-09");
    expect(day(year2026, "2027-08-31").kind).toBe("closed");
    expect(year2026.at(-1)!.month).toBe("2027-08");
    const year2027 = buildSchoolYear(2027, CLOSURES, "2026-11-09");
    expect(day(year2027, "2027-09-03").kind).toBe("closed");
    expect(day(year2027, "2027-09-04").kind).toBe("open");
  });

  it("has no today outside the current school year", () => {
    const months = buildSchoolYear(2025, CLOSURES, "2026-11-09");
    expect(months.flatMap((m) => m.cells).some((c) => c?.today)).toBe(false);
  });
});

describe("previewMonths", () => {
  it("shows the month of today when no date is chosen", () => {
    expect(previewMonths(null, "2026-11-09")).toEqual({ months: ["2026-11"], more: 0 });
  });

  it("shows the months from the start to the end, at most three", () => {
    expect(previewMonths({ start: "2026-12-28", end: "2027-01-08" }, "2026-11-09")).toEqual({
      months: ["2026-12", "2027-01"],
      more: 0,
    });
    expect(previewMonths({ start: "2027-06-01", end: "2027-10-31" }, "2026-11-09")).toEqual({
      months: ["2027-06", "2027-07", "2027-08"],
      more: 2,
    });
  });

  it("counts the rest of a very long range without walking through it", () => {
    expect(previewMonths({ start: "2026-12-28", end: "9999-12-31" }, "2026-11-09")).toEqual({
      months: ["2026-12", "2027-01", "2027-02"],
      more: 95_674, // грудень 2026 – грудень 9999: (9999 − 2026) × 12 + 1 = 95 677 місяців, 3 показано
    });
  });
});

describe("labels", () => {
  it("names a closure with the time of an early dismissal", () => {
    expect(closureCaption(WINTER)).toBe("Winter break");
    expect(closureCaption(MEETING)).toBe("Teachers' meeting from 12:00");
  });

  it("says the date, today and the closure for a screen reader", () => {
    const nov = buildMonth("2026-11", CLOSURES, "2026-11-20");
    expect(dayLabel(nov.cells.find((c) => c?.day === 20)!)).toBe("Today, Fri, 20 Nov 2026: Teachers' meeting from 12:00");
    expect(dayLabel(nov.cells.find((c) => c?.day === 19)!)).toBe("Thu, 19 Nov 2026");
  });
});

describe("overlappingClosures", () => {
  it("finds existing closures that share a date with the selection, by start date", () => {
    expect(overlappingClosures(CLOSURES, { start: "2026-11-01", end: "2027-01-01" })).toEqual([MEETING, WINTER]);
    expect(overlappingClosures(CLOSURES, { start: "2027-01-09", end: "2027-01-09" })).toEqual([]);
    expect(overlappingClosures(CLOSURES, null)).toEqual([]);
  });
});
