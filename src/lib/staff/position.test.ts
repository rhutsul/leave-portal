// Редактор розкладу й заступники (вимога PM 07, D7–D9 impl-staff-management): ті самі правила й тексти, що в базі.
import { describe, expect, it } from "vitest";
import { deputyState, DEPUTY_MESSAGES } from "./deputy";
import { blocksFromWeek, copyMondayToWeekdays, defaultWeek, emptyWeek, POSITION_MESSAGES, readBlocks, weekFromBlocks } from "./position";

describe("weekly schedule editor", () => {
  it("AC-STAFF-04: Mon–Fri 08:30–15:30 becomes the blocks the database expects", () => {
    const check = blocksFromWeek(defaultWeek());
    expect(check).toEqual({
      ok: true,
      blocks: [1, 2, 3, 4, 5].map((weekday) => ({ weekday, start_min: 510, end_min: 930 })),
    });
  });

  it("AC-STAFF-06: checks the periods themselves before sending", () => {
    expect(blocksFromWeek(emptyWeek())).toEqual({ ok: false, message: POSITION_MESSAGES.noPeriods });
    const bad = emptyWeek();
    bad[0] = [{ start: "15:30", end: "08:30" }];
    expect(blocksFromWeek(bad)).toEqual({ ok: false, message: POSITION_MESSAGES.badPeriod });
    const step = emptyWeek();
    step[0] = [{ start: "08:31", end: "09:00" }];
    expect(blocksFromWeek(step)).toEqual({ ok: false, message: POSITION_MESSAGES.badPeriod });
    const overlap = emptyWeek();
    overlap[0] = [
      { start: "08:30", end: "12:00" },
      { start: "11:00", end: "13:00" },
    ];
    expect(blocksFromWeek(overlap)).toEqual({ ok: false, message: POSITION_MESSAGES.overlap });
  });

  it("AC-STAFF-07: starts a new schedule from the one in effect and copies Monday to the weekdays", () => {
    const week = weekFromBlocks([{ weekday: 1, start: 510, end: 750 }]);
    expect(week[0]).toEqual([{ start: "08:30", end: "12:30" }]);
    expect(copyMondayToWeekdays(week).slice(0, 5)).toEqual(Array.from({ length: 5 }, () => [{ start: "08:30", end: "12:30" }]));
  });

  it("AC-STAFF-05: the text of the second main position is the AC text, verbatim", () => {
    expect(POSITION_MESSAGES.oneMain).toBe("An employee has exactly one main position");
  });

  it("AC-STAFF-06: accepts only an array of numeric blocks from the form", () => {
    expect(readBlocks('[{"weekday":1,"start_min":510,"end_min":930}]')).toEqual([{ weekday: 1, start_min: 510, end_min: 930 }]);
    expect(readBlocks('[{"weekday":"1"}]')).toBeNull();
    expect(readBlocks("not json")).toBeNull();
  });
});

describe("deputies", () => {
  it("AC-STAFF-09, AC-STAFF-10: an assignment from 2026-12-07 to 2026-12-11 is current on 08 Dec and ended on 14 Dec", () => {
    expect(deputyState("2026-12-07", "2026-12-11", "2026-12-08")).toBe("current");
    expect(deputyState("2026-12-07", "2026-12-11", "2026-12-07")).toBe("current");
    expect(deputyState("2026-12-07", "2026-12-11", "2026-12-11")).toBe("current");
    expect(deputyState("2026-12-07", "2026-12-11", "2026-12-14")).toBe("ended");
    expect(deputyState("2026-12-07", "2026-12-11", "2026-12-06")).toBe("upcoming");
  });

  it("AC-STAFF-19: the empty list says so verbatim", () => {
    expect(DEPUTY_MESSAGES.none).toBe("No deputies assigned");
  });
});
