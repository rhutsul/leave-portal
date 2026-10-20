import { describe, expect, it } from "vitest";
import {
  buildDayRecords,
  checkLeaveType,
  LEAVE_TYPES,
  positionsOnDate,
  toRpcRecords,
  weeklySchedule,
  type PositionChoice,
  type PositionSchedule,
} from "./request";

const MONDAY = "2026-11-02";
const SATURDAY = "2026-11-07";

const weekdays = (start: number, end: number) => [1, 2, 3, 4, 5].map((weekday) => ({ weekday, start, end }));

// Працівник з AC-LEAVE-02: основна посада Mon–Fri 08:30–15:30, додаткова Mon 15:45–17:00.
const MAIN: PositionSchedule = {
  id: 1,
  label: "Elementary school / Teacher",
  kind: "main",
  blocks: weekdays(510, 930),
};
const ADDITIONAL: PositionSchedule = {
  id: 2,
  label: "High school / Math teacher",
  kind: "additional",
  blocks: [{ weekday: 1, start: 945, end: 1020 }],
};

const whole = (positionId: number, include = true): PositionChoice => ({ positionId, include, wholeDay: true });

function mondayPositions(positions: PositionSchedule[]) {
  const day = positionsOnDate(positions, MONDAY);
  if (!day.ok) throw new Error(day.message);
  return day.positions;
}

describe("records of a one-date request", () => {
  it("AC-LEAVE-01: Sick leave for the whole Monday on the main position gives 1 record 08:30–15:30", () => {
    const positions = mondayPositions([MAIN]);
    expect(positions.map((p) => p.label)).toEqual(["Elementary school / Teacher"]);
    expect(buildDayRecords(MONDAY, positions, [whole(1)])).toEqual({
      ok: true,
      records: [{ positionId: 1, date: MONDAY, start: 510, end: 930, minutes: 420 }],
    });
    expect(checkLeaveType("sick", "")).toEqual({ ok: true, leaveType: "sick", relationship: null });
    expect(LEAVE_TYPES.sick).toBe("Sick leave");
  });

  it("AC-LEAVE-02: the whole day on both positions gives 2 records 08:30–15:30 and 15:45–17:00", () => {
    const positions = mondayPositions([ADDITIONAL, MAIN]);
    expect(positions.map((p) => p.kind)).toEqual(["main", "additional"]);
    const result = buildDayRecords(MONDAY, positions, [whole(1), whole(2)]);
    expect(result).toEqual({
      ok: true,
      records: [
        { positionId: 1, date: MONDAY, start: 510, end: 930, minutes: 420 },
        { positionId: 2, date: MONDAY, start: 945, end: 1020, minutes: 75 },
      ],
    });
    if (result.ok) {
      expect(toRpcRecords(result.records)).toEqual([
        { position_id: 1, date: MONDAY, start_min: 510, end_min: 930 },
        { position_id: 2, date: MONDAY, start_min: 945, end_min: 1020 },
      ]);
    }
  });

  it("AC-LEAVE-03: excluding the additional position leaves only the main-position record", () => {
    const positions = mondayPositions([MAIN, ADDITIONAL]);
    const result = buildDayRecords(MONDAY, positions, [whole(1), whole(2, false)]);
    expect(result).toEqual({
      ok: true,
      records: [{ positionId: 1, date: MONDAY, start: 510, end: 930, minutes: 420 }],
    });
  });

  it("AC-LEAVE-06: Saturday without a schedule is not accepted", () => {
    expect(positionsOnDate([MAIN, ADDITIONAL], SATURDAY)).toEqual({
      ok: false,
      message: "You have no working hours on this day",
    });
  });

  it("AC-LEAVE-10: excluding all positions gives no records", () => {
    const positions = mondayPositions([MAIN, ADDITIONAL]);
    expect(buildDayRecords(MONDAY, positions, [whole(1, false), whole(2, false)])).toEqual({
      ok: false,
      message: "Choose at least one position",
    });
    expect(buildDayRecords(MONDAY, positions, [])).toEqual({ ok: false, message: "Choose at least one position" });
  });

  it("specific hours are checked against the position's own blocks", () => {
    const positions = mondayPositions([MAIN, ADDITIONAL]);
    const choices: PositionChoice[] = [
      { positionId: 1, include: true, wholeDay: false, start: "09:00", end: "11:30" },
      { positionId: 2, include: true, wholeDay: false, start: "15:00", end: "16:00" },
    ];
    expect(buildDayRecords(MONDAY, positions, choices)).toEqual({
      ok: false,
      message: "Hours must be within your schedule: 15:45–17:00",
      positionId: 2,
    });
  });

  it("Tuesday shows only positions scheduled on Tuesday", () => {
    const day = positionsOnDate([MAIN, ADDITIONAL], "2026-11-03");
    expect(day.ok && day.positions.map((p) => p.id)).toEqual([1]);
  });

  it("an unknown leave type is rejected", () => {
    expect(checkLeaveType("vacation", "")).toEqual({ ok: false, message: "Choose a leave type" });
  });
});

describe("weekly schedule text", () => {
  it("groups days with the same hours and joins consecutive days", () => {
    expect(weeklySchedule(MAIN.blocks)).toBe("Mon–Fri 08:30–15:30");
    expect(weeklySchedule(ADDITIONAL.blocks)).toBe("Mon 15:45–17:00");
    const withGap = [
      ...weekdays(510, 930).filter((b) => b.weekday !== 2),
      { weekday: 2, start: 510, end: 720 },
      { weekday: 2, start: 750, end: 930 },
    ];
    expect(weeklySchedule(withGap)).toBe("Mon, Wed–Fri 08:30–15:30; Tue 08:30–12:00, 12:30–15:30");
    expect(weeklySchedule([...weekdays(510, 930).slice(0, 2)])).toBe("Mon, Tue 08:30–15:30");
  });
});
