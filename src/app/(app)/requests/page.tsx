import Link from "next/link";
import { redirect } from "next/navigation";
import { ButtonLink } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { CheckCircleIcon, CloseIcon, PlusIcon } from "@/components/ui/icons";
import { LeaveTypeTag } from "@/components/ui/leave-type-tag";
import { PageHeader } from "@/components/ui/page-header";
import { isRecordStatus, STATUS_DOT, StatusBadge } from "@/components/ui/status-badge";
import { positionLabel, type RecordStatus } from "@/lib/leave/request";
import { formatDuration, formatKyivDay, formatRange, weekdayName } from "@/lib/leave/time";
import { createClient } from "@/lib/supabase/server";

const TABS: { id: string; label: string; statuses: RecordStatus[] | null }[] = [
  { id: "all", label: "All", statuses: null },
  { id: "awaiting", label: "Awaiting decision", statuses: ["awaiting"] },
  { id: "returned", label: "Returned", statuses: ["returned"] },
  { id: "approved", label: "Approved", statuses: ["approved"] },
  { id: "closed", label: "Rejected and cancelled", statuses: ["rejected", "cancelled"] },
];

const STATS: { label: string; statuses: RecordStatus[] }[] = [
  { label: "Awaiting decision", statuses: ["awaiting"] },
  { label: "Returned for revision", statuses: ["returned"] },
  { label: "Approved", statuses: ["approved"] },
  { label: "Rejected or cancelled", statuses: ["rejected", "cancelled"] },
];

// «My requests» (AC-LEAVE-14): лише власні записи — view public.my_leave_records фільтрує за auth.uid(),
// бо RLS показує менеджеру ще й записи його посад. Записи згруповано за заявкою; вкладки фільтрують за статусом.
export default async function MyRequestsPage({ searchParams }: PageProps<"/requests">) {
  const supabase = await createClient();
  const { data } = await supabase.auth.getClaims();
  if (!data?.claims) redirect("/login");

  const { submitted, status } = await searchParams;
  const tab = TABS.find((t) => t.id === status) ?? TABS[0];

  const { data: rows, error } = await supabase
    .from("my_leave_records")
    .select(
      "id, request_id, date, start_min, end_min, minutes, leave_type, status, position_title, division_name, employee_comment, created_at",
    )
    .order("request_id", { ascending: false })
    .order("date", { ascending: true })
    .order("start_min", { ascending: true });

  const records = (rows ?? []).filter((r) => r.status && isRecordStatus(r.status));
  const count = (statuses: RecordStatus[] | null) =>
    records.filter((r) => !statuses || statuses.includes(r.status as RecordStatus)).length;
  const shown = records.filter((r) => !tab.statuses || tab.statuses.includes(r.status as RecordStatus));

  const groups = new Map<number, typeof shown>();
  for (const r of shown) groups.set(r.request_id!, [...(groups.get(r.request_id!) ?? []), r]);

  return (
    <>
      <PageHeader
        title="My requests"
        description="Each record is one position on one date and is decided separately by that position’s manager."
        actions={
          <ButtonLink href="/requests/new">
            <PlusIcon size={16} />
            New request
          </ButtonLink>
        }
      />

      {submitted === "1" && (
        <div
          role="status"
          className="flex items-center gap-3 rounded-xl border border-success-line bg-success-soft px-4 py-3 text-success"
        >
          <CheckCircleIcon />
          <p className="flex-1">
            <span className="font-semibold">Request submitted.</span> Each record is now awaiting a decision.
          </p>
          <Link
            href="/requests"
            aria-label="Dismiss"
            className="flex size-8 items-center justify-center rounded-lg hover:bg-success-line/40"
          >
            <CloseIcon />
          </Link>
        </div>
      )}

      {error ? (
        <p role="alert" className="text-danger">
          The records could not be loaded. Please reload the page.
        </p>
      ) : records.length === 0 ? (
        <EmptyState
          title="No leave records yet"
          text="Your records will appear here after you submit a request."
          action={<ButtonLink href="/requests/new">New request</ButtonLink>}
        />
      ) : (
        <>
          <div className="grid grid-cols-4 gap-3.5">
            {STATS.map((s) => (
              <Card key={s.label} as="div" className="flex flex-col gap-1.5 px-4.5 py-4">
                <div className="flex items-center gap-2 text-[13px] text-muted">
                  <span aria-hidden="true" className={`size-2 rounded-full ${STATUS_DOT[s.statuses[0]]}`} />
                  {s.label}
                </div>
                <div className="text-[26px] font-semibold tracking-tight">{count(s.statuses)}</div>
              </Card>
            ))}
          </div>

          <nav aria-label="Filter by status" className="flex flex-wrap gap-1 border-b border-line">
            {TABS.map((t) => {
              const active = t.id === tab.id;
              return (
                <Link
                  key={t.id}
                  href={t.id === "all" ? "/requests" : `/requests?status=${t.id}`}
                  aria-current={active ? "page" : undefined}
                  className={`-mb-px inline-flex items-center gap-2 border-b-2 px-3 py-2.5 ${
                    active ? "border-brand font-semibold text-ink" : "border-transparent font-medium text-ink-2 hover:text-ink"
                  }`}
                >
                  {t.label}
                  <span
                    className={`rounded-full px-1.75 text-xs ${active ? "bg-brand-soft text-brand-strong" : "bg-subtle text-ink-2"}`}
                  >
                    {count(t.statuses)}
                  </span>
                </Link>
              );
            })}
          </nav>

          {groups.size === 0 ? (
            <EmptyState title="No records here" text="Records with this status will appear here." />
          ) : (
            <div className="flex flex-col gap-4">
              {[...groups.entries()].map(([requestId, items]) => (
                <Card key={requestId} className="overflow-hidden">
                  <header
                    id={`request-${requestId}`}
                    className="flex flex-wrap items-center gap-3 border-b border-line bg-surface-muted px-5 py-3.5"
                  >
                    <LeaveTypeTag type={items[0].leave_type ?? ""} />
                    <span className="text-muted">Submitted {formatKyivDay(items[0].created_at!)}</span>
                    {items[0].employee_comment && (
                      <p className="w-full break-words whitespace-pre-line text-ink-2">
                        <span className="text-muted">Comment: </span>
                        {items[0].employee_comment}
                      </p>
                    )}
                  </header>
                  <table aria-labelledby={`request-${requestId}`} className="w-full border-collapse text-left">
                    <thead>
                      <tr className="text-xs text-muted">
                        <th className="w-40 px-5 py-2.5 font-medium">Date</th>
                        <th className="w-44 px-3 py-2.5 font-medium">Hours</th>
                        <th className="px-3 py-2.5 font-medium">Position</th>
                        <th className="w-48 px-5 py-2.5 font-medium">Status</th>
                      </tr>
                    </thead>
                    <tbody>
                      {items.map((r) => (
                        <tr key={r.id} data-testid="leave-record" className="border-t border-line-soft align-top">
                          <td className="px-5 py-3.5">
                            <div className="font-medium">{r.date}</div>
                            <div className="text-xs text-muted">{weekdayName(r.date!)}</div>
                          </td>
                          <td className="px-3 py-3.5">
                            <div className="font-mono text-[13px]">{formatRange(r.start_min!, r.end_min!)}</div>
                            <div className="text-xs text-muted">{formatDuration(r.minutes!)}</div>
                          </td>
                          <td className="px-3 py-3.5">{positionLabel(r.division_name ?? "", r.position_title ?? "")}</td>
                          <td className="px-5 py-3.5">
                            <StatusBadge status={r.status as RecordStatus} />
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </Card>
              ))}
            </div>
          )}
        </>
      )}
    </>
  );
}
