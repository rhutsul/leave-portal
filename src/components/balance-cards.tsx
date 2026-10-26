import { Info } from "lucide-react";
import { BalanceCard } from "@/components/ui/balance-card";
import { formatDays, type Balances, type LimitedType } from "@/lib/leave/balance";
import { LEAVE_TYPES } from "@/lib/leave/request";

/**
 * Картки залишків: Sick і Personal — скільки лишилось і «X of Y used»; Unpaid і Family — лише використано (не
 * обмежені). `detailed` — на сторінці залишків під карткою ще з чого складається залишок. Під рядком — одна підказка,
 * що таке день (DESIGN.md, розділ 5).
 */
export function BalanceCards({ balances, detailed = false }: { balances: Balances; detailed?: boolean }) {
  return (
    <div className="flex flex-col gap-2.5">
      <div className="grid grid-cols-[repeat(auto-fit,minmax(200px,1fr))] gap-4">
        {(["sick", "personal"] as LimitedType[]).map((type) => {
          const b = balances.limited[type];
          return (
            <BalanceCard
              key={type}
              title={`${LEAVE_TYPES[type]} left`}
              value={formatDays(b.remaining)}
              used={formatDays(b.used)}
              total={formatDays(b.granted + b.carriedOver)}
            >
              {detailed && (
                <dl className="mt-1 grid grid-cols-[1fr_auto] gap-y-1 border-t border-border pt-2.5 text-[13px] tabular-nums">
                  <dt className="text-muted-foreground">Granted</dt>
                  <dd>{formatDays(b.granted)}</dd>
                  <dt className="text-muted-foreground">Carried over</dt>
                  <dd>{formatDays(b.carriedOver)}</dd>
                  <dt className="text-muted-foreground">Used</dt>
                  <dd>{formatDays(b.used)}</dd>
                </dl>
              )}
            </BalanceCard>
          );
        })}
        {(["unpaid", "family"] as const).map((type) => (
          <BalanceCard
            key={type}
            title={`${LEAVE_TYPES[type]} used`}
            value={formatDays(balances.unlimited[type])}
            caption="Counted, not limited."
          />
        ))}
      </div>
      <p className="flex items-center gap-1.5 text-xs text-muted-foreground">
        <Info className="size-3.5 shrink-0" aria-hidden="true" />
        {/* Без «your»: ці картки бачить і менеджер на залишках працівника. */}
        Balances are in working days: 1 day is all the employee&apos;s working hours on that date. Only approved records
        count.
      </p>
    </div>
  );
}
