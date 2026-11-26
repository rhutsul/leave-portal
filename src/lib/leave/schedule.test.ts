// Розклад «з дати» в TS (D7 impl-staff-management): те саме правило, що private.blocks_in_effect у базі.
import { describe, expect, it } from "vitest";
import { positionsOnDate, weeklySchedule, type PositionSchedule } from "./request";
import { blocksOnDate, currentAndNext, scheduleSummary, scheduleVersions } from "./schedule";

const MON_FRI = (start: number, end: number, validFrom: string | null, validTo: string | null) =>
  [1, 2, 3, 4, 5].map((weekday) => ({ weekday, start, end, validFrom, validTo }));

// Teacher One: Mon–Fri 08:30–15:30 до 2026-12-07, з 2026-12-07 — 08:30–12:30 (AC-STAFF-07).
const BLOCKS = [...MON_FRI(510, 930, null, "2026-12-07"), ...MON_FRI(510, 750, "2026-12-07", null)];

describe("schedule from a date", () => {
  it("AC-STAFF-07: a date before the new schedule keeps the old hours, from its date the new ones", () => {
    expect(blocksOnDate(BLOCKS, "2026-12-04")).toEqual([{ weekday: 5, start: 510, end: 930, validFrom: null, validTo: "2026-12-07" }]);
    expect(blocksOnDate(BLOCKS, "2026-12-07").map((b) => b.end)).toEqual([750]);
    expect(blocksOnDate(BLOCKS, "2026-12-09").map((b) => b.end)).toEqual([750]);
    expect(blocksOnDate(BLOCKS, "2026-12-12")).toEqual([]);
  });

  it("AC-STAFF-07: a whole day on 2026-12-09 is 08:30–12:30 for the new request", () => {
    const positions: PositionSchedule[] = [{ id: 1, label: "Elementary school / Teacher", kind: "main", blocks: BLOCKS }];
    const day = positionsOnDate(positions, "2026-12-09");
    expect(day).toEqual({ ok: true, positions: [{ id: 1, label: "Elementary school / Teacher", kind: "main", blocks: [{ start: 510, end: 750 }] }] });
    const before = positionsOnDate(positions, "2026-12-04");
    expect(before.ok && before.positions[0].blocks).toEqual([{ start: 510, end: 930 }]);
  });

  it("AC-STAFF-04: a schedule from a later date is shown before it starts, with its date", () => {
    const fresh = MON_FRI(510, 930, "2026-12-07", null);
    expect(currentAndNext(fresh, "2026-12-01")).toEqual({ current: [], next: { from: "2026-12-07", blocks: fresh } });
    expect(scheduleSummary(fresh, "2026-12-01", weeklySchedule)).toBe("From Mon, 7 Dec 2026: Mon–Fri 08:30–15:30");
    expect(scheduleSummary(BLOCKS, "2026-12-01", weeklySchedule)).toBe(
      "Mon–Fri 08:30–15:30 · From Mon, 7 Dec 2026: Mon–Fri 08:30–12:30",
    );
    expect(scheduleSummary(BLOCKS, "2026-12-08", weeklySchedule)).toBe("Mon–Fri 08:30–12:30");
  });

  it("AC-STAFF-07: lists the versions by their first day", () => {
    expect(scheduleVersions(BLOCKS).map((v) => v.from)).toEqual([null, "2026-12-07"]);
  });
});
