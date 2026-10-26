import Link from "next/link";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { buttonVariants } from "@/components/ui/button";
import { cn } from "@/lib/utils";

/** "2026–27": коротко, як на сегменті. */
function shortYear(year: number) {
  return `${year}–${String(year + 1).slice(2)}`;
}

/**
 * Навчальні роки сегментами: ‹ 2025–26 | 2026–27 | 2027–28 ›. Показаний рік виділено; поки він поруч із поточним,
 * сегменти стоять навколо поточного, а далі — навколо показаного, щоб він завжди був видно; тоді поруч з'являється
 * «Current year». Поточний рік позначено крапкою. Стрілки — на рік назад і вперед, у межах `min`…`max`.
 * Назва посилання — видимий текст (2.5.3 WCAG), «School year» і «(current)» додано лише для зчитувача екрана.
 */
export function SchoolYearSwitcher({
  year,
  current,
  min,
  max,
  href,
}: {
  year: number;
  current: number;
  min: number;
  max: number;
  href: (year: number) => string;
}) {
  const center = Math.abs(year - current) <= 1 ? current : year;
  const years = [center - 1, center, center + 1].filter((y) => y >= min && y <= max);
  const arrow = buttonVariants({ variant: "ghost", size: "icon-sm" });

  return (
    <nav aria-label="School year" className="flex items-center gap-1">
      {!years.includes(current) && (
        <Link href={href(current)} className={buttonVariants({ variant: "ghost", size: "sm", className: "mr-1" })}>
          Current year
        </Link>
      )}
      {year > min ? (
        <Link href={href(year - 1)} aria-label="Previous school year" className={arrow}>
          <ChevronLeft />
        </Link>
      ) : (
        <span aria-hidden="true" className="size-8" />
      )}
      <div className="flex rounded-md bg-muted p-0.5">
        {years.map((y) => {
          const active = y === year;
          return (
            <Link
              key={y}
              href={href(y)}
              aria-current={active ? "page" : undefined}
              className={cn(
                "relative grid h-7 place-items-center rounded-sm px-3 text-[13px] font-medium tabular-nums transition-colors duration-(--duration-fast) ease-out",
                active ? "bg-card text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground",
              )}
            >
              <span>
                <span className="sr-only">School year </span>
                {shortYear(y)}
                {y === current && <span className="sr-only"> (current)</span>}
              </span>
              {y === current && (
                <span aria-hidden="true" className="absolute bottom-0.5 left-1/2 size-1 -translate-x-1/2 rounded-full bg-primary" />
              )}
            </Link>
          );
        })}
      </div>
      {year < max ? (
        <Link href={href(year + 1)} aria-label="Next school year" className={arrow}>
          <ChevronRight />
        </Link>
      ) : (
        <span aria-hidden="true" className="size-8" />
      )}
    </nav>
  );
}
