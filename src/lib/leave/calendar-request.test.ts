// Заявка в закритий і скорочений день — чисті функції задачі 2 impl-school-calendar (design.md D4). Тести написано з
// тексту AC-CAL-03, -04, -05, -09 (openspec/specs/school-calendar/spec.md) і Assumptions
// requirements/04-school-calendar.md до коду: maker ≠ checker.
// Межі скороченого дня з Assumptions: блоки, що починаються о часі закриття чи пізніше, закриті; блок, що триває в цей
// час, закінчується в цей час; «Whole day» — блоки до часу закриття. Закрита дата в заявці на кілька дат пропускається
// з повідомленням, інші дати лишаються (як AC-LEAVE-21).
import { describe, expect, it } from "vitest";
import {
  dayShare,
  employeeWarning,
  formatDays,
  requestShares,
  workingMinutesOn,
} from "./balance";
import { clipBlocks, closureOn, type Closure } from "./calendar";
import {
  buildRequestRecords,
  positionsOnDate,
  type DateChoice,
  type PositionSchedule,
} from "./request";

// 2026-11-20 — п'ятниця, 2026-11-23 і 2026-12-28 — понеділки, 2026-11-24 і 2026-12-29 — вівторки, 2027-01-08 — п'ятниця.
const EARLY_DAY = "2026-11-20";
const BREAK_DAY = "2026-12-29";
const WORKING_TUESDAY = "2026-11-24";

const WINTER_BREAK: Closure = {
  id: 1,
  name: "Winter break",
  startDate: "2026-12-28",
  endDate: "2027-01-08",
  closesAt: null,
};
const TEACHERS_MEETING: Closure = {
  id: 2,
  name: "Teachers' meeting",
  startDate: EARLY_DAY,
  endDate: EARLY_DAY,
  closesAt: 12 * 60,
};

const weekdays = (start: number, end: number) =>
  [1, 2, 3, 4, 5].map((weekday) => ({ weekday, start, end }));

// Працівник з AC-CAL-03 / AC-CAL-04: основна посада Mon–Fri 08:30–15:30; додаткова — Mon 15:45–17:00.
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

const wholeDayOn = (date: string, positionId = MAIN.id): DateChoice => ({
  date,
  positionId,
  include: true,
  wholeDay: true,
});
const hoursOn = (
  date: string,
  start: string,
  end: string,
  positionId = MAIN.id,
): DateChoice => ({
  date,
  positionId,
  include: true,
  wholeDay: false,
  start,
  end,
});

describe("clipBlocks: a day's schedule with the school calendar", () => {
  it("AC-CAL-03: a whole-day closure leaves no blocks", () => {
    expect(clipBlocks([{ start: 510, end: 930 }], { closesAt: null })).toEqual(
      [],
    );
  });

  it("AC-CAL-04: on an early dismissal from 12:00 the block 08:30–15:30 running at 12:00 ends at 12:00", () => {
    expect(clipBlocks([{ start: 510, end: 930 }], { closesAt: 720 })).toEqual([
      { start: 510, end: 720 },
    ]);
  });

  it("AC-CAL-04: a block ending exactly at the closing time stays whole; a block starting at it is closed", () => {
    const blocks = [
      { start: 510, end: 720 },
      { start: 750, end: 930 },
    ];
    // 12:00: перший блок закінчується саме о 12:00, другий починається пізніше — закритий.
    expect(clipBlocks(blocks, { closesAt: 720 })).toEqual([
      { start: 510, end: 720 },
    ]);
    // 12:30: другий блок починається саме о часі закриття — закритий.
    expect(clipBlocks(blocks, { closesAt: 750 })).toEqual([
      { start: 510, end: 720 },
    ]);
    // 13:00: другий блок триває о 13:00 — закінчується о 13:00.
    expect(clipBlocks(blocks, { closesAt: 780 })).toEqual([
      { start: 510, end: 720 },
      { start: 750, end: 780 },
    ]);
  });

  it("AC-CAL-05: blocks starting at or after the closing time are closed — before the first block nothing is left", () => {
    expect(clipBlocks([{ start: 510, end: 930 }], { closesAt: 510 })).toEqual(
      [],
    );
    expect(clipBlocks([{ start: 510, end: 930 }], { closesAt: 480 })).toEqual(
      [],
    );
  });

  it("AC-CAL-09: without a closure the blocks are unchanged and the input is not mutated", () => {
    const blocks = [
      { start: 510, end: 720 },
      { start: 750, end: 930 },
    ];
    const copy = structuredClone(blocks);
    expect(clipBlocks(blocks, null)).toEqual(copy);
    clipBlocks(blocks, { closesAt: 600 });
    expect(blocks).toEqual(copy);
  });
});

describe("closureOn: the closure of a date", () => {
  it('AC-CAL-03: 2026-12-29 is inside "Winter break"; its start and end dates are closed too (both inclusive)', () => {
    const closures = [TEACHERS_MEETING, WINTER_BREAK];
    expect(closureOn(closures, BREAK_DAY)).toEqual(WINTER_BREAK);
    expect(closureOn(closures, "2026-12-28")).toEqual(WINTER_BREAK);
    expect(closureOn(closures, "2027-01-08")).toEqual(WINTER_BREAK);
    expect(closureOn(closures, "2026-12-27")).toBeNull();
    expect(closureOn(closures, "2027-01-09")).toBeNull();
  });

  it("AC-CAL-04: the early dismissal date returns that closure with its closing time", () => {
    expect(closureOn([WINTER_BREAK, TEACHERS_MEETING], EARLY_DAY)).toEqual(
      TEACHERS_MEETING,
    );
  });

  it("AC-CAL-09: with no closures every date is open", () => {
    expect(closureOn([], BREAK_DAY)).toBeNull();
  });
});

describe("positionsOnDate: a date in a new request with the school calendar", () => {
  it('AC-CAL-03: 2026-12-29 in "Winter break" is not accepted — The school is closed on this day: Winter break', () => {
    expect(
      positionsOnDate([MAIN, ADDITIONAL], BREAK_DAY, [WINTER_BREAK]),
    ).toEqual({
      ok: false,
      message: "The school is closed on this day: Winter break",
    });
  });

  it('AC-CAL-03: the first and the last date of "Winter break" are closed as well', () => {
    const closed = {
      ok: false,
      message: "The school is closed on this day: Winter break",
    };
    expect(
      positionsOnDate([MAIN, ADDITIONAL], "2026-12-28", [WINTER_BREAK]),
    ).toEqual(closed);
    expect(
      positionsOnDate([MAIN, ADDITIONAL], "2027-01-08", [WINTER_BREAK]),
    ).toEqual(closed);
  });

  it("AC-CAL-04: on the early dismissal 2026-11-20 from 12:00 the schedule of the day is 08:30–12:00", () => {
    expect(
      positionsOnDate([MAIN, ADDITIONAL], EARLY_DAY, [TEACHERS_MEETING]),
    ).toEqual({
      ok: true,
      positions: [
        {
          id: MAIN.id,
          label: MAIN.label,
          kind: "main",
          blocks: [{ start: 510, end: 720 }],
        },
      ],
    });
  });

  it("AC-CAL-04: a position whose blocks all start at or after the closing time has no hours that day", () => {
    // Понеділок 2026-11-23, скорочений день з 15:00: основна посада — 08:30–15:00, додаткова (15:45–17:00) закрита.
    const early: Closure = {
      id: 3,
      name: "Teachers' meeting",
      startDate: "2026-11-23",
      endDate: "2026-11-23",
      closesAt: 900,
    };
    expect(positionsOnDate([MAIN, ADDITIONAL], "2026-11-23", [early])).toEqual({
      ok: true,
      positions: [
        {
          id: MAIN.id,
          label: MAIN.label,
          kind: "main",
          blocks: [{ start: 510, end: 900 }],
        },
      ],
    });
  });

  it("AC-CAL-05: an early dismissal before the first block leaves no working hours — the date is not accepted", () => {
    const early: Closure = {
      id: 3,
      name: "Teachers' meeting",
      startDate: EARLY_DAY,
      endDate: EARLY_DAY,
      closesAt: 480,
    };
    expect(positionsOnDate([MAIN, ADDITIONAL], EARLY_DAY, [early]).ok).toBe(
      false,
    );
  });

  it('AC-CAL-09: once "Winter break" is no longer in the calendar, 2026-12-29 has the schedule 08:30–15:30', () => {
    expect(
      positionsOnDate([MAIN, ADDITIONAL], BREAK_DAY, [TEACHERS_MEETING]),
    ).toEqual({
      ok: true,
      positions: [
        {
          id: MAIN.id,
          label: MAIN.label,
          kind: "main",
          blocks: [{ start: 510, end: 930 }],
        },
      ],
    });
  });
});

describe("buildRequestRecords: request records with the school calendar", () => {
  it("AC-CAL-03: a request for 2026-12-29 only is not created — The school is closed on this day: Winter break", () => {
    const result = buildRequestRecords(
      [MAIN],
      [BREAK_DAY],
      [wholeDayOn(BREAK_DAY)],
      [WINTER_BREAK],
    );
    expect(result).toMatchObject({
      ok: false,
      message: "The school is closed on this day: Winter break",
    });
  });

  it("AC-CAL-03: in a multi-date request the closed 2026-12-29 is dropped and the other date stays (as AC-LEAVE-21)", () => {
    const result = buildRequestRecords(
      [MAIN],
      [BREAK_DAY, WORKING_TUESDAY],
      [wholeDayOn(BREAK_DAY), wholeDayOn(WORKING_TUESDAY)],
      [WINTER_BREAK],
    );
    expect(result).toEqual({
      ok: true,
      records: [
        {
          positionId: MAIN.id,
          date: WORKING_TUESDAY,
          start: 510,
          end: 930,
          minutes: 420,
        },
      ],
      skipped: [BREAK_DAY],
    });
  });

  it("AC-CAL-04: Personal leave for the whole day 2026-11-20 with the early dismissal from 12:00 — 1 record 08:30–12:00", () => {
    const result = buildRequestRecords(
      [MAIN, ADDITIONAL],
      [EARLY_DAY],
      [wholeDayOn(EARLY_DAY)],
      [TEACHERS_MEETING],
    );
    expect(result).toEqual({
      ok: true,
      records: [
        {
          positionId: MAIN.id,
          date: EARLY_DAY,
          start: 510,
          end: 720,
          minutes: 210,
        },
      ],
      skipped: [],
    });
  });

  it("AC-CAL-05: hours 13:00–14:00 on 2026-11-20 — Hours must be within your schedule: 08:30–12:00", () => {
    const result = buildRequestRecords(
      [MAIN],
      [EARLY_DAY],
      [hoursOn(EARLY_DAY, "13:00", "14:00")],
      [TEACHERS_MEETING],
    );
    expect(result).toMatchObject({
      ok: false,
      message: "Hours must be within your schedule: 08:30–12:00",
    });
  });

  it("AC-CAL-05: hours running past the closing time (11:00–13:00) are refused with the same message", () => {
    const result = buildRequestRecords(
      [MAIN],
      [EARLY_DAY],
      [hoursOn(EARLY_DAY, "11:00", "13:00")],
      [TEACHERS_MEETING],
    );
    expect(result).toMatchObject({
      ok: false,
      message: "Hours must be within your schedule: 08:30–12:00",
    });
  });

  it('AC-CAL-09: after "Winter break" is removed, 2026-12-29 is accepted with hours 08:30–15:30', () => {
    const result = buildRequestRecords(
      [MAIN],
      [BREAK_DAY],
      [wholeDayOn(BREAK_DAY)],
      [TEACHERS_MEETING],
    );
    expect(result).toEqual({
      ok: true,
      records: [
        {
          positionId: MAIN.id,
          date: BREAK_DAY,
          start: 510,
          end: 930,
          minutes: 420,
        },
      ],
      skipped: [],
    });
  });
});

describe("the employee's balance warning on an early dismissal day", () => {
  const blocks = [...MAIN.blocks, ...ADDITIONAL.blocks];

  it("AC-BALANCE-08: working minutes on 2026-11-20 with the early dismissal from 12:00 are 210, not 420", () => {
    expect(workingMinutesOn(blocks, EARLY_DAY)).toBe(420);
    expect(workingMinutesOn(blocks, EARLY_DAY, [TEACHERS_MEETING])).toBe(210);
    expect(workingMinutesOn(blocks, BREAK_DAY, [WINTER_BREAK])).toBe(0);
    expect(
      formatDays(
        dayShare(210, workingMinutesOn(blocks, EARLY_DAY, [TEACHERS_MEETING])),
      ),
    ).toBe("1.00");
  });

  it("AC-BALANCE-08: a whole day 08:30–12:00 on 2026-11-20 is a share of 1.00 — with 0.50 left the warning shows another 0.50 day", () => {
    const shares = requestShares([{ date: EARLY_DAY, minutes: 210 }], blocks, [
      TEACHERS_MEETING,
    ]);
    expect(shares).toEqual(new Map([[2026, 100]]));
    expect(employeeWarning("personal", shares.get(2026) ?? 0, 50)).toBe(
      "Your Personal leave balance is 0.50 day. Another 0.50 day will be counted as Unpaid leave",
    );
  });
});
