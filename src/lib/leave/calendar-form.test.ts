// Розбір форми «Add closure» — допоміжна функція дії addClosure і форми: обов'язкові поля з текстами PM (AC-CAL-18,
// AC-CAL-19, Assumptions 04-school-calendar); решту правил перевіряє база (tests/db/school-calendar.test.ts).
import { describe, expect, it } from "vitest";
import { closureFieldErrors, closureNameLength, closuresInSchoolYear, formatClosureTime, parseClosureForm, toClosure } from "./calendar";

const form = (fields: Record<string, string>) => (name: string) => fields[name] ?? "";

describe("parseClosureForm", () => {
  it("whole days take the start and end dates and no time", () => {
    expect(
      parseClosureForm(form({ name: " Winter break ", kind: "days", start: "2026-12-28", end: "2027-01-08" })),
    ).toEqual({ ok: true, input: { name: "Winter break", start: "2026-12-28", end: "2027-01-08", closesAt: null } });
  });

  it("an early dismissal is one date with the closing time in minutes", () => {
    expect(
      parseClosureForm(form({ name: "Teachers' meeting", kind: "early", date: "2026-11-20", time: "12:00" })),
    ).toEqual({ ok: true, input: { name: "Teachers' meeting", start: "2026-11-20", end: "2026-11-20", closesAt: 720 } });
  });

  it("an end date before the start date is passed on, so the database answers with the PM text", () => {
    expect(parseClosureForm(form({ name: "Break", kind: "days", start: "2027-01-08", end: "2026-12-28" }))).toEqual({
      ok: true,
      input: { name: "Break", start: "2027-01-08", end: "2026-12-28", closesAt: null },
    });
  });

  it.each([
    ["a missing end date", { name: "Break", kind: "days", start: "2026-12-28" }],
    ["no dates at all", { name: "Break", kind: "days" }],
    ["an impossible date", { name: "Break", kind: "days", start: "2026-02-30", end: "2026-02-30" }],
    ["an early dismissal without a date", { name: "Meeting", kind: "early", time: "12:00" }],
  ])("%s is not saved: Enter the start and end dates", (_case, fields) => {
    expect(parseClosureForm(form(fields))).toEqual({
      ok: false,
      field: "dates",
      message: "Enter the start and end dates",
    });
  });

  it("an early dismissal without a time is not saved: Enter the closing time", () => {
    expect(parseClosureForm(form({ name: "Meeting", kind: "early", date: "2026-11-20" }))).toEqual({
      ok: false,
      field: "time",
      message: "Enter the closing time",
    });
  });

  it("AC-CAL-18: an empty name for 2027-01-20 is not saved: Enter a name for the closure", () => {
    for (const name of ["", "   "]) {
      expect(parseClosureForm(form({ name, kind: "days", start: "2027-01-20", end: "2027-01-20" }))).toEqual({
        ok: false,
        field: "name",
        message: "Enter a name for the closure",
      });
    }
  });

  it("AC-CAL-19: a name of 101 characters is not saved, 100 characters are", () => {
    const at = (name: string) => parseClosureForm(form({ name, kind: "days", start: "2027-01-20", end: "2027-01-20" }));
    expect(at("a".repeat(101))).toEqual({
      ok: false,
      field: "name",
      message: "The name can be at most 100 characters",
    });
    expect(at("a".repeat(100)).ok).toBe(true);
    // Знаки, а не одиниці UTF-16: 100 емодзі — це 100 знаків, як рахує char_length у базі.
    expect(at("🎄".repeat(100)).ok).toBe(true);
    expect(closureNameLength(` ${"a".repeat(100)} `)).toBe(100);
  });
});

describe("closureFieldErrors: the form's own check before sending", () => {
  it("reports every missing or too long field at once, and nothing when the form is complete", () => {
    expect(closureFieldErrors({ name: " ", hasDates: false, early: true, time: "" })).toEqual({
      name: "Enter a name for the closure",
      dates: "Enter the start and end dates",
      time: "Enter the closing time",
    });
    expect(closureFieldErrors({ name: "a".repeat(101), hasDates: true, early: false, time: "" })).toEqual({
      name: "The name can be at most 100 characters",
      dates: null,
      time: null,
    });
    expect(closureFieldErrors({ name: "Teachers' meeting", hasDates: true, early: true, time: "12:00" })).toEqual({
      name: null,
      dates: null,
      time: null,
    });
  });
});

// Допоміжні функції сторінки /calendar — без AC ID: що й як показати, а не правило AC (його тестують calendar.test.ts
// і tests/db/school-calendar.test.ts).
describe("calendar helpers", () => {
  it("formatClosureTime shows the early dismissal time and nothing for whole days", () => {
    expect(formatClosureTime({ closesAt: 720 })).toBe("from 12:00");
    expect(formatClosureTime({ closesAt: null })).toBeNull();
  });

  it("toClosure maps a database row", () => {
    expect(toClosure({ id: 7, name: "Winter break", start_date: "2026-12-28", end_date: "2027-01-08", closes_at: null })).toEqual({
      id: 7,
      name: "Winter break",
      startDate: "2026-12-28",
      endDate: "2027-01-08",
      closesAt: null,
    });
  });

  it("closures starting the same day keep their id order", () => {
    const a = { id: 2, name: "B", startDate: "2026-11-20", endDate: "2026-11-20", closesAt: 720 };
    const b = { id: 1, name: "A", startDate: "2026-11-20", endDate: "2026-11-20", closesAt: null };
    expect(closuresInSchoolYear([a, b], 2026).map((c) => c.id)).toEqual([1, 2]);
  });
});
