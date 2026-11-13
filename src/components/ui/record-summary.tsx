import { cn } from "@/lib/utils";

/** Що саме стосується дія: дата й години великим (години — primary), посада й тип нижче. Діалоги й панель рішення. */
export function RecordSummary({
  date,
  hours,
  meta,
  className,
}: {
  date: string;
  hours: string;
  meta?: string;
  className?: string;
}) {
  return (
    <div
      className={cn(
        "grid grid-cols-[auto_1fr] items-baseline gap-x-3.5 gap-y-0.5 rounded-md border border-border bg-muted px-3.5 py-3",
        className,
      )}
    >
      <span className="text-base font-semibold tabular-nums">{date}</span>
      <span className="text-base font-semibold tabular-nums text-primary">{hours}</span>
      {meta && <span className="col-span-2 text-[13px] text-muted-foreground">{meta}</span>}
    </div>
  );
}

/**
 * Запис у панелі рішення (v2): дата великим і тип відсутності, години — смугою на тлі робочого дня посади
 * («08:30–15:30 · Whole day», «7 h of 7 h»). `left` і `width` — частки дня (0–1); без меж і заливки — у панелі розділи
 * тримає відступ. У діалогах підтвердження лишається компактний `RecordSummary`.
 */
export function RecordDay({
  date,
  type,
  hours,
  total,
  left,
  width,
  className,
}: {
  date: string;
  /** Тип відсутності — `LeaveTypeTag` у варіанті `inline`. */
  type: React.ReactNode;
  /** "08:30–15:30 · Whole day". */
  hours: string;
  /** "7 h of 7 h". */
  total: string;
  left: number;
  width: number;
  className?: string;
}) {
  return (
    <div className={cn("flex flex-col gap-2.5", className)}>
      <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
        <span className="text-xl leading-[26px] font-semibold tabular-nums">{date}</span>
        <span className="text-[13px]">{type}</span>
      </div>
      <span aria-hidden="true" className="relative h-2.5 overflow-hidden rounded-full bg-muted">
        <span className="absolute inset-y-0 rounded-full bg-primary" style={{ left: `${left * 100}%`, width: `${width * 100}%` }} />
      </span>
      <div className="flex flex-wrap justify-between gap-x-3 text-[13px] tabular-nums">
        <span className="font-semibold text-primary">{hours}</span>
        <span className="text-muted-foreground">{total}</span>
      </div>
    </div>
  );
}
