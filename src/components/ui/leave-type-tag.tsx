import { isLeaveType, LEAVE_TYPES, type LeaveType } from "@/lib/leave/request";
import { cn } from "@/lib/utils";

const TAG: Record<LeaveType, string> = {
  sick: "bg-leave-sick text-leave-sick-foreground",
  personal: "bg-leave-personal text-leave-personal-foreground",
  unpaid: "bg-leave-unpaid text-leave-unpaid-foreground",
  family: "bg-leave-family text-leave-family-foreground",
};

const SQUARE: Record<LeaveType, string> = {
  sick: "bg-leave-sick-foreground",
  personal: "bg-leave-personal-foreground",
  unpaid: "bg-leave-unpaid-foreground",
  family: "bg-leave-family-foreground",
};

/**
 * Тип відсутності назвою PM. `tag` — плоска мітка для форм і підсумків; `inline` — квадратик і слово для таблиць,
 * щоб у рядку лишалась одна заповнена «пігулка» — статус (DESIGN.md, розділ 2).
 */
export function LeaveTypeTag({
  type,
  variant = "tag",
  className,
}: {
  type: string;
  variant?: "tag" | "inline";
  className?: string;
}) {
  if (!isLeaveType(type)) return <span className={className}>{type}</span>;
  if (variant === "inline") {
    return (
      <span className={cn("inline-flex items-center gap-2 whitespace-nowrap", className)}>
        <span aria-hidden="true" className={cn("size-2 rounded-[2px]", SQUARE[type])} />
        {LEAVE_TYPES[type]}
      </span>
    );
  }
  return (
    <span
      className={cn(
        "inline-flex h-[22px] items-center whitespace-nowrap rounded-sm px-2 text-xs font-medium",
        TAG[type],
        className,
      )}
    >
      {LEAVE_TYPES[type]}
    </span>
  );
}
