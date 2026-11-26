import type { Metadata } from "next";
import Link from "next/link";
import { Card, CardContent } from "@/components/ui/card";
import { PageHeader } from "@/components/ui/page-header";
import { positionLabel } from "@/lib/leave/request";
import { StaffDenied } from "../../../../denied";
import { employeeContext } from "../../../../employee-context";
import { loadManagerCandidates } from "../../../../load-staff-positions";
import { ManagersForm } from "../../../../position-forms";

export const metadata: Metadata = { title: "Change managers · Leave portal" };

/** Відповідальні менеджери посади (AC-STAFF-04): вони бачать і вирішують її записи. */
export default async function ManagersPage({ params }: PageProps<"/staff/[id]/positions/[positionId]/managers">) {
  const { id, positionId } = await params;
  const context = await employeeContext(id, positionId);
  if (!context?.position) return <StaffDenied />;
  const { supabase, employee, position, name } = context;
  const candidates = await loadManagerCandidates(supabase);

  return (
    <>
      <PageHeader
        title="Change managers"
        description={`${positionLabel(position.division, position.title)} · ${name}`}
        breadcrumb={
          <Link href={`/staff/${employee.id}`} className="hover:text-foreground">
            {name}
          </Link>
        }
      />
      <Card className="max-w-3xl">
        <CardContent>
          <ManagersForm
            employeeId={employee.id}
            positionId={position.id}
            candidates={candidates}
            initial={position.managers.map((m) => m.id)}
          />
        </CardContent>
      </Card>
    </>
  );
}
