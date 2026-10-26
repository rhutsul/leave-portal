import Link from "next/link";
import { Fragment } from "react";
import { redirect } from "next/navigation";
import { CircleCheck, Plus, TriangleAlert, X } from "lucide-react";
import { groupHistories } from "@/components/record-history";
import { Alert, AlertAction, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { buttonVariants } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { HoursBar } from "@/components/ui/hours-bar";
import { LeaveTypeTag } from "@/components/ui/leave-type-tag";
import { PageHeader } from "@/components/ui/page-header";
import { isRecordStatus, StatusBadge } from "@/components/ui/status-badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { daysToHundredths, formatSplit, isLimitedType, overBalanceWarnings } from "@/lib/leave/balance";
import { employeeActions } from "@/lib/leave/decision";
import { isLeaveType, LEAVE_TYPES, positionLabel, type PositionSchedule, type RecordStatus } from "@/lib/leave/request";
import {
  formatBlocks,
  formatDateLong,
  formatMonth,
  formatRange,
  isCalendarDate,
  isoWeekday,
  TIME_MESSAGES,
  WEEKDAY_SHORT,
} from "@/lib/leave/time";
import { cn } from "@/lib/utils";
import { createClient } from "@/lib/supabase/server";
import { loadOwnPositions } from "./new/load-positions";
import { RecordActions } from "./record-actions";

const TABS: { id: string; label: string; statuses: RecordStatus[] | null }[] = [
  { id: "all", label: "All", statuses: null },
  { id: "awaiting", label: "Awaiting decision", statuses: ["awaiting"] },
  { id: "returned", label: "Returned for revision", statuses: ["returned"] },
  { id: "approved", label: "Approved", statuses: ["approved"] },
  { id: "closed", label: "Rejected and cancelled", statuses: ["rejected", "cancelled"] },
];

/** "Tue 3" — у таблиці, згрупованій за місяцем (DESIGN.md, розділ 1). */
function dayLabel(date: string) {
  return `${WEEKDAY_SHORT[isoWeekday(date) - 1]} ${Number(date.slice(8))}`;
}

// «My requests» (AC-LEAVE-14): лише власні записи — view public.my_leave_records фільтрує за auth.uid(),
// бо RLS показує менеджеру ще й записи його посад. Список (рішення PM у
// mkozlovskyi-ops/course-staff-management-spec#15), новіші дати згори, групи за місяцем; вкладки фільтрують за
// статусом; тип і статус — завжди словом (#14 там само).
export default async function MyRequestsPage({ searchParams }: PageProps<"/requests">) {
  const supabase = await createClient();
  const { data } = await supabase.auth.getClaims();
  if (!data?.claims) redirect("/login");

  const { submitted, status, skipped, over, balance } = await searchParams;
  const tab = TABS.find((t) => t.id === status) ?? TABS[0];
  // Дати заявки без робочих годин, які не прийнято (AC-LEAVE-21) — з redirect після подання.
  const skippedDates = typeof skipped === "string" ? skipped.split(",").filter(isCalendarDate) : [];
  // Перевищення залишку на момент подання (AC-BALANCE-08, AC-BALANCE-15, AC-BALANCE-17): "тип:частка:залишок" у сотих.
  const balanceWarnings = typeof over === "string" ? overBalanceWarnings(over) : [];

  const [{ data: rows, error }, positions] = await Promise.all([
    supabase
      .from("my_leave_records")
      .select(
        "id, request_id, position_id, date, start_min, end_min, minutes, leave_type, status, position_title, division_name, employee_comment, manager_comment, paid_days, unpaid_days, created_at",
      )
      .order("date", { ascending: false })
      .order("start_min", { ascending: true })
      .order("request_id", { ascending: false }),
    // Розклад дня для смуги годин і форми зміни годин; збій — смуга на всю ширину, форма каже, що розклад не
    // завантажився (години перевірить server action).
    loadOwnPositions(supabase, data.claims.sub).catch((): PositionSchedule[] | null => null),
  ]);
  const blocksOf = (positionId: number, date: string) =>
    positions?.find((p) => p.id === positionId)?.blocks.filter((b) => b.weekday === isoWeekday(date)) ?? [];
  const scheduleOf = (positionId: number, date: string) => {
    if (!positions) return { failed: true as const };
    const blocks = blocksOf(positionId, date);
    return { failed: false as const, text: blocks.length ? formatBlocks(blocks) : null };
  };

  const records = (rows ?? []).filter((r) => r.status && isRecordStatus(r.status));
  const count = (statuses: RecordStatus[] | null) =>
    records.filter((r) => !statuses || statuses.includes(r.status as RecordStatus)).length;
  const shown = records.filter((r) => !tab.statuses || tab.statuses.includes(r.status as RecordStatus));
  // Записи щойно поданої заявки (найбільший request_id) після redirect спалахують один раз.
  const newest = submitted === "1" && records.length > 0 ? Math.max(...records.map((r) => r.request_id!)) : null;

  // Історія показаних записів з іменами тих, хто вирішував, одним запитом (public.record_histories, AC-DECIDE-15):
  // profiles за RLS показує лише власний профіль. Збій — повідомлення в деталях запису, а не порожня історія.
  const historyResult =
    shown.length > 0
      ? await supabase.rpc("record_histories", { p_record_ids: shown.map((r) => r.id!) })
      : { data: [], error: null };
  const histories = historyResult.error ? null : groupHistories(historyResult.data ?? []);

  const months = new Map<string, typeof shown>();
  for (const r of shown) {
    const month = r.date!.slice(0, 7);
    months.set(month, [...(months.get(month) ?? []), r]);
  }

  const newRequest = (
    <Link href="/requests/new" className={buttonVariants()}>
      <Plus />
      New request
    </Link>
  );

  return (
    <>
      <PageHeader
        title="My requests"
        description="Each record is one position on one date. Your managers decide on each record separately."
        actions={newRequest}
      />

      {submitted === "1" && (
        <Alert variant="info" role="status">
          <CircleCheck />
          <AlertTitle>Request submitted</AlertTitle>
          <AlertDescription>
            Each record is now awaiting a decision.
            {skippedDates.map((d) => (
              <span key={d} className="block">
                {formatDateLong(d)} was not accepted: {TIME_MESSAGES.noWorkingHours}
              </span>
            ))}
            {balance === "unchecked" && (
              <span className="block">Your balance could not be checked for this request.</span>
            )}
          </AlertDescription>
          <AlertAction>
            <Link href="/requests" aria-label="Dismiss" className={buttonVariants({ variant: "ghost", size: "icon-sm" })}>
              <X />
            </Link>
          </AlertAction>
        </Alert>
      )}

      {submitted === "1" &&
        balanceWarnings.map((w, i) => (
          // Попередження не зупинило заявку — виглядає як попередження, а не помилка (рішення PM,
          // mkozlovskyi-ops/course-staff-management-spec#16); текст — дослівно з AC.
          <Alert key={i} variant="warning" role="status">
            <TriangleAlert />
            <AlertDescription>{w}</AlertDescription>
          </Alert>
        ))}

      {error ? (
        <Alert variant="destructive" role="alert">
          <AlertDescription>The records could not be loaded. Please reload the page.</AlertDescription>
        </Alert>
      ) : records.length === 0 ? (
        <EmptyState
          title="No leave records yet"
          text="Your records will appear here after you submit a request."
          action={newRequest}
        />
      ) : (
        <>
          <nav aria-label="Filter by status" className="flex flex-wrap gap-1.5">
            {TABS.map((t) => {
              const active = t.id === tab.id;
              return (
                <Link
                  key={t.id}
                  href={t.id === "all" ? "/requests" : `/requests?status=${t.id}`}
                  aria-current={active ? "page" : undefined}
                  className={buttonVariants({
                    variant: "ghost",
                    size: "sm",
                    className: cn(active && "bg-sidebar-accent text-sidebar-accent-foreground hover:bg-sidebar-accent"),
                  })}
                >
                  {t.label}
                  <span className="text-xs tabular-nums text-muted-foreground">{count(t.statuses)}</span>
                </Link>
              );
            })}
          </nav>

          {months.size === 0 ? (
            <EmptyState title="No records here" text="Records with this status will appear here." />
          ) : (
            <div className="overflow-x-auto rounded-lg border border-border bg-card shadow-sm">
              <Table>
                <TableHeader className="bg-muted">
                  <TableRow className="hover:bg-transparent">
                    <TableHead>Date</TableHead>
                    <TableHead>Position</TableHead>
                    <TableHead>Hours</TableHead>
                    <TableHead>Type</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead className="w-px">
                      <span className="sr-only">Actions</span>
                    </TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {[...months.entries()].map(([month, items]) => (
                    <Fragment key={month}>
                      <TableRow className="hover:bg-transparent">
                        <TableCell colSpan={6} className="bg-background py-2 text-xs font-medium text-muted-foreground">
                          {formatMonth(month)}
                        </TableCell>
                      </TableRow>
                      {items.map((r) => {
                        const blocks = blocksOf(r.position_id!, r.date!);
                        const dayStart = blocks.length ? Math.min(...blocks.map((b) => b.start)) : r.start_min!;
                        const dayEnd = blocks.length ? Math.max(...blocks.map((b) => b.end)) : r.end_min!;
                        const range = formatRange(r.start_min!, r.end_min!);
                        const wholeDay = blocks.length > 0 && r.start_min === dayStart && r.end_min === dayEnd;
                        const split = splitOf(r);
                        const type = r.leave_type && isLeaveType(r.leave_type) ? LEAVE_TYPES[r.leave_type] : "";
                        const position = positionLabel(r.division_name ?? "", r.position_title ?? "");
                        return (
                          <TableRow
                            key={r.id}
                            data-testid="leave-record"
                            className={cn(r.request_id === newest && "animate-row-flash")}
                          >
                            <TableCell className="whitespace-nowrap tabular-nums">{dayLabel(r.date!)}</TableCell>
                            <TableCell className="whitespace-nowrap">{position}</TableCell>
                            <TableCell>
                              <HoursBar
                                start={r.start_min!}
                                end={r.end_min!}
                                dayStart={dayStart}
                                dayEnd={dayEnd}
                                label={wholeDay ? `Whole day · ${range}` : range}
                              />
                            </TableCell>
                            <TableCell>
                              <LeaveTypeTag type={r.leave_type ?? ""} variant="inline" />
                              {split && <span className="mt-1 block text-xs tabular-nums text-muted-foreground">{split}</span>}
                            </TableCell>
                            <TableCell>
                              <StatusBadge status={r.status as RecordStatus} />
                              {r.manager_comment && (
                                <span
                                  data-testid="manager-comment"
                                  className="mt-1 block max-w-64 break-words whitespace-pre-line text-xs text-muted-foreground"
                                >
                                  Manager: “{r.manager_comment}”
                                </span>
                              )}
                            </TableCell>
                            <TableCell className="w-px align-top">
                              <RecordActions
                                recordId={r.id!}
                                label={`${r.date} ${range}`}
                                actions={employeeActions(r.status as RecordStatus)}
                                start={r.start_min!}
                                end={r.end_min!}
                                schedule={scheduleOf(r.position_id!, r.date!)}
                                details={{
                                  date: formatDateLong(r.date!),
                                  hours: range,
                                  meta: type ? `${position} · ${type}` : position,
                                  status: r.status as RecordStatus,
                                  employeeComment: r.employee_comment,
                                  managerComment: r.manager_comment,
                                  split,
                                }}
                                history={histories ? (histories.get(r.id!) ?? []) : null}
                              />
                            </TableCell>
                          </TableRow>
                        );
                      })}
                    </Fragment>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </>
      )}
    </>
  );
}

/** Розподіл погодженого запису (AC-BALANCE-18, AC-BALANCE-19) — завжди текстом. */
function splitOf(r: {
  status: string | null;
  leave_type: string | null;
  paid_days: number | null;
  unpaid_days: number | null;
}): string | null {
  const unpaid = r.unpaid_days == null ? 0 : daysToHundredths(r.unpaid_days);
  return r.status === "approved" && unpaid > 0 && r.leave_type && isLimitedType(r.leave_type)
    ? formatSplit(r.leave_type, daysToHundredths(r.paid_days ?? 0), unpaid)
    : null;
}
