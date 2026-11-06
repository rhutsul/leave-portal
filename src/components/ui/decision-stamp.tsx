import { RECORD_STATUSES } from "@/lib/leave/request";
import { cn } from "@/lib/utils";

export type StampStatus = "approved" | "rejected" | "returned";

// Знак рішення: галочка, хрестик, стрілка повернення — лінією, що малюється (stroke-dasharray 60 ≥ довжини кожного).
const PATH: Record<StampStatus, string> = {
  approved: "M5 12.5l4.5 4.5L19 7.5",
  rejected: "M7 7l10 10M17 7L7 17",
  returned: "M9 14L4 9l5-5M4 9h10.5a5.5 5.5 0 0 1 0 11H11",
};

const TONE: Record<StampStatus, string> = {
  approved: "border-status-approved-foreground bg-status-approved text-status-approved-foreground",
  rejected: "border-status-rejected-foreground bg-status-rejected text-status-rejected-foreground",
  returned: "border-status-returned-foreground bg-status-returned text-status-returned-foreground",
};

/**
 * Печатка рішення в панелі запису (ADR 0007, DESIGN.md `DecisionStamp`): кружок кольору статусу, знак малюється
 * лінією, під ним — слово статусу. Лише після того, як рішення збережено, — не замість діалогу підтвердження.
 * Для зчитувача екрана — живе повідомлення словом статусу.
 */
export function DecisionStamp({ status, className }: { status: StampStatus; className?: string }) {
  return (
    <div role="status" className={cn("pointer-events-none grid place-items-center", className)}>
      <div className="flex animate-stamp flex-col items-center gap-2.5">
        <span className={cn("grid size-19 place-items-center rounded-full border-2", TONE[status])}>
          <svg
            viewBox="0 0 24 24"
            className="size-8.5"
            fill="none"
            stroke="currentColor"
            strokeWidth={2.4}
            strokeLinecap="round"
            strokeLinejoin="round"
            aria-hidden="true"
          >
            <path d={PATH[status]} strokeDasharray={60} className="animate-draw" />
          </svg>
        </span>
        <span className="text-[15px] font-semibold">{RECORD_STATUSES[status]}</span>
      </div>
    </div>
  );
}
