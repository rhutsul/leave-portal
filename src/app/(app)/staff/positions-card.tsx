import Link from "next/link";
import { BriefcaseBusiness, Plus } from "lucide-react";
import { buttonVariants } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { positionLabel, weeklySchedule } from "@/lib/leave/request";
import { scheduleSummary } from "@/lib/leave/schedule";
import { kindLabel } from "@/lib/staff/position";
import type { StaffPosition } from "./load-staff-positions";
import { PositionMenu } from "./position-menu";

/**
 * Посади працівника (AC-STAFF-04; D10): назва з підрозділом, Main / Additional, розклад, що діє сьогодні, і наступна
 * версія («From …»), відповідальні менеджери; дії — у «⋯». Деактивованому посад не додаємо (база відмовляє).
 */
export function PositionsCard({
  employeeId,
  positions,
  today,
  canAdd,
}: {
  employeeId: string;
  positions: StaffPosition[];
  today: string;
  canAdd: boolean;
}) {
  return (
    <Card className="gap-4" data-testid="positions-card">
      <CardHeader className="flex flex-wrap items-start justify-between gap-3">
        <div className="flex flex-col gap-1.5">
          <CardTitle className="text-base font-semibold">Positions</CardTitle>
          <CardDescription>Each position has its own schedule from a date and its responsible managers.</CardDescription>
        </div>
        {canAdd && (
          <Link
            href={`/staff/${employeeId}/positions/new`}
            className={buttonVariants({ variant: "secondary", className: "max-sm:w-full pointer-coarse:h-11" })}
          >
            <Plus />
            Add position
          </Link>
        )}
      </CardHeader>
      <CardContent className="flex flex-col gap-3">
        {positions.length === 0 ? (
          <EmptyState
            icon={<BriefcaseBusiness className="size-5" aria-hidden="true" />}
            title="No positions yet"
            text="Add the main position with its schedule and responsible managers."
            className="py-6"
          />
        ) : (
          positions.map((p) => {
            const label = positionLabel(p.division, p.title);
            return (
              <div
                key={p.id}
                data-testid="staff-position"
                className="flex items-start justify-between gap-3 rounded-lg border border-border p-4"
              >
                <div className="flex min-w-0 flex-col gap-1">
                  <span className="font-medium">
                    {label}
                    <span className="ml-2 text-xs font-normal text-muted-foreground">{kindLabel(p.kind)}</span>
                  </span>
                  <span className="text-[13px] tabular-nums text-muted-foreground" data-testid="position-schedule">
                    {scheduleSummary(p.blocks, today, weeklySchedule)}
                  </span>
                  <span className="text-xs text-muted-foreground">
                    Managers: {p.managers.length ? p.managers.map((m) => m.name).join(", ") : "an administrator decides"}
                  </span>
                </div>
                <PositionMenu employeeId={employeeId} positionId={p.id} label={label} />
              </div>
            );
          })
        )}
      </CardContent>
    </Card>
  );
}
