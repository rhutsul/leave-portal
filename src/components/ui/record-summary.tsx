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
