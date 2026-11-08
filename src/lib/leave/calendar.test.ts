// Шкільний календар на сторінці /calendar: які закриття потрапляють у навчальний рік, як показано дати, текст
// порожнього року — контракт design.md D5 зміни impl-school-calendar. Тести з тексту AC
// (openspec/specs/school-calendar/spec.md) до коду: maker ≠ checker.
import { describe, expect, it } from "vitest";
import { closuresInSchoolYear, emptyCalendarMessage, formatClosureDates, type Closure } from "./calendar";

const closure = (id: number, name: string, startDate: string, endDate = startDate, closesAt: number | null = null): Closure => ({
  id,
  name,
  startDate,
  endDate,
  closesAt,
});

const WINTER_BREAK = closure(1, "Winter break", "2026-12-28", "2027-01-08");
const TEACHERS_MEETING = closure(2, "Teachers' meeting", "2026-11-20", "2026-11-20", 720);
// Цілими днями через 31 серпня 2027: кінець 2026–2027 і початок 2027–2028.
const SUMMER_EDGE = closure(3, "Summer works", "2027-08-30", "2027-09-02");
const FIRST_DAY = closure(4, "First of September", "2026-09-01");
const LAST_DAY = closure(5, "Last of August", "2027-08-31");
const PREVIOUS_YEAR = closure(6, "Spring break", "2026-03-23", "2026-03-27");
const NEXT_YEAR = closure(7, "Winter break 2027", "2027-12-27", "2028-01-07");

const names = (list: Closure[]) => list.map((c) => c.name);

describe("closures of one school year (1 September – 31 August)", () => {
  it('AC-CAL-02: "Winter break" 2026-12-28 – 2027-01-08 is shown in school year 2026–2027 with its dates', () => {
    const shown = closuresInSchoolYear([WINTER_BREAK], 2026);
    expect(shown).toEqual([WINTER_BREAK]);
    expect(formatClosureDates(shown[0])).toBe("2026-12-28 – 2027-01-08");
  });

  it("AC-CAL-02: closures are listed by date, and other school years are left out", () => {
    expect(
      names(closuresInSchoolYear([NEXT_YEAR, WINTER_BREAK, PREVIOUS_YEAR, TEACHERS_MEETING, LAST_DAY, FIRST_DAY], 2026)),
    ).toEqual(["First of September", "Teachers' meeting", "Winter break", "Last of August"]);
  });

  it("AC-CAL-02: 1 September and 31 August are the first and last days of the school year", () => {
    expect(names(closuresInSchoolYear([FIRST_DAY, LAST_DAY], 2026))).toEqual(["First of September", "Last of August"]);
    expect(closuresInSchoolYear([FIRST_DAY], 2025)).toEqual([]);
    expect(closuresInSchoolYear([LAST_DAY], 2027)).toEqual([]);
  });

  it("AC-CAL-02: a whole-day closure across 31 August is shown in both school years", () => {
    expect(closuresInSchoolYear([SUMMER_EDGE], 2026)).toEqual([SUMMER_EDGE]);
    expect(closuresInSchoolYear([SUMMER_EDGE], 2027)).toEqual([SUMMER_EDGE]);
    expect(closuresInSchoolYear([SUMMER_EDGE], 2025)).toEqual([]);
    expect(closuresInSchoolYear([SUMMER_EDGE], 2028)).toEqual([]);
  });

  it("AC-CAL-02: an early dismissal is shown on its single date", () => {
    expect(closuresInSchoolYear([TEACHERS_MEETING], 2026)).toEqual([TEACHERS_MEETING]);
    expect(formatClosureDates(TEACHERS_MEETING)).toBe("2026-11-20");
  });

  it("AC-CAL-02: a one-day whole-day closure shows one date, not a range", () => {
    expect(formatClosureDates(FIRST_DAY)).toBe("2026-09-01");
  });

  it("AC-CAL-02: the input list is not changed by filtering", () => {
    const input = [WINTER_BREAK, FIRST_DAY];
    closuresInSchoolYear(input, 2026);
    expect(input).toEqual([WINTER_BREAK, FIRST_DAY]);
  });
});

describe("a school year without closures", () => {
  it('AC-CAL-15: school year 2026–2027 without closures shows "No closed days in school year 2026–2027"', () => {
    expect(closuresInSchoolYear([PREVIOUS_YEAR, NEXT_YEAR], 2026)).toEqual([]);
    expect(emptyCalendarMessage(2026)).toBe("No closed days in school year 2026–2027");
  });

  it("AC-CAL-15: the message names the school year shown", () => {
    expect(emptyCalendarMessage(2027)).toBe("No closed days in school year 2027–2028");
  });
});
