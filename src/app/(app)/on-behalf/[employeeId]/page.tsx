import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { CalendarX, CircleAlert, CircleCheck, Info } from "lucide-react";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { EmptyState } from "@/components/ui/empty-state";
import { PageHeader } from "@/components/ui/page-header";
import { schoolYearOf } from "@/lib/leave/balance";
import { employeeIdOf, forEmployee, ON_BEHALF_MESSAGES, parseSubmitted, refusalOf, submittedMessage } from "@/lib/leave/on-behalf";
import { formatDateLong, isCalendarDate, kyivDate, TIME_MESSAGES } from "@/lib/leave/time";
import { createClient } from "@/lib/supabase/server";
import { loadRemaining } from "../../balances/load-balances";
import { loadClosures } from "../../calendar/load-closures";
import { NewRequestForm } from "../../requests/new/new-request-form";
import { loadEmployeeSubstitutes, loadOnBehalfPositions } from "../load";
import { OnBehalfRefusal } from "../refusal";

export const metadata: Metadata = { title: "Request on behalf · Leave portal" };

const BREADCRUMB = (
  <Link href="/on-behalf" className="text-primary underline-offset-2 hover:underline">
    ← Request on behalf
  </Link>
);

// Форма заявки від імені (D10, D11 openspec/changes/impl-on-behalf/design.md): та сама форма, що в «New request», з
// пропом subject — тексти для менеджера, колонка «Status after submit», список замін працівника. Хто має право, вирішує
// база (on_behalf_positions → тексти AC-BEHALF-11, AC-BEHALF-12, AC-BEHALF-15 без імен, email і форми). Гостя веде
// на /login src/proxy.ts ще до рендеру (AC-BEHALF-14).
export default async function OnBehalfRequestPage({
  params,
  searchParams,
}: {
  params: Promise<{ employeeId: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const supabase = await createClient();
  const { data } = await supabase.auth.getClaims();
  const claims = data?.claims;
  if (!claims) redirect("/login");

  const { employeeId: raw } = await params;
  const { submitted, skipped } = await searchParams;
  const employeeId = employeeIdOf(raw);
  if (employeeId === claims.sub) redirect("/requests/new");

  const loaded = employeeId ? await loadOnBehalfPositions(supabase, employeeId) : null;
  if (!employeeId || !loaded || !loaded.ok) {
    const refusal = loaded && !loaded.ok ? refusalOf(loaded.message) : ON_BEHALF_MESSAGES.notYourEmployee;
    return (
      <>
        <PageHeader title="Request on behalf" breadcrumb={BREADCRUMB} />
        {refusal ? (
          <OnBehalfRefusal message={refusal} />
        ) : (
          <Alert variant="destructive" role="alert">
            <CircleAlert />
            <AlertDescription>The page could not be loaded. Please try again.</AlertDescription>
          </Alert>
        )}
      </>
    );
  }

  const today = kyivDate(new Date());
  const year = schoolYearOf(today);
  const [{ data: profile }, emails, remaining, { data: active, error: activeError }, closures, substitutes] = await Promise.all([
    supabase.from("profiles").select("role").eq("id", claims.sub).maybeSingle(),
    supabase.rpc("on_behalf_employees"),
    // Залишки працівника для попередження на підсумку (Assumptions PM: його бачить і менеджер; AC-BALANCE-20).
    loadRemaining(supabase, employeeId, [year - 1, year, year + 1]).catch(() => null),
    // Дати чинних записів працівника — календар їх зафарбовує; перетин однаково перевіряє база.
    supabase.rpc("on_behalf_record_dates", {
      p_employee_id: employeeId,
      p_from: `${year - 1}-09-01`,
      p_to: `${year + 2}-08-31`,
    }),
    loadClosures(supabase, `${year - 1}-09-01`, `${year + 2}-08-31`).catch(() => null),
    loadEmployeeSubstitutes(supabase, employeeId),
  ]);
  const email = emails.data?.find((e) => e.employee_id === employeeId)?.email ?? "this employee";
  const recordDates = activeError ? null : (active ?? []).map((r) => r.date);
  const counts = parseSubmitted(submitted);
  const skippedDates = typeof skipped === "string" ? skipped.split(",").filter(isCalendarDate) : [];
  const { positions } = loaded;

  return (
    <>
      <PageHeader
        title={`New request for ${email}`}
        description="Fill in the request as the employee would. The employee sees every record and its history in My requests."
        breadcrumb={BREADCRUMB}
      />
      <div className="flex flex-col gap-4">
        {counts && (
          <Alert variant="info" role="status" data-testid="on-behalf-submitted">
            <CircleCheck />
            <AlertDescription>
              <span className="text-foreground">{submittedMessage(counts.approved, counts.awaiting)}</span>
              {skippedDates.map((d) => (
                <span key={d} className="block text-muted-foreground">
                  {formatDateLong(d)} was not accepted: {forEmployee(TIME_MESSAGES.noWorkingHours)}
                </span>
              ))}
            </AlertDescription>
          </Alert>
        )}
        <Alert variant="info" role="note">
          <Info />
          <AlertDescription>
            {profile?.role === "admin" ? ON_BEHALF_MESSAGES.adminNote : ON_BEHALF_MESSAGES.managerNote}
          </AlertDescription>
        </Alert>
        {positions.length === 0 ? (
          <EmptyState
            icon={<CalendarX className="size-5" aria-hidden="true" />}
            title="This employee has no positions with a schedule yet"
            text="An administrator adds positions and schedules; then a request can be recorded here."
          />
        ) : (
          <NewRequestForm
            key={typeof submitted === "string" ? submitted : "form"}
            positions={positions}
            today={today}
            remaining={remaining && Object.fromEntries(remaining)}
            recordDates={recordDates}
            closures={closures}
            substitutes={substitutes}
            subject={{
              employeeId,
              email,
              decides: Object.fromEntries(positions.map((p) => [p.id, p.decides])),
            }}
          />
        )}
      </div>
    </>
  );
}
