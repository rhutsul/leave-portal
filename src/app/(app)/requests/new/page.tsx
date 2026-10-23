import Link from "next/link";
import { redirect } from "next/navigation";
import { Card } from "@/components/ui/legacy-card";
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
  const [positions, remaining] = await Promise.all([
    loadOwnPositions(supabase, claims.sub),
    loadRemaining(supabase, claims.sub, [year - 1, year, year + 1]).catch(() => null),
  ]);

  return (
    <>
      <PageHeader
        title="New request"
        description="Each position you include on a date becomes its own record for that position’s manager."
        breadcrumb={
          <>
            <Link href="/requests" className="text-primary underline-offset-2 hover:underline">
              My requests
            </Link>{" "}
            / New request
          </>
        }
      />
      {positions.length === 0 ? (
        <Card className="border-dashed p-10 text-center text-muted-foreground">You have no positions with a schedule yet.</Card>
      ) : (
        <NewRequestForm
          positions={positions}
          today={today}
          remaining={remaining && Object.fromEntries(remaining)}
        />
      )}
    </>
  );
}
