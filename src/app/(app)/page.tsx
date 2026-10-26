import Link from "next/link";
import { redirect } from "next/navigation";
import { ArrowRight, Plus } from "lucide-react";
import { BalanceCards } from "@/components/balance-cards";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { buttonVariants } from "@/components/ui/button";
import { Card, CardAction, CardHeader, CardTitle } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { LeaveTypeTag } from "@/components/ui/leave-type-tag";
import { PageHeader } from "@/components/ui/page-header";
import { isRecordStatus, StatusBadge } from "@/components/ui/status-badge";
import { formatSchoolYear, schoolYearOf } from "@/lib/leave/balance";
import { positionLabel, type RecordStatus } from "@/lib/leave/request";
import { formatDateLong, formatRange, kyivDate, kyivHour, monthShort, weekdayName } from "@/lib/leave/time";
import { createClient } from "@/lib/supabase/server";
import { loadBalances } from "./balances/load-balances";

const UPCOMING_LIMIT = 5;

function greeting(hour: number) {
  if (hour < 12) return "Good morning";
  if (hour < 18) return "Good afternoon";
  return "Good evening";
}

// Overview: найближчі відпустки (власні записи, що ще діють), скільки записів чекає рішення, і власні залишки
// за поточний навчальний рік.
export default async function Overview() {
  const supabase = await createClient();
  const { data } = await supabase.auth.getClaims();
  const claims = data?.claims;
  if (!claims) redirect("/login");

  const now = new Date();
  const today = kyivDate(now);
  const schoolYear = schoolYearOf(today);

  const [{ data: profile }, { data: upcoming }, { count: awaiting }, balances] = await Promise.all([
    supabase.from("profiles").select("full_name").eq("id", claims.sub).maybeSingle(),
    supabase
      .from("my_leave_records")
      .select("id, request_id, date, start_min, end_min, leave_type, status, position_title, division_name")
      .gte("date", today)
      .in("status", ["awaiting", "returned", "approved"])
      .order("date", { ascending: true })
      .order("start_min", { ascending: true })
      .limit(20),
    supabase.from("my_leave_records").select("id", { count: "exact", head: true }).eq("status", "awaiting"),
    loadBalances(supabase, claims.sub, schoolYear),
  ]);

  // Одна заявка на одну дату — один рядок, навіть якщо в ній кілька посад.
  const days = new Map<string, NonNullable<typeof upcoming>>();
  for (const r of upcoming ?? []) {
    const key = `${r.request_id}|${r.date}`;
    days.set(key, [...(days.get(key) ?? []), r]);
  }
  const items = [...days.values()].slice(0, UPCOMING_LIMIT);
  const firstName = profile?.full_name?.split(/\s+/)[0];

  return (
    <>
      <PageHeader
        title={firstName ? `${greeting(kyivHour(now))}, ${firstName}` : greeting(kyivHour(now))}
        description={formatDateLong(today)}
        actions={
          <Link href="/requests/new" className={buttonVariants()}>
            <Plus />
            New request
          </Link>
        }
      />

      <div className="flex flex-wrap items-stretch gap-4">
        <Card className="min-w-0 flex-[999_1_520px] gap-0 py-0">
          <CardHeader className="border-b border-border py-3.5">
            <CardTitle>Upcoming leave</CardTitle>
            <CardAction>
              <Link href="/requests" className={buttonVariants({ variant: "link", size: "sm" })}>
                View all
              </Link>
            </CardAction>
          </CardHeader>
          {items.length === 0 ? (
            <EmptyState
              className="rounded-none border-0"
              title="No upcoming leave"
              text="Records you submit for future dates appear here."
            />
          ) : (
            <ul>
              {items.map((records) => {
                const first = records[0];
                const statuses = [...new Set(records.map((r) => r.status).filter((s) => s && isRecordStatus(s)))];
                const hours = records.map((r) => formatRange(r.start_min!, r.end_min!)).join(", ");
                return (
                  <li
                    key={`${first.request_id}|${first.date}`}
                    className="flex items-center gap-4 border-t border-border px-5 py-3 first:border-t-0"
                  >
                    <div className="w-12 shrink-0 rounded-md border border-border py-1 text-center">
                      <div className="text-[11px] font-semibold uppercase text-muted-foreground">{monthShort(first.date!)}</div>
                      <div className="text-lg leading-6 font-semibold tabular-nums">{Number(first.date!.slice(8))}</div>
                    </div>
                    <div className="flex min-w-0 flex-1 flex-col gap-0.5">
                      <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
                        <LeaveTypeTag type={first.leave_type ?? ""} variant="inline" className="font-medium" />
                        <span className="tabular-nums text-muted-foreground">
                          {weekdayName(first.date!)} · {hours}
                        </span>
                      </div>
                      <div className="truncate text-[13px] text-muted-foreground">
                        {records.length === 1
                          ? positionLabel(first.division_name ?? "", first.position_title ?? "")
                          : `${records.length} positions`}
                      </div>
                    </div>
                    <div className="flex flex-col items-end gap-1">
                      {statuses.map((s) => (
                        <StatusBadge key={s} status={s as RecordStatus} />
                      ))}
                    </div>
                  </li>
                );
              })}
            </ul>
          )}
        </Card>

        <Card className="flex-[1_1_260px] gap-2.5 px-5 py-4">
          <span className="text-[13px] text-muted-foreground">Awaiting decision</span>
          <span className="text-[26px] leading-[30px] font-semibold tracking-tight tabular-nums">
            {awaiting ?? 0}
            <span className="ml-1.5 text-sm font-medium tracking-normal text-muted-foreground">
              {awaiting === 1 ? "record" : "records"}
            </span>
          </span>
          <Link
            href="/requests?status=awaiting"
            className={buttonVariants({ variant: "link", size: "sm", className: "mt-auto self-start" })}
          >
            Open the records
            <ArrowRight />
          </Link>
        </Card>
      </div>

      <section aria-labelledby="balances-title" className="flex flex-col gap-3">
        <div className="flex items-baseline justify-between gap-4">
          <h2 id="balances-title" className="text-base font-semibold">
            Balances · {formatSchoolYear(schoolYear)}
          </h2>
          <Link href="/balances" className={buttonVariants({ variant: "link", size: "sm" })}>
            All balances
          </Link>
        </div>
        {balances.ok ? (
          <BalanceCards balances={balances.balances} />
        ) : (
          // Власні залишки видно завжди, тож тут можливий лише збій завантаження.
          <Alert variant="destructive" role="alert">
            <AlertDescription>The balances could not be loaded. Please reload the page.</AlertDescription>
          </Alert>
        )}
      </section>
    </>
  );
}
