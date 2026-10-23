import { historyLine } from "@/lib/leave/decision";

export interface HistoryRow {
  created_at: string;
  action: string;
  actor_name: string | null;
  comment: string | null;
}

/**
 * Історія запису з public.record_histories: дата й час до хвилини за Києвом, хто, що, коментар (AC-DECIDE-15).
 * null — історію не вдалося завантажити: показуємо це, а не порожній список.
 */
/** Рядки public.record_histories (кількох записів одним запитом) → історія кожного запису за його id. */
export function groupHistories(rows: readonly (HistoryRow & { record_id: number })[]): Map<number, HistoryRow[]> {
  const byRecord = new Map<number, HistoryRow[]>();
  for (const row of rows) byRecord.set(row.record_id, [...(byRecord.get(row.record_id) ?? []), row]);
  return byRecord;
}

export function RecordHistory({ history }: { history: readonly HistoryRow[] | null }) {
  if (history === null) {
    return (
      <p role="alert" className="text-[13px] text-destructive">
        The history could not be loaded.
      </p>
    );
  }
  return (
    <details className="text-[13px]">
      <summary className="cursor-pointer font-medium text-primary">History</summary>
      <ol className="mt-2 flex flex-col gap-1 text-foreground">
        {history.map((h, i) => {
          const line = historyLine({ createdAt: h.created_at, action: h.action, actorName: h.actor_name, comment: h.comment });
          return (
            <li key={i}>
              <span className="font-mono">{line.at}</span> · {line.who} · <span className="font-medium">{line.what}</span>
              {/* У «Hours changed» коментар — попередні й нові години від бази, а не слова людини: без лапок. */}
              {h.comment && (
                <span className="block break-words whitespace-pre-line text-muted-foreground">
                  {h.action === "hours_changed" ? h.comment : `“${h.comment}”`}
                </span>
              )}
            </li>
          );
        })}
      </ol>
    </details>
  );
}
