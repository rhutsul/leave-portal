"use client";

import { cn } from "@/lib/utils";
import { Tooltip, TooltipContent, TooltipTrigger } from "./tooltip";

export type UptimeDay = { date: string; state: "ok" | "issues" | "none"; label: string };

// Колір лише допомагає: стан дня завжди є словами в підказці й у назві для зчитувача екрана (DESIGN.md, розділ 7).
const FILL: Record<UptimeDay["state"], string> = {
  ok: "bg-status-approved-foreground/80 hover:bg-status-approved-foreground",
  issues: "bg-status-awaiting-foreground/90 hover:bg-status-awaiting-foreground",
  none: "bg-muted hover:bg-muted-foreground/30",
};

/**
 * Смуга доступності за N днів (сторінка /status, WS11): день — стовпчик кольору стану, найстаріший ліворуч. Наведення,
 * дотик чи фокус з клавіатури — підказка «22 Nov — no issues». Стовпчики виростають знизу з невеликим розкидом
 * (animate-rise, `--duration-slow`); prefers-reduced-motion вимикає все.
 */
export function UptimeBar({ days, className }: { days: UptimeDay[]; className?: string }) {
  return (
    <div className={cn("flex h-9 items-stretch gap-[2px] sm:gap-[3px]", className)} role="group" aria-label="Daily status, last 30 days">
      {days.map((day, i) => (
        <Tooltip key={day.date}>
          <TooltipTrigger
            render={
              <button
                type="button"
                aria-label={day.label}
                style={{ animationDelay: `${Math.min(i * 12, 360)}ms` }}
                className={cn(
                  "min-w-0 flex-1 animate-rise rounded-[3px] transition-colors duration-(--duration-fast) outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-card motion-reduce:animate-none",
                  FILL[day.state],
                )}
              />
            }
          />
          <TooltipContent>{day.label}</TooltipContent>
        </Tooltip>
      ))}
    </div>
  );
}
