"use client";

import { useRef, type PointerEvent } from "react";
import { StatusBadge } from "@/components/ui/status-badge";

const KICKER = "font-mono text-[11px] tracking-wide text-muted-foreground uppercase";
// Нахил «екрана продукту» в спокої і скільки він повертається за курсором (лише landing, ADR 0007).
const REST = { x: 12, y: -16 };
const FOLLOW = { x: 14, y: 20 };

const STATS = [
  { label: "Sick leave left", value: "17.50" },
  { label: "Personal leave left", value: "16.64" },
  { label: "Awaiting decision", value: "1" },
  { label: "To decide", value: "6", accent: true },
];

// Смуги діаграми двох тижнів: зсув і ширина у відсотках, колір статусу з прозорістю (як у WeekTimeline).
const BARS = [
  { left: "8%", width: "38%", tone: "bg-status-approved-foreground/55" },
  { left: "40%", width: "18%", tone: "bg-status-awaiting-foreground/55" },
  { left: "22%", width: "24%", tone: "bg-primary/55" },
  { left: "60%", width: "30%", tone: "bg-status-returned-foreground/55" },
];

const TO_DECIDE = [
  ["Teacher One", "Mon 9"],
  ["Assistant Two", "Tue 10"],
  ["Teacher Three", "Thu 12"],
];

/**
 * Прев'ю Overview на landing: нахилений «екран» із двома картками над ним, що повертається за курсором миші. На
 * телефоні (ADR 0008) — рівний «екран» без карток над ним і числа 2×2: нахил і картки виступали б за край.
 * Ілюстрація (`role="img"` з підписом), а не робочий інтерфейс: даних і дій у ньому немає.
 */
export function OverviewPreview() {
  const screen = useRef<HTMLDivElement>(null);

  function move(event: PointerEvent<HTMLDivElement>) {
    const node = screen.current;
    if (!node || event.pointerType !== "mouse" || window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    const box = event.currentTarget.getBoundingClientRect();
    const x = (event.clientX - box.left) / box.width - 0.5;
    const y = (event.clientY - box.top) / box.height - 0.5;
    node.style.transform = `rotateX(${(REST.x - 4 - y * FOLLOW.x).toFixed(2)}deg) rotateY(${(REST.y + 6 + x * FOLLOW.y).toFixed(2)}deg)`;
  }

  function reset() {
    if (screen.current) screen.current.style.transform = "";
  }

  return (
    <div onPointerMove={move} onPointerLeave={reset} className="perspective-[1400px]">
      <div
        ref={screen}
        role="img"
        aria-label="Preview of the Overview screen"
        className="relative transition-transform duration-(--duration-base) ease-out transform-3d md:rotate-x-12 md:-rotate-y-16"
      >
        <div className="flex h-100 flex-col overflow-hidden rounded-lg border border-border bg-card/85 backdrop-blur-md">
          <div className="relative h-30 border-b border-border bg-[radial-gradient(color-mix(in_oklch,var(--primary)_55%,transparent)_1.5px,transparent_1.6px)] bg-size-[14px_14px]">
            <span className="absolute bottom-4 left-5 text-lg font-semibold">Good morning, Manager</span>
          </div>
          {/* Тонкі межі між числами — проміжком 1 px на тлі border: так само і в рядку з чотирьох, і 2×2 на телефоні. */}
          <div className="grid grid-cols-2 gap-px border-b border-border bg-border sm:grid-cols-4">
            {STATS.map((stat) => (
              <span key={stat.label} className="flex flex-col bg-card px-4 py-3 text-[11px]">
                <span className="text-muted-foreground">{stat.label}</span>
                <span className={`font-mono text-lg font-semibold tabular-nums ${stat.accent ? "text-primary" : ""}`}>{stat.value}</span>
              </span>
            ))}
          </div>
          <div className="flex flex-1 flex-col gap-2.5 px-4 py-3.5">
            {BARS.map((bar) => (
              <span key={bar.left} className={`block h-3.5 rounded-xs ${bar.tone}`} style={{ marginLeft: bar.left, width: bar.width }} />
            ))}
          </div>
        </div>
        <div className="absolute top-37.5 -right-7 hidden w-57.5 md:flex translate-z-[70px] flex-col gap-2 rounded-lg border border-border bg-popover/90 p-3.5 shadow-lg backdrop-blur-md">
          <span className={KICKER}>To decide</span>
          {TO_DECIDE.map(([name, day]) => (
            <span key={name} className="flex justify-between text-[13px]">
              <span>{name}</span>
              <span className="text-muted-foreground tabular-nums">{day}</span>
            </span>
          ))}
        </div>
        <div className="absolute -bottom-7.5 -left-9 hidden w-55 md:flex translate-z-[110px] flex-col gap-1 rounded-lg border border-border bg-popover/90 p-3.5 shadow-lg backdrop-blur-md">
          <span className={KICKER}>Next leave</span>
          <span className="text-xl font-semibold text-primary tabular-nums">08:30–12:00</span>
          <span className="text-xs text-muted-foreground">Thu, 12 Nov 2026</span>
          <StatusBadge status="awaiting" />
        </div>
      </div>
    </div>
  );
}
