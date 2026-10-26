import Link from "next/link";
import { redirect } from "next/navigation";
import { CalendarX } from "lucide-react";
import { EmptyState } from "@/components/ui/empty-state";
import { PageHeader } from "@/components/ui/page-header";
import { schoolYearOf } from "@/lib/leave/balance";
import { kyivDate } from "@/lib/leave/time";
import { createClient } from "@/lib/supabase/server";
import { loadRemaining } from "../../balances/load-balances";
import { loadOwnPositions } from "./load-positions";
import { NewRequestForm } from "./new-request-form";

export default async function NewRequestPage() {
  const supabase = await createClient();
  const { data } = await supabase.auth.getClaims();
  const claims = data?.claims;
  if (!claims) redirect("/login");

  // Залишки для попередження на підсумку (AC-BALANCE-08, AC-BALANCE-15, AC-BALANCE-17): поточний навчальний рік і сусідні —
  // заявки «заднім числом» і наперед. Дати поза ними перевіряє server action під час подання.
  const today = kyivDate(new Date());
  const year = schoolYearOf(today);
  const [positions, remaining, { data: active, error: activeError }] = await Promise.all([
    loadOwnPositions(supabase, claims.sub),
    loadRemaining(supabase, claims.sub, [year - 1, year, year + 1]).catch(() => null),
    // Дати, на які вже є чинні власні записи: календар їх зафарбовує (DESIGN.md, розділ 6). Перетин перевіряє база
    // (AC-LEAVE-16); збій тут лише прибирає підказку (null — календар про це скаже). Ті самі три навчальні роки, що й залишки, — щоб вибірка не
    // впиралася в ліміт рядків PostgREST.
    supabase
      .from("my_leave_records")
      .select("date")
      .in("status", ["awaiting", "returned", "approved"])
      .gte("date", `${year - 1}-09-01`)
      .lte("date", `${year + 2}-08-31`),
  ]);
  const recordDates = activeError
    ? null
    : [...new Set((active ?? []).map((r) => r.date).filter((d): d is string => Boolean(d)))];

  return (
    <>
      <PageHeader
        title="New request"
        description="Each position you include on a date becomes its own record for that position’s manager."
        breadcrumb={
          <Link href="/requests" className="text-primary underline-offset-2 hover:underline">
            ← My requests
          </Link>
        }
      />
      {positions.length === 0 ? (
        <EmptyState
          icon={<CalendarX className="size-5" aria-hidden="true" />}
          title="You have no positions with a schedule yet"
          text="Your administrator adds positions and schedules; then you can request leave here."
        />
      ) : (
        <NewRequestForm
          positions={positions}
          today={today}
          remaining={remaining && Object.fromEntries(remaining)}
          recordDates={recordDates}
        />
      )}
    </>
  );
}
