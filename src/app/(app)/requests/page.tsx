import Link from "next/link";
import { redirect } from "next/navigation";
import { isLeaveType, LEAVE_TYPES, positionLabel, RECORD_STATUSES, type RecordStatus } from "@/lib/leave/request";
import { formatDuration, formatRange, isoWeekday } from "@/lib/leave/time";
import { createClient } from "@/lib/supabase/server";

const WEEKDAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

const STATUS_STYLES: Record<RecordStatus, string> = {
  awaiting: "bg-amber-50 text-amber-800 ring-amber-200 dark:bg-amber-950/40 dark:text-amber-300 dark:ring-amber-900",
  approved: "bg-emerald-50 text-emerald-800 ring-emerald-200 dark:bg-emerald-950/40 dark:text-emerald-300 dark:ring-emerald-900",
  rejected: "bg-red-50 text-red-800 ring-red-200 dark:bg-red-950/40 dark:text-red-300 dark:ring-red-900",
  returned: "bg-sky-50 text-sky-800 ring-sky-200 dark:bg-sky-950/40 dark:text-sky-300 dark:ring-sky-900",
  cancelled: "bg-zinc-100 text-zinc-600 ring-zinc-200 dark:bg-zinc-800 dark:text-zinc-400 dark:ring-zinc-700",
};

const isStatus = (value: string): value is RecordStatus => Object.hasOwn(RECORD_STATUSES, value);

// «My requests» (AC-LEAVE-14): лише власні записи — view public.my_leave_records фільтрує за auth.uid(),
// бо RLS показує менеджеру ще й записи його посад.
export default async function MyRequestsPage({ searchParams }: PageProps<"/requests">) {
  const supabase = await createClient();
  const { data } = await supabase.auth.getClaims();
  if (!data?.claims) redirect("/login");

  const { submitted } = await searchParams;
  const { data: records, error } = await supabase
    .from("my_leave_records")
    .select("id, date, start_min, end_min, minutes, leave_type, status, position_title, division_name")
    .order("date", { ascending: false })
    .order("start_min", { ascending: true });

  return (
    <>
      <div className="flex items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">My requests</h1>
          <p className="mt-1 text-sm text-zinc-600 dark:text-zinc-400">
            Each record is one position on one date and is decided separately.
          </p>
        </div>
        <Link
          href="/requests/new"
          className="rounded-md bg-zinc-900 px-4 py-2 text-sm font-medium text-white shadow-sm hover:bg-zinc-800 dark:bg-zinc-100 dark:text-zinc-900 dark:hover:bg-white"
        >
          New request
        </Link>
      </div>

      {submitted === "1" && (
        <p
          role="status"
          className="rounded-md border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-800 dark:border-emerald-900 dark:bg-emerald-950/40 dark:text-emerald-300"
        >
          Your request has been submitted. Each record is now awaiting a decision.
        </p>
      )}

      {error ? (
        <p role="alert" className="text-sm text-red-600">
          The records could not be loaded. Please reload the page.
        </p>
      ) : !records?.length ? (
        <div className="rounded-xl border border-dashed border-zinc-300 bg-white p-10 text-center dark:border-zinc-700 dark:bg-zinc-900">
          <p className="font-medium">No leave records yet</p>
          <p className="mt-1 text-sm text-zinc-600 dark:text-zinc-400">Your records will appear here after you submit a request.</p>
        </div>
      ) : (
        <div className="overflow-hidden rounded-xl border border-zinc-200 bg-white shadow-sm dark:border-zinc-800 dark:bg-zinc-900">
          <table className="w-full text-left text-sm">
            <thead className="bg-zinc-50 text-xs uppercase tracking-wide text-zinc-500 dark:bg-zinc-900/60">
              <tr>
                <th className="px-4 py-3 font-medium">Date</th>
                <th className="px-4 py-3 font-medium">Hours</th>
                <th className="px-4 py-3 font-medium">Position</th>
                <th className="px-4 py-3 font-medium">Leave type</th>
                <th className="px-4 py-3 font-medium">Status</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-zinc-100 dark:divide-zinc-800">
              {records.map((r) => {
                const status = r.status && isStatus(r.status) ? r.status : null;
                return (
                  <tr key={r.id} data-testid="leave-record">
                    <td className="whitespace-nowrap px-4 py-3 tabular-nums">
                      {r.date}
                      {r.date && <span className="ml-2 text-xs text-zinc-500">{WEEKDAYS[isoWeekday(r.date) - 1]}</span>}
                    </td>
                    <td className="whitespace-nowrap px-4 py-3 tabular-nums">
                      {r.start_min !== null && r.end_min !== null ? formatRange(r.start_min, r.end_min) : "—"}
                      {r.minutes !== null && <span className="ml-2 text-xs text-zinc-500">{formatDuration(r.minutes)}</span>}
                    </td>
                    <td className="px-4 py-3">{positionLabel(r.division_name ?? "", r.position_title ?? "")}</td>
                    <td className="px-4 py-3">
                      {r.leave_type && isLeaveType(r.leave_type) ? LEAVE_TYPES[r.leave_type] : r.leave_type}
                    </td>
                    <td className="px-4 py-3">
                      {status ? (
                        <span
                          className={`inline-flex rounded-full px-2.5 py-0.5 text-xs font-medium ring-1 ring-inset ${STATUS_STYLES[status]}`}
                        >
                          {RECORD_STATUSES[status]}
                        </span>
                      ) : (
                        r.status
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </>
  );
}
