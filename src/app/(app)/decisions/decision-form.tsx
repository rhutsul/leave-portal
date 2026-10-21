"use client";

import { useActionState, useState } from "react";
import { Button } from "@/components/ui/button";
import { FieldError } from "@/components/ui/field-error";
import { decideRecord, type DecideState } from "./actions";

const INITIAL: DecideState = { message: "" };

/**
 * Погодити, відхилити чи повернути запис. Коментар — необов'язковий при погодженні й відхиленні, обов'язковий при
 * поверненні (AC-DECIDE-04, AC-DECIDE-23, AC-DECIDE-24). Поле кероване, тож після помилки введене лишається.
 * split — запис понад залишок: «Approve» погоджує лише з пропонованим розподілом (AC-BALANCE-10, AC-BALANCE-16).
 */
export function DecisionForm({ recordId, split = false }: { recordId: number; split?: boolean }) {
  const [state, action, pending] = useActionState(decideRecord, INITIAL);
  const [comment, setComment] = useState("");
  const commentId = `comment-${recordId}`;
  const errorId = `decision-error-${recordId}`;

  return (
    <form action={action} className="flex flex-col gap-2.5">
      <input type="hidden" name="record_id" value={recordId} />
      {split && <input type="hidden" name="split" value="1" />}
      <label htmlFor={commentId} className="text-[13px] font-medium">
        Comment for the employee{" "}
        <span className="font-normal text-muted">(optional; required to return for revision)</span>
      </label>
      <textarea
        id={commentId}
        name="comment"
        rows={2}
        value={comment}
        onChange={(e) => setComment(e.target.value)}
        aria-describedby={state.message ? errorId : undefined}
        className="w-full resize-y rounded-lg border border-line-strong bg-surface px-3 py-2 text-sm text-ink placeholder:text-muted focus-visible:outline-2 focus-visible:outline-brand"
      />
      <FieldError id={errorId} message={state.message} />
      <div className="flex flex-wrap gap-2">
        <Button type="submit" name="decision" value="approve" disabled={pending}>
          {split ? "Approve with split" : "Approve"}
        </Button>
        <Button type="submit" variant="ghost" name="decision" value="return" disabled={pending}>
          Return for revision
        </Button>
        <Button type="submit" variant="ghost" name="decision" value="reject" disabled={pending}>
          Reject
        </Button>
      </div>
    </form>
  );
}
