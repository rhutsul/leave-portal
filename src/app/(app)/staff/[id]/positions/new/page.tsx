import type { Metadata } from "next";
import Link from "next/link";
import { Card, CardContent } from "@/components/ui/card";
import { PageHeader } from "@/components/ui/page-header";
import { kyivDate } from "@/lib/leave/time";
import { StaffDenied } from "../../../denied";
import { employeeContext } from "../../../employee-context";
import { loadDivisions, loadManagerCandidates } from "../../../load-staff-positions";
import { NewPositionForm } from "../../../position-forms";

export const metadata: Metadata = { title: "Add position · Leave portal" };

/** «Add position» (AC-STAFF-04, -05, -06): тип, підрозділ, назва, розклад з дати й відповідальні менеджери. */
export default async function NewPositionPage({ params }: PageProps<"/staff/[id]/positions/new">) {
  const context = await employeeContext((await params).id);
  if (!context || context.employee.status === "deactivated") return <StaffDenied />;
  const { supabase, employee, positions, name } = context;
  const [divisions, candidates] = await Promise.all([loadDivisions(supabase), loadManagerCandidates(supabase)]);

  return (
    <>
      <PageHeader
        title="Add position"
        description={`${name} · ${employee.email}`}
        breadcrumb={
          <Link href={`/staff/${employee.id}`} className="hover:text-foreground">
            {name}
          </Link>
        }
      />
      <Card className="max-w-3xl">
        <CardContent>
          <NewPositionForm
            employeeId={employee.id}
            divisions={divisions}
            candidates={candidates}
            hasMain={positions.some((p) => p.kind === "main")}
            today={kyivDate(new Date())}
          />
        </CardContent>
      </Card>
    </>
  );
}
