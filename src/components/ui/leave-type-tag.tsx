import { isLeaveType, LEAVE_TYPES, type LeaveType } from "@/lib/leave/request";

const STYLES: Record<LeaveType, string> = {
  sick: "bg-leave-sick text-leave-sick-foreground",
  personal: "bg-accent text-primary",
  unpaid: "bg-muted text-foreground",
  family: "bg-leave-family text-leave-family-foreground",
};

/** Тип відпустки назвою PM на кольоровій мітці. */
export function LeaveTypeTag({ type }: { type: string }) {
  if (!isLeaveType(type)) return <span>{type}</span>;
  return <span className={`rounded-md px-2 py-0.5 text-xs font-semibold ${STYLES[type]}`}>{LEAVE_TYPES[type]}</span>;
}
