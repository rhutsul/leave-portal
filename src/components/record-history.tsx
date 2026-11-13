import { isRecordStatus, STATUS_DOT } from "@/components/ui/status-badge";
import { historyLine } from "@/lib/leave/decision";
import { cn } from "@/lib/utils";

export interface HistoryRow {
  created_at: string;
  action: string;
  actor_name: string | null;
  comment: string | null;
}

/** Рядки public.record_histories (кількох записів одним запитом) → історія кожного запису за його id. */
export function groupHistories(rows: readonly (HistoryRow & { record_id: number })[]): Map<number, HistoryRow[]> {
  const byRecord = new Map<number, HistoryRow[]>();
  for (const row of rows) byRecord.set(row.record_id, [...(byRecord.get(row.record_id) ?? []), row]);
  return byRecord;
}

/**
 * Історія запису з public.record_histories: дата й час до хвилини за Києвом, хто, що, коментар (AC-DECIDE-15) —
 * вертикальною лінією з крапками: подія звичайною вагою, час під нею дрібним приглушеним; крапка рішення — кольором
 * його статусу. null — історію не вдалося завантажити: показуємо це, а не порожній список.
 * `collapsed` — у рядку списку історія ховається під «History»; у деталях запису — відкритий список.
 */
export function RecordHistory({ history, collapsed = true }: { history: readonly HistoryRow[] | null; collapsed?: boolean }) {
  if (history === null) {
    return (
      <p role="alert" className="text-[13px] text-destructive">
        The history could not be loaded.
      </p>
    );
  }
  const list = (
    <ol className={cn("flex flex-col text-foreground", collapsed && "mt-2")}>
      {history.map((h, i) => {
        const line = historyLine({ createdAt: h.created_at, action: h.action, actorName: h.actor_name, comment: h.comment });
        const last = i === history.length - 1;
        return (
          <li key={i} className="grid grid-cols-[14px_1fr] gap-2.5">
            <span aria-hidden="true" className="flex flex-col items-center">
              <span className={cn("mt-1.5 size-2 shrink-0 rounded-full", isRecordStatus(h.action) ? STATUS_DOT[h.action] : "bg-muted-foreground")} />
              {!last && <span className="mt-1 w-px flex-1 bg-border" />}
            </span>
            <span className={cn("flex min-w-0 flex-col", !last && "pb-3.5")}>
              <span>
                {line.what} <span className="text-muted-foreground">· {line.who}</span>
              </span>
              <span className="text-xs text-muted-foreground tabular-nums">{line.at}</span>
              {/* У «Hours changed» коментар — попередні й нові години від бази, а не слова людини: без лапок. */}
              {h.comment && (
                <span className="mt-0.5 break-words whitespace-pre-line text-muted-foreground">
                  {h.action === "hours_changed" ? h.comment : `“${h.comment}”`}
                </span>
              )}
            </span>
          </li>
        );
      })}
    </ol>
  );
  if (!collapsed) return <div className="text-[13px]">{list}</div>;
  return (
    <details className="text-[13px]">
      <summary className="cursor-pointer font-medium text-primary">History</summary>
      {list}
    </details>
  );
}
