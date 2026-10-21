"use client";

import { useActionState, useId, useReducer, useState, type FormEvent } from "react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { FieldError } from "@/components/ui/field-error";
import { ChevronLeftIcon, ChevronRightIcon, CloseIcon, LeaveTypeIcon } from "@/components/ui/icons";
import { choiceFor, draftReducer, EMPTY_DRAFT, toPayload, type Step } from "@/lib/leave/draft";
import {
  checkComment,
  checkLeaveType,
  commentLength,
  COMMENT_MAX,
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
  addMonths,
  dayAxis,
  formatBlocks,
  formatDateLong,
  formatDateShort,
  formatDuration,
  formatMonth,
  formatRange,
  formatTime,
  monthGrid,
  WEEKDAY_SHORT,
  type TimeBlock,
} from "@/lib/leave/time";
import { submitLeaveRequest, type SubmitState } from "./actions";

// Короткі підписи: на ~1080 px картка кроку вміщає близько 120 px тексту.
const STEPS = ["Dates", "Positions & hours", "Leave type", "Summary"] as const;

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

interface DaySection {
  date: string;
  cards: Evaluated[];
}

// Заявка (D6): дати → посади й години → тип і коментар → підсумок → підтвердження; праворуч — живий підсумок.
// Стан — draftReducer (src/lib/leave/draft.ts): повернення назад і з підсумку не губить введеного (AC-LEAVE-11).
// Перевірки на кожному кроці — ті самі чисті функції src/lib/leave/, що й у server action.
export function NewRequestForm({ positions, today }: { positions: PositionSchedule[]; today: string }) {
  const ids = useId();
  const [draft, dispatch] = useReducer(draftReducer, EMPTY_DRAFT);
  const [month, setMonth] = useState(today.slice(0, 7));
  const [dateError, setDateError] = useState<string | null>(null);
  const [showPositionErrors, setShowPositionErrors] = useState(false);
  const [typeError, setTypeError] = useState<string | null>(null);
  const [commentError, setCommentError] = useState<string | null>(null);
  const [showServerError, setShowServerError] = useState(false);
  const [state, formAction, pending] = useActionState(submitLeaveRequest, INITIAL);
  const { step, maxStep, dates, leaveType, relationship, comment } = draft;

  const go = (next: Step) => {
    setShowServerError(false);
    dispatch({ type: "go", step: next });
  };

  const daysOf = (date: string) => {
    const day = positionsOnDate(positions, date);
    return day.ok ? day.positions : [];
  };

  const sections: DaySection[] = dates.map((date) => ({
    date,
    cards: daysOf(date).map((position) => {
      const choice = choiceFor(draft, date, position.id);
      return { position, choice, result: choice.include ? recordForChoice(date, position, choice) : null };
    }),
  }));
  const records: DraftRecord[] =
    step === 1 ? [] : sections.flatMap((s) => s.cards.flatMap((e) => (e.result?.ok ? [e.result.record] : [])));
  const totalMinutes = records.reduce((sum, r) => sum + r.minutes, 0);
  const labelOf = (id: number) => positions.find((p) => p.id === id)?.label ?? "";

  function pickDate(date: string) {
    if (!dates.includes(date)) {
      const day = positionsOnDate(positions, date);
      if (!day.ok) {
        setDateError(day.message);
        return;
      }
    }
    setDateError(null);
    dispatch({ type: "toggleDate", date });
  }

  function nextFromDates() {
    if (dates.length === 0) {
      setDateError(REQUEST_MESSAGES.chooseDate);
      return;
    }
    setShowPositionErrors(false);
    go(2);
  }

  function nextFromPositions() {
    setShowPositionErrors(true);
    const valid = sections.every(
      (s) => s.cards.some((e) => e.choice.include) && s.cards.every((e) => !e.result || e.result.ok),
    );
    if (valid) go(3);
  }

  function nextFromType() {
    const type = checkLeaveType(leaveType ?? "", relationship);
    setTypeError(type.ok ? null : type.message);
    const checked = checkComment(comment);
    setCommentError(checked.ok ? null : checked.message);
    if (type.ok && checked.ok) go(4);
  }

  function onSubmit(event: FormEvent<HTMLFormElement>) {
    // Enter у полі на кроках 1–3 — це «Continue», а не подання заявки.
    if (step !== 4) {
      event.preventDefault();
      if (step === 1) nextFromDates();
      else if (step === 2) nextFromPositions();
      else nextFromType();
      return;
    }
    setShowServerError(true);
  }

  const payload = JSON.stringify(toPayload(draft, (date) => daysOf(date).map((p) => p.id)));
  const typeLabel = leaveType
    ? LEAVE_TYPES[leaveType] +
      (leaveType === "family" && isRelationship(relationship) ? ` (${RELATIONSHIP_LABELS[relationship].toLowerCase()})` : "")
    : "Not chosen yet";
  const commentChars = commentLength(comment);

  return (
    <div className="flex flex-col gap-6">
      {/* Сітка на 4 колонки: картки однакової висоти, підпис в один рядок (повний — у title і для читачів екрана). */}
      <ol className="grid grid-cols-4 gap-2">
        {STEPS.map((label, i) => {
          const n = (i + 1) as Step;
          const current = n === step;
          const done = n < step || (n <= maxStep && !current);
          const locked = n > maxStep || pending;
          return (
            <li key={label} className="min-w-0">
              <button
                type="button"
                onClick={() => go(n)}
                disabled={locked || current}
                aria-current={current ? "step" : undefined}
                title={label}
                className={`flex h-full w-full items-center gap-2.5 rounded-xl border px-3 py-2.5 text-left ${
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
                <span className="flex min-w-0 flex-col">
                  <span className="text-xs text-faint">Step {n}</span>
                  <span className="truncate whitespace-nowrap font-medium">{label}</span>
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
                <StepTitle
                  title="When do you need leave?"
                  hint="Pick one or more dates. Days you work are marked; you can also pick dates in the past."
                />
                <div className="flex flex-wrap gap-7">
                  <DateCalendar
                    month={month}
                    today={today}
                    selected={dates}
                    works={(date) => daysOf(date).length > 0}
                    onMonth={(delta) => setMonth((m) => addMonths(m, delta))}
                    onPick={pickDate}
                  />
                  <div className="flex min-w-56 flex-1 flex-col gap-2.5">
                    <div className="font-medium">Selected dates</div>
                    {dates.length === 0 ? (
                      <p className="rounded-[10px] border border-dashed border-line-strong p-4 text-muted">
                        No dates yet — pick them in the calendar.
                      </p>
                    ) : (
                      <ul className="flex flex-wrap gap-2">
                        {dates.map((d) => (
                          <li
                            key={d}
                            className="inline-flex items-center gap-1.5 rounded-full bg-brand-soft py-1 pr-1.5 pl-3 font-medium text-brand-strong"
                          >
                            {formatDateShort(d)}
                            <button
                              type="button"
                              onClick={() => pickDate(d)}
                              aria-label={`Remove ${formatDateLong(d)}`}
                              className="flex size-6 items-center justify-center rounded-full hover:bg-brand-muted"
                            >
                              <CloseIcon size={14} />
                            </button>
                          </li>
                        ))}
                      </ul>
                    )}
                    <FieldError id={`${ids}-date-error`} message={dateError} />
                    <div className="mt-1.5 rounded-xl border border-line bg-surface-muted px-3.5 py-3 text-[13px] leading-relaxed text-ink-2">
                      <div className="mb-1 font-medium">Your weekly schedule</div>
                      {positions.map((p) => (
                        <div key={p.id}>
                          {p.label} — {weeklySchedule(p.blocks)}
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
              </div>
            )}

            {step === 2 && (
              <div className="flex flex-col gap-5.5 px-7 py-6">
                <StepTitle
                  title="Positions and hours"
                  hint="For each date, include the positions you will be absent from — for the whole day or for specific hours."
                />
                {sections.map((section) => (
                  <DaySectionView
                    key={section.date}
                    idPrefix={`${ids}-${section.date}`}
                    section={section}
                    showErrors={showPositionErrors}
                    onChange={(positionId, patch) => {
                      setShowServerError(false);
                      dispatch({ type: "setChoice", date: section.date, positionId, patch });
                    }}
                  />
                ))}
              </div>
            )}

            {step === 3 && (
              <div className="flex flex-col gap-5 px-7 py-6">
                <fieldset className="flex flex-col gap-5">
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
                            dispatch({ type: "setLeaveType", leaveType: type });
                            setTypeError(null);
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
                          dispatch({ type: "setRelationship", relationship: e.target.value });
                          setTypeError(null);
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

                <div className="flex flex-col gap-1.5">
                  <div className="flex items-baseline justify-between">
                    <label htmlFor={`${ids}-comment`} className="font-medium">
                      Comment <span className="font-normal text-faint">(optional)</span>
                    </label>
                    <span
                      id={`${ids}-comment-counter`}
                      className={`text-xs ${commentChars > COMMENT_MAX ? "font-medium text-danger" : "text-faint"}`}
                    >
                      {commentChars} / {COMMENT_MAX}
                    </span>
                  </div>
                  <textarea
                    id={`${ids}-comment`}
                    rows={3}
                    value={comment}
                    onChange={(e) => {
                      dispatch({ type: "setComment", comment: e.target.value });
                      setCommentError(null);
                    }}
                    placeholder="For example: Doctor’s appointment"
                    aria-invalid={commentError ? true : undefined}
                    aria-describedby={`${ids}-comment-hint ${ids}-comment-counter${commentError ? ` ${ids}-comment-error` : ""}`}
                    className="resize-y rounded-lg border border-line-strong bg-surface px-3 py-2.5 text-ink"
                  />
                  <span id={`${ids}-comment-hint`} className="text-xs text-muted">
                    Your managers see this comment on every record of the request.
                  </span>
                  <FieldError id={`${ids}-comment-error`} message={commentError} />
                </div>
              </div>
            )}

            {step === 4 && leaveType && (
              <div className="flex flex-col gap-4.5 px-7 py-6">
                <StepTitle title="Check and confirm" hint="Nothing is saved until you confirm. You can go back and change anything." />
                <dl className="grid grid-cols-[140px_1fr] gap-x-4 gap-y-2">
                  <dt className="text-muted">Leave type</dt>
                  <dd className="font-medium">{typeLabel}</dd>
                  <dt className="text-muted">Comment</dt>
                  <dd className="break-words whitespace-pre-line">{comment.trim() || "—"}</dd>
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
                        <tr key={`${r.date}|${r.positionId}`} className="border-t border-line">
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
                <Button type="submit">Continue</Button>
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
            <p className="text-muted">Pick dates and positions to see the records here.</p>
          ) : (
            <ul className="flex flex-col gap-3">
              {records.map((r) => (
                <li key={`${r.date}|${r.positionId}`} className="flex justify-between gap-3">
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

/** Календар місяця з понеділка: робочі дні — з рамкою, вибрані — заливкою; день без розкладу показує AC-LEAVE-06. */
function DateCalendar({
  month,
  today,
  selected,
  works,
  onMonth,
  onPick,
}: {
  month: string;
  today: string;
  selected: string[];
  works: (date: string) => boolean;
  onMonth: (delta: number) => void;
  onPick: (date: string) => void;
}) {
  return (
    <div className="shrink-0">
      <div className="mb-2.5 flex items-center justify-between">
        <Button variant="ghost" className="min-h-8 px-2" aria-label="Previous month" onClick={() => onMonth(-1)}>
          <ChevronLeftIcon />
        </Button>
        <div className="font-semibold" aria-live="polite">
          {formatMonth(month)}
        </div>
        <Button variant="ghost" className="min-h-8 px-2" aria-label="Next month" onClick={() => onMonth(1)}>
          <ChevronRightIcon />
        </Button>
      </div>
      <div className="grid w-84 grid-cols-7 gap-1">
        {WEEKDAY_SHORT.map((w) => (
          <div key={w} aria-hidden="true" className="py-1 text-center text-xs text-faint">
            {w}
          </div>
        ))}
        {monthGrid(month).map((date, i) => {
          if (!date) return <div key={`blank-${i}`} />;
          const isSelected = selected.includes(date);
          const working = works(date);
          return (
            <button
              key={date}
              type="button"
              onClick={() => onPick(date)}
              aria-pressed={isSelected}
              aria-label={`${formatDateLong(date)}${working ? "" : ", no working hours"}`}
              className={`h-11 rounded-[9px] border text-sm ${
                isSelected
                  ? "border-brand bg-brand font-semibold text-on-brand"
                  : working
                    ? "border-line-strong bg-surface text-ink hover:border-brand-hover"
                    : "border-transparent bg-subtle text-faint"
              } ${date === today && !isSelected ? "font-semibold underline underline-offset-4" : ""}`}
            >
              {Number(date.slice(8))}
            </button>
          );
        })}
      </div>
      <div className="mt-3 flex gap-3.5 text-xs text-muted">
        <Legend className="border border-faint bg-surface" label="Working day" />
        <Legend className="bg-brand" label="Selected" />
        <Legend className="bg-subtle" label="No schedule" />
      </div>
    </div>
  );
}

function Legend({ className, label }: { className: string; label: string }) {
  return (
    <span className="flex items-center gap-1.5">
      <span aria-hidden="true" className={`size-2.5 rounded-[3px] ${className}`} />
      {label}
    </span>
  );
}

function DaySectionView({
  idPrefix,
  section,
  showErrors,
  onChange,
}: {
  idPrefix: string;
  section: DaySection;
  showErrors: boolean;
  onChange: (positionId: number, patch: Partial<PositionChoice>) => void;
}) {
  const axis = dayAxis(section.cards.flatMap((e) => e.position.blocks));
  const included = section.cards.filter((e) => e.choice.include).length;
  return (
    <section aria-labelledby={`${idPrefix}-title`} className="flex flex-col gap-2.5">
      <div className="flex items-baseline gap-2.5">
        <h3 id={`${idPrefix}-title`} className="text-[15px] font-semibold">
          {formatDateLong(section.date)}
        </h3>
        <span className="text-[13px] text-faint">
          {included} of {section.cards.length} positions included
        </span>
      </div>
      <ul className="flex flex-col gap-2.5">
        {section.cards.map((e) => (
          <PositionCard
            key={e.position.id}
            idPrefix={`${idPrefix}-${e.position.id}`}
            item={e}
            axis={axis}
            showError={showErrors || Boolean(e.choice.start && e.choice.end)}
            onChange={(patch) => onChange(e.position.id, patch)}
          />
        ))}
      </ul>
      <FieldError message={showErrors && included === 0 ? REQUEST_MESSAGES.choosePosition : null} />
    </section>
  );
}

function PositionCard({
  idPrefix,
  item,
  axis,
  showError,
  onChange,
}: {
  idPrefix: string;
  item: Evaluated;
  axis: { start: number; end: number; ticks: number[] };
  showError: boolean;
  onChange: (patch: Partial<PositionChoice>) => void;
}) {
  const { position, choice, result } = item;
  const error = showError && result && !result.ok ? result.message : null;
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
