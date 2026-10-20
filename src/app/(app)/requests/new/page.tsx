import { redirect } from "next/navigation";
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
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">New request</h1>
        <p className="mt-1 text-sm text-zinc-600 dark:text-zinc-400">
          Each position you include on the date becomes its own record for that position&apos;s manager.
        </p>
      </div>
      {positions.length === 0 ? (
        <p className="rounded-xl border border-dashed border-zinc-300 bg-white p-8 text-center text-sm text-zinc-600 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-400">
          You have no positions with a schedule yet.
        </p>
      ) : (
        <NewRequestForm positions={positions} />
      )}
    </>
  );
}
