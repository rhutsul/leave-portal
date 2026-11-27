import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { CircleAlert } from "lucide-react";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { PageHeader } from "@/components/ui/page-header";
import { ON_BEHALF_MESSAGES, refusalOf } from "@/lib/leave/on-behalf";
import { createClient } from "@/lib/supabase/server";
import { EmployeeList } from "./employee-list";
import { OnBehalfRefusal } from "./refusal";

export const metadata: Metadata = { title: "Request on behalf · Leave portal" };

// Заявка від імені (D10 openspec/changes/archive/2026-11-27-impl-on-behalf/design.md): менеджер — працівники його посад, адміністратор —
// усі, крім себе (on_behalf_employees()). Працівник за прямим посиланням — текст AC-BEHALF-12, менеджер без посад —
// AC-BEHALF-15: обидва тексти дає база, сторінка показує їх дослівно без даних.
type EmployeeRow = { employee_id: string; email: string; main_title: string | null; division_name: string | null };

const positionOf = (r: EmployeeRow) =>
  r.main_title ? (r.division_name ? `${r.division_name} / ${r.main_title}` : r.main_title) : "";

/** Вміст сторінки: відмова чи «немає працівників» дослівно, збій — Alert, інакше список. */
function Content({ rows, error }: { rows: EmployeeRow[] | null; error: { message: string } | null }) {
  const refusal = error ? refusalOf(error.message) : rows?.length ? null : ON_BEHALF_MESSAGES.noEmployees;
  if (refusal) return <OnBehalfRefusal message={refusal} />;
  if (error || !rows) {
    return (
      <Alert variant="destructive" role="alert">
        <CircleAlert />
        <AlertDescription>The page could not be loaded. Please try again.</AlertDescription>
      </Alert>
    );
  }
  return <EmployeeList employees={rows.map((r) => ({ id: r.employee_id, email: r.email, position: positionOf(r) }))} />;
}

export default async function OnBehalfPage() {
  const supabase = await createClient();
  const { data } = await supabase.auth.getClaims();
  if (!data?.claims) redirect("/login");

  const { data: rows, error } = await supabase.rpc("on_behalf_employees");
  return (
    <>
      <PageHeader title="Request on behalf" description={error || !rows?.length ? undefined : "Record leave for an employee of your positions."} />
      <Content rows={rows} error={error} />
    </>
  );
}
