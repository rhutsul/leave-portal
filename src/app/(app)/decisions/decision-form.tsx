"use client";

import { useActionState, useId, useState, type MouseEvent, type ReactNode } from "react";
import { CircleAlert, Plus } from "lucide-react";
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
import { DECISION_MESSAGES } from "@/lib/leave/decision";
import { COMMENT_MAX, commentLength } from "@/lib/leave/request";
import { cn } from "@/lib/utils";
import { decideRecord, type DecideState } from "./actions";
import { decisionErrorPlacement } from "./decisions-view";
import { useDecisionMotion } from "./use-decision-motion";

const INITIAL: DecideState = { message: "" };

/** Рішення, які не скасувати: спершу підтвердження — наш вибір (PM лишив його розробнику, mkozlovskyi-ops/course-staff-management-spec#17). */
type FinalDecision = "approve" | "reject";

/** Поле коментаря менеджера з лічильником; помилка — текст AC під полем (AC-DECIDE-04, AC-DECIDE-24). */
function CommentField({
  value,
  error,
  onChange,
}: {
  value: string;
  error: string | null;
  onChange: (value: string) => void;
}) {
  const ids = useId();
  const chars = commentLength(value);
  return (
    <div className="flex flex-col gap-1.5">
      <div className="flex items-baseline justify-between gap-3">
        <Label htmlFor={`${ids}-comment`}>Your comment</Label>
        <span
          id={`${ids}-count`}
          className={cn("text-xs tabular-nums", chars > COMMENT_MAX ? "font-medium text-destructive" : "text-muted-foreground")}
        >
          Optional · {chars}/{COMMENT_MAX}
        </span>
      </div>
      <Textarea
        id={`${ids}-comment`}
        name="comment"
        rows={3}
        placeholder="Shown to the employee"
        // Поле щойно відкрили кнопкою чи «Return for revision» — одразу можна писати.
        autoFocus
        value={value}
        onChange={(e) => onChange(e.target.value)}
        aria-invalid={error !== null || undefined}
        aria-describedby={cn(`${ids}-hint`, `${ids}-count`, error !== null && `${ids}-error`)}
      />
      <p id={`${ids}-hint`} className="text-xs text-muted-foreground">
        Required to return the record for revision.
      </p>
      <FieldError id={`${ids}-error`} message={error} />
    </div>
  );
}

/**
 * Смуга дій унизу панелі за будь-якої ширини (v2): тіло прокручується над нею. Основна Approve — праворуч; Reject і
 * Return for revision — тихі ghost ліворуч (Reject лише червоним текстом, бо червона кнопка — у підтвердженні). На
 * телефоні (ADR 0008) Reject і Return — у два стовпці, Approve на всю ширину під ними, з відступом від смуги жестів
 * iPhone.
 */
function DecisionActions({
  split,
  pending,
  onAsk,
  onReturn,
}: {
  split: boolean;
  pending: boolean;
  onAsk: (decision: FinalDecision) => void;
  onReturn: (event: MouseEvent<HTMLButtonElement>) => void;
}) {
  return (
    <div className="sticky bottom-0 z-10 -mx-5 mt-auto -mb-5 flex items-center gap-1 border-t border-border bg-popover/95 px-5 py-3.5 backdrop-blur-md max-md:grid max-md:grid-cols-2 max-md:gap-2 max-md:pb-[calc(0.875rem+env(safe-area-inset-bottom))] max-md:*:h-11">
      <Button
        type="button"
        variant="ghost"
        className="-ml-3.5 text-destructive hover:bg-destructive/10 hover:text-destructive max-md:ml-0"
        disabled={pending}
        onClick={() => onAsk("reject")}
      >
        Reject
      </Button>
      <SubmitButton variant="ghost" name="decision" value="return" pendingLabel="Returning…" onClick={onReturn}>
        Return for revision
      </SubmitButton>
      <Button type="button" className="ml-auto h-10 min-w-33 max-md:col-span-2 max-md:ml-0" disabled={pending} onClick={() => onAsk("approve")}>
        {split ? "Approve with split" : "Approve"}
      </Button>
    </div>
  );
}

const CONFIRM_TEXT = {
  reject: "A rejected record cannot be changed back.",
  approve: "An approved record cannot be changed back.",
  split: "The record is approved with the suggested split and cannot be changed back.",
} as const;

/** Підтвердження «Approve» чи «Reject» — у дереві форми: його кнопка відправляє форму (атрибут form) з коментарем. */
function ConfirmDialog({
  decision,
  open,
  split,
  pending,
  formId,
  summary,
  comment,
  onClose,
}: {
  decision: FinalDecision;
  open: boolean;
  split: boolean;
  pending: boolean;
  formId: string;
  summary: { date: string; hours: string; meta: string };
  comment: string;
  onClose: () => void;
}) {
  const reject = decision === "reject";
  return (
    <Dialog open={open} onOpenChange={(next) => !next && !pending && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{reject ? "Reject this record?" : "Approve this record?"}</DialogTitle>
          <DialogDescription>{CONFIRM_TEXT[reject ? "reject" : split ? "split" : "approve"]}</DialogDescription>
        </DialogHeader>
        <RecordSummary date={summary.date} hours={summary.hours} meta={summary.meta} />
        {comment && (
          <p className="text-sm break-words whitespace-pre-line">
            <span className="text-muted-foreground">Your comment: </span>“{comment}”
          </p>
        )}
        <DialogFooter>
          <DialogClose render={<Button variant="ghost" />} disabled={pending}>
            Back
          </DialogClose>
          {reject ? (
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
  );
}

/**
 * Погодити, відхилити чи повернути запис — форма на всю панель запису (v2): `before` (запис, залишок) і `children`
 * (історія) приходять готовими, між ними — коментарі, унизу панелі — смуга дій. Коментар менеджера — необов'язковий
 * при погодженні й відхиленні, обов'язковий при поверненні (AC-DECIDE-04, AC-DECIDE-23, AC-DECIDE-24); поле сховане за
 * «Add a comment for the employee» і відкривається саме, коли «Return for revision» натиснуто без коментаря. Поле
 * кероване, тож після помилки введене лишається. split — запис понад залишок: «Approve» погоджує лише з пропонованим
 * розподілом (AC-BALANCE-10, AC-BALANCE-16). «Approved» і «Rejected» уже не змінити, тому ці дві дії — через Dialog;
 * «Return for revision» — одразу.
 */
export function DecisionForm({
  recordId,
  hours,
  split = false,
  summary,
  before,
  employeeComment,
  children,
}: {
  recordId: number;
  /** Години, які бачить менеджер (reviewedHours): рішення стосується саме їх. */
  hours: string;
  split?: boolean;
  /** Що показати в діалозі підтвердження (RecordSummary). */
  summary: { date: string; hours: string; meta: string };
  /** Розділи панелі над коментарями: запис, залишок, попередження. */
  before: ReactNode;
  /** Рядки коментарів працівника й попереднього рішення над полем коментаря менеджера. */
  employeeComment: ReactNode;
  /** Розділи під коментарями: історія запису. */
  children: ReactNode;
}) {
  const [state, action, pending] = useActionState(decideRecord, INITIAL);
  const [comment, setComment] = useState("");
  const [opened, setOpened] = useState(false);
  // «Return for revision» без коментаря: поле відкривається з текстом AC-DECIDE-04 — без запиту до сервера, який
  // відповів би тим самим.
  const [needsComment, setNeedsComment] = useState(false);
  const [confirm, setConfirm] = useState<FinalDecision | null>(null);
  // Що показує діалог: лишається й під час анімації закриття, коли confirm уже null.
  const [shown, setShown] = useState<FinalDecision>("approve");
  // Відповідь дії закриває діалог: помилку видно над формою чи під полем, а не під затемненням.
  const [seen, setSeen] = useState(state);
  if (seen !== state) {
    setSeen(state);
    setConfirm(null);
  }

  useDecisionMotion(state.done, recordId);

  const formId = `${useId()}-form`;
  const placement = decisionErrorPlacement(state.message);
  const trimmed = comment.trim();
  const fieldError = commentError(needsComment, placement, state.message);

  return (
    <form id={formId} action={action} className="flex flex-1 flex-col gap-6.5">
      <input type="hidden" name="record_id" value={recordId} />
      <input type="hidden" name="hours" value={hours} />
      {split && <input type="hidden" name="split" value="1" />}

      {placement === "form" && (
        <Alert variant="destructive" role="alert">
          <CircleAlert />
          <AlertDescription>{state.message}</AlertDescription>
        </Alert>
      )}

      {before}

      <section aria-label="Comments" className="flex flex-col gap-2.5">
        {employeeComment}
        {/* Відповідь сервера про коментар теж відкриває поле: помилка має стояти під ним. */}
        {opened || fieldError !== null ? (
          <CommentField
            value={comment}
            error={fieldError}
            onChange={(value) => {
              setComment(value);
              setNeedsComment(false);
            }}
          />
        ) : (
          <>
            <input type="hidden" name="comment" value="" />
            <Button
              type="button"
              variant="ghost"
              size="sm"
              className="-ml-3 self-start text-primary hover:text-primary pointer-coarse:h-11"
              onClick={() => setOpened(true)}
            >
              <Plus />
              Add a comment for the employee
            </Button>
          </>
        )}
      </section>

      {children}

      <DecisionActions
        split={split}
        pending={pending}
        onAsk={(decision) => {
          setShown(decision);
          setConfirm(decision);
        }}
        onReturn={(event) => {
          if (trimmed) return;
          event.preventDefault();
          setOpened(true);
          setNeedsComment(true);
        }}
      />

      <ConfirmDialog
        decision={shown}
        open={confirm !== null}
        split={split}
        pending={pending}
        formId={formId}
        summary={summary}
        comment={trimmed}
        onClose={() => setConfirm(null)}
      />
    </form>
  );
}

/** Помилка під полем коментаря: «Return for revision» без коментаря (ще до сервера) або відповідь сервера про коментар. */
function commentError(needsComment: boolean, placement: "field" | "form" | null, message: string): string | null {
  if (needsComment) return DECISION_MESSAGES.returnComment;
  return placement === "field" ? message : null;
}
