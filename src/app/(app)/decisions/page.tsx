import Link from "next/link";
import { redirect } from "next/navigation";
import { Card } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { CheckCircleIcon, CloseIcon } from "@/components/ui/icons";
import { LeaveTypeTag } from "@/components/ui/leave-type-tag";
import { PageHeader } from "@/components/ui/page-header";
import { isRecordStatus, StatusBadge } from "@/components/ui/status-badge";
import { DECISION_MESSAGES, historyLine } from "@/lib/leave/decision";
import {
  isRelationship,
  positionLabel,
  RECORD_STATUSES,
  RELATIONSHIP_LABELS,
  type RecordStatus,
} from "@/lib/leave/request";
import { formatDuration, formatKyivDateTime, formatRange, weekdayName } from "@/lib/leave/time";
import { createClient } from "@/lib/supabase/server";
import type { Database } from "@/lib/supabase/database.types";
import { DecisionForm } from "./decision-form";

type DecisionRow = Database["public"]["Functions"]["decision_records"]["Returns"][number];
type HistoryRow = Database["public"]["Functions"]["record_history"]["Returns"][number];

const TABS = [
  { id: "awaiting", label: "Awaiting decision" },
  { id: "history", label: "History" },
] as const;

/** Статуси, з якими запис потрапляє в «History» менеджера: рішення ухвалено (AC-DECIDE-11). */
const DECIDED: RecordStatus[] = ["approved", "rejected", "returned"];

const first = (value: string | string[] | undefined) => (Array.isArray(value) ? value[0] : value);

// «Awaiting decision» і «History» менеджера (requirements/02-leave-decision.md). Записи й імена дає
// public.decision_records: менеджеру — лише записи посад, за які він відповідає (AC-DECIDE-01), адміністратору — усі.
export default async function DecisionsPage({ searchParams }: PageProps<"/decisions">) {
  const supabase = await createClient();
  const { data } = await supabase.auth.getClaims();
  const claims = data?.claims;
  if (!claims) redirect("/login");

  const { data: profile } = await supabase.from("profiles").select("role").eq("id", claims.sub).maybeSingle();
  if (profile?.role !== "manager" && profile?.role !== "admin") redirect("/");

  const params = await searchParams;
  const tab = first(params.tab) === "history" ? "history" : "awaiting";
  const decided = first(params.decided);

  const { data: rows, error } = await supabase.rpc("decision_records");
  const records = (rows ?? []).filter((r) => isRecordStatus(r.status));
  const awaiting = records.filter((r) => r.status === "awaiting");
  const history = records
    .filter((r) => DECIDED.includes(r.status as RecordStatus))
    .sort((a, b) => (b.decided_at ?? "").localeCompare(a.decided_at ?? ""));
  const shown = tab === "awaiting" ? awaiting : history;

  // Історія кожного показаного запису з іменами (public.record_history); збій — повідомлення в цьому записі.
  const histories = await Promise.all(
    shown.map(async (r) => {
      const { data: lines, error: historyError } = await supabase.rpc("record_history", { p_record_id: r.id });
      return historyError ? null : (lines ?? []);
    }),
  );

  return (
    <>
      <PageHeader
        title="Decisions"
        description="Records of the positions you are responsible for. Each record is decided separately."
      />

      {decided && isRecordStatus(decided) && (
        <div
          role="status"
          className="flex items-center gap-3 rounded-xl border border-success-line bg-success-soft px-4 py-3 text-success"
        >
          <CheckCircleIcon />
          <p className="flex-1">
            <span className="font-semibold">Decision saved:</span> {RECORD_STATUSES[decided]}.
          </p>
          <Link
            href={tab === "history" ? "/decisions?tab=history" : "/decisions"}
            aria-label="Dismiss"
            className="flex size-8 items-center justify-center rounded-lg hover:bg-success-line/40"
          >
            <CloseIcon />
          </Link>
        </div>
      )}

      <nav aria-label="Decision lists" className="flex flex-wrap gap-1 border-b border-line">
        {TABS.map((t) => {
          const active = t.id === tab;
          const count = t.id === "awaiting" ? awaiting.length : history.length;
          return (
            <Link
              key={t.id}
              href={t.id === "awaiting" ? "/decisions" : "/decisions?tab=history"}
              aria-current={active ? "page" : undefined}
              className={`-mb-px inline-flex items-center gap-2 border-b-2 px-3 py-2.5 ${
                active ? "border-brand font-semibold text-ink" : "border-transparent font-medium text-ink-2 hover:text-ink"
              }`}
            >
              {t.label}
              <span
                className={`rounded-full px-1.75 text-xs ${active ? "bg-brand-soft text-brand-strong" : "bg-subtle text-ink-2"}`}
              >
                {count}
                <span className="sr-only"> records</span>
              </span>
            </Link>
          );
        })}
      </nav>

      {error ? (
        <p role="alert" className="text-danger">
          The records could not be loaded. Please reload the page.
        </p>
      ) : shown.length === 0 ? (
        tab === "awaiting" ? (
          <EmptyState title="No records awaiting decision" text="New records of your positions will appear here." />
        ) : (
          <EmptyState title="No decisions yet" text="Records you or another manager decided will appear here." />
        )
      ) : (
        <div className="flex flex-col gap-4">
          {shown.map((r, i) => (
            <RecordCard key={r.id} record={r} history={histories[i]} />
          ))}
        </div>
      )}
    </>
  );
}

function RecordCard({ record: r, history }: { record: DecisionRow; history: HistoryRow[] | null }) {
  const headingId = `record-${r.id}`;
  const status = r.status as RecordStatus;
  const relationship = r.relationship && isRelationship(r.relationship) ? RELATIONSHIP_LABELS[r.relationship] : null;

  return (
    <Card as="article" aria-labelledby={headingId} className="overflow-hidden">
      <header className="flex flex-wrap items-center gap-3 border-b border-line bg-surface-muted px-5 py-3.5">
        <h2 id={headingId} className="font-semibold">
          {r.employee_name || r.employee_email}
          <span className="sr-only">
            , {r.date}, {RECORD_STATUSES[status]}
          </span>
        </h2>
        <span className="text-muted">{r.employee_email}</span>
        <LeaveTypeTag type={r.leave_type} />
        {relationship && <span className="text-xs text-muted">Relationship: {relationship}</span>}
        {status !== "awaiting" && (
          <span className="ml-auto">
            <StatusBadge status={status} />
          </span>
        )}
      </header>

      <div className="grid gap-5 px-5 py-4 md:grid-cols-[1fr_1.4fr]">
        <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-2">
          <dt className="text-muted">Date</dt>
          <dd>
            <span className="font-medium">{r.date}</span> <span className="text-muted">{weekdayName(r.date)}</span>
          </dd>
          <dt className="text-muted">Hours</dt>
          <dd>
            <span className="font-mono text-[13px]">{formatRange(r.start_min, r.end_min)}</span>{" "}
            <span className="text-muted">· {formatDuration(r.minutes)}</span>
          </dd>
          <dt className="text-muted">Position</dt>
          <dd>{positionLabel(r.division_name, r.position_title)}</dd>
          <dt className="text-muted">Employee comment</dt>
          <dd className="break-words whitespace-pre-line">{r.employee_comment || <span className="text-muted">—</span>}</dd>
          {r.manager_comment && (
            <>
              <dt className="text-muted">Manager comment</dt>
              <dd className="break-words whitespace-pre-line">{r.manager_comment}</dd>
            </>
          )}
          {r.decided_at && (
            <>
              <dt className="text-muted">Decided</dt>
              <dd>
                {formatKyivDateTime(r.decided_at)} · {r.decided_by_name || "Unknown user"}
              </dd>
            </>
          )}
        </dl>

        <div className="flex flex-col gap-3">
          {status === "awaiting" &&
            (r.can_decide ? (
              <DecisionForm recordId={r.id} />
            ) : (
              <p className="rounded-lg border border-line bg-subtle px-3 py-2 text-ink-2">{DECISION_MESSAGES.ownRecord}</p>
            ))}
          <RecordHistory history={history} />
        </div>
      </div>
    </Card>
  );
}

/** Історія запису: дата й час до хвилини за Києвом, хто, що (AC-DECIDE-15). */
function RecordHistory({ history }: { history: HistoryRow[] | null }) {
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
