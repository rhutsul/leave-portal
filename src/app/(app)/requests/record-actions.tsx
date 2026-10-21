"use client";

import { useActionState, useEffect, useId, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { FieldError } from "@/components/ui/field-error";
import type { EmployeeAction } from "@/lib/leave/decision";
import { formatTime } from "@/lib/leave/time";
import { cancelRecord, changeRecordHours, resubmitRecord, type RecordActionState } from "./actions";

const INITIAL: RecordActionState = { message: "", done: false };

const LINK = "rounded px-1 py-1.5 text-[13px] font-medium hover:underline disabled:opacity-50";

type Panel = "hours" | "cancel";

const DONE_TEXT = { hours: "Hours changed.", resubmit: "Record resubmitted.", cancel: "Record cancelled." } as const;

/**
 * Дії працівника із власним записом у «My requests» (D6): Change hours, Resubmit, Cancel — лише ті, що дозволяє
 * статус (employeeActions у src/lib/leave/decision.ts). Зміна годин і скасування відкриваються під кнопками: години —
 * формою з розкладом дня, скасування — підтвердженням, бо «Cancelled» уже не змінити.
 */
export function RecordActions({
  recordId,
  label,
  actions,
  start,
  end,
  schedule,
}: {
  recordId: number;
  /** "2026-11-03 08:30–15:30" — у доступних назвах кнопок, щоб розрізняти записи однієї дати. */
  label: string;
  actions: EmployeeAction[];
  start: number;
  end: number;
  /** Блоки розкладу посади на дату запису ("08:30–12:00, 12:30–15:30"); failed — розклад не завантажився. */
  schedule: { failed: true } | { failed: false; text: string | null };
}) {
  const ids = useId();
  const statusRef = useRef<HTMLParagraphElement>(null);
  const [open, setOpen] = useState<Panel | null>(null);
  // Контрольовані поля: React скидає неконтрольовану форму після дії, а після помилки введене має лишитися.
  const [hours, setHours] = useState({ start: formatTime(start), end: formatTime(end) });
  const [hoursState, hoursAction, hoursPending] = useActionState(changeRecordHours, INITIAL);
  const [resubmitState, resubmitAction, resubmitPending] = useActionState(resubmitRecord, INITIAL);
  const [cancelState, cancelAction, cancelPending] = useActionState(cancelRecord, INITIAL);
  // Показуємо відповідь лише тієї дії, що відповіла щойно; після успіху панель закривається. Коригуємо стан під час
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
    if (changed.state.done) setOpen(null);
  }

  const error = last && !last.state.done ? last.state.message : "";
  const success = last?.state.done ? DONE_TEXT[last.action] : "";

  // Після успіху кнопка з фокусом могла зникнути разом зі статусом — фокус на повідомлення про успіх.
  useEffect(() => {
    if (success) statusRef.current?.focus();
  }, [success, last]);

  // Ні дій, ні повідомлення — нічого. Повідомлення лишається, навіть якщо після відповіді дій уже немає (запис тим
  // часом погодили — AC-DECIDE-12).
  if (actions.length === 0 && !error && !success) return null;

  const pending = hoursPending || resubmitPending || cancelPending;
  // Панель, якої статус уже не дозволяє (запис тим часом погодили), не показуємо — лише повідомлення.
  const panel = open && actions.includes(open === "hours" ? "changeHours" : "cancel") ? open : null;
  const toggle = (panel: Panel) => {
    setLast(null);
    if (panel === "hours" && open !== "hours") setHours({ start: formatTime(start), end: formatTime(end) });
    setOpen((current) => (current === panel ? null : panel));
  };

  return (
    <div className="flex flex-col items-end gap-2">
      <div className="flex justify-end gap-x-2 whitespace-nowrap">
        {actions.includes("changeHours") && (
          <button
            type="button"
            onClick={() => toggle("hours")}
            aria-expanded={open === "hours"}
            aria-controls={`${ids}-hours`}
            aria-label={`Change hours of record ${label}`}
            disabled={pending}
            className={`${LINK} text-brand-strong`}
          >
            Change hours
          </button>
        )}
        {actions.includes("resubmit") && (
          <form action={resubmitAction} onSubmit={() => setLast(null)}>
            <input type="hidden" name="record_id" value={recordId} />
            <button
              type="submit"
              aria-label={`Resubmit record ${label}`}
              disabled={pending}
              className={`${LINK} text-brand-strong`}
            >
              {resubmitPending ? "Resubmitting…" : "Resubmit"}
            </button>
          </form>
        )}
        {actions.includes("cancel") && (
          <button
            type="button"
            onClick={() => toggle("cancel")}
            aria-expanded={open === "cancel"}
            aria-controls={`${ids}-cancel`}
            aria-label={`Cancel record ${label}`}
            disabled={pending}
            className={`${LINK} text-danger`}
          >
            Cancel
          </button>
        )}
      </div>

      <p ref={statusRef} role="status" tabIndex={-1} className="text-[13px] text-success outline-none empty:hidden">
        {success}
      </p>
      {panel === null && <FieldError message={error} className="w-56 text-left" />}

      {panel === "hours" && (
        <form
          id={`${ids}-hours`}
          action={hoursAction}
          onSubmit={() => setLast(null)}
          aria-label={`New hours for record ${label}`}
          className="flex w-60 flex-col gap-2.5 rounded-xl border border-line bg-surface-muted p-3 text-left"
        >
          <input type="hidden" name="record_id" value={recordId} />
          <div className="flex items-end gap-2">
            <div className="flex flex-col gap-1">
              <label htmlFor={`${ids}-start`} className="text-xs font-medium text-ink-2">
                From
              </label>
              <input
                id={`${ids}-start`}
                name="start"
                type="time"
                step={300}
                required
                value={hours.start}
                onChange={(e) => setHours((h) => ({ ...h, start: e.target.value }))}
                aria-describedby={`${ids}-schedule`}
                className={INPUT}
              />
            </div>
            <div className="flex flex-col gap-1">
              <label htmlFor={`${ids}-end`} className="text-xs font-medium text-ink-2">
                To
              </label>
              <input
                id={`${ids}-end`}
                name="end"
                type="time"
                step={300}
                required
                value={hours.end}
                onChange={(e) => setHours((h) => ({ ...h, end: e.target.value }))}
                aria-describedby={`${ids}-schedule`}
                className={INPUT}
              />
            </div>
          </div>
          <p id={`${ids}-schedule`} className="text-xs text-muted">
            {schedule.failed
              ? "Your schedule could not be loaded. "
              : schedule.text && `Your schedule that day: ${schedule.text}. `}
            Only the hours can be changed.
          </p>
          <FieldError message={error} />
          <div className="flex gap-2">
            <Button type="submit" disabled={pending} aria-label={`Save hours for record ${label}`} className="min-h-9 px-3">
              {hoursPending ? "Saving…" : "Save hours"}
            </Button>
            <Button
              variant="ghost"
              onClick={() => toggle("hours")}
              disabled={pending}
              aria-label={`Close hours of record ${label}`}
              className="min-h-9 px-3"
            >
              Close
            </Button>
          </div>
        </form>
      )}

      {panel === "cancel" && (
        <form
          id={`${ids}-cancel`}
          action={cancelAction}
          onSubmit={() => setLast(null)}
          aria-label={`Confirm cancelling record ${label}`}
          className="flex w-60 flex-col gap-2.5 rounded-xl border border-danger-line bg-danger-soft p-3 text-left"
        >
          <input type="hidden" name="record_id" value={recordId} />
          <p className="text-[13px] text-ink">Cancel this record? A cancelled record cannot be changed or resubmitted.</p>
          <FieldError message={error} />
          <div className="flex gap-2">
            <button
              type="submit"
              disabled={pending}
              aria-label={`Confirm: cancel record ${label}`}
              className="inline-flex min-h-9 items-center rounded-lg border border-danger bg-surface px-3 text-sm font-medium text-danger hover:bg-danger-soft disabled:opacity-50"
            >
              {cancelPending ? "Cancelling…" : "Cancel record"}
            </button>
            <Button
              variant="ghost"
              onClick={() => toggle("cancel")}
              disabled={pending}
              aria-label={`Keep record ${label}`}
              className="min-h-9 px-3"
            >
              Keep
            </Button>
          </div>
        </form>
      )}
    </div>
  );
}

const INPUT = "h-9 w-26 rounded-lg border border-line-strong bg-surface px-2 text-ink";
