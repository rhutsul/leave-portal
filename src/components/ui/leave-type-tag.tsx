import { isLeaveType, LEAVE_TYPES, type LeaveType } from "@/lib/leave/request";

const STYLES: Record<LeaveType, string> = {
  sick: "bg-sick-soft text-sick",
  personal: "bg-brand-soft text-brand-strong",
  unpaid: "bg-subtle text-ink-2",
  family: "bg-family-soft text-family",
};

/** Тип відпустки назвою PM на кольоровій мітці. */
export function LeaveTypeTag({ type }: { type: string }) {
  if (!isLeaveType(type)) return <span>{type}</span>;
  return <span className={`rounded-md px-2 py-0.5 text-xs font-semibold ${STYLES[type]}`}>{LEAVE_TYPES[type]}</span>;
}
