"use client";

import { useRouter } from "next/navigation";
import { useEffect, useMemo, useRef, useState, type MouseEvent } from "react";
import { cellAt, dotLook, drawDots, layoutDots, type Dot, type DotTone } from "@/lib/dot-month";
import type { BlockingStatus } from "@/lib/leave/overview";
import { monthGrid, WEEKDAY_SHORT } from "@/lib/leave/time";
import { cn } from "@/lib/utils";

export interface DotMonthMark {
  status: BlockingStatus;
  /** Підпис при наведенні: "Thu 12 Nov · 08:30–12:00 · Awaiting decision". */
  label: string;
  /** Куди веде клік по дню (той самий запис відкривається й кнопкою в «Next leave»). */
  href: string;
}

const ROW_HEIGHT = 32;
const reducedMotion = () => window.matchMedia("(prefers-reduced-motion: reduce)").matches;

/** Кольори токенів теми (DESIGN.md, розділ 2): canvas малює OKLCH сам. */
function tokenColors(el: Element): Record<DotTone, string> {
  const css = getComputedStyle(el);
  const token = (name: string) => css.getPropertyValue(name).trim();
  return {
    base: token("--muted-foreground"),
    today: token("--highlight"),
    awaiting: token("--status-awaiting-foreground"),
    returned: token("--status-returned-foreground"),
    approved: token("--status-approved-foreground"),
  };
}

/** Підписка на все, що вимагає нової розкладки чи кольорів: розмір, тема (ADR 0005), видимість. */
function watch(c: HTMLCanvasElement, onChange: () => void, onVisible: (visible: boolean) => void) {
  const io = new IntersectionObserver(([entry]) => onVisible(entry.isIntersecting));
  io.observe(c);
  const resize = new ResizeObserver(onChange);
  resize.observe(c);
  const theme = new MutationObserver(onChange);
  theme.observe(document.documentElement, { attributes: true, attributeFilter: ["data-theme"] });
  const scheme = window.matchMedia("(prefers-color-scheme: dark)");
  scheme.addEventListener("change", onChange);
  const visibility = () => onVisible(!document.hidden);
  document.addEventListener("visibilitychange", visibility);
  return () => {
    io.disconnect();
    resize.disconnect();
    theme.disconnect();
    scheme.removeEventListener("change", onChange);
    document.removeEventListener("visibilitychange", visibility);
  };
}

/**
 * Місяць із точок у шапці Overview (ADR 0007, DESIGN.md `DotMonth`): кожен день — блок точок, записи — кольором
 * статусу, сьогодні — `highlight` з пульсом. 2D canvas, не three.js; рендер стоїть поза екраном і на схованій вкладці.
 * Полотно — декор (`aria-hidden`): ті самі записи є посиланнями в «Next leave», клік тут — лише скорочення для миші.
 */
export function DotMonth({
  month,
  today,
  marks,
  className,
}: {
  month: string;
  today: string;
  marks: Readonly<Record<number, DotMonthMark>>;
  className?: string;
}) {
  const router = useRouter();
  const canvas = useRef<HTMLCanvasElement>(null);
  const pointer = useRef<{ hover: number | null; mouse: [number, number] | null }>({ hover: null, mouse: null });
  const [hover, setHover] = useState<number | null>(null);
  const cells = useMemo(() => monthGrid(month), [month]);
  const rows = Math.ceil(cells.length / 7);

  useEffect(() => {
    const c = canvas.current;
    const ctx = c?.getContext("2d");
    if (!c || !ctx) return;
    let dots: Dot[] = [];
    let colors = tokenColors(c);
    let raf = 0;
    let visible = true;
    const start = performance.now();
    const look = (cell: number, date: string | null) =>
      dotLook({
        inMonth: date !== null,
        weekend: cell % 7 >= 5,
        status: date ? (marks[Number(date.slice(8))]?.status ?? null) : null,
        today: date === today,
      });

    const frame = (now: number) => {
      raf = 0;
      const still = reducedMotion();
      ctx.clearRect(0, 0, c.clientWidth, c.clientHeight);
      drawDots(ctx, dots, colors, {
        elapsed: still ? Infinity : now - start,
        pulse: still ? 1 : 0.75 + 0.25 * Math.sin(now / 380),
        ...pointer.current,
        mouse: still ? null : pointer.current.mouse,
      });
      // Сьогодні пульсує, тож поки полотно на екрані, кадри йдуть; reduced motion — по кадру на зміну.
      if (!still) kick();
    };
    const kick = () => {
      if (!raf && visible) raf = requestAnimationFrame(frame);
    };
    const layout = () => {
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      c.width = Math.round(c.clientWidth * dpr);
      c.height = Math.round(c.clientHeight * dpr);
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      colors = tokenColors(c);
      dots = layoutDots(cells, look, c.clientWidth, c.clientHeight);
      kick();
    };

    layout();
    c.addEventListener("pointermove", kick);
    c.addEventListener("pointerleave", kick);
    const stop = watch(c, layout, (v) => {
      visible = v;
      kick();
    });
    return () => {
      cancelAnimationFrame(raf);
      stop();
      c.removeEventListener("pointermove", kick);
      c.removeEventListener("pointerleave", kick);
    };
  }, [cells, marks, today]);

  function place(event: MouseEvent<HTMLCanvasElement>) {
    const box = event.currentTarget.getBoundingClientRect();
    const x = event.clientX - box.left;
    const y = event.clientY - box.top;
    return { mouse: [x, y] as [number, number], cell: cellAt(cells, x, y, box.width, box.height) };
  }

  function move(event: MouseEvent<HTMLCanvasElement>) {
    const { mouse, cell } = place(event);
    pointer.current = { hover: cell, mouse };
    setHover(cell);
  }

  function leave() {
    pointer.current = { hover: null, mouse: null };
    setHover(null);
  }

  function click(event: MouseEvent<HTMLCanvasElement>) {
    const { cell } = place(event);
    const date = cell === null ? null : cells[cell];
    const mark = date ? marks[Number(date.slice(8))] : undefined;
    if (mark) router.push(mark.href, { scroll: false });
  }

  const hoverDate = hover === null ? null : cells[hover];
  const hoverMark = hoverDate ? marks[Number(hoverDate.slice(8))] : undefined;
  const hoverLabel = hoverMark?.label ?? (hoverDate ? `${hoverDate === today ? "Today · " : ""}${Number(hoverDate.slice(8))} · no records` : "Point at a day");

  return (
    <div aria-hidden="true" className={cn("flex flex-col gap-1.5", className)}>
      <div className="flex items-baseline justify-between gap-3 font-mono text-[11px] text-muted-foreground">
        <span className="tracking-wide uppercase">Your records this month</span>
        <span className="truncate">{hoverLabel}</span>
      </div>
      <div className="grid grid-cols-7 text-center font-mono text-[10px] text-muted-foreground">
        {WEEKDAY_SHORT.map((d) => (
          <span key={d}>{d}</span>
        ))}
      </div>
      <canvas
        ref={canvas}
        onPointerMove={move}
        onPointerLeave={leave}
        onClick={click}
        className={cn("block w-full", hoverMark ? "cursor-pointer" : "cursor-default")}
        style={{ height: rows * ROW_HEIGHT }}
      />
    </div>
  );
}
