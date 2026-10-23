import { RECORD_STATUSES, type RecordStatus } from "@/lib/leave/request";

const STYLES: Record<RecordStatus, { badge: string; dot: string }> = {
  awaiting: { badge: "bg-status-awaiting text-status-awaiting-foreground", dot: "bg-status-awaiting-foreground" },
  returned: { badge: "bg-status-returned text-status-returned-foreground", dot: "bg-status-returned-foreground" },
  approved: { badge: "bg-status-approved text-status-approved-foreground", dot: "bg-status-approved-foreground" },
  rejected: { badge: "bg-status-rejected text-status-rejected-foreground", dot: "bg-status-rejected-foreground" },
  cancelled: { badge: "bg-status-cancelled text-status-cancelled-foreground", dot: "bg-status-cancelled-foreground" },
};

export const STATUS_DOT = Object.fromEntries(Object.entries(STYLES).map(([k, v]) => [k, v.dot])) as Record<
  RecordStatus,
  string
>;

export function isRecordStatus(value: string): value is RecordStatus {
  return Object.hasOwn(RECORD_STATUSES, value);
}

/** Статус запису назвою PM («Awaiting decision» …) з кольоровою крапкою. */
export function StatusBadge({ status }: { status: RecordStatus }) {
  const style = STYLES[status];
  return (
    <span
      className={`inline-flex items-center gap-1.5 whitespace-nowrap rounded-full px-2.5 py-0.5 text-xs font-semibold ${style.badge}`}
    >
      <span aria-hidden="true" className={`size-1.5 rounded-full ${style.dot}`} />
      {RECORD_STATUSES[status]}
    </span>
  );
}
