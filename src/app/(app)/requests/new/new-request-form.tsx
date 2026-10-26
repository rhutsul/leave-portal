"use client";

import { useActionState, useId, useReducer, useState, type FormEvent, type ReactNode } from "react";
import { Banknote, Check, ChevronLeft, ChevronRight, CircleAlert, Gift, HeartPulse, Info, TriangleAlert, UserRound, X } from "lucide-react";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { CalendarDay, CalendarLegend } from "@/components/ui/calendar-day";
import { Card } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { FieldError } from "@/components/ui/field-error";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { LeaveTypeTag } from "@/components/ui/leave-type-tag";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Textarea } from "@/components/ui/textarea";
import {
  employeeWarning,
  isLimitedType,
  requestOverBalance,
  uncheckedYears,
  type LimitedType,
} from "@/lib/leave/balance";
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
import { cn } from "@/lib/utils";
import { submitLeaveRequest, type SubmitState } from "./actions";
import { calendarDay } from "./calendar-view";

// Кроки без номерів у заголовках (DESIGN.md): лише назви; пройдений крок — з галочкою.
const STEPS = ["Dates", "Positions & hours", "Leave type", "Summary"] as const;

const TYPE_HINTS: Record<LeaveType, string> = {
  sick: "Illness, a doctor’s appointment",
  personal: "Counts against your Personal leave balance",
  unpaid: "Not paid; counted, not limited",
  family: "A celebration of a close relative",
};

const TYPE_ICONS: Record<LeaveType, ReactNode> = {
  sick: <HeartPulse />,
  personal: <UserRound />,
  unpaid: <Banknote />,
  family: <Gift />,
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
// Перевірки на кожному кроці — ті самі чисті функції src/lib/leave/, що й у server action. Як обирати дати —
// вибір розробника (mkozlovskyi-ops/course-staff-management-spec#13): календар місяця.
export function NewRequestForm({
  positions,
  today,
  remaining,
  recordDates,
}: {
  positions: PositionSchedule[];
  today: string;
  /** Залишки в сотих за навчальним роком на момент відкриття форми; null — не завантажились. */
  remaining: Record<number, Record<LimitedType, number>> | null;
  /** Дати з чинними власними записами — у календарі зафарбовані. */
  recordDates: string[];
}) {
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
  // Одне попередження на всю заявку за залишком навчального року її дат (AC-BALANCE-08, AC-BALANCE-15, AC-BALANCE-17).
  // Заявку все одно можна подати; server action ще раз рахує його за залишком на момент подання.
  const allBlocks = positions.flatMap((p) => p.blocks);
  const remainingOf = (year: number) =>
    leaveType && isLimitedType(leaveType) ? (remaining?.[year]?.[leaveType] ?? null) : null;
  const overBalance = leaveType ? requestOverBalance(leaveType, records, allBlocks, remainingOf) : [];
  // Залишок не завантажився або дати поза завантаженими роками — кажемо, що перевірка буде під час подання.
  const balanceUnchecked = leaveType !== null && isLimitedType(leaveType) && uncheckedYears(records, remainingOf).length > 0;
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
  const relationshipNote =
    leaveType === "family" && isRelationship(relationship) ? ` (${RELATIONSHIP_LABELS[relationship].toLowerCase()})` : "";
  const commentChars = commentLength(comment);
  const relationshipItems = RELATIONSHIPS.map((r) => ({ value: r, label: RELATIONSHIP_LABELS[r] }));
  const warnings =
    leaveType && isLimitedType(leaveType)
      ? overBalance.map((o) => ({ key: o.schoolYear, text: employeeWarning(leaveType, o.share, o.remaining) }))
      : [];

  return (
    <div className="flex flex-col gap-6">
      <nav aria-label="Request steps">
        <ol className="flex flex-wrap gap-1.5">
          {STEPS.map((label, i) => {
            const n = (i + 1) as Step;
            const current = n === step;
            const done = n < step || (n <= maxStep && !current);
            const locked = n > maxStep || pending;
            return (
              <li key={label}>
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  onClick={() => !current && go(n)}
                  disabled={locked && !current}
                  aria-current={current ? "step" : undefined}
                  className={cn(current && "bg-sidebar-accent text-sidebar-accent-foreground hover:bg-sidebar-accent")}
                >
                  {done && <Check className="text-status-approved-foreground" aria-hidden="true" />}
                  {label}
                  {done && <span className="sr-only">(done)</span>}
                </Button>
              </li>
            );
          })}
        </ol>
      </nav>

      <div className="flex flex-wrap items-start gap-6">
        <form action={formAction} onSubmit={onSubmit} className="min-w-0 flex-[999_1_560px]">
          <Card className="gap-0 py-0">
            {step === 1 && (
              <div className="flex flex-col gap-5 px-6 py-5">
                <StepTitle title="Dates" hint="Pick one or more dates. You can also pick dates in the past." />
                <div className="flex flex-wrap gap-7">
                  <DateCalendar
                    month={month}
                    today={today}
                    selected={dates}
                    recordDates={recordDates}
                    works={(date) => daysOf(date).length > 0}
                    onMonth={(delta) => setMonth((m) => addMonths(m, delta))}
                    onPick={pickDate}
                  />
                  <div className="flex min-w-56 flex-1 flex-col gap-2.5">
                    <span className="text-[13px] font-medium">Selected dates</span>
                    {dates.length === 0 ? (
                      <p className="rounded-md border border-dashed border-border p-4 text-muted-foreground">
                        No dates yet — pick them in the calendar.
                      </p>
                    ) : (
                      <ul className="flex flex-wrap gap-1.5">
                        {dates.map((d) => (
                          <li
                            key={d}
                            className="inline-flex h-8 items-center gap-1 rounded-full bg-accent pr-1 pl-3 text-[13px] font-medium tabular-nums text-accent-foreground"
                          >
                            {formatDateShort(d)}
                            <Button
                              variant="ghost"
                              size="icon-xs"
                              className="rounded-full hover:bg-primary/10"
                              onClick={() => pickDate(d)}
                              aria-label={`Remove ${formatDateLong(d)}`}
                            >
                              <X />
                            </Button>
                          </li>
                        ))}
                      </ul>
                    )}
                    <FieldError id={`${ids}-date-error`} message={dateError} />
                    <div className="mt-1 rounded-md border border-border bg-muted px-3.5 py-3 text-[13px] leading-relaxed">
                      <div className="mb-1 font-medium">Your weekly schedule</div>
                      {positions.map((p) => (
                        <div key={p.id} className="text-muted-foreground">
                          {p.label} — {weeklySchedule(p.blocks)}
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
              </div>
            )}

            {step === 2 && (
              <div className="flex flex-col gap-5 px-6 py-5">
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
              <div className="flex flex-col gap-5 px-6 py-5">
                <div className="flex flex-col gap-3">
                  <StepTitle title="Leave type" hint="One leave type per request. Different types mean different requests." />
                  <RadioGroup
                    aria-label="Leave type"
                    value={leaveType ?? ""}
                    onValueChange={(value) => {
                      dispatch({ type: "setLeaveType", leaveType: value as LeaveType });
                      setTypeError(null);
                    }}
                    className="grid-cols-[repeat(auto-fit,minmax(220px,1fr))] gap-3"
                  >
                    {(Object.keys(LEAVE_TYPES) as LeaveType[]).map((type) => (
                      <Label
                        key={type}
                        htmlFor={`${ids}-type-${type}`}
                        className={cn(
                          // Радіо сховане (sr-only), тож фокус клавіатури показує картка.
                          "items-center gap-3.5 rounded-md border border-border bg-card p-3.5 font-normal transition-colors duration-(--duration-fast) hover:border-ring has-focus-visible:ring-2 has-focus-visible:ring-ring has-focus-visible:ring-offset-2 has-focus-visible:ring-offset-background",
                          leaveType === type && "border-ring bg-accent",
                        )}
                      >
                        <RadioGroupItem id={`${ids}-type-${type}`} value={type} className="sr-only" />
                        <span
                          aria-hidden="true"
                          className={cn(
                            "grid size-9 shrink-0 place-items-center rounded-md bg-muted text-foreground [&_svg]:size-4.5",
                            leaveType === type && "bg-primary text-primary-foreground",
                          )}
                        >
                          {TYPE_ICONS[type]}
                        </span>
                        <span className="flex flex-col gap-0.5">
                          <span className="text-sm font-semibold">{LEAVE_TYPES[type]}</span>
                          <span className="text-[13px] text-muted-foreground">{TYPE_HINTS[type]}</span>
                        </span>
                      </Label>
                    ))}
                  </RadioGroup>
                  {leaveType === "family" && (
                    <div className="flex max-w-80 flex-col gap-1.5">
                      <Label htmlFor={`${ids}-relationship`}>Relationship to the person</Label>
                      <Select
                        value={relationship || null}
                        items={relationshipItems}
                        onValueChange={(value) => {
                          dispatch({ type: "setRelationship", relationship: String(value ?? "") });
                          setTypeError(null);
                        }}
                      >
                        <SelectTrigger
                          id={`${ids}-relationship`}
                          className="w-full"
                          aria-invalid={typeError ? true : undefined}
                          aria-describedby={`${ids}-relationship-hint${typeError ? ` ${ids}-type-error` : ""}`}
                        >
                          <SelectValue placeholder="Choose…" />
                        </SelectTrigger>
                        <SelectContent>
                          {relationshipItems.map((r) => (
                            <SelectItem key={r.value} value={r.value}>
                              {r.label}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                      <span id={`${ids}-relationship-hint`} className="text-xs text-muted-foreground">
                        Not applicable to cousins, friends, neighbours or siblings-in-law.
                      </span>
                    </div>
                  )}
                  <FieldError id={`${ids}-type-error`} message={typeError} />
                </div>

                <div className="flex flex-col gap-1.5">
                  <div className="flex items-baseline justify-between">
                    <Label htmlFor={`${ids}-comment`}>Comment</Label>
                    <span
                      id={`${ids}-comment-counter`}
                      className={cn(
                        "text-xs tabular-nums",
                        commentChars > COMMENT_MAX ? "font-medium text-destructive" : "text-muted-foreground",
                      )}
                    >
                      Optional · {commentChars}/{COMMENT_MAX}
                    </span>
                  </div>
                  <Textarea
                    id={`${ids}-comment`}
                    rows={2}
                    value={comment}
                    onChange={(e) => {
                      dispatch({ type: "setComment", comment: e.target.value });
                      setCommentError(null);
                    }}
                    placeholder="For example: Doctor’s appointment"
                    aria-invalid={commentError ? true : undefined}
                    aria-describedby={`${ids}-comment-hint ${ids}-comment-counter${commentError ? ` ${ids}-comment-error` : ""}`}
                  />
                  <span id={`${ids}-comment-hint`} className="text-xs text-muted-foreground">
                    Your managers see this comment on every record of the request.
                  </span>
                  <FieldError id={`${ids}-comment-error`} message={commentError} />
                </div>
              </div>
            )}

            {step === 4 && leaveType && (
              <div className="flex flex-col gap-4 px-6 py-5">
                <StepTitle title="Check and confirm" hint="Nothing is saved until you confirm. You can go back and change anything." />
                <dl className="grid grid-cols-[140px_1fr] gap-x-4 gap-y-2">
                  <dt className="text-muted-foreground">Leave type</dt>
                  <dd>
                    <LeaveTypeTag type={leaveType} />
                    {relationshipNote}
                  </dd>
                  <dt className="text-muted-foreground">Comment</dt>
                  <dd className="break-words whitespace-pre-line">{comment.trim() || "—"}</dd>
                  <dt className="text-muted-foreground">Total</dt>
                  <dd className="font-medium tabular-nums">
                    {formatDuration(totalMinutes)} in {recordCount(records.length)}
                  </dd>
                </dl>
                <div className="overflow-x-auto rounded-md border border-border">
                  <Table>
                    <TableHeader className="bg-muted">
                      <TableRow className="hover:bg-transparent">
                        <TableHead>Date</TableHead>
                        <TableHead>Position</TableHead>
                        <TableHead>Hours</TableHead>
                        <TableHead className="text-right">Duration</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {records.map((r) => (
                        <TableRow key={`${r.date}|${r.positionId}`}>
                          <TableCell className="tabular-nums">{formatDateLong(r.date)}</TableCell>
                          <TableCell>{labelOf(r.positionId)}</TableCell>
                          <TableCell className="tabular-nums">{formatRange(r.start, r.end)}</TableCell>
                          <TableCell className="text-right tabular-nums">{formatDuration(r.minutes)}</TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
                {/* Попередження не зупиняє заявку — виглядає як попередження, не помилка (рішення PM,
                    mkozlovskyi-ops/course-staff-management-spec#16); текст дослівно з AC. */}
                {warnings.map((w) => (
                  <Alert key={w.key} variant="warning" role="note">
                    <TriangleAlert />
                    <AlertDescription>{w.text}</AlertDescription>
                  </Alert>
                ))}
                {balanceUnchecked && (
                  <p className="flex items-center gap-1.5 text-[13px] text-muted-foreground">
                    <Info className="size-3.5 shrink-0" aria-hidden="true" />
                    Your balance will be checked when you submit; if it is exceeded, you will see a warning.
                  </p>
                )}
                <input type="hidden" name="payload" value={payload} />
                {showServerError && state.message && (
                  <Alert variant="destructive" role="alert">
                    <CircleAlert />
                    <AlertDescription>{state.message}</AlertDescription>
                  </Alert>
                )}
              </div>
            )}

            <div className="flex items-center justify-between gap-3 border-t border-border bg-muted/50 px-6 py-3.5">
              <div>
                {step > 1 && (
                  <Button variant="ghost" onClick={() => go((step - 1) as Step)} disabled={pending}>
                    <ChevronLeft />
                    {step === 4 ? "Back to editing" : "Back"}
                  </Button>
                )}
              </div>
              {step < 4 ? (
                <Button type="submit">
                  Continue
                  <ChevronRight />
                </Button>
              ) : (
                <Button type="submit" disabled={pending} aria-busy={pending || undefined}>
                  {pending && (
                    <span aria-hidden="true" className="size-3.5 animate-spin rounded-full border-2 border-current border-r-transparent" />
                  )}
                  {pending ? "Submitting…" : "Submit request"}
                </Button>
              )}
            </div>
          </Card>
        </form>

        <Card role="complementary" aria-label="Your request" className="sticky top-8 max-w-full flex-[1_1_300px] gap-3.5 px-5 py-4.5">
          <div className="flex items-center justify-between">
            <h2 className="text-base font-semibold">Your request</h2>
            <span className="text-xs text-muted-foreground">{recordCount(records.length)}</span>
          </div>
          <div className="flex items-center justify-between gap-3">
            <span className="text-muted-foreground">Type</span>
            {leaveType ? <LeaveTypeTag type={leaveType} /> : <span className="text-muted-foreground">Not chosen yet</span>}
          </div>
          {records.length === 0 ? (
            <p className="border-t border-border pt-3 text-muted-foreground">Pick dates and positions to see the records here.</p>
          ) : (
            <ul className="flex flex-col border-t border-border">
              {records.map((r) => (
                <li key={`${r.date}|${r.positionId}`} className="flex justify-between gap-3 border-b border-border py-2.5">
                  <div className="min-w-0">
                    <div className="font-medium tabular-nums">{formatDateShort(r.date)}</div>
                    <div className="truncate text-xs text-muted-foreground">{labelOf(r.positionId)}</div>
                  </div>
                  <div className="text-right whitespace-nowrap tabular-nums">
                    <div>{formatRange(r.start, r.end)}</div>
                    <div className="text-xs text-muted-foreground">{formatDuration(r.minutes)}</div>
                  </div>
                </li>
              ))}
            </ul>
          )}
          <div className="flex justify-between font-semibold tabular-nums">
            <span>Total</span>
            <span>{totalMinutes ? formatDuration(totalMinutes) : "—"}</span>
          </div>
          <p className="text-xs leading-normal text-muted-foreground">
            Each record goes to the manager of its position and is decided separately.
          </p>
        </Card>
      </div>
    </div>
  );
}

/**
 * Календар місяця з понеділка (CalendarDay): вибрані — primary, з чинним записом — заливкою status-awaiting, без
 * робочих годин — блідо (натискання показує повідомлення AC-LEAVE-06). Під календарем — легенда.
 */
function DateCalendar({
  month,
  today,
  selected,
  recordDates,
  works,
  onMonth,
  onPick,
}: {
  month: string;
  today: string;
  selected: string[];
  recordDates: string[];
  works: (date: string) => boolean;
  onMonth: (delta: number) => void;
  onPick: (date: string) => void;
}) {
  return (
    <div className="flex w-84 shrink-0 flex-col gap-2.5">
      <div className="flex items-center justify-between">
        <Button variant="ghost" size="icon-sm" aria-label="Previous month" onClick={() => onMonth(-1)}>
          <ChevronLeft />
        </Button>
        <div className="font-semibold" aria-live="polite">
          {formatMonth(month)}
        </div>
        <Button variant="ghost" size="icon-sm" aria-label="Next month" onClick={() => onMonth(1)}>
          <ChevronRight />
        </Button>
      </div>
      <div className="grid grid-cols-7 gap-1">
        {WEEKDAY_SHORT.map((w) => (
          <div key={w} aria-hidden="true" className="py-1 text-center text-xs text-muted-foreground">
            {w}
          </div>
        ))}
        {monthGrid(month).map((date, i) => {
          if (!date) return <div key={`blank-${i}`} />;
          const { state, label } = calendarDay(date, { selected, recordDates, works: works(date) });
          return (
            <CalendarDay
              key={date}
              day={Number(date.slice(8))}
              state={state}
              onClick={() => onPick(date)}
              aria-label={label}
              className={cn(date === today && state !== "selected" && "underline underline-offset-4")}
            />
          );
        })}
      </div>
      <CalendarLegend states={["free", "selected", "record", "off"]} />
    </div>
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
        <h3 id={`${idPrefix}-title`} className="font-semibold tabular-nums">
          {formatDateLong(section.date)}
        </h3>
        <span className="text-[13px] text-muted-foreground">
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
      className={cn(
        "rounded-md border px-4 py-3.5 transition-colors duration-(--duration-fast)",
        error ? "border-destructive" : choice.include ? "border-ring bg-accent/40" : "border-border bg-muted/60",
      )}
    >
      <div className="flex items-start gap-3">
        <Checkbox
          id={`${idPrefix}-include`}
          checked={choice.include}
          onCheckedChange={(checked) => onChange({ include: checked === true })}
          className="mt-0.5"
        />
        <Label htmlFor={`${idPrefix}-include`} className="flex-1 cursor-pointer flex-col items-start gap-0.5">
          <span className="flex flex-wrap items-center gap-2 text-sm font-semibold">
            {position.label}
            <span className="rounded-sm bg-muted px-2 py-0.5 text-xs font-medium text-muted-foreground">
              {position.kind === "main" ? "Main" : "Additional"}
            </span>
          </span>
          <span className="text-xs font-normal text-muted-foreground">Schedule: {formatBlocks(position.blocks)}</span>
        </Label>
        <span className="text-[13px] tabular-nums text-muted-foreground">{duration}</span>
      </div>

      <div className={cn("mt-3 ml-7", !choice.include && "opacity-60")} aria-hidden="true">
        <div className="relative h-3 rounded-sm bg-muted ring-1 ring-border ring-inset">
          {position.blocks.map((b) => (
            <div
              key={b.start}
              className={cn("absolute inset-y-0 rounded-sm", choice.include ? "bg-ring/35" : "bg-input/40")}
              style={{ left: `${pct(b.start)}%`, width: `${pct(b.end) - pct(b.start)}%` }}
            />
          ))}
          {selected.map((s) => (
            <div
              key={s.start}
              className="absolute inset-y-0 rounded-sm bg-primary"
              style={{ left: `${pct(s.start)}%`, width: `${pct(s.end) - pct(s.start)}%` }}
            />
          ))}
        </div>
        <div className="relative mt-1 h-4 text-[11px] tabular-nums text-muted-foreground">
          {axis.ticks.map((t) => (
            <span key={t} className="absolute -translate-x-1/2" style={{ left: `${pct(t)}%` }}>
              {formatTime(t)}
            </span>
          ))}
        </div>
      </div>

      {choice.include && (
        <div className="mt-3 ml-7 flex flex-wrap items-center gap-4">
          <div role="group" aria-label={`Hours for ${position.label}`} className="inline-flex gap-1 rounded-md bg-muted p-1">
            {[
              { whole: true, label: "Whole day" },
              { whole: false, label: "Specific hours" },
            ].map((option) => (
              <Button
                key={option.label}
                variant="ghost"
                size="sm"
                aria-pressed={choice.wholeDay === option.whole}
                onClick={() => onChange({ wholeDay: option.whole })}
                className={cn(choice.wholeDay === option.whole && "bg-card text-foreground shadow-sm hover:bg-card")}
              >
                {option.label}
              </Button>
            ))}
          </div>
          {!choice.wholeDay && (
            <div className="flex items-center gap-2">
              <Label htmlFor={`${idPrefix}-from`}>From</Label>
              <Input
                id={`${idPrefix}-from`}
                type="time"
                step={300}
                value={choice.start ?? ""}
                onChange={(e) => onChange({ start: e.target.value })}
                aria-invalid={error ? true : undefined}
                className="w-30"
              />
              <Label htmlFor={`${idPrefix}-to`}>to</Label>
              <Input
                id={`${idPrefix}-to`}
                type="time"
                step={300}
                value={choice.end ?? ""}
                onChange={(e) => onChange({ end: e.target.value })}
                aria-invalid={error ? true : undefined}
                className="w-30"
              />
            </div>
          )}
        </div>
      )}

      <FieldError message={error} className="mt-2.5 ml-7" />
    </li>
  );
}

function recordCount(n: number) {
  return n === 1 ? "1 record" : `${n} records`;
}

function StepTitle({ title, hint }: { title: string; hint: string }) {
  return (
    <div>
      <h2 className="text-base font-semibold">{title}</h2>
      <p className="mt-0.5 text-muted-foreground">{hint}</p>
    </div>
  );
}
