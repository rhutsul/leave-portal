import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { timelineDays, twoWeeks } from "@/lib/leave/overview";
import { DayCard, RecordCard, WeekTimeline, type WeekTimelineRecord, type WeekTimelineRow } from "./week-timeline";

// Вигляд діаграми двох тижнів (DESIGN.md `WeekTimeline`), а не AC PM: тому без AC ID у назвах.

const weeks = twoWeeks("2026-11-05"); // Mon 2 … Fri 13 Nov.
const days = timelineDays(weeks, "2026-11-05").map((d) => {
  if (d.date === "2026-11-06") return { ...d, closure: { from: 0, label: "Autumn break", time: null } };
  if (d.date === "2026-11-11") return { ...d, closure: { from: 0.4, closesAt: 12 * 60, label: "Teachers' meeting from 12:00", time: "from 12:00" } };
  return { ...d, closure: null };
});

const record = (id: number, start: number, end: number, status: WeekTimelineRecord["status"], type: string, hours: string, duration: string): WeekTimelineRecord => ({
  id,
  start_min: start,
  end_min: end,
  status,
  type,
  hours,
  duration,
  href: `/decisions?record=${id}`,
});

const whole = record(1, 510, 930, "approved", "sick", "08:30–15:30", "7 h");
const morning = record(2, 510, 570, "approved", "sick", "08:30–09:30", "1 h");
const midday = record(3, 600, 720, "returned", "personal", "10:00–12:00", "2 h");
const three = [
  record(4, 510, 570, "approved", "personal", "08:30–09:30", "1 h"),
  record(5, 600, 660, "awaiting", "personal", "10:00–11:00", "1 h"),
  record(6, 780, 840, "returned", "sick", "13:00–14:00", "1 h"),
];

const rows: WeekTimelineRow[] = [
  {
    key: "1",
    name: "Teacher One",
    sub: "Elementary school / Teacher",
    cells: [
      { col: 0, records: [whole] },
      { col: 7, records: [morning, midday] },
      { col: 8, records: three },
    ],
  },
];
const html = renderToStaticMarkup(<WeekTimeline days={days} rows={rows} label="Your leave this week and next" empty="No leave in these two weeks." />);

// Той самий рядок зі шкалою дня посади 08:30–15:30 у кожній колонці.
const scaled = renderToStaticMarkup(
  <WeekTimeline
    days={days}
    rows={[{ ...rows[0], scales: days.map(() => ({ start: 510, end: 930 })) }]}
    label="Your leave this week and next"
    empty="No leave in these two weeks."
  />,
);
const buttons = html.match(/<button[^>]*>/g) ?? [];

describe("WeekTimeline", () => {
  it("a record is a button named with who, the date, the hours, the type and the status — and no native tooltip", () => {
    expect(html).toContain('aria-label="Teacher One · Elementary school / Teacher, Mon, 2 Nov 2026, 08:30–15:30, Sick leave, Approved"');
    expect(buttons.some((b) => b.includes("title="))).toBe(false);
    // Смуга на своїх годинах шкали 08:00–18:00: 08:30 — 5 %, сім годин — 70 %.
    expect(html).toContain("left:calc(5% + 3px);width:calc(70% - 6px)");
  });

  it("two records of one day are two separate buttons on their own hours, cut at an early closing", () => {
    expect(html).toContain("Wed, 11 Nov 2026, 08:30–09:30, Sick leave, Approved");
    expect(html).toContain("Wed, 11 Nov 2026, 10:00–12:00, Personal leave, Returned for revision");
    expect(html).toContain("left:calc(20% + 3px);width:calc(20% - 6px)");
    expect(html).not.toContain("2 records");
  });

  it("three records collapse into one counter button that names each of them and splits its background by status", () => {
    expect(html).toContain(
      'aria-label="Teacher One · Elementary school / Teacher, Thu, 12 Nov 2026, 3 records: 08:30–09:30 Approved; 10:00–11:00 Awaiting decision; 13:00–14:00 Returned for revision"',
    );
    expect(html).toContain("3 records</span>");
    expect(html).toContain("×3</span>");
    expect(html).toMatch(/linear-gradient\(90deg, color-mix\(in oklch, var\(--status-approved-foreground\) 30%, transparent\) 0% 33\.3/);
    // Один запис, два записи поруч і лічильник — чотири кнопки на рядок.
    expect(buttons).toHaveLength(4);
  });

  it("on the working day of the position a whole-day record fills its cell and says Whole day", () => {
    expect(scaled).toContain("left:calc(0% + 3px);width:calc(100% - 6px)");
    expect(scaled).toContain("Whole day</span>");
    // Скорочений день з 12:00 на дні 08:30–15:30 — штриховка з половини клітинки.
    expect(scaled).toMatch(/left:50%/);
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

  it("the legend names the three statuses and the hatching of closed days", () => {
    for (const word of ["Approved", "Awaiting decision", "Returned for revision", "hatched — closed by the school"]) expect(html).toContain(word);
  });

  it("without records the grid says so", () => {
    const empty = renderToStaticMarkup(<WeekTimeline days={days} rows={[]} label="Your leave" empty="No leave in these two weeks." />);
    expect(empty).toContain("No leave in these two weeks.");
    expect(empty).not.toContain("<button");
  });
});

describe("WeekTimeline cards", () => {
  it("the record card tells the date, hours, person, type and duration, and links to the record", () => {
    const card = renderToStaticMarkup(<RecordCard record={whole} day={days[0]} who="Teacher One · Elementary school / Teacher" />);
    for (const text of ["Mon, 2 Nov 2026", "08:30–15:30", "Teacher One · Elementary school / Teacher", "Sick leave", "· 7 h"]) expect(card).toContain(text);
    expect(card).toMatch(/<a[^>]*href="\/decisions\?record=1"[^>]*>Open record<\/a>/);
  });

  it("the day card lists every record of the day as a link with its hours, type and status", () => {
    const card = renderToStaticMarkup(<DayCard records={three} who="Teacher One · Elementary school / Teacher" />);
    expect(card.match(/<a /g)).toHaveLength(3);
    expect(card).toContain('href="/decisions?record=5"');
    for (const text of ["10:00–11:00", "Personal leave", "Awaiting decision", "Returned for revision"]) expect(card).toContain(text);
  });
});
