import { describe, expect, it } from "vitest";
import type { Closure } from "./calendar";
import type { CellLayout } from "./overview";
import {
  addDays,
  cellLayout,
  closedShare,
  closureLabel,
  closuresText,
  count,
  dayClosures,
  dayShare,
  groupByRequestDate,
  monthClosures,
  nextClosureLine,
  segmentBox,
  headline,
  isBlocking,
  overviewRange,
  rangeLabel,
  leadStatus,
  monthMarks,
  timelineDays,
  timelineHref,
  timelinePage,
  timelineRows,
  timelineSummary,
  twoWeeks,
} from "./overview";

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

  it("pages two weeks at a time, forward and back", () => {
    expect(twoWeeks("2026-11-05", 1)).toEqual(["2026-11-16", "2026-11-17", "2026-11-18", "2026-11-19", "2026-11-20", "2026-11-23", "2026-11-24", "2026-11-25", "2026-11-26", "2026-11-27"]);
    expect(twoWeeks("2026-11-05", -1)[0]).toBe("2026-10-19");
    expect(twoWeeks("2026-12-24", 1)).toContain("2027-01-04");
  });

  it("reads the page from ?weeks=, falling back to this week and next for anything else", () => {
    expect(timelinePage(undefined)).toBe(0);
    expect(timelinePage("2")).toBe(2);
    expect(timelinePage("-3")).toBe(-3);
    expect(timelinePage(["1", "5"])).toBe(1);
    expect(["", "abc", "1.5", "1e3", "--1", "9999"].map(timelinePage)).toEqual([0, 0, 0, 0, 0, 0]);
    // Не далі року в кожен бік; "-0" — це 0, а не -0.
    expect(timelinePage("120")).toBe(26);
    expect(timelinePage("-120")).toBe(-26);
    expect(Object.is(timelinePage("-0"), 0)).toBe(true);
  });

  it("links to a page of the diagram, with no parameter for this week and no link past the limit", () => {
    expect(timelineHref(0)).toBe("/");
    expect(timelineHref(2)).toBe("/?weeks=2");
    expect(timelineHref(-1)).toBe("/?weeks=-1");
    expect(timelineHref(27)).toBeNull();
    expect(timelineHref(-27)).toBeNull();
  });

  it("labels the shown range, naming both years across New Year", () => {
    expect(rangeLabel(twoWeeks("2026-11-10"))).toBe("9 Nov – 20 Nov 2026");
    expect(rangeLabel(twoWeeks("2026-12-30"))).toBe("28 Dec 2026 – 8 Jan 2027");
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

  it("one cell per row and day with its records in time order, non-blocking and out-of-range records dropped", () => {
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
      {
        key: "Teacher",
        name: "Teacher",
        sub: "",
        cells: [
          {
            col: 5,
            records: [
              { who: "Teacher", date: "2026-11-09", start_min: 510, end_min: 720, status: "approved" },
              { who: "Teacher", date: "2026-11-09", start_min: 750, end_min: 840, status: "awaiting" },
            ],
          },
        ],
      },
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

  it("keeps the positions of one person in separate rows", () => {
    const records = [
      { ...rec("Teacher", "2026-11-09", 510, 720, "approved"), pos: "Elementary school / Teacher" },
      { ...rec("Teacher", "2026-11-09", 945, 1020, "awaiting"), pos: "High school / Math teacher" },
    ].map((r) => ({ ...r, status: r.status as never }));
    const rows = timelineRows(records, days, (r) => ({ key: `${r.who}|${r.pos}`, name: r.who, sub: r.pos }));
    expect(rows.map((r) => [r.sub, r.cells.map((c) => c.records.length)])).toEqual([
      ["Elementary school / Teacher", [1]],
      ["High school / Math teacher", [1]],
    ]);
  });
});

// Смуги клітинки; у лічильника їх немає.
const barsOf = <T,>(layout: CellLayout<T>) => (layout.collapsed ? [] : layout.bars);

describe("cellLayout", () => {
  const rec = (start: number, end: number, status: "approved" | "awaiting" | "returned") => ({ start_min: start, end_min: end, status });

  it("one record is one bar placed and sized by its minutes on the 08:00–18:00 day", () => {
    const layout = cellLayout([rec(8 * 60 + 30, 15 * 60 + 30, "approved")]);
    expect(barsOf(layout)).toHaveLength(1);
    expect(barsOf(layout)[0].left).toBeCloseTo(0.05);
    expect(barsOf(layout)[0].width).toBeCloseTo(0.7);
  });

  it("two records are two separate bars on their own hours", () => {
    const layout = cellLayout([rec(8 * 60 + 30, 10 * 60, "approved"), rec(13 * 60, 15 * 60, "awaiting")]);
    expect(barsOf(layout).map((b) => b.record.status)).toEqual(["approved", "awaiting"]);
    expect(barsOf(layout)[0].left).toBeCloseTo(0.05);
    expect(barsOf(layout)[0].width).toBeCloseTo(0.15);
    expect(barsOf(layout)[1].left).toBeCloseTo(0.5);
    expect(barsOf(layout)[1].width).toBeCloseTo(0.2);
    // Смуги не перетинаються: перша закінчується до початку другої.
    expect(barsOf(layout)[0].left + barsOf(layout)[0].width).toBeLessThan(barsOf(layout)[1].left);
  });

  it("an early closing cuts the bars at its hour", () => {
    const layout = cellLayout([rec(10 * 60, 15 * 60, "approved")], 0.4);
    expect(barsOf(layout)[0].left + barsOf(layout)[0].width).toBeCloseTo(0.4);
  });

  it("three or more records collapse into a counter with their statuses in time order", () => {
    const three = [rec(510, 570, "approved"), rec(600, 660, "awaiting"), rec(780, 840, "returned")];
    expect(cellLayout(three)).toEqual({ collapsed: true, count: 3, statuses: ["approved", "awaiting", "returned"] });
    expect(cellLayout([...three, rec(870, 900, "approved")])).toMatchObject({ collapsed: true, count: 4 });
  });

  it("summarises the shown records for a manager and for an employee, and says nothing when there are none", () => {
    expect(timelineSummary(["approved", "awaiting", "awaiting", "returned", "approved", "awaiting"], true)).toBe(
      "6 records of your positions · 3 awaiting decision",
    );
    expect(timelineSummary(["approved"], false)).toBe("1 record · 0 awaiting decision");
    expect(timelineSummary([], true)).toBeNull();
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

describe("overviewRange", () => {
  it("covers the whole month and both weeks, ending on a real date", () => {
    expect(overviewRange("2026-11-06")).toMatchObject({ month: "2026-11", from: "2026-11-01", to: "2026-11-30" });
    expect(overviewRange("2026-02-10").to).toBe("2026-02-28");
    // Тижні виходять за межі місяця — діапазон розширюється до них.
    expect(overviewRange("2026-11-30")).toMatchObject({ from: "2026-11-01", to: "2026-12-11" });
    expect(overviewRange("2026-12-01")).toMatchObject({ from: "2026-11-30", to: "2026-12-31" });
  });

  it("a paged diagram widens only what is loaded, not the month and the current weeks", () => {
    const paged = overviewRange("2026-11-06", 2);
    expect(paged).toMatchObject({ month: "2026-11", from: "2026-11-01", to: "2026-11-30", loadFrom: "2026-11-01", loadTo: "2026-12-11" });
    expect(paged.days[0]).toBe("2026-11-30");
    expect(overviewRange("2026-11-06", -1)).toMatchObject({ from: "2026-11-01", loadFrom: "2026-10-19", loadTo: "2026-11-30" });
    expect(overviewRange("2026-11-06")).toMatchObject({ loadFrom: "2026-11-01", loadTo: "2026-11-30" });
  });
});

// Закриття школи на Overview — вигляд (DotMonth, WeekTimeline), а не AC PM: тому без AC ID у назвах.
describe("school closures on Overview", () => {
  const closures: Closure[] = [
    { id: 1, name: "Winter break", startDate: "2026-12-28", endDate: "2027-01-08", closesAt: null },
    { id: 2, name: "Teachers' meeting", startDate: "2026-11-20", endDate: "2026-11-20", closesAt: 12 * 60 },
    { id: 3, name: "Open day", startDate: "2026-11-27", endDate: "2026-11-27", closesAt: 7 * 60 },
  ];

  it("closedShare: whole days from the start, an early closing from its hour on the 08:00–18:00 scale", () => {
    expect(closedShare({ closesAt: null })).toBe(0);
    expect(closedShare({ closesAt: 12 * 60 })).toBeCloseTo(0.4);
    expect(closedShare({ closesAt: 7 * 60 })).toBe(0);
    expect(closedShare({ closesAt: 20 * 60 })).toBe(1);
  });

  it("segmentBox puts a record on its hours of the 08:00–18:00 day and cuts it at an early closing", () => {
    const box = segmentBox({ start_min: 8 * 60 + 30, end_min: 12 * 60 });
    expect(box.left).toBeCloseTo(0.05);
    expect(box.width).toBeCloseTo(0.35);
    expect(segmentBox({ start_min: 6 * 60, end_min: 20 * 60 })).toEqual({ left: 0, width: 1 });
    // Скорочений день з 12:00 (частка 0.4): запис 10:00–15:00 видно лише до 12:00.
    const cut = segmentBox({ start_min: 10 * 60, end_min: 15 * 60 }, 0.4);
    expect(cut.left).toBeCloseTo(0.2);
    expect(cut.width).toBeCloseTo(0.2);
    // Закритий цілий день (0) запис не обрізає; дуже короткий запис лишається видно.
    expect(segmentBox({ start_min: 10 * 60, end_min: 15 * 60 }, 0).width).toBeCloseTo(0.5);
    expect(segmentBox({ start_min: 9 * 60, end_min: 9 * 60 + 5 }).width).toBeCloseTo(0.06);
    expect(dayShare(13 * 60)).toBeCloseTo(0.5);
  });

  it("closureLabel names the closure and the hour of an early closing", () => {
    expect(closureLabel(closures[0])).toBe("Winter break");
    expect(closureLabel(closures[1])).toBe("Teachers' meeting from 12:00");
  });

  it("monthClosures marks every closed day of the month and only them", () => {
    const dec = monthClosures(closures, "2026-12");
    expect(Object.keys(dec).map(Number)).toEqual([28, 29, 30, 31]);
    expect(dec[28]).toEqual({ from: 0, label: "Winter break", time: null });
    const nov = monthClosures(closures, "2026-11");
    expect(Object.keys(nov).map(Number)).toEqual([20, 27]);
    expect(nov[20]).toEqual({ from: expect.closeTo(0.4), label: "Teachers' meeting from 12:00", time: "from 12:00" });
    expect(monthClosures(closures, "2027-01")[9]).toBeUndefined();
  });

  it("dayClosures follows the order of the two weeks and leaves open days empty", () => {
    const days = twoWeeks("2026-12-30"); // Mon 28 Dec … Fri 8 Jan.
    const marks = dayClosures(closures, days);
    expect(marks).toHaveLength(10);
    expect(marks.every((m) => m?.label === "Winter break")).toBe(true);
    const nov = dayClosures(closures, twoWeeks("2026-11-18")); // Mon 16 … Fri 27 Nov.
    expect(nov.map((m) => m?.time ?? (m ? "closed" : null))).toEqual([null, null, null, null, "from 12:00", null, null, null, null, "from 07:00"]);
  });

  it("closuresText names every closure of the shown range in date order, including one that already started", () => {
    expect(closuresText(closures, "2026-11-01", "2026-11-30")).toEqual([
      "School closes early: Teachers' meeting, Fri 20 Nov from 12:00",
      "School closes early: Open day, Fri 27 Nov from 07:00",
    ]);
    expect(closuresText(closures, "2027-01-01", "2027-01-31")).toEqual(["School closed: Winter break, Mon 28 Dec – Fri 8 Jan"]);
    expect(closuresText(closures, "2027-02-01", "2027-02-28")).toEqual([]);
  });

  it("nextClosureLine tells the nearest closure that has not ended, up to the end of what Overview shows", () => {
    expect(nextClosureLine(closures, "2026-12-01", "2026-12-31")).toBe("School closed: Winter break, Mon 28 Dec – Fri 8 Jan");
    expect(nextClosureLine(closures, "2026-11-09", "2026-11-30")).toBe(
      "School closes early: Teachers' meeting, Fri 20 Nov from 12:00 · 1 more by Mon 30 Nov",
    );
    expect(nextClosureLine(closures, "2026-11-21", "2026-11-30")).toBe("School closes early: Open day, Fri 27 Nov from 07:00");
    expect(nextClosureLine(closures, "2026-11-28", "2026-11-30")).toBeNull();
    // Кінець місяця: друга неділя діаграми вже в грудні, і канікули з 28 грудня — у межах показаного.
    expect(nextClosureLine(closures, "2026-12-30", "2027-01-08")).toBe("School closed: Winter break, Mon 28 Dec – Fri 8 Jan");
    expect(nextClosureLine(closures, "2026-12-21", "2026-12-31")).toBe("School closed: Winter break, Mon 28 Dec – Fri 8 Jan");
    expect(nextClosureLine(closures, "2026-12-01", "2026-12-27")).toBeNull();
    expect(nextClosureLine([{ ...closures[0], endDate: "2026-12-28" }], "2026-12-01", "2026-12-31")).toBe(
      "School closed: Winter break, Mon 28 Dec",
    );
  });
});
