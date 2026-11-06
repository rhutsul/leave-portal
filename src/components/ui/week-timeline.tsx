import type { BlockingStatus } from "@/lib/leave/overview";
import { RECORD_STATUSES } from "@/lib/leave/request";
import { cn } from "@/lib/utils";

export interface WeekTimelineDay {
  date: string;
  /** "Mon 2". */
  label: string;
  /** Повна дата для зчитувача екрана: "Mon, 2 Nov 2026". */
  long: string;
  today: boolean;
}

export interface WeekTimelineBar {
  col: number;
  status: BlockingStatus;
  hours: string;
}

export interface WeekTimelineRow {
  key: string;
  name: string;
  sub: string;
  bars: readonly WeekTimelineBar[];
}

// Смуга — колір статусу з прозорістю; «Awaiting decision» — пунктирна межа (DESIGN.md, `WeekTimeline`).
const BAR: Record<BlockingStatus, string> = {
  approved: "border-status-approved-foreground/70 bg-status-approved-foreground/20",
  returned: "border-status-returned-foreground/70 bg-status-returned-foreground/20",
  awaiting: "border-dashed border-status-awaiting-foreground/70 bg-status-awaiting-foreground/15",
};

const GRID = "grid grid-cols-[170px_repeat(10,minmax(0,1fr))]";

/**
 * Діаграма на два робочі тижні (ADR 0007): рядок — людина (менеджер) або посада (працівник), смуга — записи дня
 * кольором статусу; сьогодні — колонка `highlight`. Статус і дата кожної смуги — словами для зчитувача екрана й у
 * підказці; ширше за картку — прокрутка всередині.
 */
export function WeekTimeline({
  days,
  rows,
  empty,
  label,
}: {
  days: readonly WeekTimelineDay[];
  rows: readonly WeekTimelineRow[];
  empty: string;
  label: string;
}) {
  const today = days.findIndex((d) => d.today);
  return (
    <div className="overflow-x-auto rounded-lg border border-border bg-card">
      <div role="table" aria-label={label} className="min-w-[640px]">
        <div role="row" className={cn(GRID, "border-b border-border")}>
          {/* Перша колонка — імена: заголовок лише для зчитувача, але сама клітинка лишається в сітці. */}
          <span role="columnheader">
            <span className="sr-only">Who</span>
          </span>
          {days.map((d, i) => (
            <span
              key={d.date}
              role="columnheader"
              aria-label={d.long}
              className={cn(
                "py-2 text-center font-mono text-[11px] text-muted-foreground",
                i === 5 && "border-l border-border",
                d.today && "bg-highlight/10 font-medium text-foreground",
              )}
            >
              {d.label}
            </span>
          ))}
        </div>
        {rows.length === 0 ? (
          <p className="px-4 py-8 text-center text-[13px] text-muted-foreground">{empty}</p>
        ) : (
          rows.map((row) => (
            <div key={row.key} role="row" className={cn(GRID, "min-h-12 border-b border-border last:border-b-0")}>
              <span role="rowheader" className="row-start-1 flex min-w-0 flex-col justify-center px-3 py-1.5">
                <span className="truncate text-[13px] font-medium">{row.name}</span>
                <span className="truncate text-[11px] text-muted-foreground">{row.sub}</span>
              </span>
              {today >= 0 && <span aria-hidden="true" className="row-start-1 bg-highlight/10" style={{ gridColumn: today + 2 }} />}
              {row.bars.map((b) => (
                <span
                  key={b.col}
                  role="cell"
                  title={`${days[b.col].long} · ${b.hours} · ${RECORD_STATUSES[b.status]}`}
                  className={cn(
                    "row-start-1 mx-0.5 flex h-7 min-w-0 items-center self-center rounded-[5px] border px-1.5 text-[11px] tabular-nums",
                    BAR[b.status],
                  )}
                  style={{ gridColumn: b.col + 2 }}
                >
                  <span className="sr-only">
                    {days[b.col].long}, {RECORD_STATUSES[b.status]}:{" "}
                  </span>
                  <span className="truncate">{b.hours}</span>
                </span>
              ))}
            </div>
          ))
        )}
      </div>
    </div>
  );
}
