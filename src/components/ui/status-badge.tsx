import { RECORD_STATUSES, type RecordStatus } from "@/lib/leave/request";
import { Badge } from "./badge";

export const STATUS_DOT: Record<RecordStatus, string> = {
  awaiting: "bg-status-awaiting-foreground",
  returned: "bg-status-returned-foreground",
  approved: "bg-status-approved-foreground",
  rejected: "bg-status-rejected-foreground",
  cancelled: "bg-status-cancelled-foreground",
};

// М'який ореол навколо крапки — той самий колір статусу з прозорістю (ADR 0007).
const HALO: Record<RecordStatus, string> = {
  awaiting: "ring-status-awaiting-foreground/20",
  returned: "ring-status-returned-foreground/20",
  approved: "ring-status-approved-foreground/20",
  rejected: "ring-status-rejected-foreground/20",
  cancelled: "ring-status-cancelled-foreground/20",
};

// Крапка: «Awaiting decision» пульсує повільно (вимикається з prefers-reduced-motion).
const DOT: Record<RecordStatus, string> = {
  awaiting: `${STATUS_DOT.awaiting} ${HALO.awaiting} animate-pulse-slow`,
  returned: `${STATUS_DOT.returned} ${HALO.returned}`,
  approved: `${STATUS_DOT.approved} ${HALO.approved}`,
  rejected: `${STATUS_DOT.rejected} ${HALO.rejected}`,
  cancelled: `${STATUS_DOT.cancelled} ${HALO.cancelled}`,
};

export function isRecordStatus(value: string): value is RecordStatus {
  return Object.hasOwn(RECORD_STATUSES, value);
}

/**
 * Статус запису назвою PM («Awaiting decision» …): слово з крапкою кольору статусу, без заливки (ADR 0007). Колір лише
 * допомагає, слово — завжди.
 */
export function StatusBadge({ status, className }: { status: RecordStatus; className?: string }) {
  return (
    <Badge variant={status} className={className}>
      <span aria-hidden="true" className={`size-[7px] shrink-0 rounded-full ring-3 ${DOT[status]}`} />
      {RECORD_STATUSES[status]}
    </Badge>
  );
}
