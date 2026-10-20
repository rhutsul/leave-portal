"use client";

import { useActionState, useId, useState, type FormEvent } from "react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { FieldError } from "@/components/ui/field-error";
import { LeaveTypeIcon } from "@/components/ui/icons";
import {
  checkLeaveType,
  isRelationship,
  LEAVE_TYPES,
  positionsOnDate,
  recordForChoice,
  RELATIONSHIP_LABELS,
  RELATIONSHIPS,
  REQUEST_MESSAGES,
  weeklySchedule,
  type DraftRecord,
  type LeaveType,
  type PositionChoice,
  type PositionDay,
  type PositionSchedule,
} from "@/lib/leave/request";
import {
  dayAxis,
  formatBlocks,
  formatDateLong,
  formatDateShort,
  formatDuration,
  formatRange,
  formatTime,
  type TimeBlock,
} from "@/lib/leave/time";
import { submitLeaveRequest, type SubmitState } from "./actions";

const STEPS = ["Date", "Positions and hours", "Leave type", "Summary"] as const;
type Step = 1 | 2 | 3 | 4;

const TYPE_HINTS: Record<LeaveType, string> = {
  sick: "Illness, a doctor’s appointment",
  personal: "Counts against your Personal leave balance",
  unpaid: "Not paid; counted, not limited",
  family: "A celebration of a close relative",
};

const INITIAL: SubmitState = { message: "" };

interface Evaluated {
  position: PositionDay;
  choice: PositionChoice;
  result: ReturnType<typeof recordForChoice> | null;
}

// Заявка на одну дату (D6): дата → посади й години → тип → підсумок → підтвердження; праворуч — живий підсумок.
// Перевірки на кожному кроці — ті самі чисті функції src/lib/leave/, що й у server action; введене зберігається
// при поверненні назад. Кілька дат і коментар — задача 2.
export function NewRequestForm({ positions }: { positions: PositionSchedule[] }) {
  const ids = useId();
  const [step, setStep] = useState<Step>(1);
  const [maxStep, setMaxStep] = useState<Step>(1);
  const [date, setDate] = useState("");
  const [dateError, setDateError] = useState<string | null>(null);
  const [dayPositions, setDayPositions] = useState<PositionDay[]>([]);
  const [choices, setChoices] = useState<Record<number, PositionChoice>>({});
  const [cardErrors, setCardErrors] = useState<Record<number, string>>({});
  const [positionsError, setPositionsError] = useState<string | null>(null);
  const [leaveType, setLeaveType] = useState<LeaveType | null>(null);
  const [relationship, setRelationship] = useState("");
  const [typeError, setTypeError] = useState<string | null>(null);
  const [showServerError, setShowServerError] = useState(false);
  const [state, formAction, pending] = useActionState(submitLeaveRequest, INITIAL);

  // Будь-яка зміна на кроці робить наступні кроки недоступними, доки їх не пройдено знову.
  const edited = (at: Step) => setMaxStep((m) => (m > at ? at : m));

  const go = (next: Step) => {
    setShowServerError(false);
    setStep(next);
    setMaxStep((m) => (next > m ? next : m));
  };

  const evaluated: Evaluated[] = dayPositions.map((position) => {
    const choice = choices[position.id];
    return { position, choice, result: choice.include ? recordForChoice(date, position, choice) : null };
  });
  const records: DraftRecord[] =
    step === 1 ? [] : evaluated.flatMap((e) => (e.result?.ok ? [e.result.record] : []));
  const totalMinutes = records.reduce((sum, r) => sum + r.minutes, 0);
  const axis = dayPositions.length ? dayAxis(dayPositions.flatMap((p) => p.blocks)) : null;

  function nextFromDate() {
    if (!date) return;
    const day = positionsOnDate(positions, date);
    if (!day.ok) {
      setDateError(day.message);
      return;
    }
    setDayPositions(day.positions);
    setChoices((prev) => {
      const next: Record<number, PositionChoice> = {};
      for (const p of day.positions) {
        next[p.id] = prev[p.id] ?? { positionId: p.id, include: true, wholeDay: true, start: "", end: "" };
      }
      return next;
    });
    setCardErrors({});
    setPositionsError(null);
    go(2);
  }

  function nextFromPositions() {
    const errors: Record<number, string> = {};
    for (const e of evaluated) if (e.result && !e.result.ok) errors[e.position.id] = e.result.message;
    setCardErrors(errors);
    const included = evaluated.some((e) => e.choice.include);
    setPositionsError(included ? null : REQUEST_MESSAGES.choosePosition);
    if (included && Object.keys(errors).length === 0) go(3);
  }

  function nextFromType() {
    const result = checkLeaveType(leaveType ?? "", relationship);
    if (!result.ok) {
      setTypeError(result.message);
      return;
    }
    go(4);
  }

  function updateChoice(id: number, patch: Partial<PositionChoice>) {
    setChoices((prev) => ({ ...prev, [id]: { ...prev[id], ...patch } }));
    setCardErrors((prev) => {
      const next = { ...prev };
      delete next[id];
      return next;
    });
    if (patch.include !== undefined) setPositionsError(null);
    edited(2);
  }

  function onSubmit(event: FormEvent<HTMLFormElement>) {
    // Enter у полі на кроках 1–3 — це «Continue», а не подання заявки.
    if (step !== 4) {
      event.preventDefault();
      if (step === 1) nextFromDate();
      else if (step === 2) nextFromPositions();
      else nextFromType();
      return;
    }
    setShowServerError(true);
  }

  const payload = JSON.stringify({ date, leaveType, relationship, choices: Object.values(choices) });
  const typeLabel = leaveType
    ? LEAVE_TYPES[leaveType] +
      (leaveType === "family" && isRelationship(relationship) ? ` (${RELATIONSHIP_LABELS[relationship].toLowerCase()})` : "")
    : "Not chosen yet";
  const labelOf = (id: number) => dayPositions.find((p) => p.id === id)?.label ?? "";

  return (
    <div className="flex flex-col gap-6">
      <ol className="flex flex-wrap gap-2">
        {STEPS.map((label, i) => {
          const n = (i + 1) as Step;
          const current = n === step;
          const done = n < step || (n <= maxStep && !current);
          const locked = n > maxStep || pending;
          return (
            <li key={label} className="min-w-44 flex-1">
              <button
                type="button"
                onClick={() => go(n)}
                disabled={locked || current}
                aria-current={current ? "step" : undefined}
                className={`flex w-full items-center gap-2.5 rounded-xl border px-3 py-2.5 text-left ${
                  current ? "border-brand-line bg-surface shadow-xs" : "border-line"
                } ${locked && !current ? "opacity-60" : ""} ${!locked && !current ? "cursor-pointer hover:bg-surface" : ""}`}
              >
                <span
                  aria-hidden="true"
                  className={`flex size-6.5 shrink-0 items-center justify-center rounded-full text-xs font-semibold ${
                    current ? "bg-brand text-on-brand" : done ? "bg-brand-muted text-brand-strong" : "bg-subtle text-ink-2"
                  }`}
                >
                  {done ? "✓" : n}
                </span>
                <span className="flex flex-col">
                  <span className="text-xs text-faint">Step {n}</span>
                  <span className="font-medium">{label}</span>
                </span>
              </button>
            </li>
          );
        })}
      </ol>

      <div className="flex flex-wrap items-start gap-6">
        <form action={formAction} onSubmit={onSubmit} className="min-w-0 flex-[999_1_560px]">
          <Card>
            {step === 1 && (
              <div className="flex flex-col gap-5 px-7 py-6">
                <StepTitle title="When do you need leave?" hint="Choose the date of your leave. Past dates are allowed." />
                <div className="flex flex-wrap gap-7">
                  <div className="flex flex-col gap-1.5">
                    <label htmlFor={`${ids}-date`} className="font-medium">
                      Date
                    </label>
                    <input
                      id={`${ids}-date`}
                      type="date"
                      value={date}
                      onChange={(e) => {
                        setDate(e.target.value);
                        setDateError(null);
                        edited(1);
                      }}
                      aria-invalid={dateError ? true : undefined}
                      aria-describedby={dateError ? `${ids}-date-error` : undefined}
                      className={inputClass}
                    />
                    <FieldError id={`${ids}-date-error`} message={dateError} className="mt-1 max-w-xs" />
                  </div>
                  <div className="min-w-56 flex-1 rounded-xl border border-line bg-surface-muted px-3.5 py-3 text-[13px] leading-relaxed text-ink-2">
                    <div className="mb-1 font-medium">Your weekly schedule</div>
                    {positions.map((p) => (
                      <div key={p.id}>
                        {p.label} — {weeklySchedule(p.blocks)}
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            )}

            {step === 2 && axis && (
              <div className="flex flex-col gap-5 px-7 py-6">
                <StepTitle
                  title="Positions and hours"
                  hint="Include the positions you will be absent from — for the whole day or for specific hours."
                />
                <div className="flex items-baseline gap-2.5">
                  <h3 className="text-[15px] font-semibold">{formatDateLong(date)}</h3>
                  <span className="text-[13px] text-faint">
                    {evaluated.filter((e) => e.choice.include).length} of {evaluated.length} positions included
                  </span>
                </div>
                <ul className="flex flex-col gap-2.5">
                  {evaluated.map((e) => (
                    <PositionCard
                      key={e.position.id}
                      idPrefix={`${ids}-${e.position.id}`}
                      item={e}
                      axis={axis}
                      error={cardErrors[e.position.id]}
                      onChange={(patch) => updateChoice(e.position.id, patch)}
                    />
                  ))}
                </ul>
                <FieldError message={positionsError} />
              </div>
            )}

            {step === 3 && (
              <fieldset className="flex flex-col gap-5 px-7 py-6">
                <legend className="contents">
                  <StepTitle title="Leave type" hint="One leave type per request. Different types mean different requests." />
                </legend>
                <div className="grid grid-cols-2 gap-3">
                  {(Object.keys(LEAVE_TYPES) as LeaveType[]).map((type) => (
                    <label
                      key={type}
                      className="flex min-h-18 cursor-pointer items-center gap-3.5 rounded-xl border border-line bg-surface p-4 hover:border-brand-hover has-checked:border-2 has-checked:border-brand has-checked:bg-brand-soft has-focus-visible:outline-2 has-focus-visible:outline-ring"
                    >
                      <input
                        type="radio"
                        name="leave-type"
                        value={type}
                        checked={leaveType === type}
                        onChange={() => {
                          setLeaveType(type);
                          setTypeError(null);
                          edited(3);
                        }}
                        className="peer sr-only"
                      />
                      <span className="flex size-9.5 shrink-0 items-center justify-center rounded-lg bg-subtle text-ink-2 peer-checked:bg-brand peer-checked:text-on-brand">
                        <LeaveTypeIcon type={type} />
                      </span>
                      <span className="flex flex-col gap-0.5">
                        <span className="font-semibold">{LEAVE_TYPES[type]}</span>
                        <span className="text-[13px] text-muted">{TYPE_HINTS[type]}</span>
                      </span>
                    </label>
                  ))}
                </div>
                {leaveType === "family" && (
                  <div className="flex max-w-90 flex-col gap-1.5">
                    <label htmlFor={`${ids}-relationship`} className="font-medium">
                      Relationship to the person
                    </label>
                    <select
                      id={`${ids}-relationship`}
                      value={relationship}
                      onChange={(e) => {
                        setRelationship(e.target.value);
                        setTypeError(null);
                        edited(3);
                      }}
                      aria-invalid={typeError ? true : undefined}
                      aria-describedby={`${ids}-relationship-hint${typeError ? ` ${ids}-type-error` : ""}`}
                      className={inputClass}
                    >
                      <option value="">Choose…</option>
                      {RELATIONSHIPS.map((r) => (
                        <option key={r} value={r}>
                          {RELATIONSHIP_LABELS[r]}
                        </option>
                      ))}
                    </select>
                    <span id={`${ids}-relationship-hint`} className="text-xs text-muted">
                      Not applicable to cousins, friends, neighbours or siblings-in-law.
                    </span>
                  </div>
                )}
                <FieldError id={`${ids}-type-error`} message={typeError} />
              </fieldset>
            )}

            {step === 4 && leaveType && (
              <div className="flex flex-col gap-4.5 px-7 py-6">
                <StepTitle title="Check and confirm" hint="Nothing is saved until you confirm. You can go back and change anything." />
                <dl className="grid grid-cols-[140px_1fr] gap-x-4 gap-y-2">
                  <dt className="text-muted">Leave type</dt>
                  <dd className="font-medium">{typeLabel}</dd>
                  <dt className="text-muted">Total</dt>
                  <dd className="font-medium">
                    {formatDuration(totalMinutes)} in {recordCount(records.length)}
                  </dd>
                </dl>
                <div className="overflow-hidden rounded-xl border border-line">
                  <table className="w-full border-collapse text-left">
                    <thead>
                      <tr className="bg-surface-muted text-xs text-muted">
                        <th className="px-3.5 py-2.5 font-medium">Date</th>
                        <th className="px-3.5 py-2.5 font-medium">Position</th>
                        <th className="px-3.5 py-2.5 font-medium">Hours</th>
                        <th className="px-3.5 py-2.5 text-right font-medium">Duration</th>
                      </tr>
                    </thead>
                    <tbody>
                      {records.map((r) => (
                        <tr key={r.positionId} className="border-t border-line">
                          <td className="whitespace-nowrap px-3.5 py-3">{formatDateLong(r.date)}</td>
                          <td className="px-3.5 py-3">{labelOf(r.positionId)}</td>
                          <td className="px-3.5 py-3 font-mono text-[13px]">{formatRange(r.start, r.end)}</td>
                          <td className="px-3.5 py-3 text-right">{formatDuration(r.minutes)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                <input type="hidden" name="payload" value={payload} />
                {showServerError && <FieldError message={state.message} />}
              </div>
            )}

            <div className="flex items-center justify-between gap-3 rounded-b-2xl border-t border-line bg-surface-muted px-7 py-4">
              <div>
                {step > 1 && (
                  <Button variant="ghost" onClick={() => go((step - 1) as Step)} disabled={pending}>
                    {step === 4 ? "Back to editing" : "Back"}
                  </Button>
                )}
              </div>
              {step < 4 ? (
                <Button type="submit" disabled={step === 1 && !date}>
                  Continue
                </Button>
              ) : (
                <Button type="submit" disabled={pending}>
                  {pending ? "Submitting…" : "Confirm request"}
                </Button>
              )}
            </div>
          </Card>
        </form>

        <Card as="aside" aria-label="Your request" className="sticky top-8 flex max-w-full flex-[1_1_280px] flex-col gap-3.5 p-5">
          <div className="flex items-center justify-between">
            <h2 className="text-[15px] font-semibold">Your request</h2>
            <span className="text-xs text-muted">{recordCount(records.length)}</span>
          </div>
          <div className="flex flex-col gap-1">
            <span className="text-xs text-muted">Leave type</span>
            <span className="font-medium">{typeLabel}</span>
          </div>
          <div className="h-px bg-line" />
          {records.length === 0 ? (
            <p className="text-muted">Pick a date and positions to see the records here.</p>
          ) : (
            <ul className="flex flex-col gap-3">
              {records.map((r) => (
                <li key={r.positionId} className="flex justify-between gap-3">
                  <div className="min-w-0">
                    <div className="font-medium">
                      {formatDateShort(r.date)} · <span className="font-mono text-[13px]">{formatRange(r.start, r.end)}</span>
                    </div>
                    <div className="text-[13px] text-muted">{labelOf(r.positionId)}</div>
                  </div>
                  <div className="whitespace-nowrap text-ink-2">{formatDuration(r.minutes)}</div>
                </li>
              ))}
            </ul>
          )}
          <div className="h-px bg-line" />
          <div className="flex justify-between font-semibold">
            <span>Total</span>
            <span>{totalMinutes ? formatDuration(totalMinutes) : "—"}</span>
          </div>
          <p className="text-xs leading-normal text-muted">
            Each record goes to the manager of its position and is decided separately.
          </p>
        </Card>
      </div>
    </div>
  );
}

function PositionCard({
  idPrefix,
  item,
  axis,
  error,
  onChange,
}: {
  idPrefix: string;
  item: Evaluated;
  axis: { start: number; end: number; ticks: number[] };
  error: string | undefined;
  onChange: (patch: Partial<PositionChoice>) => void;
}) {
  const { position, choice, result } = item;
  const pct = (m: number) => ((m - axis.start) / (axis.end - axis.start)) * 100;
  const selected: TimeBlock[] =
    result?.ok
      ? position.blocks
          .map((b) => ({ start: Math.max(result.record.start, b.start), end: Math.min(result.record.end, b.end) }))
          .filter((s) => s.end > s.start)
      : [];
  const duration = !choice.include ? "Not included" : result?.ok ? formatDuration(result.record.minutes) : "—";

  return (
    <li
      className={`rounded-xl border px-4.5 py-4 ${
        error ? "border-danger-line" : choice.include ? "border-brand-line bg-surface" : "border-line bg-surface-muted"
      }`}
    >
      <div className="flex items-start gap-3">
        <input
          id={`${idPrefix}-include`}
          type="checkbox"
          checked={choice.include}
          onChange={(e) => onChange({ include: e.target.checked })}
          className="mt-0.5 size-4.5 accent-brand"
        />
        <label htmlFor={`${idPrefix}-include`} className="flex-1 cursor-pointer">
          <span className="flex flex-wrap items-center gap-2">
            <span className="font-semibold">{position.label}</span>
            <span className="rounded-md bg-subtle px-2 py-0.5 text-xs font-medium text-ink-2">
              {position.kind === "main" ? "Main" : "Additional"}
            </span>
          </span>
          <span className="mt-0.5 block text-[13px] text-muted">Schedule: {formatBlocks(position.blocks)}</span>
        </label>
        <span className="font-mono text-[13px] text-ink-2">{duration}</span>
      </div>

      <div className={`mt-3.5 ml-7.5 ${choice.include ? "" : "opacity-60"}`} aria-hidden="true">
        <div className="relative h-3.5 rounded bg-subtle">
          {position.blocks.map((b) => (
            <div
              key={b.start}
              className={`absolute inset-y-0 rounded ${choice.include ? "bg-brand-line" : "bg-line-strong"}`}
              style={{ left: `${pct(b.start)}%`, width: `${pct(b.end) - pct(b.start)}%` }}
            />
          ))}
          {selected.map((s) => (
            <div
              key={s.start}
              className="absolute inset-y-0 rounded bg-brand"
              style={{ left: `${pct(s.start)}%`, width: `${pct(s.end) - pct(s.start)}%` }}
            />
          ))}
        </div>
        <div className="relative mt-1 h-4 text-[11px] text-faint">
          {axis.ticks.map((t) => (
            <span key={t} className="absolute -translate-x-1/2" style={{ left: `${pct(t)}%` }}>
              {formatTime(t)}
            </span>
          ))}
        </div>
      </div>

      {choice.include && (
        <div className="mt-3 ml-7.5 flex flex-wrap items-center gap-4.5">
          <fieldset className="inline-flex rounded-[9px] bg-subtle p-0.75">
            <legend className="sr-only">Hours for {position.label}</legend>
            {[
              { whole: true, label: "Whole day" },
              { whole: false, label: "Specific hours" },
            ].map((option) => (
              <label
                key={option.label}
                className="cursor-pointer rounded-[7px] px-3 py-1.5 text-[13px] text-ink-2 has-checked:bg-surface has-checked:font-medium has-checked:text-ink has-checked:shadow-xs has-focus-visible:outline-2 has-focus-visible:outline-ring"
              >
                <input
                  type="radio"
                  name={`${idPrefix}-mode`}
                  checked={choice.wholeDay === option.whole}
                  onChange={() => onChange({ wholeDay: option.whole })}
                  className="sr-only"
                />
                {option.label}
              </label>
            ))}
          </fieldset>
          {!choice.wholeDay && (
            <div className="flex items-center gap-2">
              <label htmlFor={`${idPrefix}-from`} className="text-ink-2">
                From
              </label>
              <input
                id={`${idPrefix}-from`}
                type="time"
                step={300}
                value={choice.start ?? ""}
                onChange={(e) => onChange({ start: e.target.value })}
                aria-invalid={error ? true : undefined}
                className={`${inputClass} h-9`}
              />
              <label htmlFor={`${idPrefix}-to`} className="text-ink-2">
                to
              </label>
              <input
                id={`${idPrefix}-to`}
                type="time"
                step={300}
                value={choice.end ?? ""}
                onChange={(e) => onChange({ end: e.target.value })}
                aria-invalid={error ? true : undefined}
                className={`${inputClass} h-9`}
              />
            </div>
          )}
        </div>
      )}

      <FieldError message={error} className="mt-3 ml-7.5" />
    </li>
  );
}

const inputClass = "h-10 rounded-lg border border-line-strong bg-surface px-2.5 text-ink";

function recordCount(n: number) {
  return n === 1 ? "1 record" : `${n} records`;
}

function StepTitle({ title, hint }: { title: string; hint: string }) {
  return (
    <div>
      <h2 className="text-[17px] font-semibold">{title}</h2>
      <p className="mt-1 text-muted">{hint}</p>
    </div>
  );
}
