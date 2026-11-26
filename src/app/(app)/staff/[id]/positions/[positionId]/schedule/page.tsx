import type { Metadata } from "next";
import Link from "next/link";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { PageHeader } from "@/components/ui/page-header";
import { positionLabel, weeklySchedule } from "@/lib/leave/request";
import { currentAndNext, scheduleSummary } from "@/lib/leave/schedule";
import { kyivDate } from "@/lib/leave/time";
import { weekFromBlocks } from "@/lib/staff/position";
import { StaffDenied } from "../../../../denied";
import { employeeContext } from "../../../../employee-context";
import { ScheduleForm } from "../../../../position-forms";

export const metadata: Metadata = { title: "Change schedule · Leave portal" };

/**
 * Новий розклад посади з дати (AC-STAFF-07): попередній діє до цієї дати, наявні записи не змінюються. Редактор
 * починає з розкладу, що діє сьогодні (а якщо його ще немає — з наступної версії).
 */
export default async function SchedulePage({ params }: PageProps<"/staff/[id]/positions/[positionId]/schedule">) {
  const { id, positionId } = await params;
  const context = await employeeContext(id, positionId);
  if (!context?.position) return <StaffDenied />;
  const { employee, position, name } = context;
  const today = kyivDate(new Date());
  const { current, next } = currentAndNext(position.blocks, today);
  const label = positionLabel(position.division, position.title);

  return (
    <>
      <PageHeader
        title="Change schedule"
        description={`${label} · ${name}`}
        breadcrumb={
          <Link href={`/staff/${employee.id}`} className="hover:text-foreground">
            {name}
          </Link>
        }
      />
      <Card className="max-w-3xl gap-4">
        <CardHeader>
          <CardTitle className="text-base font-semibold">New schedule</CardTitle>
          <CardDescription>Now: {scheduleSummary(position.blocks, today, weeklySchedule)}</CardDescription>
        </CardHeader>
        <CardContent>
          <ScheduleForm
            employeeId={employee.id}
            positionId={position.id}
            initial={weekFromBlocks(current.length ? current : (next?.blocks ?? []))}
            today={today}
          />
        </CardContent>
      </Card>
    </>
  );
}
