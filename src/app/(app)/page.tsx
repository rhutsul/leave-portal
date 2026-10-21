import Link from "next/link";
import { redirect } from "next/navigation";
import { BalanceCards } from "@/components/balance-cards";
import { ButtonLink } from "@/components/ui/button";
import { Card, CardHeader } from "@/components/ui/card";
import { ClockIcon, PlusIcon } from "@/components/ui/icons";
import { PageHeader } from "@/components/ui/page-header";
import { isRecordStatus, StatusBadge } from "@/components/ui/status-badge";
import { formatSchoolYear, schoolYearOf } from "@/lib/leave/balance";
import { isLeaveType, LEAVE_TYPES, positionLabel, type RecordStatus } from "@/lib/leave/request";
import { formatDateLong, formatRange, kyivDate, kyivHour, monthShort } from "@/lib/leave/time";
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
          <>
            <ButtonLink href="/requests" variant="ghost">
              My requests
            </ButtonLink>
            <ButtonLink href="/requests/new">
              <PlusIcon size={16} />
              New request
            </ButtonLink>
          </>
        }
      />

      <div className="flex flex-wrap items-stretch gap-5">
        <Card className="min-w-0 flex-[999_1_520px] overflow-hidden">
          <CardHeader
            title="Upcoming leave"
            action={
              <Link href="/requests" className="text-[13px] font-medium text-brand-strong underline-offset-2 hover:underline">
                View all
              </Link>
            }
          />
          {items.length === 0 ? (
            <p className="px-5 py-8 text-center text-muted">No upcoming leave.</p>
          ) : (
            <ul>
              {items.map((records) => {
                const first = records[0];
                const statuses = [...new Set(records.map((r) => r.status).filter((s) => s && isRecordStatus(s)))];
                const type = first.leave_type && isLeaveType(first.leave_type) ? LEAVE_TYPES[first.leave_type] : "";
                const hours = records.map((r) => formatRange(r.start_min!, r.end_min!)).join(", ");
                return (
                  <li
                    key={`${first.request_id}|${first.date}`}
                    className="flex items-center gap-4 border-t border-line-soft px-5 py-3.5 first:border-t-0"
                  >
                    <div className="w-12 shrink-0 rounded-[10px] border border-line py-1 text-center">
                      <div className="text-[11px] font-semibold uppercase text-danger">{monthShort(first.date!)}</div>
                      <div className="text-lg font-semibold">{Number(first.date!.slice(8))}</div>
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="font-medium">
                        {type} · <span className="font-mono text-[13px]">{hours}</span>
                      </div>
                      <div className="text-[13px] text-muted">
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

        <Card className="flex flex-[1_1_280px] flex-col gap-3.5 px-5 py-4.5">
          <h2 className="text-[15px] font-semibold">Awaiting a decision</h2>
          <div className="flex items-center gap-3">
            <span className="flex size-10 items-center justify-center rounded-xl bg-awaiting-soft text-awaiting">
              <ClockIcon />
            </span>
            <span className="text-[26px] font-semibold tracking-tight">{awaiting ?? 0}</span>
            <span className="text-muted">{awaiting === 1 ? "record" : "records"}</span>
          </div>
          <Link href="/requests?status=awaiting" className="text-[13px] font-medium text-brand-strong underline-offset-2 hover:underline">
            Open the records
          </Link>
        </Card>
      </div>

      <section aria-labelledby="balances-title" className="flex flex-col gap-3.5">
        <div className="flex items-baseline justify-between gap-4">
          <h2 id="balances-title" className="text-[17px] font-semibold">
            Balances · {formatSchoolYear(schoolYear)}
          </h2>
          <span className="text-[13px] text-muted">
            Days, to 0.01. Only approved records count.{" "}
            <Link href="/balances" className="font-medium text-brand-strong underline-offset-2 hover:underline">
              All balances
            </Link>
          </span>
        </div>
        {balances.ok ? (
          <BalanceCards balances={balances.balances} />
        ) : (
          // Власні залишки видно завжди, тож тут можливий лише збій завантаження.
          <p role="alert" className="text-danger">
            The balances could not be loaded. Please reload the page.
          </p>
        )}
      </section>
    </>
  );
}
