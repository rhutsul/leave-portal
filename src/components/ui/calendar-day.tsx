import type { ButtonHTMLAttributes } from "react";
import { cn } from "@/lib/utils";

/**
 * Стан дня в календарі заявки (DESIGN.md, розділ 6):
 * selected — вибрано; record — уже є запис; closed — закрито школою; off — немає робочих годин; free — можна вибрати.
 */
export type DayState = "free" | "selected" | "record" | "closed" | "off";

const DAY: Record<DayState, string> = {
  free: "text-foreground hover:bg-accent hover:text-accent-foreground",
  selected: "bg-primary text-primary-foreground hover:bg-primary/90",
  record: "bg-status-awaiting text-status-awaiting-foreground hover:border-status-awaiting-foreground",
  closed:
    "cursor-not-allowed text-muted-foreground line-through bg-[repeating-linear-gradient(135deg,var(--muted)_0_3px,var(--border)_3px_5px)]",
  off: "cursor-not-allowed text-muted-foreground/60",
};

export function CalendarDay({
  day,
  state,
  className,
  ...props
}: { day: number; state: DayState } & Omit<ButtonHTMLAttributes<HTMLButtonElement>, "children">) {
  const unavailable = state === "closed" || state === "off";
  return (
    <button
      type="button"
      {...props}
      aria-pressed={state === "selected"}
      disabled={unavailable || props.disabled}
      className={cn(
        "h-9 rounded-md border border-transparent text-[13px] font-medium tabular-nums transition-colors duration-(--duration-fast) ease-out",
        DAY[state],
        className,
      )}
    >
      {day}
    </button>
  );
}

const SWATCH: Record<Exclude<DayState, "free">, { className: string; label: string }> = {
  selected: { className: "bg-primary", label: "Selected" },
  record: { className: "bg-status-awaiting ring-1 ring-inset ring-status-awaiting-foreground", label: "You already have a record" },
  closed: {
    className: "bg-[repeating-linear-gradient(135deg,var(--muted)_0_3px,var(--border)_3px_5px)]",
    label: "Closed by the school",
  },
  off: { className: "bg-muted", label: "No working hours" },
};

/** Легенда станів під календарем; `states` — які з них показувати (наприклад, без closed до зрізу календаря). */
export function CalendarLegend({
  states = ["selected", "record", "closed", "off"],
  className,
}: {
  states?: Exclude<DayState, "free">[];
  className?: string;
}) {
  return (
    <ul className={cn("flex flex-wrap gap-x-4.5 gap-y-2 text-xs text-muted-foreground", className)} aria-label="Calendar legend">
      {states.map((s) => (
        <li key={s} className="inline-flex items-center gap-1.5">
          <span aria-hidden="true" className={cn("size-3.5 rounded-[4px]", SWATCH[s].className)} />
          {SWATCH[s].label}
        </li>
      ))}
    </ul>
  );
}
