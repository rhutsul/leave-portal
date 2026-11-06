// Пісочниця landing (ADR 0007) — синтетична демонстрація, не поведінка за AC PM: тому без AC ID. Числа — ті самі
// правила, що в портала (частка дня від усіх робочих хвилин дати, не більше 1.00 на дату).
import { describe, expect, it } from "vitest";
import {
  clock,
  duration,
  END_OPTIONS,
  INITIAL,
  personalLeft,
  playgroundRecords,
  START_OPTIONS,
  summary,
  toggleDay,
  togglePosition,
  totalDays,
  withEnd,
  withStart,
  type PlaygroundState,
} from "./playground";

const state = (patch: Partial<PlaygroundState>): PlaygroundState => ({ ...INITIAL, ...patch });

describe("playgroundRecords", () => {
  it("splits one request into one record per position and date", () => {
    const records = playgroundRecords(state({ days: [12] }));
    expect(records.map((r) => [r.date, r.position, r.manager])).toEqual([
      ["Thu, 12 Nov", "Elementary school / Teacher", "Elementary school manager"],
      ["Thu, 12 Nov", "High school / Math teacher", "High school manager"],
    ]);
  });

  it("counts one whole date as 1.00 day across all positions", () => {
    expect(totalDays(playgroundRecords(state({ days: [12] })))).toBe(1);
  });

  it("skips a position that does not work on the date", () => {
    const records = playgroundRecords(state({ days: [13] }));
    expect(records).toHaveLength(1);
    expect(records[0].position).toBe("Elementary school / Teacher");
    expect(records[0].share).toBe(1);
  });

  it("counts hours as a share of all working minutes on the date", () => {
    // 09:00–11:30 on the teacher position: 150 of 390 working minutes on Thursday.
    const records = playgroundRecords(state({ days: [12], positions: [true, false], mode: "hours", start: 540, end: 690 }));
    expect(records).toHaveLength(1);
    expect(records[0]).toMatchObject({ from: 540, to: 690, minutes: 150 });
    expect(totalDays(records)).toBe(0.38);
  });

  it("drops a position whose hours do not overlap the chosen time", () => {
    const records = playgroundRecords(state({ days: [12], mode: "hours", start: 540, end: 690 }));
    expect(records.map((r) => r.position)).toEqual(["Elementary school / Teacher"]);
  });

  it("returns no records without a date or a position", () => {
    expect(playgroundRecords(state({ days: [] }))).toEqual([]);
    expect(playgroundRecords(state({ positions: [false, false] }))).toEqual([]);
  });
});

describe("balance and labels", () => {
  it("takes approved records off the Personal leave balance", () => {
    const records = playgroundRecords(state({ days: [12, 13] }));
    expect(personalLeft(records, 0)).toBe(16.64);
    expect(personalLeft(records, 2)).toBe(15.64);
    expect(personalLeft(records, 3)).toBe(14.64);
  });

  it("formats clock times, durations and the summary", () => {
    expect(clock(510)).toBe("08:30");
    expect(duration(210)).toBe("3 h 30 min");
    expect(duration(45)).toBe("45 min");
    expect(duration(120)).toBe("2 h");
    expect(summary([])).toBe("");
    expect(summary(playgroundRecords(state({ days: [13] })))).toBe("1 record · 1.00 days");
    expect(summary(playgroundRecords(state({ days: [12] })))).toBe("2 records · 1.00 days");
  });
});

describe("state changes", () => {
  it("keeps To after From when either moves", () => {
    expect(withStart(state({ start: 540, end: 600 }), 630)).toMatchObject({ start: 630, end: 660 });
    expect(withEnd(state({ start: 600, end: 690 }), 570)).toMatchObject({ start: 540, end: 570 });
    expect(withStart(state({ start: 540, end: 690 }), 600)).toMatchObject({ start: 600, end: 690 });
  });

  it("offers half-hour steps across the working day", () => {
    expect(START_OPTIONS[0]).toBe(510);
    expect(START_OPTIONS.at(-1)).toBe(900);
    expect(END_OPTIONS.at(-1)).toBe(930);
  });

  it("toggles dates and positions", () => {
    expect(toggleDay(state({ days: [12] }), 9).days).toEqual([12, 9]);
    expect(toggleDay(state({ days: [12] }), 12).days).toEqual([]);
    expect(togglePosition(state({ positions: [true, true] }), 1).positions).toEqual([true, false]);
  });
});
