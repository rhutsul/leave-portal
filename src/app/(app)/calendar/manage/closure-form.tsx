"use client";

import Link from "next/link";
import { useActionState, useId, useState } from "react";
import { CalendarRange, CircleAlert, Clock, TriangleAlert } from "lucide-react";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { buttonVariants } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { DatePicker } from "@/components/ui/date-picker";
import { FieldError } from "@/components/ui/field-error";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { CalendarMonth, ClosureSwatch, SchoolCalendarLegend } from "@/components/ui/school-calendar";
import { SubmitButton } from "@/components/ui/submit-button";
import { formatSchoolYear, schoolYearOf } from "@/lib/leave/balance";
import {
  CALENDAR_MESSAGES,
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

type Kind = "days" | "early";

const KINDS: { kind: Kind; label: string; hint: string; icon: React.ReactNode }[] = [
  { kind: "days", label: "Whole days", hint: "One date, or from a start date to an end date, both included", icon: <CalendarRange /> },
  { kind: "early", label: "Early dismissal", hint: "One date, closed from a time to the end of the day", icon: <Clock /> },
];

/**
 * Форма «Add closure» (AC-CAL-01, -07, -10, -11): назва до 100 знаків і або цілі дні, або скорочений день із кроком
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
  const [missing, setMissing] = useState(false);
  const pick = closurePick(dates[kind]);
  const early = kind === "early";

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
            onSubmit={(event) => {
              // Сховані поля дат браузер не перевіряє (required): без дати форму не надсилаємо.
              if (pick) return;
              event.preventDefault();
              setMissing(true);
            }}
            className="flex flex-col gap-5"
          >
            <div className="flex flex-col gap-1.5">
              <Label htmlFor={`${ids}-name`}>Name</Label>
              <Input
                id={`${ids}-name`}
                name="name"
                required
                maxLength={100}
                placeholder="Winter break"
                value={name}
                onChange={(e) => setName(e.target.value)}
              />
            </div>

            <KindChoice id={`${ids}-kind`} kind={kind} onKind={setKind} />

            <ClosureDates
              id={`${ids}-dates`}
              kind={kind}
              value={dates[kind]}
              onChange={(value) => {
                setDates((d) => ({ ...d, [kind]: value }));
                setMissing(false);
              }}
              pick={pick}
              missing={missing}
              closures={closures ?? []}
              today={today}
            />

            {early && (
              <div className="flex flex-col gap-1.5 sm:max-w-[calc(50%-0.375rem)]">
                <Label htmlFor={`${ids}-time`}>Closed from</Label>
                <Input
                  id={`${ids}-time`}
                  name="time"
                  type="time"
                  step={300}
                  required
                  value={time}
                  onChange={(e) => setTime(e.target.value)}
                />
              </div>
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

const DATES: Record<Kind, { label: string; hint: string; mode: "range" | "single" }> = {
  days: { label: "Dates", hint: "Click one day, or click the first and then the last day of the closure.", mode: "range" },
  early: { label: "Date", hint: "Click the day of the early dismissal.", mode: "single" },
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
      {/* key: свій календар для кожного виду — свій вибір і місяць. Телефон (ADR 0008): без бічних полів картки, як
          календар «New request», — клітинка ≥ 40 px завширшки на 360 px. */}
      <DatePicker
        key={kind}
        mode={field.mode}
        value={value}
        onChange={onChange}
        today={today}
        note={(date) => closureNote(closures, date)}
        labelledBy={id}
        describedBy={joinIds(`${id}-hint`, (missing || reversed) && `${id}-error`)}
        className="max-md:-mx-3 max-md:w-[calc(100%+1.5rem)] md:w-84"
      />
      <DatesMessage id={`${id}-error`} reversed={reversed} missing={missing} />
    </div>
  );
}

/** Під календарем: кінець раніше за початок (текст AC-CAL-10, не alert) або «немає дати» після спроби надіслати. */
function DatesMessage({ id, reversed, missing }: { id: string; reversed: boolean; missing: boolean }) {
  if (!reversed) return <FieldError id={id} message={missing ? "Choose a date in the calendar" : null} />;
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

