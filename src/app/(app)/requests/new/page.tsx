import Link from "next/link";
import { redirect } from "next/navigation";
import { Card } from "@/components/ui/card";
import { PageHeader } from "@/components/ui/page-header";
import { createClient } from "@/lib/supabase/server";
import { loadOwnPositions } from "./load-positions";
import { NewRequestForm } from "./new-request-form";

export default async function NewRequestPage() {
  const supabase = await createClient();
  const { data } = await supabase.auth.getClaims();
  const claims = data?.claims;
  if (!claims) redirect("/login");

  const positions = await loadOwnPositions(supabase, claims.sub);

  return (
    <>
      <PageHeader
        title="New request"
        description="Each position you include on a date becomes its own record for that position’s manager."
        breadcrumb={
          <>
            <Link href="/requests" className="text-brand-strong underline-offset-2 hover:underline">
              My requests
            </Link>{" "}
            / New request
          </>
        }
      />
      {positions.length === 0 ? (
        <Card className="border-dashed p-10 text-center text-muted">You have no positions with a schedule yet.</Card>
      ) : (
        <NewRequestForm positions={positions} />
      )}
    </>
  );
}
