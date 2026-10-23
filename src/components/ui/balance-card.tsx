import { cn } from "@/lib/utils";
import { Card } from "./card";

/**
 * Залишок одного типу відсутності в днях: «22.00 days», смуга використаного й «X of Y used».
 * Що означає день, пояснює одна підказка під рядком карток, а не кожна картка (DESIGN.md, розділ 5).
 */
export function BalanceCard({
  title,
  remaining,
  used,
  total,
  className,
}: {
  title: string;
  remaining: string;
  /** Використано й доступно разом (призначене + перенесене); без них — картка лише з числом. */
  used?: string;
  total?: string;
  className?: string;
}) {
  const share = used && total && Number(total) > 0 ? Math.min(1, Number(used) / Number(total)) : null;
  return (
    <Card className={cn("gap-2.5 px-5 py-4", className)}>
      <span className="text-[13px] text-muted-foreground">{title}</span>
      <span className="animate-rise text-[26px] leading-[30px] font-semibold tracking-tight tabular-nums">
        {remaining}
        <span className="ml-1.5 text-sm font-medium tracking-normal text-muted-foreground">days</span>
      </span>
      {share !== null && (
        <>
          <span aria-hidden="true" className="h-1.5 overflow-hidden rounded-full bg-muted">
            <span
              className="block h-full origin-left animate-grow rounded-full bg-primary"
              style={{ width: `${share * 100}%` }}
            />
          </span>
          <span className="text-xs text-muted-foreground tabular-nums">
            {used} of {total} used
          </span>
        </>
      )}
    </Card>
  );
}
