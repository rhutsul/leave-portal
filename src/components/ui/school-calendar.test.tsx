import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import type { Closure } from "@/lib/leave/calendar";
import { buildMonth } from "@/lib/leave/calendar-grid";
import { CalendarMonth } from "./school-calendar";

// Правила дизайн-системи (DESIGN.md, розділи 5–6), а не AC PM: тому без AC ID у назвах.

const MEETING: Closure = { id: 2, name: "Teachers' meeting", startDate: "2026-11-20", endDate: "2026-11-20", closesAt: 720 };
const STAFF: Closure = { id: 3, name: "Staff day", startDate: "2026-11-26", endDate: "2026-11-27", closesAt: null };

const html = (selection: { start: string; end: string } | null = null) =>
  renderToStaticMarkup(<CalendarMonth month={buildMonth("2026-11", [MEETING, STAFF], "2026-11-09", selection)} />);

describe("CalendarMonth", () => {
  it("is hidden from screen readers and has no tab stops: the list next to it carries the closures", () => {
    const out = html();
    expect(out).toMatch(/^<div aria-hidden="true"/);
    expect(out).not.toContain("tabindex");
    expect(out).not.toContain("role=");
  });

  it("names a closed day by date and closure on mouse hover", () => {
    const out = html();
    // Апостроф у назві React екранує як &#x27;.
    expect(out).toContain('title="Fri, 20 Nov 2026: Teachers&#x27; meeting from 12:00"');
    expect(out).toContain('title="Thu, 26 Nov 2026: Staff day"');
    expect(out.match(/title="/g)).toHaveLength(3);
  });

  it("rings today", () => {
    expect(html()).toMatch(/data-today="true" class="[^"]*ring-primary/);
  });

  it("strikes through whole closed days but not an early dismissal", () => {
    const out = html();
    const cell = (kind: string) => out.match(new RegExp(`data-day="${kind}"[^>]*class="([^"]*)"`))?.[1] ?? "";
    expect(cell("closed")).toContain("line-through");
    expect(cell("early")).not.toContain("line-through");
    expect(cell("early")).toContain("bg-bottom");
  });

  it("shows a selected day that is already closed with a destructive ring", () => {
    const out = html({ start: "2026-11-25", end: "2026-11-26" });
    expect(out).toMatch(/data-day="open" data-selected="true" class="[^"]*bg-primary/);
    expect(out).toMatch(/data-day="closed" data-selected="true" class="[^"]*ring-destructive/);
  });
});
