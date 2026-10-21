import { historyLine } from "@/lib/leave/decision";

export interface HistoryRow {
  created_at: string;
  action: string;
  actor_name: string | null;
  comment: string | null;
}

/**
 * Історія запису з public.record_history: дата й час до хвилини за Києвом, хто, що, коментар (AC-DECIDE-15).
 * null — історію не вдалося завантажити: показуємо це, а не порожній список.
 */
export function RecordHistory({ history }: { history: readonly HistoryRow[] | null }) {
  if (history === null) {
    return (
      <p role="alert" className="text-[13px] text-danger">
        The history could not be loaded.
      </p>
    );
  }
  return (
    <details className="text-[13px]">
      <summary className="cursor-pointer font-medium text-brand-strong">History</summary>
      <ol className="mt-2 flex flex-col gap-1 text-ink-2">
        {history.map((h, i) => {
          const line = historyLine({ createdAt: h.created_at, action: h.action, actorName: h.actor_name, comment: h.comment });
          return (
            <li key={i}>
              <span className="font-mono">{line.at}</span> · {line.who} · <span className="font-medium">{line.what}</span>
              {h.comment && <span className="block break-words whitespace-pre-line text-muted">“{h.comment}”</span>}
            </li>
          );
        })}
      </ol>
    </details>
  );
}
