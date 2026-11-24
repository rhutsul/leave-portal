import Link from "next/link";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { buttonVariants } from "@/components/ui/button";
import { addMonths, formatMonth } from "@/lib/leave/time";

/**
 * Місяць посиланнями: ‹ November 2026 › і «This month», коли показано інший. Стрілки — «Previous month» / «Next
 * month» у межах `min`…`max` ("YYYY-MM"); за межею — порожнє місце того самого розміру, щоб рядок не стрибав.
 * Перехід — звичайне посилання: працює без JavaScript, «Назад» повертає попередній місяць.
 */
export function MonthSwitcher({
  month,
  current,
  min,
  max,
  href,
}: {
  month: string;
  current: string;
  min: string;
  max: string;
  href: (month: string) => string;
}) {
  const arrow = buttonVariants({ variant: "ghost", size: "icon-sm" });
  const previous = addMonths(month, -1);
  const next = addMonths(month, 1);

  return (
    <nav aria-label="Month" className="flex items-center gap-1">
      {month !== current && (
        <Link href={href(current)} className={buttonVariants({ variant: "ghost", size: "sm", className: "mr-1" })}>
          This month
        </Link>
      )}
      {previous >= min ? (
        <Link href={href(previous)} aria-label="Previous month" className={arrow}>
          <ChevronLeft />
        </Link>
      ) : (
        <span aria-hidden="true" className="size-8" />
      )}
      <span aria-live="polite" className="min-w-32 text-center text-[13px] font-medium tabular-nums">
        {formatMonth(month)}
      </span>
      {next <= max ? (
        <Link href={href(next)} aria-label="Next month" className={arrow}>
          <ChevronRight />
        </Link>
      ) : (
        <span aria-hidden="true" className="size-8" />
      )}
    </nav>
  );
}
