import Link from "next/link";
import { redirect } from "next/navigation";
import { CircleAlert, ShieldX } from "lucide-react";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { buttonVariants } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { PageHeader } from "@/components/ui/page-header";
import { RecordSummary } from "@/components/ui/record-summary";
import { isRecordStatus, StatusBadge } from "@/components/ui/status-badge";
import { CANCELLATION_MESSAGES, cancellationBlocker } from "@/lib/leave/cancellation";
import { parseRecordId } from "@/lib/leave/decision";
import { isLeaveType, LEAVE_TYPES, positionLabel } from "@/lib/leave/request";
import { formatDateLong, formatRange, kyivDate } from "@/lib/leave/time";
import { createClient } from "@/lib/supabase/server";
import { CancelRequestForm } from "./cancel-form";
import { loadOwnCancellable } from "./load-record";

const backToList = (
  <Link href="/requests" className={buttonVariants({ variant: "outline" })}>
    Go to My requests
  </Link>
);

// Пряме посилання на прохання про скасування погодженого запису (D9 openspec/changes/impl-cancel-approved/design.md).
// Гість — на вхід, і жодних даних запису (AC-CANCEL-12; той самий redirect робить і layout). Чужий запис —
// "You can cancel only your own records" без даних (AC-CANCEL-10); менеджера чи адміністратора, якому RLS показує
// запис, — у «Decisions», де скасування з приміткою. Власний, який не можна скасувати, — причина замість форми
// (AC-CANCEL-05, AC-CANCEL-06).
export default async function CancelRecordPage({ params }: PageProps<"/requests/[id]/cancel">) {
  const supabase = await createClient();
  const { data } = await supabase.auth.getClaims();
  const claims = data?.claims;
  if (!claims) redirect("/login");

  const recordId = parseRecordId((await params).id);
  const own = recordId === null ? { error: false as const, record: null } : await loadOwnCancellable(supabase, claims.sub, recordId);

  if (own.error) {
    return (
      <>
        <PageHeader title="Request cancellation" />
        <Alert variant="destructive" role="alert">
          <CircleAlert />
          <AlertDescription>The record could not be loaded. Please reload the page.</AlertDescription>
        </Alert>
      </>
    );
  }

  const record = own.record;
  if (!record || !isRecordStatus(record.status)) {
    if (recordId !== null) {
      const [{ data: profile }, { data: visible }] = await Promise.all([
        supabase.from("profiles").select("role").eq("id", claims.sub).maybeSingle(),
        supabase.from("leave_records").select("id").eq("id", recordId).maybeSingle(),
      ]);
      if (visible && (profile?.role === "manager" || profile?.role === "admin")) {
        redirect(`/decisions?tab=history&record=${recordId}`);
      }
    }
    return (
      <>
        <PageHeader title="Request cancellation" />
        <EmptyState
          icon={<ShieldX className="size-5" aria-hidden="true" />}
          titleAs="h2"
          title={CANCELLATION_MESSAGES.notOwn}
          text="Ask to cancel your own approved records from My requests."
          action={backToList}
        />
      </>
    );
  }

  const type = isLeaveType(record.leave_type) ? LEAVE_TYPES[record.leave_type] : record.leave_type;
  const position = positionLabel(record.division_name, record.position_title);
  const summary = (
    <RecordSummary
      date={formatDateLong(record.date)}
      hours={formatRange(record.start_min, record.end_min)}
      meta={type ? `${position} · ${type}` : position}
    />
  );
  const blocker = cancellationBlocker(
    {
      date: record.date,
      status: record.status,
      cancelReason: record.cancel_reason,
      cancelRequestId: record.cancel_request_id,
    },
    kyivDate(new Date()),
  );

  return (
    <>
      <PageHeader
        title="Request cancellation"
        description="Your manager confirms or declines the cancellation. Until then the record stays Approved."
        breadcrumb={
          <Link href="/requests" className="hover:text-foreground">
            My requests
          </Link>
        }
      />
      <div className="flex max-w-xl flex-col gap-5">
        {blocker ? (
          <>
            <Alert variant="destructive" role="alert">
              <CircleAlert />
              <AlertDescription>{blocker}</AlertDescription>
            </Alert>
            {summary}
            <div className="flex items-center gap-2 text-sm">
              <span className="text-muted-foreground">Status:</span>
              <StatusBadge status={record.status} />
            </div>
            <div>{backToList}</div>
          </>
        ) : (
          <CancelRequestForm recordId={record.id} summary={summary} />
        )}
      </div>
    </>
  );
}
