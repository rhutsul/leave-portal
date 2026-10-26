import { RECORD_STATUSES, type RecordStatus } from "@/lib/leave/request";
import { Badge } from "./badge";

export const STATUS_DOT: Record<RecordStatus, string> = {
  awaiting: "bg-status-awaiting-foreground",
  returned: "bg-status-returned-foreground",
  approved: "bg-status-approved-foreground",
  rejected: "bg-status-rejected-foreground",
  cancelled: "bg-status-cancelled-foreground",
};

// Крапка в бейджі: «Awaiting decision» пульсує повільно (вимикається з prefers-reduced-motion).
const DOT: Record<RecordStatus, string> = { ...STATUS_DOT, awaiting: `${STATUS_DOT.awaiting} animate-pulse-slow` };

export function isRecordStatus(value: string): value is RecordStatus {
  return Object.hasOwn(RECORD_STATUSES, value);
}

/** Статус запису назвою PM («Awaiting decision» …): пігулка з крапкою; колір лише допомагає, слово — завжди. */
export function StatusBadge({ status, className }: { status: RecordStatus; className?: string }) {
  return (
    <Badge variant={status} className={className}>
      <span aria-hidden="true" className={`size-1.5 rounded-full ${DOT[status]}`} />
      {RECORD_STATUSES[status]}
    </Badge>
  );
}
