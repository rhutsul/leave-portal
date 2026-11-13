"use client";

import Link from "next/link";
import { useActionState, useId, useState } from "react";
import { CalendarRange, CircleAlert, Clock, TriangleAlert } from "lucide-react";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { buttonVariants } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { DatePickerField } from "@/components/ui/date-picker";
import { FieldError } from "@/components/ui/field-error";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { CalendarMonth, ClosureSwatch, SchoolCalendarLegend } from "@/components/ui/school-calendar";
import { SubmitButton } from "@/components/ui/submit-button";
import { formatSchoolYear, schoolYearOf } from "@/lib/leave/balance";
import {
  CALENDAR_MESSAGES,
  closureFieldErrors,
  closuresInSchoolYear,
  emptyCalendarMessage,
  formatClosureDates,
  formatClosureTime,
  type Closure,
} from "@/lib/leave/calendar";
import { buildMonth, overlappingClosures, previewMonths, type DateSelection } from "@/lib/leave/calendar-grid";
import { joinIds } from "@/lib/date-picker";
import { closureFields, closureNote, closurePick, type ClosurePick } from "@/lib/leave/closure-dates";
import { formatTime, parseTime } from "@/lib/leave/time";
import { cn } from "@/lib/utils";
import { addClosure, type ClosureActionState } from "../actions";

const INITIAL: ClosureActionState = { message: "", done: false };
const NO_ERRORS = { name: null, dates: null, time: null };

type Kind = "days" | "early";

const KINDS: { kind: Kind; label: string; hint: string; icon: React.ReactNode }[] = [
  { kind: "days", label: "Whole days", hint: "One date, or from a start date to an end date, both included", icon: <CalendarRange /> },
  { kind: "early", label: "Early dismissal", hint: "One date, closed from a time to the end of the day", icon: <Clock /> },
];

/**
 * Форма «Add closure» (AC-CAL-01, -07, -10, -11, -17, -18, -19): назва обов'язкова й до 100 знаків і або цілі дні, або скорочений день із кроком
 * 5 хвилин. Дати — кліками в DatePicker: цілі дні — одна дата або діапазон (закриття — один проміжок, тому окремих
 * дат тут немає), скорочений день — одна дата. Порядок кліків зберігаємо: кінець раніше за початок — повідомлення
 * AC-CAL-10 поруч із календарем, а відхиляє база. Помилку з бази показуємо дослівно над кнопкою; введене лишається.
 */
export function ClosureForm({ closures, today }: { closures: Closure[] | null; today: string }) {
  const ids = useId();
  const [state, action] = useActionState(addClosure, INITIAL);
  const [kind, setKind] = useState<Kind>("days");
  const [name, setName] = useState("");
  const [time, setTime] = useState("");
  // Дати кожного виду — окремо, як окремі поля раніше: перемикання виду не губить вибраного.
  const [dates, setDates] = useState<Record<Kind, string[]>>({ days: [], early: [] });
  // Помилки полів показуємо після спроби зберегти й ховаємо, щойно поле виправлено (AC-CAL-18, AC-CAL-19).
  const [tried, setTried] = useState(false);
  const pick = closurePick(dates[kind]);
  const early = kind === "early";
  const errors = closureFieldErrors({ name, hasDates: pick != null, early, time });
  const shown = tried ? errors : NO_ERRORS;

  return (
    // Як «New request»: форма ліворуч, перегляд праворуч; вужче — перегляд під формою (ADR 0008).
    <div className="flex flex-wrap items-start gap-6">
      <Card className="min-w-0 flex-[999_1_560px]">
        <CardHeader>
          <CardTitle>New closure</CardTitle>
        </CardHeader>
        <CardContent>
          <form
            action={action}
            noValidate
            onSubmit={(event) => {
              // Обов'язкові поля перевіряємо самі, з текстами PM (AC-CAL-18, AC-CAL-19, Assumptions): браузерні
              // підказки required / maxLength їх не показують, а сховані поля дат браузер не перевіряє зовсім.
              // Server action перевіряє те саме ще раз.
              if (Object.values(errors).every((e) => e == null)) return;
              event.preventDefault();
              setTried(true);
            }}
            className="flex flex-col gap-5"
          >
            <RequiredField
              id={`${ids}-name`}
              label="Name"
              error={shown.name}
              name="name"
              placeholder="Winter break"
              value={name}
              onChange={(e) => setName(e.target.value)}
            />

            <KindChoice id={`${ids}-kind`} kind={kind} onKind={setKind} />

            <ClosureDates
              id={`${ids}-dates`}
              kind={kind}
              value={dates[kind]}
              onChange={(value) => setDates((d) => ({ ...d, [kind]: value }))}
              pick={pick}
              // Помилка — з поточного вибору: щойно дату вибрано (чи вид з уже вибраною датою), вона зникає.
              missing={shown.dates != null}
              closures={closures ?? []}
              today={today}
            />

            {early && (
              <RequiredField
                id={`${ids}-time`}
                label="Closed from"
                error={shown.time}
                className="sm:max-w-[calc(50%-0.375rem)]"
                name="time"
                type="time"
                step={300}
                value={time}
                onChange={(e) => setTime(e.target.value)}
              />
            )}

            {state.message && (
              <Alert variant="destructive" role="alert">
                <CircleAlert />
                <AlertDescription>{state.message}</AlertDescription>
              </Alert>
            )}

            <div className="flex flex-wrap justify-end gap-2">
              <Link href="/calendar" className={buttonVariants({ variant: "ghost" })}>
                Back
              </Link>
              <SubmitButton pendingLabel="Adding…">Add closure</SubmitButton>
            </div>
          </form>
        </CardContent>
      </Card>
      <ClosurePreview
        name={name.trim()}
        selection={pick?.preview ?? null}
        closesAt={early ? parseTime(time) : null}
        closures={closures}
        today={today}
      />
    </div>
  );
}

/**
 * Обов'язкове поле форми з підписом і помилкою під ним (DESIGN.md, розділ 6): текст PM, aria-invalid і
 * aria-describedby, лише після спроби зберегти (AC-CAL-18, AC-CAL-19, Assumptions 04-school-calendar).
 */
function RequiredField({
  id,
  label,
  error,
  className,
  ...input
}: { id: string; label: string; error: string | null; className?: string } & React.ComponentProps<typeof Input>) {
  return (
    <div className={cn("flex flex-col gap-1.5", className)}>
      <Label htmlFor={id}>{label}</Label>
      <Input
        {...input}
        id={id}
        aria-required="true"
        aria-invalid={error ? true : undefined}
        aria-describedby={error ? `${id}-error` : undefined}
      />
      <FieldError id={`${id}-error`} message={error} />
    </div>
  );
}

/** Вибір виду закриття: дві картки-радіо (цілі дні чи скорочений день), не менші за 44 px (ADR 0008). */
function KindChoice({ id, kind, onKind }: { id: string; kind: Kind; onKind: (kind: Kind) => void }) {
  return (
    <div className="flex flex-col gap-1.5">
      <span id={id} className="text-[13px] font-medium">
        Closed
      </span>
      <input type="hidden" name="kind" value={kind} />
      <RadioGroup
        aria-labelledby={id}
        value={kind}
        onValueChange={(value) => onKind(value as Kind)}
        className="grid-cols-[repeat(auto-fit,minmax(220px,1fr))] gap-3"
      >
        {KINDS.map((k) => (
          <Label
            key={k.kind}
            htmlFor={`${id}-${k.kind}`}
            className={cn(
              "min-h-11 items-center gap-3.5 rounded-md border border-border bg-card p-3.5 font-normal transition-colors duration-(--duration-fast) hover:border-ring has-focus-visible:ring-2 has-focus-visible:ring-ring has-focus-visible:ring-offset-2 has-focus-visible:ring-offset-background",
              kind === k.kind && "border-ring bg-accent",
            )}
          >
            <RadioGroupItem id={`${id}-${k.kind}`} value={k.kind} className="sr-only absolute" />
            <span
              aria-hidden="true"
              className={cn(
                "grid size-9 shrink-0 place-items-center rounded-md bg-muted text-foreground [&_svg]:size-4.5",
                kind === k.kind && "bg-primary text-primary-foreground",
              )}
            >
              {k.icon}
            </span>
            <span className="flex flex-col gap-0.5">
              <span className="text-sm font-semibold">{k.label}</span>
              <span className="text-[13px] text-muted-foreground">{k.hint}</span>
            </span>
          </Label>
        ))}
      </RadioGroup>
    </div>
  );
}

const DATES: Record<Kind, { label: string; hint: string; placeholder: string; mode: "range" | "single" }> = {
  days: {
    label: "Dates",
    hint: "One day, or the first and then the last day of the closure.",
    placeholder: "Choose dates",
    mode: "range",
  },
  early: { label: "Date", hint: "The day of the early dismissal.", placeholder: "Choose a date", mode: "single" },
};

/**
 * Дати закриття: DatePicker і сховані поля, які читає parseClosureForm (цілі дні — start і end, скорочений день — date).
 * Кінець раніше за початок — текст AC-CAL-10 одразу, але не alert: alert лишається помилці бази над кнопкою.
 */
function ClosureDates({
  id,
  kind,
  value,
  onChange,
  pick,
  missing,
  closures,
  today,
}: {
  id: string;
  kind: Kind;
  value: string[];
  onChange: (value: string[]) => void;
  pick: ClosurePick | null;
  missing: boolean;
  closures: Closure[];
  today: string;
}) {
  const field = DATES[kind];
  const reversed = Boolean(pick?.reversed);
  return (
    <div className="flex flex-col gap-1.5">
      <span id={id} className="text-[13px] font-medium">
        {field.label}
      </span>
      <p id={`${id}-hint`} className="text-xs text-muted-foreground">
        {field.hint}
      </p>
      {Object.entries(closureFields(kind, pick)).map(([name, value]) => (
        <input key={name} type="hidden" name={name} value={value} />
      ))}
      {/* key: свій календар для кожного виду — свій вибір і місяць. Календар — у спливній панелі під полем. */}
      <DatePickerField
        key={kind}
        mode={field.mode}
        value={value}
        onChange={onChange}
        today={today}
        note={(date) => closureNote(closures, date)}
        placeholder={field.placeholder}
        labelledBy={id}
        describedBy={joinIds(`${id}-hint`, (missing || reversed) && `${id}-error`)}
        invalid={missing || reversed}
      />
      <DatesMessage id={`${id}-error`} reversed={reversed} missing={missing} />
    </div>
  );
}

/** Під календарем: кінець раніше за початок (текст AC-CAL-10, не alert) або «немає дати» після спроби надіслати. */
function DatesMessage({ id, reversed, missing }: { id: string; reversed: boolean; missing: boolean }) {
  if (!reversed) return <FieldError id={id} message={missing ? CALENDAR_MESSAGES.datesRequired : null} />;
  return (
    <p id={id} className="flex items-start gap-1.5 text-xs text-destructive">
      <CircleAlert className="mt-px size-3.5 shrink-0" aria-hidden="true" />
      {CALENDAR_MESSAGES.endBeforeStart}
    </p>
  );
}

/**
 * Перегляд «Your closure» поруч із формою (вигляд за розробником): міні-календар вибраних дат, що оновлюється під час
 * введення, і наявні закриття того самого навчального року — щоб перетин було видно до натискання «Add closure».
 * Правила тут не перевіряються: перетин (AC-CAL-11) і порядок дат (AC-CAL-10) відхиляє база.
 */
function ClosurePreview({
  name,
  selection,
  closesAt,
  closures,
  today,
}: {
  name: string;
  selection: DateSelection | null;
  closesAt: number | null;
  closures: Closure[] | null;
  today: string;
}) {
  const known = closures ?? [];
  const { months, more } = previewMonths(selection, today);
  const year = schoolYearOf(selection?.start ?? today);
  const inYear = closuresInSchoolYear(known, year);
  const overlaps = overlappingClosures(known, selection);
  const dates = selection ? formatClosureDates({ startDate: selection.start, endDate: selection.end }) : null;

  return (
    <Card
      role="complementary"
      aria-label="Your closure"
      className="max-w-full flex-[1_1_300px] gap-3.5 px-5 py-4.5 lg:sticky lg:top-8"
    >
      <h2 className="text-base font-semibold">Your closure</h2>
      <dl className="flex flex-col gap-1.5">
        <div className="flex justify-between gap-3">
          <dt className="text-muted-foreground">Name</dt>
          <dd className="min-w-0 truncate text-right font-medium">
            {name || <span className="font-normal text-muted-foreground">Not named yet</span>}
          </dd>
        </div>
        <div className="flex justify-between gap-3">
          <dt className="text-muted-foreground">Dates</dt>
          <dd className="text-right tabular-nums">{dates ?? <span className="text-muted-foreground">Not chosen yet</span>}</dd>
        </div>
        <div className="flex justify-between gap-3">
          <dt className="text-muted-foreground">Closed</dt>
          <dd className="text-right tabular-nums">
            {closesAt != null ? `Early dismissal from ${formatTime(closesAt)}` : "Whole days"}
          </dd>
        </div>
      </dl>

      <div className="flex flex-col gap-4 border-t border-border pt-3.5" data-testid="closure-preview">
        {months.map((m) => (
          <CalendarMonth key={m} month={buildMonth(m, known, today, selection)} size="md" />
        ))}
        {more > 0 && (
          <p className="text-xs text-muted-foreground">
            And {more} more {more === 1 ? "month" : "months"}
          </p>
        )}
        <SchoolCalendarLegend items={["selected", "overlap", "closed", "early", "today"]} />
      </div>

      {/* Підказка, не помилка: role="status", щоб єдиним alert лишалась помилка бази над кнопкою (AC-CAL-11).
          Контейнер змонтовано завжди — тоді зчитувач оголошує текст, що в ньому з'являється. */}
      {/* empty:-mt-3.5 — порожній контейнер не додає проміжку картки; role="none" знімає з Alert його role="alert". */}
      <div role="status" className="empty:-mt-3.5">
        {overlaps.length > 0 && (
          <Alert variant="warning" role="none">
            <TriangleAlert />
            <AlertDescription>
              These dates are already closed: {overlaps.map((c) => `${c.name} (${formatClosureDates(c)})`).join(", ")}
            </AlertDescription>
          </Alert>
        )}
      </div>

      <section aria-labelledby="closures-in-year" className="flex flex-col gap-2 border-t border-border pt-3.5">
        <h3 id="closures-in-year" className="text-sm font-semibold">
          School year {formatSchoolYear(year)}
        </h3>
        {closures === null ? (
          <p className="max-w-[60ch] text-xs text-muted-foreground">
            Existing closures could not be loaded, so they are not shown. Overlaps are still checked when you add.
          </p>
        ) : inYear.length === 0 ? (
          <p className="text-muted-foreground">{emptyCalendarMessage(year)}</p>
        ) : (
          <ul className="flex flex-col">
            {inYear.map((c) => {
              const time = formatClosureTime(c);
              return (
                <li key={c.id} className="flex items-start gap-2.5 border-b border-border py-2 last:border-b-0">
                  <ClosureSwatch early={time != null} className="mt-0.5" />
                  <div className="flex min-w-0 flex-1 flex-col">
                    <span className="truncate font-medium">{c.name}</span>
                    <span className="text-xs text-muted-foreground tabular-nums">
                      {formatClosureDates(c)}
                      {time && ` · ${time}`}
                    </span>
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </section>
    </Card>
  );
}

