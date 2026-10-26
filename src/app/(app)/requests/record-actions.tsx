"use client";

import { startTransition, useActionState, useEffect, useId, useRef, useState } from "react";
import { CircleAlert, Clock, Eye, RotateCcw, X } from "lucide-react";
import { RecordHistory, type HistoryRow } from "@/components/record-history";
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
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { RecordSummary } from "@/components/ui/record-summary";
import { RowMenu, type RowMenuItem } from "@/components/ui/row-menu";
import { StatusBadge } from "@/components/ui/status-badge";
import { SubmitButton } from "@/components/ui/submit-button";
import type { EmployeeAction } from "@/lib/leave/decision";
import type { RecordStatus } from "@/lib/leave/request";
import { formatTime } from "@/lib/leave/time";
import { cancelRecord, changeRecordHours, resubmitRecord, type RecordActionState } from "./actions";
import { errorPlacement, visiblePanel, type Panel } from "./record-actions-view";

const INITIAL: RecordActionState = { message: "", done: false };

const DONE_TEXT = { hours: "Hours changed.", resubmit: "Record resubmitted.", cancel: "Record cancelled." } as const;

export interface RecordDetails {
  /** "Tue, 3 Nov 2026" */
  date: string;
  /** "08:30–12:00" */
  hours: string;
  /** "Elementary school · Teacher · Sick leave" */
  meta: string;
  status: RecordStatus;
  employeeComment: string | null;
  managerComment: string | null;
  /** Розподіл погодженого запису (AC-BALANCE-18). */
  split: string | null;
}

/**
 * Дії працівника із власним записом у «My requests» (D6): одна кнопка «⋯» у кожному рядку (DESIGN.md, розділ 5).
 * View details — завжди; Change hours, Resubmit, Cancel record — лише ті, що дозволяє статус (employeeActions у
 * src/lib/leave/decision.ts). Зміна годин і скасування — у діалозі: скасування з підтвердженням, бо «Cancelled» уже
 * не змінити.
 */
export function RecordActions({
  recordId,
  label,
  actions,
  start,
  end,
  schedule,
  details,
  history,
}: {
  recordId: number;
  /** "2026-11-03 08:30–15:30" — у доступних назвах, щоб розрізняти записи однієї дати. */
  label: string;
  actions: EmployeeAction[];
  start: number;
  end: number;
  /** Блоки розкладу посади на дату запису ("08:30–12:00, 12:30–15:30"); failed — розклад не завантажився. */
  schedule: { failed: true } | { failed: false; text: string | null };
  details: RecordDetails;
  history: readonly HistoryRow[] | null;
}) {
  const ids = useId();
  const statusRef = useRef<HTMLParagraphElement>(null);
  const [open, setOpen] = useState<Panel | null>(null);
  // Контрольовані поля: React скидає неконтрольовану форму після дії, а після помилки введене має лишитися.
  const [hours, setHours] = useState({ start: formatTime(start), end: formatTime(end) });
  const [hoursState, hoursAction] = useActionState(changeRecordHours, INITIAL);
  const [resubmitState, resubmitAction, resubmitPending] = useActionState(resubmitRecord, INITIAL);
  const [cancelState, cancelAction] = useActionState(cancelRecord, INITIAL);
  // Показуємо відповідь лише тієї дії, що відповіла щойно; після успіху діалог закривається. Коригуємо стан під час
  // рендеру, а не в ефекті.
  const [seen, setSeen] = useState({ hoursState, resubmitState, cancelState });
  const [last, setLast] = useState<{ action: keyof typeof DONE_TEXT; state: RecordActionState } | null>(null);
  if (seen.hoursState !== hoursState || seen.resubmitState !== resubmitState || seen.cancelState !== cancelState) {
    const changed =
      seen.hoursState !== hoursState
        ? { action: "hours" as const, state: hoursState }
        : seen.resubmitState !== resubmitState
          ? { action: "resubmit" as const, state: resubmitState }
          : { action: "cancel" as const, state: cancelState };
    setSeen({ hoursState, resubmitState, cancelState });
    setLast(changed);
    // Resubmit іде з меню, без діалогу: його успіх не закриває панель, яку відкрили, поки він тривав.
    if (changed.state.done && changed.action !== "resubmit") setOpen(null);
  }

  const error = last && !last.state.done ? last.state.message : "";
  const success = last?.state.done ? DONE_TEXT[last.action] : "";

  // Після успіху діалог закрився, а кнопка могла зникнути разом зі статусом — фокус на повідомлення про успіх.
  useEffect(() => {
    if (success) statusRef.current?.focus();
  }, [success, last]);

  const panel = visiblePanel(open, actions);
  const { inDialog, underRow: rowError } = errorPlacement(panel, error);
  const show = (next: Panel) => {
    setLast(null);
    if (next === "hours") setHours({ start: formatTime(start), end: formatTime(end) });
    setOpen(next);
  };
  // Закрили діалог самі — його помилка більше не актуальна й під меню не переходить.
  const close = () => {
    setLast(null);
    setOpen(null);
  };

  function resubmit() {
    setLast(null);
    const form = new FormData();
    form.set("record_id", String(recordId));
    startTransition(() => resubmitAction(form));
  }

  const items: RowMenuItem[] = [];
  if (actions.includes("changeHours")) items.push({ label: "Change hours", icon: <Clock />, onSelect: () => show("hours") });
  if (actions.includes("resubmit"))
    items.push({ label: "Resubmit", icon: <RotateCcw />, onSelect: resubmit, disabled: resubmitPending });
  items.push({ label: "View details", icon: <Eye />, onSelect: () => show("details") });
  if (actions.includes("cancel"))
    items.push({ label: "Cancel record", icon: <X />, onSelect: () => show("cancel"), destructive: true });

  const summary = <RecordSummary date={details.date} hours={details.hours} meta={details.meta} />;
  const dialogError = inDialog && (
    <Alert variant="destructive" role="alert">
      <CircleAlert />
      <AlertDescription>{inDialog}</AlertDescription>
    </Alert>
  );

  return (
    <div className="flex flex-col items-end gap-1">
      <RowMenu items={items} label={`Actions for record ${label}`} />
      <p
        ref={statusRef}
        role="status"
        tabIndex={-1}
        className="text-xs whitespace-nowrap text-status-approved-foreground outline-none empty:hidden"
      >
        {resubmitPending ? "Resubmitting…" : success}
      </p>
      {rowError && (
        <p role="alert" className="max-w-56 text-right text-xs text-destructive">
          {rowError}
        </p>
      )}

      <Dialog open={panel === "details"} onOpenChange={(o) => (o ? show("details") : close())}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Record details</DialogTitle>
            <DialogDescription className="sr-only">Status, comments and history of record {label}</DialogDescription>
          </DialogHeader>
          {summary}
          <dl className="grid grid-cols-[auto_1fr] items-start gap-x-4 gap-y-2.5 text-sm">
            <dt className="text-muted-foreground">Status</dt>
            <dd>
              <StatusBadge status={details.status} />
            </dd>
            {details.split && (
              <>
                <dt className="text-muted-foreground">Split</dt>
                <dd className="tabular-nums">{details.split}</dd>
              </>
            )}
            {details.employeeComment && (
              <>
                <dt className="text-muted-foreground">Your comment</dt>
                <dd className="break-words whitespace-pre-line">{details.employeeComment}</dd>
              </>
            )}
            {details.managerComment && (
              <>
                <dt className="text-muted-foreground">Manager</dt>
                <dd className="break-words whitespace-pre-line">“{details.managerComment}”</dd>
              </>
            )}
            <dt className="text-muted-foreground">History</dt>
            <dd>
              <RecordHistory history={history} collapsed={false} />
            </dd>
          </dl>
          {/* Помилка Resubmit, що відповів, поки деталі були відкриті. */}
          {dialogError}
          <DialogFooter>
            <DialogClose render={<Button variant="outline" />}>Close</DialogClose>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={panel === "hours"} onOpenChange={(o) => (o ? show("hours") : close())}>
        <DialogContent>
          <form action={hoursAction} onSubmit={() => setLast(null)} className="flex flex-col gap-4">
            <DialogHeader>
              <DialogTitle>Change hours</DialogTitle>
              <DialogDescription>Only the hours can be changed.</DialogDescription>
            </DialogHeader>
            {summary}
            <input type="hidden" name="record_id" value={recordId} />
            <div className="flex gap-3">
              <div className="flex flex-1 flex-col gap-1.5">
                <Label htmlFor={`${ids}-start`}>From</Label>
                <Input
                  id={`${ids}-start`}
                  name="start"
                  type="time"
                  step={300}
                  required
                  value={hours.start}
                  onChange={(e) => setHours((h) => ({ ...h, start: e.target.value }))}
                  aria-describedby={`${ids}-schedule`}
                  aria-invalid={error ? true : undefined}
                />
              </div>
              <div className="flex flex-1 flex-col gap-1.5">
                <Label htmlFor={`${ids}-end`}>To</Label>
                <Input
                  id={`${ids}-end`}
                  name="end"
                  type="time"
                  step={300}
                  required
                  value={hours.end}
                  onChange={(e) => setHours((h) => ({ ...h, end: e.target.value }))}
                  aria-describedby={`${ids}-schedule`}
                  aria-invalid={error ? true : undefined}
                />
              </div>
            </div>
            <p id={`${ids}-schedule`} className="-mt-2 text-xs text-muted-foreground">
              {schedule.failed
                ? "Your schedule could not be loaded."
                : schedule.text
                  ? `Your schedule that day: ${schedule.text}.`
                  : null}
            </p>
            {dialogError}
            <DialogFooter>
              <DialogClose render={<Button variant="ghost" />}>Back</DialogClose>
              <SubmitButton pendingLabel="Saving…">Save hours</SubmitButton>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      <Dialog open={panel === "cancel"} onOpenChange={(o) => (o ? show("cancel") : close())}>
        <DialogContent>
          <form action={cancelAction} onSubmit={() => setLast(null)} className="flex flex-col gap-4">
            <DialogHeader>
              <DialogTitle>Cancel this record?</DialogTitle>
              <DialogDescription>A cancelled record cannot be changed or resubmitted.</DialogDescription>
            </DialogHeader>
            {summary}
            <input type="hidden" name="record_id" value={recordId} />
            {dialogError}
            <DialogFooter>
              <DialogClose render={<Button variant="ghost" />}>Back</DialogClose>
              <SubmitButton variant="destructive" pendingLabel="Cancelling…">
                Cancel record
              </SubmitButton>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}
