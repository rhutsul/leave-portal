import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { timelineDays, twoWeeks } from "@/lib/leave/overview";
import { WeekTimeline, type WeekTimelineRow } from "./week-timeline";

// Вигляд діаграми двох тижнів (DESIGN.md `WeekTimeline`), а не AC PM: тому без AC ID у назвах.

const weeks = twoWeeks("2026-11-05"); // Mon 2 … Fri 13 Nov.
const days = timelineDays(weeks, "2026-11-05").map((d) => {
  if (d.date === "2026-11-06") return { ...d, closure: { from: 0, label: "Autumn break", time: null } };
  if (d.date === "2026-11-11") return { ...d, closure: { from: 0.4, label: "Teachers' meeting from 12:00", time: "from 12:00" } };
  return { ...d, closure: null };
});
const rows: WeekTimelineRow[] = [
  {
    key: "1",
    name: "Teacher One",
    sub: "Elementary school / Teacher",
    bars: [
      { col: 0, status: "approved", hours: "08:30–15:30" },
      {
        col: 7,
        status: "returned",
        hours: "08:30–09:30, 10:00–12:00",
        segments: [
          { start_min: 510, end_min: 570, status: "approved", hours: "08:30–09:30" },
          { start_min: 600, end_min: 720, status: "returned", hours: "10:00–12:00" },
        ],
      },
    ],
  },
];
const html = renderToStaticMarkup(<WeekTimeline days={days} rows={rows} label="Your leave this week and next" empty="No leave in these two weeks." />);

describe("WeekTimeline", () => {
  it("a single record is one bar with its hours, and its date and status for screen readers", () => {
    expect(html).toContain('title="Mon, 2 Nov 2026 · 08:30–15:30 · Approved"');
    expect(html).toContain('<span class="sr-only">Mon, 2 Nov 2026, Approved: </span>');
  });

  it("several records of one day are segments with a count, and each record's hours and status in title and sr-only", () => {
    expect(html).toContain('title="Wed, 11 Nov 2026 · 08:30–09:30 · Approved; 10:00–12:00 · Returned for revision"');
    expect(html).toContain("Wed, 11 Nov 2026, 2 records: 08:30–09:30 · Approved; 10:00–12:00 · Returned for revision");
    expect(html).toContain("2 records</span>");
    expect(html).toContain("×2</span>");
    // Два сегменти на своїх годинах шкали 08:00–18:00: 08:30 — 5 %, 10:00 — 20 %.
    expect(html).toMatch(/left:5%/);
    expect(html).toMatch(/left:20%/);
  });

  it("a closed day's header says closed and names the closure; an early closing shows its time", () => {
    expect(html).toContain('aria-label="Fri, 6 Nov 2026 · School closed: Autumn break"');
    expect(html).toContain('title="Fri, 6 Nov 2026 · School closed: Autumn break"');
    expect(html).toMatch(/Fri 6<span[^>]*>closed<\/span>/);
    expect(html).toContain('aria-label="Wed, 11 Nov 2026 · School closes early: Teachers&#x27; meeting from 12:00"');
    expect(html).toContain("· 12:00</span>");
    expect(html).toContain("from 12:00</span>");
    // Штриховка рядка скороченого дня — від години закриття (частка 0.4) праворуч.
    expect(html).toMatch(/left:40%/);
  });

  it("an open day has only its date for screen readers and no title", () => {
    expect(html).toContain('aria-label="Mon, 2 Nov 2026"');
    expect(html).not.toContain('title="Mon, 2 Nov 2026"');
  });
});
