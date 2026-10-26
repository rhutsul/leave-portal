import type { ButtonHTMLAttributes } from "react";
import { cn } from "@/lib/utils";

/**
 * Стан дня в календарі заявки (DESIGN.md, розділ 6):
 * selected — вибрано; record — уже є запис; closed — закрито школою (не вибирається); off — немає робочих годин;
 * free — робочий день, можна вибрати (тонка рамка, щоб відрізнявся від off). День off лишається кнопкою: натискання показує повідомлення з AC-LEAVE-06, а не мовчить.
 */
export type DayState = "free" | "selected" | "record" | "closed" | "off";

const DAY: Record<DayState, string> = {
  free: "border-border text-foreground hover:bg-accent hover:text-accent-foreground",
  selected: "bg-primary text-primary-foreground hover:bg-primary/90",
  record: "bg-status-awaiting text-status-awaiting-foreground hover:border-status-awaiting-foreground",
  closed:
    "cursor-not-allowed text-muted-foreground line-through bg-[repeating-linear-gradient(135deg,var(--muted)_0_3px,var(--border)_3px_5px)]",
  // Кнопка, а не disabled: число має контраст muted-foreground (≥ 4.5:1); від робочого дня відрізняє відсутність рамки.
  off: "text-muted-foreground hover:bg-muted",
};

export function CalendarDay({
  day,
  state,
  className,
  ...props
}: { day: number; state: DayState } & Omit<ButtonHTMLAttributes<HTMLButtonElement>, "children">) {
  const unavailable = state === "closed";
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

const SWATCH: Record<DayState, { className: string; label: string }> = {
  free: { className: "border border-border bg-card", label: "Working day" },
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
  states = ["free", "selected", "record", "closed", "off"],
  className,
}: {
  states?: DayState[];
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
