import { describe, expect, it, vi } from "vitest";
import { cellAt, dayLabel, dotLook, dotPosition, drawDots, inClosedPart, layoutDots, layoutHatch, type Dot } from "./dot-month";
import { monthGrid } from "./leave/time";

// Правила вигляду DotMonth (ADR 0007), а не AC PM: тому без AC ID у назвах.

describe("dotLook", () => {
  it("days outside the month have no dots; today and records stand out; weekends are quieter", () => {
    expect(dotLook({ inMonth: false, weekend: false, status: null, today: false })).toBeNull();
    expect(dotLook({ inMonth: true, weekend: false, status: "awaiting", today: true })?.tone).toBe("today");
    expect(dotLook({ inMonth: true, weekend: true, status: "approved", today: false })).toEqual({ tone: "approved", alpha: 0.95, size: 1.9, closedFrom: null });
    const weekday = dotLook({ inMonth: true, weekend: false, status: null, today: false })!;
    const weekend = dotLook({ inMonth: true, weekend: true, status: null, today: false })!;
    expect(weekend.alpha).toBeLessThan(weekday.alpha);
  });
});

describe("layoutDots and cellAt", () => {
  const cells = monthGrid("2026-11"); // 1 Nov 2026 — неділя: шість порожніх клітинок, потім 30 днів.
  const look = (cell: number, date: string | null) => dotLook({ inMonth: date !== null, weekend: cell % 7 >= 5, status: null, today: false });

  it("lays out 21 dots per day and none for the blank cells before the 1st", () => {
    const dots = layoutDots(cells, look, 420, 192);
    expect(dots).toHaveLength(30 * 21);
    expect(dots.every((d) => d.cell >= 6)).toBe(true);
    expect(layoutDots(cells, look, 420, 192)).toEqual(dots);
  });

  it("finds the day under the pointer, and nothing outside or on a blank cell", () => {
    expect(cellAt(cells, 10, 10, 420, 192)).toBeNull();
    expect(cellAt(cells, 6.5 * 60, 10, 420, 192)).toBe(6);
    expect(cellAt(cells, -1, 10, 420, 192)).toBeNull();
    expect(cellAt(cells, 10, 500, 420, 192)).toBeNull();
  });
});

describe("dotPosition", () => {
  const dot: Dot = { cell: 6, x: 100, y: 50, fromX: 0, fromY: 300, delay: 100, tone: "base", alpha: 0.34, size: 1.5 };

  it("flies from below to its place and stays there", () => {
    expect(dotPosition(dot, 0, null)).toEqual({ x: 0, y: 300, e: 0 });
    expect(dotPosition(dot, Infinity, null)).toEqual({ x: 100, y: 50, e: 1 });
  });

  it("steps aside near the pointer, not under it exactly or far away", () => {
    expect(dotPosition(dot, Infinity, [90, 50]).x).toBeGreaterThan(100);
    expect(dotPosition(dot, Infinity, [100, 50])).toEqual({ x: 100, y: 50, e: 1 });
    expect(dotPosition(dot, Infinity, [300, 300])).toEqual({ x: 100, y: 50, e: 1 });
  });
});

describe("drawDots", () => {
  it("draws every dot with its token colour, a glow for today, and resets the alpha", () => {
    const ctx = { fillStyle: "", globalAlpha: 1, beginPath: vi.fn(), arc: vi.fn(), fill: vi.fn() };
    const dots: Dot[] = [
      { cell: 6, x: 1, y: 1, fromX: 1, fromY: 1, delay: 0, tone: "base", alpha: 0.34, size: 1.5 },
      { cell: 9, x: 2, y: 2, fromX: 2, fromY: 2, delay: 0, tone: "today", alpha: 1, size: 2.1 },
    ];
    const colors = { base: "b", today: "t", awaiting: "a", returned: "r", approved: "p" };
    drawDots(ctx as unknown as CanvasRenderingContext2D, dots, colors, { elapsed: Infinity, pulse: 1, hover: 6, mouse: null });
    expect(ctx.fill).toHaveBeenCalledTimes(3);
    expect(ctx.fillStyle).toBe("t");
    expect(ctx.globalAlpha).toBe(1);
    expect(ctx.arc.mock.calls[0][2]).toBeCloseTo(1.5 * 1.6);
  });
});

describe("school closures in the month", () => {
  const cells = monthGrid("2026-11"); // 1 Nov — неділя: клітинка 6; 20 Nov — клітинка 25; 27 Nov — клітинка 32.
  const closedFrom = (date: string | null) => (date === "2026-11-20" ? 0.4 : date === "2026-11-27" ? 0 : null);

  it("a closed day keeps its dots but mutes them; an early closing mutes only the dots after its hour", () => {
    const look = (cell: number, date: string | null) =>
      dotLook({ inMonth: date !== null, weekend: false, status: null, today: false, closedFrom: closedFrom(date) });
    const dots = layoutDots(cells, look, 420, 192);
    const open = dots.filter((d) => d.cell === 24);
    const whole = dots.filter((d) => d.cell === 32);
    const early = dots.filter((d) => d.cell === 25);
    expect(whole).toHaveLength(21);
    expect(whole.every((d) => d.alpha < open[0].alpha)).toBe(true);
    // Стовпці 3–6 з семи — після 12:00 (частка 0.4), стовпці 0–2 — до.
    expect(early.filter((d) => d.alpha < open[0].alpha)).toHaveLength(4 * 3);
    expect([0, 1, 2, 3, 6].map((c) => inClosedPart(c, 0.4))).toEqual([false, false, false, true, true]);
    expect(inClosedPart(0, null)).toBe(false);
  });

  it("records and today stay as they are on a closed day", () => {
    const record = dotLook({ inMonth: true, weekend: false, status: "approved", today: false, closedFrom: 0 })!;
    const dots = layoutDots(cells, (_, date) => (date === "2026-11-27" ? record : null), 420, 192);
    expect(dots.every((d) => d.tone === "approved" && d.alpha === 0.95)).toBe(true);
    expect(dotLook({ inMonth: true, weekend: false, status: null, today: true, closedFrom: 0 })?.tone).toBe("today");
  });

  it("hatches the whole cell of a closed day and the part after the hour of an early closing", () => {
    const rects = layoutHatch(cells, (_, date) => closedFrom(date), 420, 192);
    expect(rects).toHaveLength(2);
    const [early, whole] = rects; // клітинки за порядком: 20 Nov, потім 27 Nov.
    expect(whole).toEqual({ x: 4 * 60 + 2, y: 4 * 32 + 2, w: 56, h: 28 });
    expect(early.x).toBeCloseTo(4 * 60 + 2 + 56 * 0.4);
    expect(early.w).toBeCloseTo(56 * 0.6);
  });

  it("the day caption names the closure, next to the record when there is one", () => {
    const winter = { label: "Winter break" };
    expect(dayLabel("2026-12-28", "2026-11-09", undefined, winter)).toBe("28 · Winter break");
    expect(dayLabel("2026-11-20", "2026-11-20", undefined, { label: "Teachers' meeting from 12:00" })).toBe(
      "Today · 20 · Teachers' meeting from 12:00",
    );
    expect(dayLabel("2026-12-28", "2026-11-09", { label: "Mon 28 Dec · 08:30–12:00 · Approved" }, winter)).toBe(
      "Mon 28 Dec · 08:30–12:00 · Approved · Winter break",
    );
    expect(dayLabel("2026-12-29", "2026-11-09", undefined, undefined)).toBe("29 · no records");
  });
});
