import { cn } from "@/lib/utils";

/**
 * Години запису на тлі робочого дня посади: смуга 56 px, заповнена частина — запис, поруч — час або «Whole day».
 * Хвилини — від півночі; день — межі розкладу посади на цю дату.
 */
export function HoursBar({
  start,
  end,
  dayStart,
  dayEnd,
  label,
  className,
}: {
  start: number;
  end: number;
  dayStart: number;
  dayEnd: number;
  label: string;
  className?: string;
}) {
  const span = Math.max(1, dayEnd - dayStart);
  const clamp = (v: number) => Math.min(1, Math.max(0, v));
  const left = clamp((start - dayStart) / span);
  const width = Math.max(0, clamp((end - dayStart) / span) - left);
  return (
    <span className={cn("inline-flex items-center gap-2.5 whitespace-nowrap tabular-nums", className)}>
      <span aria-hidden="true" className="relative h-1.5 w-14 overflow-hidden rounded-full bg-muted ring-1 ring-border ring-inset">
        <span
          className="absolute inset-y-0 rounded-full bg-primary"
          style={{ left: `${left * 100}%`, width: `${width * 100}%` }}
        />
      </span>
      {label}
    </span>
  );
}
