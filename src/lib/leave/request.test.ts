import { describe, expect, it } from "vitest";
import {
  buildDayRecords,
  buildRequestRecords,
  checkComment,
  checkLeaveType,
  commentLength,
  findOverlap,
  LEAVE_TYPES,
  overlapMessage,
  positionsOnDate,
  toRpcRecords,
  weeklySchedule,
  type DraftRecord,
  type ExistingRecord,
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

  it("a date that does not exist in the calendar is refused like a day without a schedule", () => {
    // 2026-02-30 → Date.UTC дав би 2026-03-02, понеділок із розкладом.
    for (const date of ["2026-02-30", "2026-11-31", "2026-13-02", "2026-00-10", "2026-11-00", "2026-11-2"]) {
      expect(positionsOnDate([MAIN, ADDITIONAL], date)).toEqual({
        ok: false,
        message: "You have no working hours on this day",
      });
    }
    expect(buildRequestRecords([MAIN], ["2026-02-30"], [{ ...whole(1), date: "2026-02-30" }])).toEqual({
      ok: false,
      message: "You have no working hours on this day",
      date: "2026-02-30",
    });
    expect(positionsOnDate([MAIN], "2028-02-29").ok).toBe(true);
  });

  it("Tuesday shows only positions scheduled on Tuesday", () => {
    const day = positionsOnDate([MAIN, ADDITIONAL], "2026-11-03");
    expect(day.ok && day.positions.map((p) => p.id)).toEqual([1]);
  });

  it("an unknown leave type is rejected", () => {
    expect(checkLeaveType("vacation", "")).toEqual({ ok: false, message: "Choose a leave type" });
  });
});

describe("a request with several dates, a comment and overlaps", () => {
  const TUESDAY = "2026-11-03";

  it("AC-LEAVE-05: the whole day on 2026-11-02 and 2026-11-03 gives 2 records of one request, one per date", () => {
    const result = buildRequestRecords(
      [MAIN],
      [TUESDAY, MONDAY],
      [
        { ...whole(1), date: MONDAY },
        { ...whole(1), date: TUESDAY },
      ],
    );
    expect(result).toEqual({
      ok: true,
      records: [
        { positionId: 1, date: MONDAY, start: 510, end: 930, minutes: 420 },
        { positionId: 1, date: TUESDAY, start: 510, end: 930, minutes: 420 },
      ],
    });
  });

  it("AC-LEAVE-05: a date without positions or without a schedule stops the whole request", () => {
    expect(
      buildRequestRecords(
        [MAIN, ADDITIONAL],
        [MONDAY, TUESDAY],
        [
          { ...whole(1), date: MONDAY },
          { ...whole(1, false), date: TUESDAY },
        ],
      ),
    ).toEqual({ ok: false, message: "Choose at least one position", date: TUESDAY });
    expect(buildRequestRecords([MAIN], [MONDAY, SATURDAY], [{ ...whole(1), date: MONDAY }])).toEqual({
      ok: false,
      message: "You have no working hours on this day",
      date: SATURDAY,
    });
    expect(buildRequestRecords([MAIN], [], [])).toEqual({ ok: false, message: "Choose at least one date" });
  });

  it("AC-LEAVE-12: Family celebration without a relationship gives the PM message; with one it passes", () => {
    expect(checkLeaveType("family", "")).toEqual({
      ok: false,
      message:
        "State your relationship to this person: sibling, child, parent, grandchild or grandparent. Not applicable to cousins, friends, neighbours or siblings-in-law",
    });
    expect(checkLeaveType("family", "cousin")).toMatchObject({ ok: false });
    expect(checkLeaveType("family", "sibling")).toEqual({ ok: true, leaveType: "family", relationship: "sibling" });
  });

  const existing = (date: string, start: number, end: number, status = "awaiting"): ExistingRecord => ({
    positionId: 1,
    date,
    start,
    end,
    status,
  });

  it("AC-LEAVE-13: 10:00–12:00 over an awaiting 09:00–11:00 record of the same position gives the PM message", () => {
    const draft: DraftRecord[] = [{ positionId: 1, date: MONDAY, start: 600, end: 720, minutes: 120 }];
    const conflict = findOverlap(draft, [existing(MONDAY, 540, 660)]);
    expect(conflict && overlapMessage(conflict)).toBe("You already have a request for this time: 2026-11-02 09:00–11:00");
  });

  it("AC-LEAVE-13: rejected or cancelled records, other positions and adjacent hours do not overlap", () => {
    const draft: DraftRecord[] = [{ positionId: 1, date: MONDAY, start: 600, end: 720, minutes: 120 }];
    expect(findOverlap(draft, [existing(MONDAY, 540, 660, "rejected"), existing(MONDAY, 540, 660, "cancelled")])).toBeNull();
    expect(findOverlap(draft, [{ ...existing(MONDAY, 540, 660), positionId: 2 }])).toBeNull();
    expect(findOverlap(draft, [existing(MONDAY, 720, 780), existing(MONDAY, 510, 600)])).toBeNull();
    expect(findOverlap(draft, [existing(MONDAY, 540, 660, "returned")])).not.toBeNull();
    expect(findOverlap(draft, [existing(MONDAY, 540, 660, "approved")])).not.toBeNull();
  });

  it("AC-LEAVE-16: a whole-day request for 2026-11-02 and 2026-11-03 names the record on 2026-11-03", () => {
    const result = buildRequestRecords(
      [MAIN],
      [MONDAY, TUESDAY],
      [
        { ...whole(1), date: MONDAY },
        { ...whole(1), date: TUESDAY },
      ],
    );
    if (!result.ok) throw new Error(result.message);
    const conflict = findOverlap(result.records, [existing(TUESDAY, 540, 660), existing("2026-11-04", 540, 660)]);
    expect(conflict && overlapMessage(conflict)).toBe("You already have a request for this time: 2026-11-03 09:00–11:00");
  });

  it("AC-LEAVE-18: a comment of 501 characters gives the PM message; 500 characters and no comment pass", () => {
    expect(checkComment("x".repeat(501))).toEqual({ ok: false, message: "The comment can be at most 500 characters" });
    expect(checkComment("x".repeat(500))).toEqual({ ok: true, comment: "x".repeat(500) });
    expect(checkComment("   ")).toEqual({ ok: true, comment: null });
    // Як char_length у Postgres: емодзі — один символ, а не два UTF-16.
    expect(commentLength("🙂".repeat(500))).toBe(500);
    expect(checkComment("🙂".repeat(500))).toMatchObject({ ok: true });
  });

  // Копію в кожному записі перевіряє tests/db/multi-date-request.test.ts.
  it("AC-LEAVE-17: the request comment \"Doctor's appointment\" is passed on as typed, without edge spaces", () => {
    expect(checkComment("  Doctor's appointment ")).toEqual({ ok: true, comment: "Doctor's appointment" });
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
