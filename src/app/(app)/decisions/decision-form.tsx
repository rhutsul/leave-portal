"use client";

import { useActionState, useId, useState } from "react";
import { CircleAlert } from "lucide-react";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { FieldError } from "@/components/ui/field-error";
import { Label } from "@/components/ui/label";
import { RecordSummary } from "@/components/ui/record-summary";
import { SubmitButton } from "@/components/ui/submit-button";
import { Textarea } from "@/components/ui/textarea";
import { COMMENT_MAX, commentLength } from "@/lib/leave/request";
import { cn } from "@/lib/utils";
import { decideRecord, type DecideState } from "./actions";
import { decisionErrorPlacement } from "./decisions-view";

const INITIAL: DecideState = { message: "" };

/** Рішення, які не скасувати: спершу підтвердження — наш вибір (PM лишив його розробнику, mkozlovskyi-ops/course-staff-management-spec#17). */
type FinalDecision = "approve" | "reject";

/**
 * Погодити, відхилити чи повернути запис. Коментар — необов'язковий при погодженні й відхиленні, обов'язковий при
 * поверненні (AC-DECIDE-04, AC-DECIDE-23, AC-DECIDE-24). Поле кероване, тож після помилки введене лишається.
 * split — запис понад залишок: «Approve» погоджує лише з пропонованим розподілом (AC-BALANCE-10, AC-BALANCE-16).
 * «Approved» і «Rejected» уже не змінити, тому ці дві дії — через Dialog; «Return for revision» — одразу.
 */
export function DecisionForm({
  recordId,
  hours,
  split = false,
  summary,
}: {
  recordId: number;
  /** Години, які бачить менеджер (reviewedHours): рішення стосується саме їх. */
  hours: string;
  split?: boolean;
  /** Що показати в діалозі підтвердження (RecordSummary). */
  summary: { date: string; hours: string; meta: string };
}) {
  const [state, action, pending] = useActionState(decideRecord, INITIAL);
  const [comment, setComment] = useState("");
  const [confirm, setConfirm] = useState<FinalDecision | null>(null);
  // Що показує діалог: лишається й під час анімації закриття, коли confirm уже null.
  const [shown, setShown] = useState<FinalDecision>("approve");
  const ask = (decision: FinalDecision) => {
    setShown(decision);
    setConfirm(decision);
  };
  // Відповідь дії закриває діалог: помилку видно над формою чи під полем, а не під затемненням.
  const [seen, setSeen] = useState(state);
  if (seen !== state) {
    setSeen(state);
    setConfirm(null);
  }

  const ids = useId();
  const formId = `${ids}-form`;
  const commentId = `${ids}-comment`;
  const countId = `${ids}-count`;
  const hintId = `${ids}-hint`;
  const errorId = `${ids}-error`;
  const chars = commentLength(comment);
  const placement = decisionErrorPlacement(state.message);
  const trimmed = comment.trim();

  return (
    <form id={formId} action={action} className="flex flex-col gap-3">
      <input type="hidden" name="record_id" value={recordId} />
      <input type="hidden" name="hours" value={hours} />
      {split && <input type="hidden" name="split" value="1" />}

      {placement === "form" && (
        <Alert variant="destructive" role="alert">
          <CircleAlert />
          <AlertDescription>{state.message}</AlertDescription>
        </Alert>
      )}

      <div className="flex flex-col gap-1.5">
        <div className="flex items-baseline justify-between gap-3">
          <Label htmlFor={commentId}>Your comment</Label>
          <span
            id={countId}
            className={cn(
              "text-xs tabular-nums",
              chars > COMMENT_MAX ? "font-medium text-destructive" : "text-muted-foreground",
            )}
          >
            Optional · {chars}/{COMMENT_MAX}
          </span>
        </div>
        <Textarea
          id={commentId}
          name="comment"
          rows={3}
          placeholder="Shown to the employee"
          value={comment}
          onChange={(e) => setComment(e.target.value)}
          aria-invalid={placement === "field" || undefined}
          aria-describedby={cn(hintId, countId, placement === "field" && errorId)}
        />
        <p id={hintId} className="text-xs text-muted-foreground">
          Required to return the record for revision.
        </p>
        {placement === "field" && <FieldError id={errorId} message={state.message} />}
      </div>

      <div className="flex flex-wrap gap-2">
        <Button type="button" className="flex-1" disabled={pending} onClick={() => ask("approve")}>
          {split ? "Approve with split" : "Approve"}
        </Button>
        <SubmitButton variant="outline" name="decision" value="return" pendingLabel="Returning…">
          Return for revision
        </SubmitButton>
        <Button
          type="button"
          variant="outline"
          className="text-destructive hover:text-destructive"
          disabled={pending}
          onClick={() => ask("reject")}
        >
          Reject
        </Button>
      </div>

      {/* Діалог — у дереві форми: його кнопка відправляє цю форму (атрибут form) разом із коментарем. */}
      <Dialog open={confirm !== null} onOpenChange={(open) => !open && !pending && setConfirm(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{shown === "reject" ? "Reject this record?" : "Approve this record?"}</DialogTitle>
            <DialogDescription>
              {shown === "reject"
                ? "A rejected record cannot be changed back."
                : split
                  ? "The record is approved with the suggested split and cannot be changed back."
                  : "An approved record cannot be changed back."}
            </DialogDescription>
          </DialogHeader>
          <RecordSummary date={summary.date} hours={summary.hours} meta={summary.meta} />
          {trimmed && (
            <p className="text-sm break-words whitespace-pre-line">
              <span className="text-muted-foreground">Your comment: </span>“{trimmed}”
            </p>
          )}
          <DialogFooter>
            <DialogClose render={<Button variant="ghost" />} disabled={pending}>
              Back
            </DialogClose>
            {shown === "reject" ? (
              <SubmitButton form={formId} name="decision" value="reject" variant="destructive" pendingLabel="Rejecting…">
                Reject
              </SubmitButton>
            ) : (
              <SubmitButton form={formId} name="decision" value="approve" pendingLabel="Approving…">
                {split ? "Approve with split" : "Approve"}
              </SubmitButton>
            )}
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </form>
  );
}
