import { CLOSED_HATCH } from "@/components/ui/calendar-day";
import { dayLabel, type GridDay, type GridMonth } from "@/lib/leave/calendar-grid";
import { WEEKDAY_SHORT } from "@/lib/leave/time";
import { cn } from "@/lib/utils";

/**
 * Сітка шкільного календаря (DESIGN.md, розділи 5–6): місяць з понеділка, закритий цілий день — штриховка й
 * перекреслення, як у календарі «New request»; скорочений день — рамка й штриховка нижньої половини; сьогодні — кільце
 * `primary`. Сітка — лише картинка для очей, як `DotMonth`: `aria-hidden` і без зупинок Tab, бо ті самі закриття (і
 * дії адміністратора) — у списку поруч, і зчитувач не читатиме їх двічі. Наведення мишею на закритий день показує
 * дату й назву закриття (`title`).
 */

/** Скорочений день: штриховка лише нижньої половини — школа закрита з певної години до кінця дня. */
const EARLY_HATCH = `${CLOSED_HATCH} bg-no-repeat bg-bottom bg-[length:100%_50%]`;

const KIND: Record<GridDay["kind"], string> = {
  open: "text-foreground",
  closed: `text-muted-foreground line-through ${CLOSED_HATCH}`,
  early: `text-foreground border border-input ${EARLY_HATCH}`,
};

function dayClass(day: GridDay, size: "sm" | "md") {
  const overlap = day.selected && day.closure;
  return cn(
    "flex items-center justify-center rounded-sm tabular-nums",
    size === "sm" ? "h-6 text-xs md:h-7" : "h-8 text-sm font-medium",
    !day.selected && KIND[day.kind],
    day.selected && !day.closure && "bg-primary text-primary-foreground",
    // Вибрано у формі, але день уже закрито: штриховка лишається, межа й число — destructive (база відхилить, AC-CAL-11).
    overlap && cn(KIND[day.kind], "font-semibold text-destructive ring-2 ring-destructive ring-inset"),
    day.today && !day.selected && "font-semibold text-primary ring-2 ring-primary ring-inset",
    day.closure &&
      "cursor-default transition-shadow duration-(--duration-fast) ease-out hover:ring-1 hover:ring-ring hover:ring-inset",
  );
}

function Day({ day, size }: { day: GridDay; size: "sm" | "md" }) {
  return (
    <span
      title={day.closure ? dayLabel(day) : undefined}
      data-day={day.kind}
      data-today={day.today || undefined}
      data-selected={day.selected || undefined}
      className={dayClass(day, size)}
    >
      {day.day}
    </span>
  );
}

/**
 * Один місяць сітки: назва, дні тижня з понеділка і дні. `size="md"` — більші клітинки для перегляду в формі.
 * `aria-hidden`: дати й закриття є текстом поруч (список закриттів, підсумок форми).
 */
export function CalendarMonth({
  month,
  size = "sm",
  className,
}: {
  month: GridMonth;
  size?: "sm" | "md";
  className?: string;
}) {
  return (
    <div aria-hidden="true" data-month={month.month} className={cn("flex min-w-0 flex-col gap-1.5", className)}>
      <div className="text-sm font-semibold">{month.label}</div>
      <div className={cn("grid grid-cols-7", size === "sm" ? "gap-px md:gap-0.5" : "gap-1")}>
        {WEEKDAY_SHORT.map((w) => (
          <div key={w} className="py-0.5 text-center text-xs text-muted-foreground">
            {size === "sm" ? w.slice(0, 2) : w}
          </div>
        ))}
        {month.cells.map((day, i) => (day ? <Day key={day.date} day={day} size={size} /> : <span key={`blank-${i}`} />))}
      </div>
    </div>
  );
}

/**
 * 12 місяців навчального року. Колонок стільки, скільки вміщається: на телефоні (від 360 px) — дві, від `md` —
 * місяць не вужчий за 10.5rem (ADR 0008: та сама сторінка, змінюється лише розкладка).
 */
export function SchoolYearCalendar({ months, className }: { months: GridMonth[]; className?: string }) {
  return (
    <div
      data-testid="school-year-calendar"
      className={cn(
        "grid grid-cols-2 gap-x-4 gap-y-5 md:grid-cols-[repeat(auto-fill,minmax(10.5rem,1fr))] md:gap-x-6",
        className,
      )}
    >
      {months.map((m) => (
        <CalendarMonth key={m.month} month={m} />
      ))}
    </div>
  );
}

type LegendItem = "closed" | "early" | "today" | "selected" | "overlap";

const SWATCH: Record<LegendItem, { className: string; label: string }> = {
  closed: { className: CLOSED_HATCH, label: "Closed all day" },
  early: { className: cn("border border-input", EARLY_HATCH), label: "Early dismissal" },
  today: { className: "ring-2 ring-primary ring-inset", label: "Today" },
  selected: { className: "bg-primary", label: "New closure" },
  overlap: { className: cn(CLOSED_HATCH, "ring-2 ring-destructive ring-inset"), label: "Already closed" },
};

/** Легенда сітки; `items` — які позначки показувати (у перегляді форми — ще вибрані дати й перетин). */
export function SchoolCalendarLegend({
  items = ["closed", "early", "today"],
  className,
}: {
  items?: LegendItem[];
  className?: string;
}) {
  return (
    <ul className={cn("flex flex-wrap gap-x-4.5 gap-y-2 text-xs text-muted-foreground", className)} aria-label="Calendar legend">
      {items.map((s) => (
        <li key={s} className="inline-flex items-center gap-1.5">
          <span aria-hidden="true" className={cn("size-3.5 rounded-sm", SWATCH[s].className)} />
          {SWATCH[s].label}
        </li>
      ))}
    </ul>
  );
}

/** Позначка закриття в списку поруч із сіткою — та сама, що в сітці (цілий день чи скорочений). */
export function ClosureSwatch({ early, className }: { early: boolean; className?: string }) {
  return (
    <span
      aria-hidden="true"
      className={cn("inline-block size-3.5 shrink-0 rounded-sm", early ? SWATCH.early.className : SWATCH.closed.className, className)}
    />
  );
}
