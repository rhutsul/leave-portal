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
  it("lets keyboard reach only days with a closure, named by date and closure", () => {
    const out = html();
    expect(out.match(/tabindex="0"/g)).toHaveLength(3);
    // Апостроф у назві React екранує як &#x27;.
    expect(out).toContain('aria-label="Fri, 20 Nov 2026: Teachers&#x27; meeting from 12:00"');
    expect(out).toContain('aria-label="Thu, 26 Nov 2026: Staff day"');
  });

  it("marks today for a screen reader and hides plain day numbers", () => {
    const out = html();
    expect(out).toContain('aria-label="Today, Mon, 9 Nov 2026" aria-current="date"');
    expect(out.match(/aria-hidden="true" data-day="open"/g)).toHaveLength(26); // 30 днів − 3 із закриттям − сьогодні
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
    expect(out).toMatch(/data-day="closed" class="[^"]*ring-destructive/);
  });
});
