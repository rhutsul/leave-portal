"use client";

import { useActionState, useId, useState, type MouseEvent, type ReactNode } from "react";
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
import { NoteField } from "@/components/ui/note-field";
import { RecordSummary } from "@/components/ui/record-summary";
import { SubmitButton } from "@/components/ui/submit-button";
import { CANCELLATION_MESSAGES } from "@/lib/leave/cancellation";
import { cancelApprovedRecord, decideCancellation, type CancellationState } from "./actions";
import { CommentToggle } from "./comment-toggle";
import { useDecisionMotion } from "./use-decision-motion";

const INITIAL: CancellationState = { message: "" };

type Summary = { date: string; hours: string; meta: string };

/** Смуга дій унизу панелі (як DecisionActions): тихі дії ліворуч, основна праворуч; телефон — два стовпці. */
const ACTION_BAR =
  "sticky bottom-0 z-10 -mx-5 mt-auto flex items-center gap-1 border-t border-border bg-popover/95 px-5 py-3.5 backdrop-blur-md max-md:grid max-md:grid-cols-2 max-md:gap-2 max-md:pb-[calc(0.875rem+env(safe-area-inset-bottom))] max-md:*:h-11";

/** Тихий ghost червоним текстом — червона кнопка лише в підтвердженні (DESIGN.md, Sheet). */
const QUIET_DESTRUCTIVE = "-ml-3.5 text-destructive hover:bg-destructive/10 hover:text-destructive max-md:ml-0";

/** Помилка дії над формою (не про коментар чи примітку — та стоїть під полем). */
function FormError({ state }: { state: CancellationState }) {
  if (!state.message || state.field) return null;
  return (
    <Alert variant="destructive" role="alert">
      <CircleAlert />
      <AlertDescription>{state.message}</AlertDescription>
    </Alert>
  );
}

/** Підтвердження скасування: «Cancelled» уже не змінити, тож дія проходить Dialog з RecordSummary (DESIGN.md). */
function ConfirmCancellation({
  open,
  pending,
  formId,
  summary,
  onClose,
}: {
  open: boolean;
  pending: boolean;
  formId: string;
  summary: Summary;
  onClose: () => void;
}) {
  return (
    <Dialog open={open} onOpenChange={(next) => !next && !pending && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Confirm the cancellation?</DialogTitle>
          <DialogDescription>The record becomes Cancelled and its days return to the balance.</DialogDescription>
        </DialogHeader>
        <RecordSummary date={summary.date} hours={summary.hours} meta={summary.meta} />
        <DialogFooter>
          <DialogClose render={<Button variant="ghost" />} disabled={pending}>
            Back
          </DialogClose>
          <SubmitButton form={formId} name="decision" value="confirm" variant="destructive" pendingLabel="Cancelling…">
            Confirm cancellation
          </SubmitButton>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

/**
 * Рішення щодо прохання про скасування в панелі запису (D11, D12): «Confirm cancellation» — основна дія, через Dialog
 * з RecordSummary, бо «Cancelled» не змінити (AC-CANCEL-02); «Decline cancellation» — тихий ghost; коментар
 * обов'язковий (AC-CANCEL-04) і схований за «Add a comment for the employee», а натиснуте без нього «Decline» відкриває
 * поле саме з текстом AC. request_id — прохання, яке бачить менеджер: рішення стосується саме його (D4).
 */
export function CancellationForm({
  recordId,
  requestId,
  summary,
  before,
  children,
}: {
  recordId: number;
  requestId: number;
  summary: Summary;
  /** Розділи панелі над полем коментаря: запис, прохання. */
  before: ReactNode;
  /** Розділи під полем: історія. */
  children: ReactNode;
}) {
  const [state, action, pending] = useActionState(decideCancellation, INITIAL);
  const [comment, setComment] = useState("");
  const [opened, setOpened] = useState(false);
  const [needsComment, setNeedsComment] = useState(false);
  const [confirm, setConfirm] = useState(false);
  const [seen, setSeen] = useState(state);
  if (seen !== state) {
    setSeen(state);
    setConfirm(false);
  }

  useDecisionMotion(state.done, recordId);

  const formId = `${useId()}-form`;
  const serverFieldError = state.field ? state.message : null;
  const fieldError = needsComment ? CANCELLATION_MESSAGES.declineComment : serverFieldError;

  const onDecline = (event: MouseEvent<HTMLButtonElement>) => {
    if (comment.trim()) return;
    event.preventDefault();
    setOpened(true);
    setNeedsComment(true);
  };

  return (
    <form id={formId} action={action} className="flex flex-1 flex-col gap-6.5">
      <input type="hidden" name="record_id" value={recordId} />
      <input type="hidden" name="request_id" value={requestId} />
      <FormError state={state} />
      {before}
      <section aria-label="Your comment" className="flex flex-col gap-2.5">
        <CommentToggle
          open={opened}
          error={fieldError}
          value={comment}
          label="Comment for the employee"
          hint="Required to decline the cancellation."
          onOpen={() => setOpened(true)}
          onChange={(value) => {
            setComment(value);
            setNeedsComment(false);
          }}
        />
      </section>
      {children}
      <div data-slot="decision-actions" className={ACTION_BAR}>
        <SubmitButton
          variant="ghost"
          name="decision"
          value="decline"
          pendingLabel="Declining…"
          className={QUIET_DESTRUCTIVE}
          onClick={onDecline}
        >
          Decline cancellation
        </SubmitButton>
        <Button
          type="button"
          className="ml-auto h-10 min-w-33 max-md:col-span-2 max-md:ml-0"
          disabled={pending}
          onClick={() => setConfirm(true)}
        >
          Confirm cancellation
        </Button>
      </div>
      <ConfirmCancellation
        open={confirm}
        pending={pending}
        formId={formId}
        summary={summary}
        onClose={() => setConfirm(false)}
      />
    </form>
  );
}

/**
 * Скасування погодженого запису менеджером з приміткою (D5, D12): тихий «Cancel record» у смузі дій панелі відкриває
 * Dialog з RecordSummary і полем «Note for the employee»; без примітки — текст AC-CANCEL-09 під полем, запис
 * лишається «Approved».
 */
export function CancelWithNote({ recordId, summary }: { recordId: number; summary: Summary }) {
  const [state, action, pending] = useActionState(cancelApprovedRecord, INITIAL);
  const [open, setOpen] = useState(false);
  const [note, setNote] = useState("");

  return (
    <>
      <div data-slot="decision-actions" className={ACTION_BAR}>
        <Button type="button" variant="ghost" className={QUIET_DESTRUCTIVE} onClick={() => setOpen(true)}>
          Cancel record
        </Button>
      </div>
      <Dialog open={open} onOpenChange={(next) => !pending && setOpen(next)}>
        <DialogContent>
          <form action={action} className="flex flex-col gap-4">
            <DialogHeader>
              <DialogTitle>Cancel this record?</DialogTitle>
              <DialogDescription>
                The record becomes Cancelled, its days return to the balance, and the employee sees your note.
              </DialogDescription>
            </DialogHeader>
            <RecordSummary date={summary.date} hours={summary.hours} meta={summary.meta} />
            <input type="hidden" name="record_id" value={recordId} />
            <NoteField
              name="note"
              label="Note for the employee"
              hint="Required to cancel an approved record."
              placeholder="Shown to the employee"
              value={note}
              error={state.field ? state.message : null}
              onChange={setNote}
            />
            <FormError state={state} />
            <DialogFooter>
              <DialogClose render={<Button variant="ghost" />} disabled={pending}>
                Back
              </DialogClose>
              <SubmitButton variant="destructive" pendingLabel="Cancelling…">
                Cancel record
              </SubmitButton>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </>
  );
}
