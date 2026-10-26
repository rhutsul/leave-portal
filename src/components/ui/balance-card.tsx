import type { ReactNode } from "react";
import { cn } from "@/lib/utils";
import { Card } from "./card";

/**
 * Залишок чи використане одного типу відсутності в днях: «22.00 days», для Sick і Personal — смуга використаного й
 * «X of Y used». Що означає день, пояснює одна підказка під рядком карток, а не кожна картка (DESIGN.md, розділ 5).
 * `children` — подробиці під карткою (на сторінці залишків: призначено, перенесено, використано).
 */
export function BalanceCard({
  title,
  value,
  used,
  total,
  caption,
  children,
  className,
}: {
  title: string;
  value: string;
  /** Використано й доступно разом (призначене + перенесене); без них — картка без смуги. */
  used?: string;
  total?: string;
  caption?: string;
  children?: ReactNode;
  className?: string;
}) {
  const share = used && total && Number(total) > 0 ? Math.min(1, Math.max(0, Number(used) / Number(total))) : null;
  return (
    <Card role="group" aria-label={title} className={cn("gap-2.5 px-5 py-4", className)}>
      <span className="text-[13px] text-muted-foreground">{title}</span>
      <span className="animate-rise text-[26px] leading-[30px] font-semibold tracking-tight tabular-nums">
        {value}
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
      {caption && <span className="text-xs text-muted-foreground">{caption}</span>}
      {children}
    </Card>
  );
}
