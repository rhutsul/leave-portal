import Link from "next/link";
import { redirect } from "next/navigation";
import { ChevronRight, CircleAlert, CircleCheck, ClipboardCheck, Info, Pencil, ShieldX, TriangleAlert, X } from "lucide-react";
import { groupHistories, type HistoryRow, RecordHistory } from "@/components/record-history";
import { Alert, AlertAction, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { buttonVariants } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { LeaveTypeTag } from "@/components/ui/leave-type-tag";
import { PageHeader } from "@/components/ui/page-header";
import { BalanceShift } from "@/components/ui/balance-shift";
import { CancellationMarkView } from "@/components/ui/cancellation-mark";
import { RecordDay } from "@/components/ui/record-summary";
import { isRecordStatus, StatusBadge } from "@/components/ui/status-badge";
import { RecordSubstituteNote } from "@/components/ui/substitute-note";
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
import { canCancelWithNote, cancellationRequestLine, type CancellationMark } from "@/lib/leave/cancellation";
import { DECISION_MESSAGES, parseReviewedRecord } from "@/lib/leave/decision";
import { EDIT_MESSAGES } from "@/lib/leave/record-edit";
import {
  isLeaveType,
  isRelationship,
  LEAVE_TYPES,
  positionLabel,
  RECORD_STATUSES,
  RELATIONSHIP_LABELS,
  type RecordStatus,
} from "@/lib/leave/request";
import { formatDateLong, formatDuration, formatKyivDateTime, formatRange, kyivDate } from "@/lib/leave/time";
import { cn } from "@/lib/utils";
import { createClient } from "@/lib/supabase/server";
import type { Database } from "@/lib/supabase/database.types";
import { loadBalances } from "../balances/load-balances";
import { CancellationForm, CancelWithNote } from "./cancellation-form";
import { DecisionForm } from "./decision-form";
import { EditRecordForm } from "./edit-record-form";
import {
  balanceShift,
  dayBar,
  decidedNotice,
  decisionsTab,
  historyRecords,
  neighbours,
  pickRecord,
  recordHref,
  type DecisionsTab,
  type PositionDay,
} from "./decisions-view";
import { loadRecordDay } from "./load-record-day";
import { RecordSheet } from "./record-sheet";
import { loadRecordSubstitutes, substituteLookup, type RecordSubstitute } from "../requests/load-record-substitutes";
import { loadReviewed, type Reviewed } from "./load-reviewed";

type DecisionRow = Database["public"]["Functions"]["decision_records"]["Returns"][number];

const TABS: { id: DecisionsTab; label: string; href: string }[] = [
  { id: "awaiting", label: "Awaiting decision", href: "/decisions" },
  { id: "history", label: "History", href: "/decisions?tab=history" },
];

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
  const [{ data: profile }, { data: rows, error }, { requests, cancelEvents }] = await Promise.all([
    supabase.from("profiles").select("role").eq("id", claims.sub).maybeSingle(),
    supabase.rpc("decision_records"),
    loadCancellations(supabase),
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
  const declined = first(params.cancellation) === "declined";
  const today = kyivDate(new Date());

  const records = (rows ?? []).filter((r) => isRecordStatus(r.status));
  // Черга «Awaiting decision» (AC-DECIDE-01, AC-DECIDE-14 у редакції 09): записи, що чекають рішення, і погоджені з
  // відкритим проханням про скасування (AC-CANCEL-01) — у тому самому порядку (дата, час).
  const awaiting = records.filter((r) => r.status === "awaiting" || (r.status === "approved" && requests.has(r.id)));
  const history = historyRecords(records, cancelEvents);
  const shown = tab === "awaiting" ? awaiting : history;
  const { record: selected, denied } = pickRecord(records, first(params.record));
  const listHref = TABS.find((t) => t.id === tab)!.href;
  const around = selected ? neighbours(shown, selected.id) : null;

  // Історія вибраного запису з іменами (public.record_histories), робочий день посади на його дату (смуга годин) і,
  // якщо запис можна вирішити, залишок на цей момент (public.decision_balance) — той самий, за яким
  // decide_leave_record порахує розподіл (AC-BALANCE-14).
  const [historyResult, balance, day, substitutes, reviewed] = await Promise.all([
    selected
      ? supabase.rpc("record_histories", { p_record_ids: [selected.id] })
      : Promise.resolve({ data: [], error: null }),
    selected && selected.status === "awaiting" && selected.can_decide
      ? loadDecisionBalance(supabase, selected)
      : Promise.resolve<Balance>(null),
    selected ? loadRecordDay(supabase, selected.id, selected.date) : Promise.resolve(null),
    // Заміна й позначка підвищення (AC-SUBST-02, AC-SUBST-03, AC-SUBST-08) показаних записів і вибраного; збій — без них.
    loadRecordSubstitutes(supabase, recordIds(shown, selected)),
    // Дата, тип і заміна вибраного запису для форми рішення (D9 impl-on-behalf).
    loadReviewed(supabase, selected),
  ]);
  const substituteOf = substituteLookup(substitutes);
  const edit = await loadEdit(supabase, selected, tab, first(params.edit) === "1", first(params.updated) === "1", reviewed.record);
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

      {declined && (
        <Alert variant="info" role="status">
          <CircleCheck />
          <AlertTitle>Cancellation declined</AlertTitle>
          <AlertDescription>The record stays Approved. The employee sees your comment.</AlertDescription>
          <AlertAction>
            <Link href="/decisions" aria-label="Dismiss" className={buttonVariants({ variant: "ghost", size: "icon-sm" })}>
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
            <RecordTable
              tab={tab}
              records={shown}
              selectedId={selected?.id ?? null}
              requests={requests}
              substituteOf={substituteOf}
            />
          )}

          {selected && (
            <RecordSheet
              title={selected.employee_name || selected.employee_email}
              description={[selected.employee_email, positionLabel(selected.division_name, selected.position_title)].filter(Boolean).join(" · ")}
              badge={
                <span className="flex flex-wrap items-center gap-x-2">
                  <StatusBadge status={selected.status as RecordStatus} />
                  <CancellationMarkView mark={requestMark(selected, requests)} className="mt-0" />
                </span>
              }
              position={around && around.index >= 0 ? `${around.index + 1} of ${shown.length}` : null}
              closeHref={listHref}
              prevHref={around?.prev ? recordHref(tab, around.prev.id) : null}
              nextHref={around?.next ? recordHref(tab, around.next.id) : null}
              recordKey={selected.id}
            >
              <RecordBody
                record={{ ...selected, reviewed, edit }}
                substitute={substituteOf(selected.id)}
                history={selectedHistory}
                balance={balance}
                day={day}
                request={selected.status === "approved" ? (requests.get(selected.id) ?? null) : null}
                today={today}
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

/** Відкрите прохання про скасування погодженого запису (D11). */
type CancelRequest = { id: number; cancel_reason: string; cancel_request_id: number };

/**
 * Прохання про скасування погоджених записів (D11) — окремим запитом, бо тип результату decision_records не змінюємо
 * (expand → contract, AGENTS.md); RLS — ті самі записи (посади менеджера, адміністратору — усі). Події «cancelled» —
 * щоб записи, скасовані менеджером, лишались у «History» (historyRecords). Збій будь-якого — без них, сторінка працює.
 */
async function loadCancellations(supabase: Supabase) {
  const [{ data: found, error }, { data: events }] = await Promise.all([
    supabase.from("leave_records").select("id, cancel_reason, cancel_request_id").not("cancel_reason", "is", null),
    supabase.from("leave_record_events").select("record_id, actor_id, created_at").eq("action", "cancelled"),
  ]);
  const requests = new Map<number, CancelRequest>(error ? [] : (found ?? []).map((c) => [c.id, c as CancelRequest]));
  return { requests, cancelEvents: events ?? [] };
}

/** Позначка «Cancellation requested» для рядка й шапки панелі (D12). */
function requestMark(r: DecisionRow, requests: ReadonlyMap<number, CancelRequest>): CancellationMark | null {
  return r.status === "approved" && requests.has(r.id) ? { kind: "requested", text: "Cancellation requested" } : null;
}

function RecordTable({
  tab,
  records,
  selectedId,
  requests,
  substituteOf,
}: {
  tab: DecisionsTab;
  records: readonly DecisionRow[];
  selectedId: number | null;
  requests: ReadonlyMap<number, CancelRequest>;
  /** null — «No substitute», undefined — заміни не завантажились (рядка немає). */
  substituteOf: (id: number) => RecordSubstitute | null | undefined;
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
                  {/* Заміна — під працівником: колонка годин не переносить рядки, і довгий email обрізався б. */}
                  <RecordSubstituteNote substitute={substituteOf(r.id)} className="mt-1" />
                </TableCell>
                <TableCell className="whitespace-nowrap tabular-nums">{formatDateLong(r.date)}</TableCell>
                <TableCell className="whitespace-nowrap tabular-nums">
                  {formatRange(r.start_min, r.end_min)}
                  <span className="block text-xs text-muted-foreground">{formatDuration(r.minutes)}</span>
                </TableCell>
                <TableCell>
                  <LeaveTypeTag type={r.leave_type} variant="inline" />
                  <CancellationMarkView mark={requestMark(r, requests)} />
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

/** Правка запису в панелі: посилання, стан форми й список замін працівника. */
type EditInfo = {
  href: string;
  cancelHref: string;
  open: boolean;
  /** Правку щойно збережено — «Record updated» над записом. */
  updated: boolean;
  substitutes: { value: string; label: string }[];
};

/** Запис панелі: що бачить менеджер для рішення (reviewed: години, дата, тип, заміна — D9 impl-on-behalf) і правка. */
type PanelRecord = DecisionRow & { reviewed: Reviewed; edit: EditInfo | null };

/**
 * Правка запису до рішення (крок 4 D9 impl-on-behalf): лише «Awaiting decision» і запис, який можна вирішувати (власний
 * запис менеджера — ні, D7); список замін працівника — лише коли форму відкрито. Збій читання списку — лише «No
 * substitute» і нинішня заміна: база все одно звірить вибір.
 */
async function loadEdit(
  supabase: Awaited<ReturnType<typeof createClient>>,
  selected: DecisionRow | null,
  tab: DecisionsTab,
  open: boolean,
  updated: boolean,
  reviewed: string,
): Promise<EditInfo | null> {
  if (!selected || !canEdit(selected, reviewed)) return null;
  return {
    href: `${recordHref(tab, selected.id)}&edit=1`,
    cancelHref: recordHref(tab, selected.id),
    open,
    updated,
    substitutes: open ? await substituteOptions(supabase, selected.employee_id) : [],
  };
}

/**
 * Чи можна змінити запис: «Awaiting decision», запис, який можна вирішувати, і відомо, що бачить менеджер (reviewed —
 * дата, тип, заміна; збій читання — порожньо). Без reviewed форма відкрилась би з «No substitute» і мовчки прибрала б
 * заміну (друга думка до PR 144).
 */
function canEdit(selected: DecisionRow, reviewed: string): boolean {
  return selected.status === "awaiting" && selected.can_decide && reviewed !== "";
}

/** Список замін працівника для форми правки: email і id; збій — порожньо. */
async function substituteOptions(supabase: Awaited<ReturnType<typeof createClient>>, employeeId: string) {
  const { data } = await supabase.rpc("substitute_list", { p_employee_id: employeeId });
  return (data ?? []).map((s) => ({ value: s.substitute_id, label: s.email }));
}

/** Id записів списку й вибраного (він може бути поза вкладкою) — для заміни й позначки одним викликом. */
function recordIds(shown: readonly DecisionRow[], selected: DecisionRow | null): number[] {
  return [...new Set([...shown.map((r) => r.id), ...(selected ? [selected.id] : [])])];
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

/** «Record updated» після правки і заголовок розділу «Record» з «Edit record» праворуч (D11); запис, який змінити не можна, — без них. */
function EditRecordLink({ edit }: { edit?: EditInfo | null }) {
  if (!edit) return null;
  return (
    <>
      <UpdatedNotice show={edit.updated} />
      <div className="-mb-1 flex items-center justify-between gap-2">
        <h3 className="font-mono text-[11px] font-normal tracking-wide text-muted-foreground uppercase">Record</h3>
        <Link
          href={edit.href}
          replace
          scroll={false}
          className={cn(buttonVariants({ variant: "ghost", size: "sm" }), "-mr-2 pointer-coarse:h-11")}
        >
          <Pencil aria-hidden="true" />
          Edit record
        </Link>
      </div>
    </>
  );
}

/** Розділ «Record»: дата, тип і години смугою дня; нижче — деталі без рамок. */
function RecordSection({
  record: r,
  day,
  substitute,
}: {
  /** Запис; edit — «Edit record» (AC-BEHALF-06…08) лише для запису, який можна змінити. */
  record: DecisionRow & { edit?: EditInfo | null };
  day: PositionDay | null;
  substitute: RecordSubstitute | null | undefined;
}) {
  const status = r.status as RecordStatus;
  const relationship = r.relationship && isRelationship(r.relationship) ? RELATIONSHIP_LABELS[r.relationship] : null;
  const bar = dayBar(r, day);
  const split = approvedSplit(r);
  return (
    <section aria-label="Record" className="flex flex-col gap-2.5">
      <EditRecordLink edit={r.edit} />
      <RecordDay
        date={formatDateLong(r.date)}
        type={<LeaveTypeTag type={r.leave_type} variant="inline" />}
        hours={bar.label}
        total={bar.total}
        left={bar.left}
        width={bar.width}
      />
      <RecordSubstituteNote substitute={substitute} />
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

/** «Record updated» над записом після збереженої правки (D11). */
function UpdatedNotice({ show }: { show: boolean }) {
  if (!show) return null;
  return (
    <Alert variant="info" role="status">
      <CircleCheck />
      <AlertDescription>{EDIT_MESSAGES.saved}</AlertDescription>
    </Alert>
  );
}

/**
 * Панель запису на час правки (крок 4 D9, D11 impl-on-behalf): форма замість розділу «Record» і залишку, нижче —
 * коментарі й історія; дії рішення сховані — одна основна дія «Save changes».
 */
function EditPanel({
  record: r,
  substitute,
  history,
  day,
  today,
  edit,
}: {
  record: DecisionRow & { reviewed: Reviewed };
  substitute: RecordSubstitute | null | undefined;
  history: HistoryRow[] | null;
  day: PositionDay | null;
  today: string;
  edit: EditInfo;
}) {
  return (
    <EditRecordForm
      key={r.id}
      recordId={r.id}
      initial={{
        date: r.date,
        wholeDay: isWholeDay(r, day),
        start: r.start_min,
        end: r.end_min,
        leaveType: r.leave_type,
        relationship: r.relationship,
        substituteId: parseReviewedRecord(r.reviewed.record)?.substituteId ?? null,
      }}
      reviewed={r.reviewed}
      substitutes={edit.substitutes}
      currentSubstitute={substitute?.email}
      today={today}
      cancelHref={edit.cancelHref}
    >
      <section aria-label="Comments" className="flex flex-col gap-2.5">
        <CommentLines record={r} />
      </section>
      <HistorySection history={history} />
    </EditRecordForm>
  );
}

/** Запис на весь робочий день посади на свою дату — форма правки відкривається з «Whole day». */
function isWholeDay(r: DecisionRow, day: PositionDay | null): boolean {
  return day !== null && r.start_min === day.start && r.end_min === day.end;
}

function RecordPanel({
  record: r,
  substitute,
  history,
  balance,
  day,
  request,
  today,
  notice,
}: {
  /** Запис і те, що з нього бачить менеджер для рішення (reviewed: години, дата, тип, заміна — D9 impl-on-behalf). */
  record: PanelRecord;
  /** Заміна запису; null — «No substitute»; undefined — не завантажились. */
  substitute: RecordSubstitute | null | undefined;
  history: HistoryRow[] | null;
  balance: Balance;
  /** Робочий день посади на дату запису — для смуги годин; null — без розкладу. */
  day: PositionDay | null;
  /** Відкрите прохання про скасування погодженого запису (D11); null — немає. */
  request: CancelRequest | null;
  /** Сьогодні за Києвом — чи можна скасувати з приміткою (D5). */
  today: string;
  /** Рішення не збережено, бо запис уже вирішив інший менеджер чи скасував працівник (AC-DECIDE-07). */
  notice: string | null;
}) {
  const awaiting = r.status === "awaiting";
  const summary = { date: formatDateLong(r.date), hours: formatRange(r.start_min, r.end_min), meta: recordMeta(r) };

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
      <RecordSection record={r} day={day} substitute={substitute} />
      <BalanceSection type={r.leave_type} balance={balance} />
    </>
  );

  if (awaiting && r.can_decide) {
    return (
      // key: інший запис — нова форма з порожнім коментарем і без відповіді попереднього.
      <DecisionForm
        key={r.id}
        recordId={r.id}
        reviewed={r.reviewed}
        split={Boolean(balance && balance !== "error" && balance.warning)}
        summary={summary}
        before={before}
        employeeComment={<CommentLines record={r} />}
      >
        <HistorySection history={history} />
      </DecisionForm>
    );
  }

  // Прохання про скасування (AC-CANCEL-01): причина дослівно — «Cancellation requested: <причина>».
  const requestSection = request && (
    <section aria-label="Cancellation request" className="flex flex-col gap-2.5">
      <p className="text-[13px] break-words whitespace-pre-line">{cancellationRequestLine(request.cancel_reason)}</p>
      <CommentLines record={r} />
      {!r.can_decide && (
        <Alert variant="info" role="note">
          <Info />
          <AlertDescription>{DECISION_MESSAGES.ownRecord}</AlertDescription>
        </Alert>
      )}
    </section>
  );

  if (request && r.can_decide) {
    return (
      <CancellationForm
        key={`${r.id}-${request.cancel_request_id}`}
        recordId={r.id}
        requestId={request.cancel_request_id}
        summary={summary}
        before={
          <>
            {before}
            {requestSection}
          </>
        }
      >
        <HistorySection history={history} />
      </CancellationForm>
    );
  }

  const cancellable =
    !request &&
    r.can_decide &&
    canCancelWithNote({ date: r.date, status: r.status as RecordStatus, cancelReason: null, cancelRequestId: null }, today);

  return (
    <div className="flex flex-1 flex-col gap-6.5">
      {before}
      {requestSection || (
        <section aria-label="Comments" className="flex flex-col gap-2.5">
          <CommentLines record={r} />
          {awaiting && (
            <Alert variant="info" role="note">
              <Info />
              <AlertDescription>{DECISION_MESSAGES.ownRecord}</AlertDescription>
            </Alert>
          )}
        </section>
      )}
      <HistorySection history={history} />
      {cancellable && <CancelWithNote key={r.id} recordId={r.id} summary={summary} />}
    </div>
  );
}

/** Панель запису: форма правки, коли її відкрито (крок 4 D9), інакше — запис і рішення щодо нього. */
function RecordBody(props: Parameters<typeof RecordPanel>[0]) {
  const { edit } = props.record;
  if (!edit?.open) return <RecordPanel {...props} />;
  return (
    <EditPanel
      record={props.record}
      substitute={props.substitute}
      history={props.history}
      day={props.day}
      today={props.today}
      edit={edit}
    />
  );
}
