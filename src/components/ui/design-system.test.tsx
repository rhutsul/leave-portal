import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { LEAVE_TYPES, RECORD_STATUSES, type LeaveType, type RecordStatus } from "@/lib/leave/request";
import { Button } from "./button";
import { CalendarDay } from "./calendar-day";
import { DialogFooter } from "./dialog";
import { LeaveTypeTag } from "./leave-type-tag";
import { splitRowMenuItems } from "./row-menu";
import { StatusBadge } from "./status-badge";

// Правила дизайн-системи (DESIGN.md), а не AC PM: тому без AC ID у назвах.

const classes = (html: string) => html.match(/class="([^"]*)"/)?.[1].split(" ") ?? [];

describe("Button", () => {
  it("link variant has no button height or padding at any size", () => {
    for (const size of ["default", "xs", "sm", "lg"] as const) {
      const list = classes(renderToStaticMarkup(<Button variant="link" size={size} />));
      expect(list).toEqual(expect.arrayContaining(["h-auto", "px-0"]));
      // Висота й відступи розміру, зокрема відступ біля іконки (has-data-[icon=…]:pr-3).
      expect(list.filter((c) => /(^|:)(h-\d|p[xlr]-[1-9])/.test(c))).toEqual([]);
    }
  });

  it("other variants keep the size", () => {
    expect(classes(renderToStaticMarkup(<Button />))).toEqual(expect.arrayContaining(["h-9", "px-3.5"]));
  });
});

describe("DialogFooter", () => {
  it("bleeds exactly over the p-5 padding of DialogContent", () => {
    expect(classes(renderToStaticMarkup(<DialogFooter />))).toEqual(
      expect.arrayContaining(["-mx-5", "-mb-5", "px-5"]),
    );
  });
});

describe("StatusBadge and LeaveTypeTag", () => {
  it("always show the status as its word", () => {
    for (const status of Object.keys(RECORD_STATUSES) as RecordStatus[]) {
      expect(renderToStaticMarkup(<StatusBadge status={status} />)).toContain(`>${RECORD_STATUSES[status]}<`);
    }
  });

  it("always show the leave type as its word in both variants", () => {
    for (const type of Object.keys(LEAVE_TYPES) as LeaveType[]) {
      expect(renderToStaticMarkup(<LeaveTypeTag type={type} />)).toContain(LEAVE_TYPES[type]);
      expect(renderToStaticMarkup(<LeaveTypeTag type={type} variant="inline" />)).toContain(LEAVE_TYPES[type]);
    }
  });

  it("shows an unknown leave type as is", () => {
    expect(renderToStaticMarkup(<LeaveTypeTag type="other" />)).toBe("<span>other</span>");
  });
});

describe("CalendarDay", () => {
  it("days closed by the school and days without hours cannot be picked", () => {
    for (const state of ["closed", "off"] as const) {
      expect(renderToStaticMarkup(<CalendarDay day={3} state={state} />)).toMatch(/\sdisabled=""/);
    }
    expect(renderToStaticMarkup(<CalendarDay day={3} state="free" />)).not.toMatch(/\sdisabled=""/);
  });

  it("marks only the selected day as pressed", () => {
    expect(renderToStaticMarkup(<CalendarDay day={3} state="selected" />)).toContain('aria-pressed="true"');
    expect(renderToStaticMarkup(<CalendarDay day={3} state="record" />)).toContain('aria-pressed="false"');
  });
});

describe("RowMenu", () => {
  it("puts the dangerous actions last and keeps the order of the others", () => {
    const { safe, danger } = splitRowMenuItems([
      { label: "View details" },
      { label: "Cancel record", destructive: true },
      { label: "Change hours" },
    ]);
    expect(safe.map((i) => i.label)).toEqual(["View details", "Change hours"]);
    expect(danger.map((i) => i.label)).toEqual(["Cancel record"]);
  });
});
