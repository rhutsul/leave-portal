import Link from "next/link";
import { redirect } from "next/navigation";
import { groupHistories, type HistoryRow, RecordHistory } from "@/components/record-history";
import { Card } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { AlertIcon, CheckCircleIcon, CloseIcon } from "@/components/ui/icons";
import { LeaveTypeTag } from "@/components/ui/leave-type-tag";
import { PageHeader } from "@/components/ui/page-header";
import { isRecordStatus, StatusBadge } from "@/components/ui/status-badge";
import { daysToHundredths, formatSplit, isLimitedType, managerWarning } from "@/lib/leave/balance";
import { DECISION_MESSAGES } from "@/lib/leave/decision";
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

const TABS = [
  { id: "awaiting", label: "Awaiting decision" },
  { id: "history", label: "History" },
] as const;

/** Статуси, з якими запис потрапляє в «History» менеджера: рішення ухвалено (AC-DECIDE-11). */
const DECIDED: RecordStatus[] = ["approved", "rejected", "returned"];

const first = (value: string | string[] | undefined) => (Array.isArray(value) ? value[0] : value);

/** Попередження про перевищення залишку: null — у межах залишку або тип без ліміту; "error" — не вдалося порахувати. */
type BalanceWarning = string | null | "error";

/** Відповідь public.decision_balance → текст попередження PM (AC-BALANCE-09, AC-BALANCE-14). */
function warningFrom(raw: unknown): string | null {
  const value = raw as { leave_type?: string; share?: number | string; remaining?: number | string } | null;
  if (!value || !value.leave_type || !isLimitedType(value.leave_type)) return null;
  return managerWarning(value.leave_type, daysToHundredths(value.share ?? 0), daysToHundredths(value.remaining ?? 0));
}

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

  // Історія показаних записів з іменами — одним запитом (public.record_histories); збій — повідомлення в записах.
  // Для записів, які користувач може вирішити, — залишок на цей момент (public.decision_balance): той самий, за яким
  // decide_leave_record порахує розподіл, з урахуванням погоджень після відкриття сторінки (AC-BALANCE-14).
  const [historyResult, warnings] = await Promise.all([
    shown.length > 0
      ? supabase.rpc("record_histories", { p_record_ids: shown.map((r) => r.id) })
      : Promise.resolve({ data: [], error: null }),
    Promise.all(
      shown.map(async (r): Promise<BalanceWarning> => {
        if (r.status !== "awaiting" || !r.can_decide || !isLimitedType(r.leave_type)) return null;
        const { data: balance, error: balanceError } = await supabase.rpc("decision_balance", { p_record_id: r.id });
        return balanceError ? "error" : warningFrom(balance);
      }),
    ),
  ]);
  const histories = historyResult.error ? null : groupHistories(historyResult.data ?? []);

  return (
    <>
      <PageHeader
        title="Decisions"
        description={
          profile.role === "admin"
            ? "All records awaiting a decision, of every position. Each record is decided separately."
            : "Records of the positions you are responsible for. Each record is decided separately."
        }
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
            <RecordCard key={r.id} record={r} history={histories ? (histories.get(r.id) ?? []) : null} warning={warnings[i]} />
          ))}
        </div>
      )}
    </>
  );
}

function RecordCard({
  record: r,
  history,
  warning,
}: {
  record: DecisionRow;
  history: HistoryRow[] | null;
  warning: BalanceWarning;
}) {
  const headingId = `record-${r.id}`;
  const status = r.status as RecordStatus;
  const relationship = r.relationship && isRelationship(r.relationship) ? RELATIONSHIP_LABELS[r.relationship] : null;
  const unpaid = r.unpaid_days == null ? 0 : daysToHundredths(r.unpaid_days);
  const split =
    status === "approved" && unpaid > 0 && isLimitedType(r.leave_type)
      ? formatSplit(r.leave_type, daysToHundredths(r.paid_days ?? 0), unpaid)
      : null;

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
          {split && (
            <>
              <dt className="text-muted">Split</dt>
              <dd>{split}</dd>
            </>
          )}
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
          {warning === "error" && (
            <p role="alert" className="text-[13px] text-danger">
              The balance could not be checked. Please reload the page before approving.
            </p>
          )}
          {warning && warning !== "error" && (
            <p
              role="note"
              className="flex items-start gap-2 rounded-lg border border-awaiting-dot/30 bg-awaiting-soft px-3 py-2 text-awaiting"
            >
              <span className="mt-0.5 shrink-0">
                <AlertIcon />
              </span>
              {warning}
            </p>
          )}
          {status === "awaiting" &&
            (r.can_decide ? (
              <DecisionForm recordId={r.id} split={warning !== null && warning !== "error"} />
            ) : (
              <p className="rounded-lg border border-line bg-subtle px-3 py-2 text-ink-2">{DECISION_MESSAGES.ownRecord}</p>
            ))}
          <RecordHistory history={history} />
        </div>
      </div>
    </Card>
  );
}
