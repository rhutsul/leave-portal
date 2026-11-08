// Розбір форми «Add closure» — допоміжна функція дії addClosure; правила AC перевіряє база
// (tests/db/school-calendar.test.ts), тож тут без AC ID: лише що потрапляє у виклик add_school_closure.
import { describe, expect, it } from "vitest";
import { parseClosureForm } from "./calendar";

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
