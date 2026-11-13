import Link from "next/link";
import { redirect } from "next/navigation";
import { ChevronRight, CircleAlert, CircleCheck, ClipboardCheck, Info, ShieldX, TriangleAlert, X } from "lucide-react";
import { groupHistories, type HistoryRow, RecordHistory } from "@/components/record-history";
import { Alert, AlertAction, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { buttonVariants } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { LeaveTypeTag } from "@/components/ui/leave-type-tag";
import { PageHeader } from "@/components/ui/page-header";
import { BalanceShift } from "@/components/ui/balance-shift";
import { RecordDay } from "@/components/ui/record-summary";
import { isRecordStatus, StatusBadge } from "@/components/ui/status-badge";
import { Tick } from "@/components/ui/motion";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import {
  daysToHundredths,
  formatDays,
  formatSplit,
  isLimitedType,
  managerWarning,
  schoolYearOf,
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
import { loadBalances } from "../balances/load-balances";
import { DecisionForm } from "./decision-form";
import {
  balanceShift,
  dayBar,
  decidedNotice,
  decisionsTab,
  neighbours,
  pickRecord,
  recordHref,
  type DecisionsTab,
  type PositionDay,
} from "./decisions-view";
import { loadRecordDay } from "./load-record-day";
import { RecordSheet } from "./record-sheet";

type DecisionRow = Database["public"]["Functions"]["decision_records"]["Returns"][number];

const TABS: { id: DecisionsTab; label: string; href: string }[] = [
  { id: "awaiting", label: "Awaiting decision", href: "/decisions" },
  { id: "history", label: "History", href: "/decisions?tab=history" },
];

/** Статуси, з якими запис потрапляє в «History» менеджера: рішення ухвалено (AC-DECIDE-11). */
const DECIDED: RecordStatus[] = ["approved", "rejected", "returned"];

const first = (value: string | string[] | undefined) => (Array.isArray(value) ? value[0] : value);

/**
 * Залишок і попередження для запису, який користувач може вирішити (усе в сотих дня); "error" — не вдалося порахувати.
 * `total` — нараховане й перенесене за рік, лише для смуги й «X of Y used»: null — не завантажилось, решта лишається.
 */
type Balance = { remaining: number; share: number; total: number | null; warning: string | null } | "error" | null;

/** Відповідь public.decision_balance → залишок і текст попередження PM (AC-BALANCE-09, AC-BALANCE-14). */
function balanceFrom(raw: unknown, total: number | null): Balance {
  const value = raw as { leave_type?: string; share?: number | string; remaining?: number | string } | null;
  if (!value || !value.leave_type || !isLimitedType(value.leave_type)) return null;
  const remaining = daysToHundredths(value.remaining ?? 0);
  const share = daysToHundredths(value.share ?? 0);
  return { remaining, share, total, warning: managerWarning(value.leave_type, share, remaining) };
}

type Supabase = Awaited<ReturnType<typeof createClient>>;

/**
 * Залишок запису, який можна вирішити: числа рішення — public.decision_balance (ті самі, за якими
 * decide_leave_record порахує розподіл, AC-BALANCE-14); нараховане за рік — із залишків працівника (get_balance_inputs
 * показує їх менеджеру його посад і адміністратору), лише для смуги.
 */
async function loadDecisionBalance(supabase: Supabase, r: DecisionRow): Promise<Balance> {
  const type = r.leave_type;
  if (!isLimitedType(type)) return null;
  const [{ data: raw, error }, balances] = await Promise.all([
    supabase.rpc("decision_balance", { p_record_id: r.id }),
    loadBalances(supabase, r.employee_id, schoolYearOf(r.date)),
  ]);
  if (error) return "error";
  const limited = balances.ok ? balances.balances.limited[type] : null;
  return balanceFrom(raw, limited ? limited.granted + limited.carriedOver : null);
}

// «Decisions» менеджера (requirements/02-leave-decision.md): вкладки «Awaiting decision» і «History», ліворуч — список
// записів, праворуч — вибраний запис і рішення щодо нього (полотно «Leave Portal screens», DESIGN.md). Записи й імена
// дає public.decision_records: менеджеру — лише записи посад, за які він відповідає (AC-DECIDE-01), адміністратору — усі.
export default async function DecisionsPage({ searchParams }: PageProps<"/decisions">) {
  const supabase = await createClient();
  const { data } = await supabase.auth.getClaims();
  const claims = data?.claims;
  if (!claims) redirect("/login");

  // Роль і записи — одночасно: decision_records сам повертає лише записи посад, якими користувач керує (адміністратору —
  // усі), а без ролі manager чи admin рядки нижче не використовуються. Сторінка чекає бази один раз замість двох.
  const [{ data: profile }, { data: rows, error }] = await Promise.all([
    supabase.from("profiles").select("role").eq("id", claims.sub).maybeSingle(),
    supabase.rpc("decision_records"),
  ]);
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

  const records = (rows ?? []).filter((r) => isRecordStatus(r.status));
  const awaiting = records.filter((r) => r.status === "awaiting");
  const history = records
    .filter((r) => DECIDED.includes(r.status as RecordStatus))
    .sort((a, b) => (b.decided_at ?? "").localeCompare(a.decided_at ?? ""));
  const shown = tab === "awaiting" ? awaiting : history;
  const { record: selected, denied } = pickRecord(records, first(params.record));
  const listHref = TABS.find((t) => t.id === tab)!.href;
  const around = selected ? neighbours(shown, selected.id) : null;

  // Історія вибраного запису з іменами (public.record_histories), робочий день посади на його дату (смуга годин) і,
  // якщо запис можна вирішити, залишок на цей момент (public.decision_balance) — той самий, за яким
  // decide_leave_record порахує розподіл (AC-BALANCE-14).
  const [historyResult, balance, day] = await Promise.all([
    selected
      ? supabase.rpc("record_histories", { p_record_ids: [selected.id] })
      : Promise.resolve({ data: [], error: null }),
    selected && selected.status === "awaiting" && selected.can_decide
      ? loadDecisionBalance(supabase, selected)
      : Promise.resolve<Balance>(null),
    selected ? loadRecordDay(supabase, selected.id, selected.date) : Promise.resolve(null),
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
                <Tick value={t.id === "awaiting" ? awaiting.length : history.length} />
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
        <>
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

          {selected && (
            <RecordSheet
              title={selected.employee_name || selected.employee_email}
              description={[selected.employee_email, positionLabel(selected.division_name, selected.position_title)].filter(Boolean).join(" · ")}
              badge={<StatusBadge status={selected.status as RecordStatus} />}
              position={around && around.index >= 0 ? `${around.index + 1} of ${shown.length}` : null}
              closeHref={listHref}
              prevHref={around?.prev ? recordHref(tab, around.prev.id) : null}
              nextHref={around?.next ? recordHref(tab, around.next.id) : null}
              recordKey={selected.id}
            >
              <RecordPanel
                record={selected}
                history={selectedHistory}
                balance={balance}
                day={day}
                notice={first(params.notice) === "decided" ? decidedNotice(selected.status as RecordStatus) : null}
              />
            </RecordSheet>
          )}
          {denied && (
            // Відмова — без даних запису: чужий він чи його немає зовсім, не розрізняємо (AC-DECIDE-08, AC-DECIDE-09).
            <RecordSheet title="Record not available" position={null} closeHref={listHref} prevHref={null} nextHref={null}>
              <EmptyState
                icon={<ShieldX className="size-5" aria-hidden="true" />}
                titleAs="h2"
                title={DECISION_MESSAGES.noAccess}
                text="This record is not in your lists."
                action={
                  <Link href={listHref} className={buttonVariants({ variant: "outline" })}>
                    Back to the list
                  </Link>
                }
              />
            </RecordSheet>
          )}
        </>
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
    <div className="overflow-x-auto rounded-lg border border-border bg-card max-md:overflow-visible max-md:border-0 max-md:bg-transparent">
      <Table stack>
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
                data-record-row={r.id}
                data-state={selected ? "selected" : undefined}
                className="relative cursor-pointer data-leaving:animate-row-leave"
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
                  <TableCell data-cell="end">
                    {/* Хто й коли вирішив — у панелі запису (Decided, History). */}
                    <StatusBadge status={r.status as RecordStatus} />
                  </TableCell>
                ) : (
                  <TableCell data-cell="end" className="w-px text-muted-foreground max-md:p-2.5!">
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

/** Рядок деталей запису без рамок: приглушений підпис і значення. */
function Detail({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <p className="text-[13px] break-words whitespace-pre-line">
      <span className="text-muted-foreground">{label}: </span>
      {children}
    </p>
  );
}

/** Розділ «Record»: дата, тип і години смугою дня; нижче — деталі без рамок. */
function RecordSection({ record: r, day }: { record: DecisionRow; day: PositionDay | null }) {
  const status = r.status as RecordStatus;
  const relationship = r.relationship && isRelationship(r.relationship) ? RELATIONSHIP_LABELS[r.relationship] : null;
  const bar = dayBar(r, day);
  const split = approvedSplit(r);
  return (
    <section aria-label="Record" className="flex flex-col gap-2.5">
      <RecordDay
        date={formatDateLong(r.date)}
        type={<LeaveTypeTag type={r.leave_type} variant="inline" />}
        hours={bar.label}
        total={bar.total}
        left={bar.left}
        width={bar.width}
      />
      {relationship && <Detail label="Relationship">{relationship}</Detail>}
      {split && (
        <Detail label="Split">
          <span className="tabular-nums">{split}</span>
        </Detail>
      )}
      {/* Повторно поданий запис знову чекає рішення: попереднє повернення — лише в історії. */}
      {r.decided_at && status !== "awaiting" && (
        <Detail label="Decided">
          <span className="tabular-nums">
            {formatKyivDateTime(r.decided_at)} · {r.decided_by_name || "Unknown user"}
          </span>
        </Detail>
      )}
    </section>
  );
}

/** Розподіл погодженого запису понад залишок: "0.50 days Sick leave + 0.50 days Unpaid leave"; інакше — null. */
function approvedSplit(r: DecisionRow): string | null {
  const unpaid = r.unpaid_days == null ? 0 : daysToHundredths(r.unpaid_days);
  if (r.status !== "approved" || unpaid <= 0 || !isLimitedType(r.leave_type)) return null;
  return formatSplit(r.leave_type, daysToHundredths(r.paid_days ?? 0), unpaid);
}

/** "this record 1.00 day · 2.64 of 18.00 used"; без нарахованого за рік — лише перша частина. */
function balanceNote(share: number, used: number | null, total: number | null): string {
  const record = `this record ${formatDays(share)} ${share === 100 ? "day" : "days"}`;
  return used === null || total === null ? record : `${record} · ${formatDays(used)} of ${formatDays(total)} used`;
}

/** Розділ «Balance» запису, який можна вирішити: залишок до й після погодження, збій перевірки, попередження PM. */
function BalanceSection({ type, balance }: { type: string; balance: Balance }) {
  if (!balance) return null;
  if (balance === "error") {
    return (
      <Alert variant="destructive" role="alert">
        <CircleAlert />
        <AlertDescription>The balance could not be checked. Please reload the page before approving.</AlertDescription>
      </Alert>
    );
  }
  const shift = balanceShift(balance.remaining, balance.share, balance.total);
  return (
    <section aria-label="Balance" className="flex flex-col gap-3">
      {isLimitedType(type) && (
        <BalanceShift
          label={`${LEAVE_TYPES[type]} balance`}
          before={formatDays(shift.before)}
          after={formatDays(shift.after)}
          bar={shift.bar}
          note={balanceNote(balance.share, shift.used, balance.total)}
        />
      )}
      {balance.warning && (
        // Попередження не зупиняє рішення — виглядає як попередження, а не помилка (#16 у репо PM); текст — з AC.
        <Alert variant="warning" role="note">
          <TriangleAlert />
          <AlertDescription>{balance.warning}</AlertDescription>
        </Alert>
      )}
    </section>
  );
}

/** Коментар працівника й коментар попереднього рішення (повернення) — його видно й у повторно поданого запису. */
function CommentLines({ record: r }: { record: DecisionRow }) {
  return (
    <>
      <Detail label="Employee’s comment">{r.employee_comment ? `“${r.employee_comment}”` : "No comment"}</Detail>
      {r.manager_comment && <Detail label="Manager’s comment">“{r.manager_comment}”</Detail>}
    </>
  );
}

function HistorySection({ history }: { history: HistoryRow[] | null }) {
  return (
    <section aria-label="History" className="flex flex-col gap-2.5">
      <h3 className="font-mono text-[11px] font-normal tracking-wide text-muted-foreground uppercase">History</h3>
      <RecordHistory history={history} collapsed={false} />
    </section>
  );
}

function RecordPanel({
  record: r,
  history,
  balance,
  day,
  notice,
}: {
  record: DecisionRow;
  history: HistoryRow[] | null;
  balance: Balance;
  /** Робочий день посади на дату запису — для смуги годин; null — без розкладу. */
  day: PositionDay | null;
  /** Рішення не збережено, бо запис уже вирішив інший менеджер чи скасував працівник (AC-DECIDE-07). */
  notice: string | null;
}) {
  const awaiting = r.status === "awaiting";
  // Ім'я, email, посада й статус — у шапці панелі (RecordSheet); тут — сам запис, залишок, коментарі й історія.
  // Розділи тримає відступ, без меж і ліній (v2).
  const before = (
    <>
      {notice && (
        <Alert variant="destructive" role="alert">
          <CircleAlert />
          <AlertTitle>Your decision was not saved</AlertTitle>
          <AlertDescription>{notice}</AlertDescription>
        </Alert>
      )}
      <RecordSection record={r} day={day} />
      <BalanceSection type={r.leave_type} balance={balance} />
    </>
  );

  if (awaiting && r.can_decide) {
    return (
      // key: інший запис — нова форма з порожнім коментарем і без відповіді попереднього.
      <DecisionForm
        key={r.id}
        recordId={r.id}
        hours={reviewedHours(r.start_min, r.end_min)}
        split={Boolean(balance && balance !== "error" && balance.warning)}
        summary={{ date: formatDateLong(r.date), hours: formatRange(r.start_min, r.end_min), meta: recordMeta(r) }}
        before={before}
        employeeComment={<CommentLines record={r} />}
      >
        <HistorySection history={history} />
      </DecisionForm>
    );
  }

  return (
    <div className="flex flex-col gap-6.5">
      {before}
      <section aria-label="Comments" className="flex flex-col gap-2.5">
        <CommentLines record={r} />
        {awaiting && (
          <Alert variant="info" role="note">
            <Info />
            <AlertDescription>{DECISION_MESSAGES.ownRecord}</AlertDescription>
          </Alert>
        )}
      </section>
      <HistorySection history={history} />
    </div>
  );
}
