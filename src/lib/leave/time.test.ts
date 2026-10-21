import { describe, expect, it } from "vitest";
import {
  addMonths,
  checkHours,
  dayAxis,
  formatDateLong,
  formatDateShort,
  formatDuration,
  formatKyivDay,
  formatMonth,
  formatTime,
  isCalendarDate,
  isoWeekday,
  kyivDate,
  kyivHour,
  monthGrid,
  parseTime,
  weekdayName,
  type TimeBlock,
} from "./time";

// 08:30 = 510, 12:00 = 720, 12:30 = 750, 13:00 = 780, 15:30 = 930.
const MORNING: TimeBlock[] = [{ start: 510, end: 780 }];
const FULL_DAY: TimeBlock[] = [{ start: 510, end: 930 }];
const TUESDAY_WITH_GAP: TimeBlock[] = [
  { start: 510, end: 720 },
  { start: 750, end: 930 },
];

const hours = (blocks: TimeBlock[], start: string, end: string) => checkHours(blocks, parseTime(start), parseTime(end));

describe("leave hours within the schedule", () => {
  it("AC-LEAVE-04: 09:00–11:30 within 08:30–15:30 lasts 2 h 30 min", () => {
    const result = hours(FULL_DAY, "09:00", "11:30");
    expect(result).toEqual({ ok: true, minutes: 150 });
    expect(formatDuration(150)).toBe("2 h 30 min");
  });

  it("AC-LEAVE-07: 08:00–10:00 outside the block 08:30–13:00 is rejected with the schedule", () => {
    expect(hours(MORNING, "08:00", "10:00")).toEqual({
      ok: false,
      message: "Hours must be within your schedule: 08:30–13:00",
    });
  });

  it("AC-LEAVE-08: 13:00, the end of the block 08:30–13:00, cannot be the start", () => {
    const message = "13:00 is the end of working time and can only be chosen as the end of leave";
    expect(hours(MORNING, "13:00", "14:00")).toEqual({ ok: false, message });
    expect(hours(MORNING, "13:00", "12:00")).toEqual({ ok: false, message });
    // Як кінець 13:00 дозволено, а найпізніший початок — 12:55.
    expect(hours(MORNING, "12:55", "13:00")).toEqual({ ok: true, minutes: 5 });
  });

  it("AC-LEAVE-09: from 11:00 to 10:00 — the end must be later than the start", () => {
    expect(hours(FULL_DAY, "11:00", "10:00")).toEqual({ ok: false, message: "The end must be later than the start" });
    expect(hours(FULL_DAY, "11:00", "11:00")).toEqual({ ok: false, message: "The end must be later than the start" });
  });

  it("AC-LEAVE-15: 11:00–13:00 across the gap 12:00–12:30 counts 1 h 30 min", () => {
    const result = hours(TUESDAY_WITH_GAP, "11:00", "13:00");
    expect(result).toEqual({ ok: true, minutes: 90 });
    expect(formatDuration(90)).toBe("1 h 30 min");
  });

  it("AC-LEAVE-19: 07:30–09:00 lists all blocks of the day in time order", () => {
    const message = "Hours must be within your schedule: 08:30–12:00, 12:30–15:30";
    expect(hours(TUESDAY_WITH_GAP, "07:30", "09:00")).toEqual({ ok: false, message });
    expect(hours([...TUESDAY_WITH_GAP].reverse(), "07:30", "09:00")).toEqual({ ok: false, message });
  });

  it("AC-LEAVE-20: 12:00, the end of a block before the gap, cannot be the start", () => {
    expect(hours(TUESDAY_WITH_GAP, "12:00", "13:00")).toEqual({
      ok: false,
      message: "12:00 is the end of working time and can only be chosen as the end of leave",
    });
  });

  it("a start or end inside the gap between blocks is outside the schedule", () => {
    const message = "Hours must be within your schedule: 08:30–12:00, 12:30–15:30";
    expect(hours(TUESDAY_WITH_GAP, "12:10", "13:00")).toEqual({ ok: false, message });
    expect(hours(TUESDAY_WITH_GAP, "11:00", "12:15")).toEqual({ ok: false, message });
  });

  it("times off the 5-minute step are rejected", () => {
    expect(hours(FULL_DAY, "09:03", "10:00")).toEqual({ ok: false, message: "Enter times in 5-minute steps" });
    expect(hours(FULL_DAY, "", "10:00")).toEqual({ ok: false, message: "Enter times in 5-minute steps" });
  });
});

describe("time helpers", () => {
  it("parses and formats HH:MM", () => {
    expect(parseTime("08:30")).toBe(510);
    expect(parseTime("24:00")).toBe(1440);
    expect(parseTime("24:05")).toBeNull();
    expect(parseTime("8:30")).toBeNull();
    expect(formatTime(945)).toBe("15:45");
  });

  it("formats whole hours and minutes only", () => {
    expect(formatDuration(420)).toBe("7 h");
    expect(formatDuration(45)).toBe("45 min");
  });

  it("formats dates for the interface and today in Kyiv", () => {
    expect(formatDateLong("2026-11-02")).toBe("Mon, 2 Nov 2026");
    expect(formatDateShort("2026-11-03")).toBe("Tue 3 Nov");
    expect(weekdayName("2026-11-07")).toBe("Saturday");
    // 22:30 UTC 1 листопада — у Києві вже 2 листопада, 00:30.
    expect(kyivDate(new Date("2026-11-01T22:30:00Z"))).toBe("2026-11-02");
    expect(kyivHour(new Date("2026-11-01T22:30:00Z"))).toBe(0);
    expect(formatKyivDay("2026-10-20T18:12:00Z")).toBe("20 Oct 2026");
  });

  it("builds a whole-hour axis around the day's blocks", () => {
    expect(dayAxis([{ start: 510, end: 930 }, { start: 945, end: 1020 }])).toEqual({
      start: 480,
      end: 1020,
      ticks: [480, 600, 720, 840, 960],
    });
    expect(dayAxis([{ start: 945, end: 1020 }])).toEqual({ start: 900, end: 1020, ticks: [900, 960, 1020] });
  });

  it("gives ISO weekdays for calendar dates", () => {
    expect(isoWeekday("2026-11-02")).toBe(1);
    expect(isoWeekday("2026-11-03")).toBe(2);
    expect(isoWeekday("2026-11-07")).toBe(6);
    expect(isoWeekday("2026-11-08")).toBe(7);
  });
});

describe("calendar month", () => {
  it("starts on Monday: November 2026 begins on a Sunday after 6 blank cells", () => {
    const grid = monthGrid("2026-11");
    expect(grid.slice(0, 7)).toEqual([null, null, null, null, null, null, "2026-11-01"]);
    expect(grid.at(-1)).toBe("2026-11-30");
    expect(monthGrid("2028-02").filter(Boolean)).toHaveLength(29);
  });

  it("moves across years and names the month", () => {
    expect(addMonths("2026-12", 1)).toBe("2027-01");
    expect(addMonths("2027-01", -1)).toBe("2026-12");
    expect(formatMonth("2026-11")).toBe("November 2026");
  });
});

describe("calendar date check", () => {
  it("accepts only real dates in YYYY-MM-DD", () => {
    expect(isCalendarDate("2026-11-02")).toBe(true);
    expect(isCalendarDate("2028-02-29")).toBe(true);
    expect(isCalendarDate("2027-02-29")).toBe(false);
    expect(isCalendarDate("2026-02-30")).toBe(false);
    expect(isCalendarDate("2026-04-31")).toBe(false);
    expect(isCalendarDate("2026-13-01")).toBe(false);
    expect(isCalendarDate("2026-11-00")).toBe(false);
    expect(isCalendarDate("2026-1-02")).toBe(false);
    expect(isCalendarDate("")).toBe(false);
  });
});
