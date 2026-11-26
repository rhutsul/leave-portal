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

const TITLE = "Request on behalf";
const DESCRIPTION = "Record leave for an employee of your positions.";

// Заявка від імені (D10 openspec/changes/impl-on-behalf/design.md): менеджер — працівники його посад, адміністратор —
// усі, крім себе (on_behalf_employees()). Працівник за прямим посиланням — текст AC-BEHALF-12, менеджер без посад —
// AC-BEHALF-15: обидва тексти дає база, сторінка показує їх дослівно без даних.
export default async function OnBehalfPage() {
  const supabase = await createClient();
  const { data } = await supabase.auth.getClaims();
  if (!data?.claims) redirect("/login");

  const { data: rows, error } = await supabase.rpc("on_behalf_employees");
  const refusal = error ? refusalOf(error.message) : rows?.length === 0 ? ON_BEHALF_MESSAGES.noEmployees : null;

  return (
    <>
      <PageHeader title={TITLE} description={refusal ? undefined : DESCRIPTION} />
      {refusal ? (
        <OnBehalfRefusal message={refusal} />
      ) : error ? (
        <Alert variant="destructive" role="alert">
          <CircleAlert />
          <AlertDescription>The page could not be loaded. Please try again.</AlertDescription>
        </Alert>
      ) : (
        <EmployeeList
          employees={(rows ?? []).map((r) => ({
            id: r.employee_id,
            email: r.email,
            position: r.main_title ? (r.division_name ? `${r.division_name} / ${r.main_title}` : r.main_title) : "",
          }))}
        />
      )}
    </>
  );
}
