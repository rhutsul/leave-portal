import { describe, expect, it } from "vitest";
import {
  dayLabel,
  dayMark,
  daysInclusive,
  fieldText,
  focusStart,
  isSelected,
  joinIds,
  moveFocus,
  pendingMark,
  pickDate,
  pickDone,
  pickSummary,
  rangeMark,
  rangeOf,
  shiftMonth,
} from "./date-picker";

// Логіка компонента DatePicker (DESIGN.md, розділ 5) — інструмент інтерфейсу, а не правило PM: тому без AC ID у назвах.
// Правило про порядок дат закриття (AC-CAL-10) перевіряють тести форми й бази.

describe("pickDate", () => {
  it("single: every click replaces the date", () => {
    expect(pickDate("single", [], "2026-11-03")).toEqual(["2026-11-03"]);
    expect(pickDate("single", ["2026-11-03"], "2026-11-05")).toEqual(["2026-11-05"]);
  });

  it("range: the first click starts, the second ends, the third starts over", () => {
    const start = pickDate("range", [], "2026-12-28");
    expect(start).toEqual(["2026-12-28"]);
    const range = pickDate("range", start, "2027-01-08");
    expect(range).toEqual(["2026-12-28", "2027-01-08"]);
    expect(pickDate("range", range, "2026-11-20")).toEqual(["2026-11-20"]);
  });

  it("range: keeps the click order when the second date is earlier", () => {
    expect(pickDate("range", ["2027-01-08"], "2026-12-28")).toEqual(["2027-01-08", "2026-12-28"]);
  });

  it("range: clicking the start again makes a one-day range", () => {
    expect(pickDate("range", ["2026-12-30"], "2026-12-30")).toEqual(["2026-12-30", "2026-12-30"]);
  });

  it("multiple: adds dates in calendar order and removes a date clicked again", () => {
    const two = pickDate("multiple", pickDate("multiple", [], "2026-11-20"), "2026-11-03");
    expect(two).toEqual(["2026-11-03", "2026-11-20"]);
    expect(pickDate("multiple", two, "2026-11-03")).toEqual(["2026-11-20"]);
  });
});

describe("dayMark", () => {
  it("single and multiple mark only the chosen days", () => {
    expect(dayMark("single", ["2026-11-03"], "2026-11-03")).toBe("single");
    expect(dayMark("single", ["2026-11-03"], "2026-11-04")).toBeNull();
    expect(dayMark("multiple", ["2026-11-03", "2026-11-20"], "2026-11-20")).toBe("single");
    expect(dayMark("multiple", ["2026-11-03", "2026-11-20"], "2026-11-10", "2026-11-25")).toBeNull();
  });

  it("range: nothing is marked before the first click", () => {
    expect(dayMark("range", [], "2026-11-03", "2026-11-03")).toBeNull();
  });

  it("range: marks the start, the end and the days between", () => {
    const value = ["2026-12-28", "2027-01-08"];
    expect(dayMark("range", value, "2026-12-28")).toBe("start");
    expect(dayMark("range", value, "2027-01-01")).toBe("inside");
    expect(dayMark("range", value, "2027-01-08")).toBe("end");
    expect(dayMark("range", value, "2026-12-27")).toBeNull();
    expect(dayMark("range", value, "2027-01-09")).toBeNull();
  });

  it("range: previews the days up to the hovered one while the end is not chosen", () => {
    const value = ["2026-12-28"];
    expect(dayMark("range", value, "2026-12-28", "2026-12-31")).toBe("start");
    expect(dayMark("range", value, "2026-12-30", "2026-12-31")).toBe("preview");
    expect(dayMark("range", value, "2026-12-31", "2026-12-31")).toBe("preview");
    expect(dayMark("range", value, "2027-01-01", "2026-12-31")).toBeNull();
    expect(dayMark("range", value, "2026-12-27", "2026-12-31")).toBeNull();
  });

  it("range: no preview without a hovered day, on the start itself or before it", () => {
    expect(dayMark("range", ["2026-12-28"], "2026-12-28")).toBe("single");
    expect(dayMark("range", ["2026-12-28"], "2026-12-28", "2026-12-28")).toBe("single");
    expect(dayMark("range", ["2026-12-28"], "2026-12-27", "2026-12-20")).toBeNull();
    expect(dayMark("range", ["2026-12-28"], "2026-12-29", null)).toBeNull();
  });

  it("range: a one-day range and a reversed range mark the clicked days only", () => {
    expect(dayMark("range", ["2026-12-30", "2026-12-30"], "2026-12-30")).toBe("single");
    const reversed = ["2027-01-08", "2026-12-28"];
    expect(dayMark("range", reversed, "2027-01-08")).toBe("single");
    expect(dayMark("range", reversed, "2026-12-28")).toBe("single");
    expect(dayMark("range", reversed, "2027-01-01")).toBeNull();
  });

  it("a preview is not part of the selection", () => {
    expect(isSelected("preview")).toBe(false);
    expect(isSelected(null)).toBe(false);
    for (const mark of ["single", "start", "end", "inside"] as const) expect(isSelected(mark)).toBe(true);
  });
});

describe("rangeOf", () => {
  it("one click is one day; the click order is kept", () => {
    expect(rangeOf([])).toBeNull();
    expect(rangeOf(["2026-12-30"])).toEqual({ start: "2026-12-30", end: "2026-12-30" });
    expect(rangeOf(["2027-01-08", "2026-12-28"])).toEqual({ start: "2027-01-08", end: "2026-12-28" });
  });
});

describe("moveFocus", () => {
  it("moves by a day and a week, across months and years", () => {
    expect(moveFocus("2026-12-31", "ArrowRight")).toBe("2027-01-01");
    expect(moveFocus("2026-12-01", "ArrowLeft")).toBe("2026-11-30");
    expect(moveFocus("2026-12-28", "ArrowDown")).toBe("2027-01-04");
    expect(moveFocus("2026-12-03", "ArrowUp")).toBe("2026-11-26");
  });

  it("Home and End go to Monday and Sunday of the week", () => {
    // Середа, 2 грудня 2026.
    expect(moveFocus("2026-12-02", "Home")).toBe("2026-11-30");
    expect(moveFocus("2026-12-02", "End")).toBe("2026-12-06");
    expect(moveFocus("2026-11-30", "Home")).toBe("2026-11-30");
    expect(moveFocus("2026-12-06", "End")).toBe("2026-12-06");
  });

  it("PageUp and PageDown move by a month and keep the day where it exists", () => {
    expect(moveFocus("2026-12-15", "PageDown")).toBe("2027-01-15");
    expect(moveFocus("2027-01-15", "PageUp")).toBe("2026-12-15");
    expect(moveFocus("2027-01-31", "PageDown")).toBe("2027-02-28");
  });

  it("ignores other keys", () => {
    expect(moveFocus("2026-12-15", "Enter")).toBeNull();
    expect(moveFocus("2026-12-15", "a")).toBeNull();
  });
});

describe("shiftMonth", () => {
  it("clamps the day to the end of a shorter month, leap years included", () => {
    expect(shiftMonth("2028-01-31", 1)).toBe("2028-02-29");
    expect(shiftMonth("2026-03-31", -1)).toBe("2026-02-28");
    expect(shiftMonth("2026-10-05", 3)).toBe("2027-01-05");
  });
});

describe("focusStart", () => {
  it("starts on a chosen day, then today, then the 1st of the month", () => {
    expect(focusStart("2026-12", ["2026-11-03", "2026-12-28"], "2026-12-10")).toBe("2026-12-28");
    expect(focusStart("2026-12", [], "2026-12-10")).toBe("2026-12-10");
    expect(focusStart("2027-01", [], "2026-12-10")).toBe("2027-01-01");
    expect(focusStart("2027-01", [], null)).toBe("2027-01-01");
  });
});

describe("daysInclusive", () => {
  it("counts both ends", () => {
    expect(daysInclusive("2026-12-28", "2027-01-08")).toBe(12);
    expect(daysInclusive("2026-12-30", "2026-12-30")).toBe(1);
  });
});

describe("pickSummary", () => {
  it("says when nothing is chosen", () => {
    expect(pickSummary("single", [])).toBe("No date selected");
    expect(pickSummary("range", [])).toBe("No date selected");
    expect(pickSummary("multiple", [])).toBe("No dates selected");
  });

  it("names the chosen date or dates", () => {
    expect(pickSummary("single", ["2026-11-20"])).toBe("Selected Fri, 20 Nov 2026");
    expect(pickSummary("multiple", ["2026-11-20"])).toBe("1 date selected: Fri, 20 Nov 2026");
    expect(pickSummary("multiple", ["2026-11-03", "2026-11-20"])).toBe("2 dates selected: Tue, 3 Nov 2026; Fri, 20 Nov 2026");
  });

  it("range: asks for the end, then names both ends and the number of days", () => {
    expect(pickSummary("range", ["2026-12-28"])).toBe("Selected Mon, 28 Dec 2026. Click another day to make it a range.");
    expect(pickSummary("range", ["2026-12-28", "2027-01-08"])).toBe("Selected Mon, 28 Dec 2026 – Fri, 8 Jan 2027, 12 days");
    expect(pickSummary("range", ["2026-12-30", "2026-12-30"])).toBe("Selected Wed, 30 Dec 2026");
  });

  it("range: a reversed range keeps the click order and has no day count", () => {
    expect(pickSummary("range", ["2027-01-08", "2026-12-28"])).toBe("Selected from Fri, 8 Jan 2027 to Mon, 28 Dec 2026");
  });
});

describe("pendingMark and rangeMark", () => {
  it("pendingMark previews only forward from the start", () => {
    expect(pendingMark("2026-12-28", "2026-12-29", "2026-12-29")).toBe("preview");
    expect(pendingMark("2026-12-28", "2026-12-28", null)).toBe("single");
    expect(pendingMark("2026-12-28", "2026-12-29", "2026-12-20")).toBeNull();
  });

  it("rangeMark marks the ends and the middle of a forward range only", () => {
    expect(rangeMark("2026-12-28", "2026-12-30", "2026-12-29")).toBe("inside");
    expect(rangeMark("2026-12-30", "2026-12-28", "2026-12-29")).toBeNull();
    expect(rangeMark("2026-12-30", "2026-12-28", "2026-12-28")).toBe("single");
  });
});

describe("dayLabel", () => {
  it("starts with the full date and adds the note and today", () => {
    expect(dayLabel("2026-12-28", null, "2026-11-09")).toBe("Mon, 28 Dec 2026");
    expect(dayLabel("2026-12-28", { label: "already closed: Winter break", hatch: "full" }, null)).toBe(
      "Mon, 28 Dec 2026, already closed: Winter break",
    );
    expect(dayLabel("2026-11-09", null, "2026-11-09")).toBe("Mon, 9 Nov 2026, today");
  });
});

describe("joinIds", () => {
  it("keeps only the given ids", () => {
    expect(joinIds("a", false, null, undefined, "b")).toBe("a b");
    expect(joinIds(false)).toBe("");
  });
});

describe("fieldText", () => {
  it("is empty before the first click", () => {
    expect(fieldText("range", [])).toBeNull();
    expect(fieldText("single", [])).toBeNull();
  });

  it("names one date, a range with its days, or a reversed range as clicked", () => {
    expect(fieldText("single", ["2026-11-20"])).toBe("Fri, 20 Nov 2026");
    expect(fieldText("range", ["2026-12-30"])).toBe("Wed, 30 Dec 2026");
    expect(fieldText("range", ["2026-12-30", "2026-12-30"])).toBe("Wed, 30 Dec 2026");
    expect(fieldText("range", ["2026-12-28", "2027-01-08"])).toBe("Mon, 28 Dec 2026 – Fri, 8 Jan 2027, 12 days");
    expect(fieldText("range", ["2027-01-08", "2026-12-28"])).toBe("Fri, 8 Jan 2027 – Mon, 28 Dec 2026");
  });

  it("counts several dates", () => {
    expect(fieldText("multiple", ["2026-11-12"])).toBe("Thu, 12 Nov 2026");
    expect(fieldText("multiple", ["2026-11-12", "2026-11-13"])).toBe("2 dates");
  });
});

describe("pickDone", () => {
  it("closes after one date, after the end of a range, never for several dates", () => {
    expect(pickDone("single", ["2026-11-20"])).toBe(true);
    expect(pickDone("range", ["2026-12-28"])).toBe(false);
    expect(pickDone("range", ["2026-12-28", "2027-01-08"])).toBe(true);
    expect(pickDone("multiple", ["2026-11-12", "2026-11-13"])).toBe(false);
    expect(pickDone("single", [])).toBe(false);
  });
});
