import { RECORD_STATUSES, type RecordStatus } from "@/lib/leave/request";

const STYLES: Record<RecordStatus, { badge: string; dot: string }> = {
  awaiting: { badge: "bg-awaiting-soft text-awaiting", dot: "bg-awaiting-dot" },
  returned: { badge: "bg-returned-soft text-returned", dot: "bg-returned-dot" },
  approved: { badge: "bg-approved-soft text-approved", dot: "bg-approved-dot" },
  rejected: { badge: "bg-rejected-soft text-rejected", dot: "bg-rejected-dot" },
  cancelled: { badge: "bg-cancelled-soft text-cancelled", dot: "bg-cancelled-dot" },
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
