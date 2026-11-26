import { EMPLOYEE_STATUS_LABELS, type EmployeeStatus as Status } from "@/lib/staff/employee";
import { Badge } from "./badge";

// Ті самі токени, що в StatusBadge (DESIGN.md, розділ 2): «Invited» — чекає, «Active» — гаразд, «Deactivated» — тихо.
const DOT: Record<Status, string> = {
  invited: "bg-status-awaiting-foreground ring-status-awaiting-foreground/20",
  active: "bg-status-approved-foreground ring-status-approved-foreground/20",
  deactivated: "bg-status-cancelled-foreground ring-status-cancelled-foreground/20",
};

const VARIANT = { invited: "awaiting", active: "approved", deactivated: "cancelled" } as const;

/**
 * Статус працівника словом із крапкою, без заливки (як StatusBadge, ADR 0007; D13 impl-staff-management): «Invited»,
 * «Active» (AC-STAFF-01, -02), «Deactivated». Колір лише допомагає, слово — завжди.
 */
export function EmployeeStatus({ status, className }: { status: Status; className?: string }) {
  return (
    <Badge variant={VARIANT[status]} className={className}>
      <span aria-hidden="true" className={`size-[7px] shrink-0 rounded-full ring-3 ${DOT[status]}`} />
      {EMPLOYEE_STATUS_LABELS[status]}
    </Badge>
  );
}
