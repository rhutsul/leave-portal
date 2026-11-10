import { describe, expect, it } from "vitest";
import type { Closure } from "./calendar";
import { closureFields, closureNote, closurePick } from "./closure-dates";

// Дати форми «Add closure» з календаря — вигляд за розробником: тому без AC ID. Правило порядку дат (AC-CAL-10)
// перевіряють тести бази й e2e calendar.spec.ts; тут — лише що форма надсилає те, що клікнули.

const CLOSURES: Closure[] = [
  { id: 1, name: "Teachers' meeting", startDate: "2026-11-20", endDate: "2026-11-20", closesAt: 12 * 60 },
  { id: 2, name: "Winter break", startDate: "2026-12-28", endDate: "2027-01-08", closesAt: null },
];

describe("closurePick", () => {
  it("nothing clicked — no dates", () => {
    expect(closurePick([])).toBeNull();
  });

  it("one click is a one-day closure", () => {
    expect(closurePick(["2026-12-30"])).toEqual({
      start: "2026-12-30",
      end: "2026-12-30",
      reversed: false,
      preview: { start: "2026-12-30", end: "2026-12-30" },
    });
  });

  it("two clicks are the start and the end", () => {
    expect(closurePick(["2026-12-28", "2027-01-08"])).toMatchObject({ start: "2026-12-28", end: "2027-01-08", reversed: false });
  });

  it("an end before the start is sent as clicked, and the preview shows the start day only", () => {
    expect(closurePick(["2027-01-08", "2026-12-28"])).toEqual({
      start: "2027-01-08",
      end: "2026-12-28",
      reversed: true,
      preview: { start: "2027-01-08", end: "2027-01-08" },
    });
  });
});

describe("closureNote", () => {
  it("hatches a day that is already closed and names the closure", () => {
    expect(closureNote(CLOSURES, "2026-12-30")).toEqual({ label: "already closed: Winter break", hatch: "full" });
    expect(closureNote(CLOSURES, "2026-11-20")).toEqual({
      label: "already closed: Teachers' meeting from 12:00",
      hatch: "half",
    });
  });

  it("leaves an open day as it is", () => {
    expect(closureNote(CLOSURES, "2026-12-27")).toBeNull();
    expect(closureNote([], "2026-12-30")).toBeNull();
  });
});

describe("closureFields", () => {
  it("whole days send start and end, an early dismissal sends one date", () => {
    expect(closureFields("days", closurePick(["2027-01-08", "2026-12-28"]))).toEqual({ start: "2027-01-08", end: "2026-12-28" });
    expect(closureFields("days", null)).toEqual({ start: "", end: "" });
    expect(closureFields("early", closurePick(["2026-11-20"]))).toEqual({ date: "2026-11-20" });
    expect(closureFields("early", null)).toEqual({ date: "" });
  });
});
