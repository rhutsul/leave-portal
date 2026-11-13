import { ChevronRight } from "lucide-react";
import { cn } from "@/lib/utils";

/**
 * Залишок до й після погодження запису (панель рішення v2): «15.36 → 14.36 days after approval» і тонка двоколірна
 * смуга — світла частина `primary` показує залишок зараз, суцільна — після погодження. Числа — уже відформатовані дні
 * (`formatDays`); `bar` — частки нарахованого за рік (0–1), без нього смуги немає.
 */
export function BalanceShift({
  label,
  before,
  after,
  bar,
  note,
  className,
}: {
  /** "Sick leave balance". */
  label: string;
  before: string;
  after: string;
  bar: { before: number; after: number } | null;
  /** "this record 1.00 day · 2.64 of 18.00 used". */
  note: string;
  className?: string;
}) {
  return (
    <div className={cn("flex flex-col gap-2", className)}>
      <span className="font-mono text-[11px] tracking-wide text-muted-foreground uppercase">{label}</span>
      <p className="flex flex-wrap items-baseline gap-x-2.5 tabular-nums">
        <span className="text-lg font-medium text-muted-foreground">{before}</span>
        <ChevronRight className="size-3.5 self-center text-muted-foreground" aria-hidden="true" />
        <span className="sr-only">to</span>
        <span className="text-[26px] leading-[30px] font-semibold">{after}</span>
        <span className="text-[13px] text-muted-foreground">days after approval</span>
      </p>
      {bar && (
        <span aria-hidden="true" className="relative h-1 overflow-hidden rounded-full bg-muted">
          <span className="absolute inset-y-0 left-0 bg-primary/35" style={{ width: `${bar.before * 100}%` }} />
          <span className="absolute inset-y-0 left-0 bg-primary" style={{ width: `${bar.after * 100}%` }} />
        </span>
      )}
      <span className="text-xs text-muted-foreground tabular-nums">{note}</span>
    </div>
  );
}
