import Link from "next/link";
import { redirect } from "next/navigation";
import { ChevronRight, CircleAlert, CircleCheck, ClipboardCheck, Info, ShieldX, TriangleAlert, X } from "lucide-react";
import { groupHistories, type HistoryRow, RecordHistory } from "@/components/record-history";
import { Alert, AlertAction, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { buttonVariants } from "@/components/ui/button";
import { Card, CardAction, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { LeaveTypeTag } from "@/components/ui/leave-type-tag";
import { PageHeader } from "@/components/ui/page-header";
import { RecordSummary } from "@/components/ui/record-summary";
import { Separator } from "@/components/ui/separator";
import { isRecordStatus, StatusBadge } from "@/components/ui/status-badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import {
  daysToHundredths,
  formatDays,
  formatSplit,
  isLimitedType,
  managerWarning,
} from "@/lib/leave/balance";
import { DECISION_MESSAGES, reviewedHours } from "@/lib/leave/decision";
import {
  isLeaveType,
  isRelationship,
  LEAVE_TYPES,
  positionLabel,
  RECORD_STATUSES,
  RELATIONSHIP_LABELS,
  type RecordStatus,
} from "@/lib/leave/request";
import { formatDateLong, formatDuration, formatKyivDateTime, formatRange } from "@/lib/leave/time";
import { cn } from "@/lib/utils";
import { createClient } from "@/lib/supabase/server";
import type { Database } from "@/lib/supabase/database.types";
import { DecisionForm } from "./decision-form";
import { decidedNotice, decisionsTab, pickRecord, recordHref, type DecisionsTab } from "./decisions-view";

type DecisionRow = Database["public"]["Functions"]["decision_records"]["Returns"][number];

const TABS: { id: DecisionsTab; label: string; href: string }[] = [
  { id: "awaiting", label: "Awaiting decision", href: "/decisions" },
  { id: "history", label: "History", href: "/decisions?tab=history" },
];

/** Статуси, з якими запис потрапляє в «History» менеджера: рішення ухвалено (AC-DECIDE-11). */
const DECIDED: RecordStatus[] = ["approved", "rejected", "returned"];

const first = (value: string | string[] | undefined) => (Array.isArray(value) ? value[0] : value);

/** Залишок і попередження для запису, який користувач може вирішити; "error" — не вдалося порахувати. */
type Balance = { remaining: number; warning: string | null } | "error" | null;

/** Відповідь public.decision_balance → залишок і текст попередження PM (AC-BALANCE-09, AC-BALANCE-14). */
function balanceFrom(raw: unknown): Balance {
  const value = raw as { leave_type?: string; share?: number | string; remaining?: number | string } | null;
  if (!value || !value.leave_type || !isLimitedType(value.leave_type)) return null;
  const remaining = daysToHundredths(value.remaining ?? 0);
  return { remaining, warning: managerWarning(value.leave_type, daysToHundredths(value.share ?? 0), remaining) };
}

// «Decisions» менеджера (requirements/02-leave-decision.md): вкладки «Awaiting decision» і «History», ліворуч — список
// записів, праворуч — вибраний запис і рішення щодо нього (полотно «Leave Portal screens», DESIGN.md). Записи й імена
// дає public.decision_records: менеджеру — лише записи посад, за які він відповідає (AC-DECIDE-01), адміністратору — усі.
export default async function DecisionsPage({ searchParams }: PageProps<"/decisions">) {
  const supabase = await createClient();
  const { data } = await supabase.auth.getClaims();
  const claims = data?.claims;
  if (!claims) redirect("/login");

  const { data: profile } = await supabase.from("profiles").select("role").eq("id", claims.sub).maybeSingle();
  if (profile?.role !== "manager" && profile?.role !== "admin") {
    // Відмова в доступі — пояснення й посилання на головну, без даних (DESIGN.md, розділ 6).
    return (
      <>
        <PageHeader title="Decisions" />
        <EmptyState
          icon={<ShieldX className="size-5" aria-hidden="true" />}
          title="You can't decide on records"
          text="Decisions are made by managers and administrators. Your own requests are in My requests."
          action={
            <Link href="/" className={buttonVariants({ variant: "outline" })}>
              Go to Overview
            </Link>
          }
        />
      </>
    );
  }

  const params = await searchParams;
  const tab = decisionsTab(first(params.tab));
  const decided = first(params.decided);

  const { data: rows, error } = await supabase.rpc("decision_records");
  const records = (rows ?? []).filter((r) => isRecordStatus(r.status));
  const awaiting = records.filter((r) => r.status === "awaiting");
  const history = records
    .filter((r) => DECIDED.includes(r.status as RecordStatus))
    .sort((a, b) => (b.decided_at ?? "").localeCompare(a.decided_at ?? ""));
  const shown = tab === "awaiting" ? awaiting : history;
  const { record: selected, denied } = pickRecord(records, shown, first(params.record));

  // Історія вибраного запису з іменами (public.record_histories) і, якщо його можна вирішити, залишок на цей момент
  // (public.decision_balance) — той самий, за яким decide_leave_record порахує розподіл (AC-BALANCE-14).
  const [historyResult, balance] = await Promise.all([
    selected
      ? supabase.rpc("record_histories", { p_record_ids: [selected.id] })
      : Promise.resolve({ data: [], error: null }),
    selected && selected.status === "awaiting" && selected.can_decide && isLimitedType(selected.leave_type)
      ? supabase
          .rpc("decision_balance", { p_record_id: selected.id })
          .then(({ data: raw, error: balanceError }): Balance => (balanceError ? "error" : balanceFrom(raw)))
      : Promise.resolve<Balance>(null),
  ]);
  const selectedHistory = historyResult.error ? null : (groupHistories(historyResult.data ?? []).get(selected?.id ?? -1) ?? []);

  return (
    <>
      <PageHeader
        title="Decisions"
        description={
          profile.role === "admin"
            ? "All records of every position. Each record is decided separately."
            : "Records of the positions you are responsible for. Each record is decided separately."
        }
      />

      {decided && isRecordStatus(decided) && (
        <Alert variant="info" role="status">
          <CircleCheck />
          <AlertTitle>Decision saved</AlertTitle>
          <AlertDescription>The record is now {RECORD_STATUSES[decided]}.</AlertDescription>
          <AlertAction>
            <Link
              href={tab === "history" ? "/decisions?tab=history" : "/decisions"}
              aria-label="Dismiss"
              className={buttonVariants({ variant: "ghost", size: "icon-sm" })}
            >
              <X />
            </Link>
          </AlertAction>
        </Alert>
      )}

      <nav aria-label="Decision lists" className="flex flex-wrap gap-1.5">
        {TABS.map((t) => {
          const active = t.id === tab;
          return (
            <Link
              key={t.id}
              href={t.href}
              aria-current={active ? "page" : undefined}
              className={buttonVariants({
                variant: "ghost",
                size: "sm",
                className: cn(active && "bg-sidebar-accent text-sidebar-accent-foreground hover:bg-sidebar-accent"),
              })}
            >
              {t.label}
              <span className="text-xs tabular-nums text-muted-foreground">
                {t.id === "awaiting" ? awaiting.length : history.length}
                <span className="sr-only"> records</span>
              </span>
            </Link>
          );
        })}
      </nav>

      {error ? (
        <Alert variant="destructive" role="alert">
          <CircleAlert />
          <AlertDescription>The records could not be loaded. Please reload the page.</AlertDescription>
        </Alert>
      ) : (
        <div className="grid items-start gap-6 lg:grid-cols-[minmax(0,1fr)_340px] xl:grid-cols-[minmax(0,1fr)_380px]">
          {shown.length === 0 ? (
            tab === "awaiting" ? (
              <EmptyState
                icon={<ClipboardCheck className="size-5" aria-hidden="true" />}
                title="No records awaiting decision"
                text="New records of your positions will appear here."
              />
            ) : (
              <EmptyState title="No decisions yet" text="Records you or another manager decided will appear here." />
            )
          ) : (
            <RecordTable tab={tab} records={shown} selectedId={selected?.id ?? null} />
          )}

          {(selected || denied) && (
            // Панель, вища за вікно, прокручується сама: кнопки рішення не ховаються під довгим списком.
            <aside
              aria-label="Selected record"
              className="lg:sticky lg:top-8 lg:max-h-[calc(100vh-4rem)] lg:overflow-y-auto lg:rounded-lg"
            >
              {selected ? (
                <RecordPanel
                  record={selected}
                  history={selectedHistory}
                  balance={balance}
                  notice={first(params.notice) === "decided" ? decidedNotice(selected.status as RecordStatus) : null}
                />
              ) : (
                <EmptyState
                  icon={<ShieldX className="size-5" aria-hidden="true" />}
                  titleAs="h2"
                  title={DECISION_MESSAGES.noAccess}
                  text="This record is not in your lists."
                  action={
                    <Link href={TABS.find((t) => t.id === tab)!.href} className={buttonVariants({ variant: "outline" })}>
                      Back to the list
                    </Link>
                  }
                />
              )}
            </aside>
          )}
        </div>
      )}
    </>
  );
}

/** Тип відсутності й посада одним рядком: "Elementary school · Teacher · Sick leave · 3 h 30 min". */
function recordMeta(r: DecisionRow): string {
  const type = isLeaveType(r.leave_type) ? LEAVE_TYPES[r.leave_type] : r.leave_type;
  return `${positionLabel(r.division_name, r.position_title)} · ${type} · ${formatDuration(r.minutes)}`;
}

function RecordTable({
  tab,
  records,
  selectedId,
}: {
  tab: DecisionsTab;
  records: readonly DecisionRow[];
  selectedId: number | null;
}) {
  return (
    <div className="overflow-x-auto rounded-lg border border-border bg-card shadow-sm">
      <Table>
        <TableHeader className="bg-muted">
          <TableRow className="hover:bg-transparent">
            <TableHead>Employee</TableHead>
            <TableHead>Date</TableHead>
            <TableHead>Hours</TableHead>
            <TableHead>Type</TableHead>
            {/* У «History» замість стрілки — статус: на вужчих екранах колонок інакше не вистачає місця. */}
            {tab === "history" ? (
              <TableHead>Status</TableHead>
            ) : (
              <TableHead className="w-px">
                <span className="sr-only">Open</span>
              </TableHead>
            )}
          </TableRow>
        </TableHeader>
        <TableBody>
          {records.map((r) => {
            const selected = r.id === selectedId;
            return (
              // Увесь рядок відкриває запис: посилання в першій клітинці розтягнуто на рядок (after:inset-0).
              <TableRow
                key={r.id}
                data-testid="decision-record"
                data-state={selected ? "selected" : undefined}
                className="relative cursor-pointer"
              >
                <TableCell className="min-w-44 whitespace-normal">
                  <Link
                    href={recordHref(tab, r.id)}
                    scroll={false}
                    aria-current={selected ? "true" : undefined}
                    className="font-medium text-foreground outline-none after:absolute after:inset-0 after:rounded-sm focus-visible:after:outline-2 focus-visible:after:-outline-offset-2 focus-visible:after:outline-ring"
                  >
                    {r.employee_name || r.employee_email}
                    <span className="sr-only">
                      , {r.date} {formatRange(r.start_min, r.end_min)}
                    </span>
                  </Link>
                  <span className="block text-xs text-muted-foreground">
                    {positionLabel(r.division_name, r.position_title)}
                  </span>
                </TableCell>
                <TableCell className="whitespace-nowrap tabular-nums">{formatDateLong(r.date)}</TableCell>
                <TableCell className="whitespace-nowrap tabular-nums">
                  {formatRange(r.start_min, r.end_min)}
                  <span className="block text-xs text-muted-foreground">{formatDuration(r.minutes)}</span>
                </TableCell>
                <TableCell>
                  <LeaveTypeTag type={r.leave_type} variant="inline" />
                </TableCell>
                {tab === "history" ? (
                  <TableCell>
                    {/* Хто й коли вирішив — у панелі запису (Decided, History). */}
                    <StatusBadge status={r.status as RecordStatus} />
                  </TableCell>
                ) : (
                  <TableCell className="w-px text-muted-foreground">
                    <ChevronRight className="size-4" aria-hidden="true" />
                  </TableCell>
                )}
              </TableRow>
            );
          })}
        </TableBody>
      </Table>
    </div>
  );
}

function RecordPanel({
  record: r,
  history,
  balance,
  notice,
}: {
  record: DecisionRow;
  history: HistoryRow[] | null;
  balance: Balance;
  /** Рішення не збережено, бо запис уже вирішив інший менеджер чи скасував працівник (AC-DECIDE-07). */
  notice: string | null;
}) {
  const status = r.status as RecordStatus;
  const range = formatRange(r.start_min, r.end_min);
  const relationship = r.relationship && isRelationship(r.relationship) ? RELATIONSHIP_LABELS[r.relationship] : null;
  const unpaid = r.unpaid_days == null ? 0 : daysToHundredths(r.unpaid_days);
  const split =
    status === "approved" && unpaid > 0 && isLimitedType(r.leave_type)
      ? formatSplit(r.leave_type, daysToHundredths(r.paid_days ?? 0), unpaid)
      : null;
  const warning = balance && balance !== "error" ? balance.warning : null;
  const summary = { date: formatDateLong(r.date), hours: range, meta: recordMeta(r) };

  return (
    <Card>
      <CardHeader>
        <CardTitle>
          <h2>{r.employee_name || r.employee_email}</h2>
        </CardTitle>
        <CardDescription className="truncate">{r.employee_email}</CardDescription>
        <CardAction>
          <StatusBadge status={status} />
        </CardAction>
      </CardHeader>

      <CardContent className="flex flex-col gap-4">
        {notice && (
          <Alert variant="destructive" role="alert">
            <CircleAlert />
            <AlertTitle>Your decision was not saved</AlertTitle>
            <AlertDescription>{notice}</AlertDescription>
          </Alert>
        )}
        <RecordSummary {...summary} />

        <dl className="grid grid-cols-[auto_1fr] items-start gap-x-4 gap-y-2">
          {relationship && (
            <>
              <dt className="text-muted-foreground">Relationship</dt>
              <dd>{relationship}</dd>
            </>
          )}
          <dt className="text-muted-foreground">Employee&apos;s comment</dt>
          <dd className="break-words whitespace-pre-line">
            {r.employee_comment ? `“${r.employee_comment}”` : <span className="text-muted-foreground">No comment</span>}
          </dd>
          {split && (
            <>
              <dt className="text-muted-foreground">Split</dt>
              <dd className="tabular-nums">{split}</dd>
            </>
          )}
          {r.manager_comment && (
            <>
              <dt className="text-muted-foreground">Manager&apos;s comment</dt>
              <dd className="break-words whitespace-pre-line">“{r.manager_comment}”</dd>
            </>
          )}
          {/* Повторно поданий запис знову чекає рішення: попереднє повернення — лише в історії. */}
          {r.decided_at && status !== "awaiting" && (
            <>
              <dt className="text-muted-foreground">Decided</dt>
              <dd className="tabular-nums">
                {formatKyivDateTime(r.decided_at)} · {r.decided_by_name || "Unknown user"}
              </dd>
            </>
          )}
        </dl>

        {balance && balance !== "error" && isLimitedType(r.leave_type) && (
          <div className="flex items-baseline justify-between gap-3">
            <span className="text-muted-foreground">{LEAVE_TYPES[r.leave_type]} remaining</span>
            <span className="text-xl font-semibold tabular-nums">
              {formatDays(Math.max(balance.remaining, 0))}
              <span className="ml-1 text-sm font-normal text-muted-foreground">days</span>
            </span>
          </div>
        )}
        {balance === "error" && (
          <Alert variant="destructive" role="alert">
            <CircleAlert />
            <AlertDescription>The balance could not be checked. Please reload the page before approving.</AlertDescription>
          </Alert>
        )}
        {warning && (
          // Попередження не зупиняє рішення — виглядає як попередження, а не помилка (#16 у репо PM); текст — з AC.
          <Alert variant="warning" role="note">
            <TriangleAlert />
            <AlertDescription>{warning}</AlertDescription>
          </Alert>
        )}

        {status === "awaiting" &&
          (r.can_decide ? (
            // key: інший запис — нова форма з порожнім коментарем і без відповіді попереднього.
            <DecisionForm
              key={r.id}
              recordId={r.id}
              hours={reviewedHours(r.start_min, r.end_min)}
              split={warning !== null}
              summary={summary}
            />
          ) : (
            <Alert variant="info" role="note">
              <Info />
              <AlertDescription>{DECISION_MESSAGES.ownRecord}</AlertDescription>
            </Alert>
          ))}

        <Separator />
        <section aria-label="History" className="flex flex-col gap-2">
          <h3 className="text-[13px] font-medium text-muted-foreground">History</h3>
          <RecordHistory history={history} collapsed={false} />
        </section>
      </CardContent>
    </Card>
  );
}
