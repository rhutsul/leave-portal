import { Card } from "@/components/ui/legacy-card";
import { formatDays, type Balances, type LimitedType } from "@/lib/leave/balance";
import { LEAVE_TYPES } from "@/lib/leave/request";

/** Картки залишків за макетом: Sick і Personal — залишок і з чого він складається; Unpaid і Family — лише використано. */
export function BalanceCards({ balances }: { balances: Balances }) {
  return (
    <div className="grid grid-cols-4 gap-3.5">
      {(["sick", "personal"] as LimitedType[]).map((type) => {
        const b = balances.limited[type];
        const total = b.granted + b.carriedOver;
        const usedPct = total > 0 ? Math.min(100, Math.max(0, (b.used / total) * 100)) : 0;
        return (
          <Card key={type} as="article" aria-label={LEAVE_TYPES[type]} className="flex flex-col gap-2.5 p-4.5">
            <h3 className="font-semibold">{LEAVE_TYPES[type]}</h3>
            <p className="text-[28px] font-semibold tracking-tight">
              {formatDays(b.remaining)} <span className="text-[13px] font-normal text-muted-foreground">remaining</span>
            </p>
            <div aria-hidden="true" className="h-1.5 rounded-full bg-muted">
              <div className="h-1.5 rounded-full bg-primary" style={{ width: `${usedPct}%` }} />
            </div>
            <dl className="grid grid-cols-[1fr_auto] gap-y-1 text-[13px] text-foreground">
              <dt>Granted</dt>
              <dd className="font-mono">{formatDays(b.granted)}</dd>
              <dt>Carried over</dt>
              <dd className="font-mono">{formatDays(b.carriedOver)}</dd>
              <dt>Used</dt>
              <dd className="font-mono">{formatDays(b.used)}</dd>
            </dl>
          </Card>
        );
      })}
      {(["unpaid", "family"] as const).map((type) => (
        <Card key={type} as="article" aria-label={LEAVE_TYPES[type]} className="flex flex-col gap-2.5 p-4.5">
          <h3 className="font-semibold">{LEAVE_TYPES[type]}</h3>
          <p className="text-[28px] font-semibold tracking-tight">
            {formatDays(balances.unlimited[type])} <span className="text-[13px] font-normal text-muted-foreground">used</span>
          </p>
          <p className="text-[13px] text-muted-foreground">Counted, not limited.</p>
        </Card>
      ))}
    </div>
  );
}
