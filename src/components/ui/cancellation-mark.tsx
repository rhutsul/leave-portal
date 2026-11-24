import { Clock } from "lucide-react";
import type { CancellationMark } from "@/lib/leave/cancellation";
import { cn } from "@/lib/utils";
import { Badge } from "./badge";

/**
 * Скасування погодженого запису на записі (D12 openspec/changes/impl-cancel-approved/design.md): відкрите прохання —
 * тег «Cancellation requested» без заливки поруч зі статусом «Approved» (позначка, а не новий статус); відхилене —
 * «Cancellation declined: …», примітка менеджера скасованого запису — «Manager: “…”» рядком під статусом, як коментар
 * рішення (DESIGN.md, Do: причина під статусом). Лише токени.
 */
export function CancellationMarkView({ mark, className }: { mark: CancellationMark | null; className?: string }) {
  if (!mark) return null;
  if (mark.kind === "requested") {
    return (
      <Badge variant="outline" data-testid="cancellation-mark" className={cn("mt-1.5 flex", className)}>
        <Clock data-icon="inline-start" aria-hidden="true" />
        {mark.text}
      </Badge>
    );
  }
  return (
    <span
      data-testid="cancellation-mark"
      className={cn("mt-1 block max-w-64 break-words whitespace-pre-line text-xs text-muted-foreground", className)}
    >
      {mark.kind === "note" ? `Manager: “${mark.text}”` : mark.text}
    </span>
  );
}
