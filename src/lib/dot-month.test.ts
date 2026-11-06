import { describe, expect, it, vi } from "vitest";
import { cellAt, dotLook, dotPosition, drawDots, layoutDots, type Dot } from "./dot-month";
import { monthGrid } from "./leave/time";

// Правила вигляду DotMonth (ADR 0007), а не AC PM: тому без AC ID у назвах.

describe("dotLook", () => {
  it("days outside the month have no dots; today and records stand out; weekends are quieter", () => {
    expect(dotLook({ inMonth: false, weekend: false, status: null, today: false })).toBeNull();
    expect(dotLook({ inMonth: true, weekend: false, status: "awaiting", today: true })?.tone).toBe("today");
    expect(dotLook({ inMonth: true, weekend: true, status: "approved", today: false })).toEqual({ tone: "approved", alpha: 0.95, size: 1.9 });
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
