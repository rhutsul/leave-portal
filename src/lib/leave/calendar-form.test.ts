// Розбір форми «Add closure» — допоміжна функція дії addClosure; правила AC перевіряє база
// (tests/db/school-calendar.test.ts), тож тут без AC ID: лише що потрапляє у виклик add_school_closure.
import { describe, expect, it } from "vitest";
import { closuresInSchoolYear, formatClosureTime, parseClosureForm, toClosure } from "./calendar";

const form = (fields: Record<string, string>) => (name: string) => fields[name] ?? "";

describe("parseClosureForm", () => {
  it("whole days take the start and end dates and no time", () => {
    expect(
      parseClosureForm(form({ name: " Winter break ", kind: "days", start: "2026-12-28", end: "2027-01-08" })),
    ).toEqual({ name: "Winter break", start: "2026-12-28", end: "2027-01-08", closesAt: null });
  });

  it("an early dismissal is one date with the closing time in minutes", () => {
    expect(
      parseClosureForm(form({ name: "Teachers' meeting", kind: "early", date: "2026-11-20", time: "12:00" })),
    ).toEqual({ name: "Teachers' meeting", start: "2026-11-20", end: "2026-11-20", closesAt: 720 });
  });

  it("an end date before the start date is passed on, so the database answers with the PM text", () => {
    expect(parseClosureForm(form({ name: "Break", kind: "days", start: "2027-01-08", end: "2026-12-28" }))).toEqual({
      name: "Break",
      start: "2027-01-08",
      end: "2026-12-28",
      closesAt: null,
    });
  });

  it.each([
    ["an empty name", { name: "  ", kind: "days", start: "2026-12-28", end: "2026-12-28" }],
    ["a missing end date", { name: "Break", kind: "days", start: "2026-12-28" }],
    ["an impossible date", { name: "Break", kind: "days", start: "2026-02-30", end: "2026-02-30" }],
    ["an early dismissal without a time", { name: "Meeting", kind: "early", date: "2026-11-20" }],
  ])("%s is not sent", (_case, fields) => {
    expect(parseClosureForm(form(fields))).toBeNull();
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
