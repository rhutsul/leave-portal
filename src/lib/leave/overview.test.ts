import { describe, expect, it } from "vitest";
import { addDays, count, groupByRequestDate, headline, isBlocking, leadStatus, monthMarks, timelineDays, timelineRows, twoWeeks } from "./overview";

// Форма головної (ADR 0007), а не правило PM: тому без AC ID у назвах. Які записи видно — вирішує база (RLS).

describe("dates", () => {
  it("adds days across months and years", () => {
    expect(addDays("2026-11-30", 1)).toBe("2026-12-01");
    expect(addDays("2026-12-31", 1)).toBe("2027-01-01");
    expect(addDays("2026-11-02", -1)).toBe("2026-11-01");
  });

  it("two weeks are Mon–Fri of this week and the next, from any weekday including Sunday", () => {
    const expected = ["2026-11-02", "2026-11-03", "2026-11-04", "2026-11-05", "2026-11-06", "2026-11-09", "2026-11-10", "2026-11-11", "2026-11-12", "2026-11-13"];
    expect(twoWeeks("2026-11-05")).toEqual(expected);
    expect(twoWeeks("2026-11-02")).toEqual(expected);
    expect(twoWeeks("2026-11-08")).toEqual(expected);
  });
});

describe("statuses", () => {
  it("only awaiting, returned and approved block time", () => {
    expect(["awaiting", "returned", "approved"].every((s) => isBlocking(s))).toBe(true);
    expect(["rejected", "cancelled", "", null].some((s) => isBlocking(s))).toBe(false);
  });

  it("the status still waiting for someone leads the cell", () => {
    expect(leadStatus(["approved", "awaiting"])).toBe("awaiting");
    expect(leadStatus(["approved", "returned"])).toBe("returned");
    expect(leadStatus(["approved"])).toBe("approved");
  });
});

describe("timelineRows", () => {
  const days = twoWeeks("2026-11-05");
  const rec = (who: string, date: string, start: number, end: number, status: string) => ({ who, date, start_min: start, end_min: end, status });
  const rowOf = (r: { who: string }) => ({ key: r.who, name: r.who, sub: "" });

  it("one bar per person and day, hours joined in time order, non-blocking and out-of-range records dropped", () => {
    const rows = timelineRows(
      [
        rec("Teacher", "2026-11-09", 750, 840, "awaiting"),
        rec("Teacher", "2026-11-09", 510, 720, "approved"),
        rec("Teacher", "2026-11-10", 510, 720, "rejected"),
        rec("Teacher", "2026-11-20", 510, 720, "approved"),
      ].map((r) => ({ ...r, status: r.status as never })),
      days,
      rowOf,
    );
    expect(rows).toEqual([
      { key: "Teacher", name: "Teacher", sub: "", bars: [{ col: 5, status: "awaiting", hours: "08:30–12:00, 12:30–14:00", count: 2 }] },
    ]);
  });

  it("orders rows by their first day, then by name", () => {
    const rows = timelineRows(
      [rec("B", "2026-11-04", 510, 600, "approved"), rec("A", "2026-11-04", 510, 600, "approved"), rec("C", "2026-11-02", 510, 600, "approved")].map(
        (r) => ({ ...r, status: r.status as never }),
      ),
      days,
      rowOf,
    );
    expect(rows.map((r) => r.name)).toEqual(["C", "A", "B"]);
  });
});

describe("monthMarks", () => {
  it("marks days of the month with the leading blocking status", () => {
    const marks = monthMarks(
      [
        { date: "2026-11-12", status: "approved" },
        { date: "2026-11-12", status: "awaiting" },
        { date: "2026-11-17", status: "returned" },
        { date: "2026-11-18", status: "cancelled" },
        { date: "2026-12-01", status: "approved" },
      ],
      "2026-11",
    );
    expect([...marks.entries()]).toEqual([
      [12, "awaiting"],
      [17, "returned"],
    ]);
  });
});

describe("groupByRequestDate", () => {
  it("joins the positions of one request on one date", () => {
    const groups = groupByRequestDate([
      { request_id: 1, date: "2026-11-09", id: 1 },
      { request_id: 1, date: "2026-11-09", id: 2 },
      { request_id: 1, date: "2026-11-10", id: 3 },
      { request_id: 2, date: "2026-11-09", id: 4 },
    ]);
    expect(groups.map((g) => g.map((r) => r.id))).toEqual([[1, 2], [3], [4]]);
  });
});

describe("timelineDays", () => {
  it("labels days short for the header and long for screen readers, and marks today", () => {
    expect(timelineDays(["2026-11-05", "2026-11-06"], "2026-11-05")).toEqual([
      { date: "2026-11-05", label: "Thu 5", long: "Thu, 5 Nov 2026", today: true },
      { date: "2026-11-06", label: "Fri 6", long: "Fri, 6 Nov 2026", today: false },
    ]);
  });
});

describe("headline", () => {
  it("tells a manager what awaits and who is away, in singular and plural", () => {
    expect(headline({ decider: true, toDecide: 1, awayThisWeek: 1 })).toBe(
      "1 record of your positions awaits your decision. 1 person is away this week.",
    );
    expect(headline({ decider: true, toDecide: 6, awayThisWeek: 0 })).toBe(
      "6 records of your positions await your decision. 0 people are away this week.",
    );
  });

  it("tells an employee the next leave and returned records", () => {
    expect(headline({ decider: false, nextDate: "2026-11-09", returned: 0 })).toBe("Your next leave is on Mon, 9 Nov 2026.");
    expect(headline({ decider: false, nextDate: "2026-11-09", returned: 2 })).toBe(
      "Your next leave is on Mon, 9 Nov 2026. 2 records were returned for revision.",
    );
    expect(headline({ decider: false, nextDate: "2026-11-09", returned: 1 })).toContain("1 record was returned");
    expect(headline({ decider: false, nextDate: null, returned: 1 })).toBe("You have no upcoming leave.");
  });

  it("counts in singular and plural", () => {
    expect(count(1, "record", "records")).toBe("1 record");
    expect(count(0, "record", "records")).toBe("0 records");
  });
});
