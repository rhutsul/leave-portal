"use client";

import Link from "next/link";
import { useActionState, useId, useState } from "react";
import { CalendarRange, CircleAlert, Clock, TriangleAlert } from "lucide-react";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { buttonVariants } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { CalendarMonth, ClosureSwatch, SchoolCalendarLegend } from "@/components/ui/school-calendar";
import { SubmitButton } from "@/components/ui/submit-button";
import { formatSchoolYear, schoolYearOf } from "@/lib/leave/balance";
import {
  closuresInSchoolYear,
  emptyCalendarMessage,
  formatClosureDates,
  formatClosureTime,
  type Closure,
} from "@/lib/leave/calendar";
import { buildMonth, overlappingClosures, previewMonths, type DateSelection } from "@/lib/leave/calendar-grid";
import { formatTime, isCalendarDate, parseTime } from "@/lib/leave/time";
import { cn } from "@/lib/utils";
import { addClosure, type ClosureActionState } from "../actions";

const INITIAL: ClosureActionState = { message: "", done: false };

type Kind = "days" | "early";

const KINDS: { kind: Kind; label: string; hint: string; icon: React.ReactNode }[] = [
  { kind: "days", label: "Whole days", hint: "From a start date to an end date, both included", icon: <CalendarRange /> },
  { kind: "early", label: "Early dismissal", hint: "One date, closed from a time to the end of the day", icon: <Clock /> },
];

/**
 * Форма «Add closure» (AC-CAL-01, -07, -10, -11): назва до 100 знаків і або цілі дні, або скорочений день із кроком
 * 5 хвилин. Помилку з бази показуємо дослівно над кнопкою; введене лишається (контрольовані поля).
 */
export function ClosureForm({ closures, today }: { closures: Closure[] | null; today: string }) {
  const ids = useId();
  const [state, action] = useActionState(addClosure, INITIAL);
  const [kind, setKind] = useState<Kind>("days");
  const [fields, setFields] = useState({ name: "", start: "", end: "", date: "", time: "" });
  const set = (key: keyof typeof fields) => (e: React.ChangeEvent<HTMLInputElement>) =>
    setFields((f) => ({ ...f, [key]: e.target.value }));
  const error = state.message;
  const selection = selectionOf(kind, fields);

  return (
    // Як «New request»: форма ліворуч, перегляд праворуч; вужче — перегляд під формою (ADR 0008).
    <div className="flex flex-wrap items-start gap-6">
      <Card className="min-w-0 flex-[999_1_560px]">
        <CardHeader>
          <CardTitle>New closure</CardTitle>
        </CardHeader>
        <CardContent>
          <form action={action} className="flex flex-col gap-5">
            <div className="flex flex-col gap-1.5">
              <Label htmlFor={`${ids}-name`}>Name</Label>
              <Input
                id={`${ids}-name`}
                name="name"
                required
                maxLength={100}
                placeholder="Winter break"
                value={fields.name}
                onChange={set("name")}
              />
            </div>

            <div className="flex flex-col gap-1.5">
              <span id={`${ids}-kind`} className="text-[13px] font-medium">
                Closed
              </span>
              <input type="hidden" name="kind" value={kind} />
              <RadioGroup
                aria-labelledby={`${ids}-kind`}
                value={kind}
                onValueChange={(value) => setKind(value as Kind)}
                className="grid-cols-[repeat(auto-fit,minmax(220px,1fr))] gap-3"
              >
                {KINDS.map((k) => (
                  <Label
                    key={k.kind}
                    htmlFor={`${ids}-kind-${k.kind}`}
                    className={cn(
                      "min-h-11 items-center gap-3.5 rounded-md border border-border bg-card p-3.5 font-normal transition-colors duration-(--duration-fast) hover:border-ring has-focus-visible:ring-2 has-focus-visible:ring-ring has-focus-visible:ring-offset-2 has-focus-visible:ring-offset-background",
                      kind === k.kind && "border-ring bg-accent",
                    )}
                  >
                    <RadioGroupItem id={`${ids}-kind-${k.kind}`} value={k.kind} className="sr-only absolute" />
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

            {kind === "days" ? (
              <div className="grid gap-3 sm:grid-cols-2">
                <div className="flex flex-col gap-1.5">
                  <Label htmlFor={`${ids}-start`}>Start date</Label>
                  <Input id={`${ids}-start`} name="start" type="date" required value={fields.start} onChange={set("start")} />
                </div>
                <div className="flex flex-col gap-1.5">
                  <Label htmlFor={`${ids}-end`}>End date</Label>
                  <Input id={`${ids}-end`} name="end" type="date" required value={fields.end} onChange={set("end")} />
                </div>
              </div>
            ) : (
              <div className="grid gap-3 sm:grid-cols-2">
                <div className="flex flex-col gap-1.5">
                  <Label htmlFor={`${ids}-date`}>Date</Label>
                  <Input id={`${ids}-date`} name="date" type="date" required value={fields.date} onChange={set("date")} />
                </div>
                <div className="flex flex-col gap-1.5">
                  <Label htmlFor={`${ids}-time`}>Closed from</Label>
                  <Input
                    id={`${ids}-time`}
                    name="time"
                    type="time"
                    step={300}
                    required
                    value={fields.time}
                    onChange={set("time")}
                  />
                </div>
              </div>
            )}

            {error && (
              <Alert variant="destructive" role="alert">
                <CircleAlert />
                <AlertDescription>{error}</AlertDescription>
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
        name={fields.name.trim()}
        selection={selection}
        closesAt={kind === "early" ? parseTime(fields.time) : null}
        closures={closures}
        today={today}
      />
    </div>
  );
}

/** Дати з полів форми для перегляду: цілі дні — start…end (end порожній — лише start), скорочений день — одна дата. */
function selectionOf(kind: Kind, f: { start: string; end: string; date: string }): DateSelection | null {
  const start = kind === "days" ? f.start : f.date;
  if (!isCalendarDate(start)) return null;
  const end = kind === "days" && isCalendarDate(f.end) && f.end >= start ? f.end : start;
  return { start, end };
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
          <CalendarMonth key={m} month={buildMonth(m, known, today, selection)} size="md" headingLevel={0} />
        ))}
        {more > 0 && (
          <p className="text-xs text-muted-foreground">
            And {more} more {more === 1 ? "month" : "months"}
          </p>
        )}
        <SchoolCalendarLegend items={["selected", "overlap", "closed", "early", "today"]} />
      </div>

      {overlaps.length > 0 && (
        // Підказка, не помилка: role="status", щоб єдиним alert лишалась помилка бази над кнопкою (AC-CAL-11).
        <Alert variant="warning" role="status">
          <TriangleAlert />
          <AlertDescription>
            These dates are already closed: {overlaps.map((c) => `${c.name} (${formatClosureDates(c)})`).join(", ")}
          </AlertDescription>
        </Alert>
      )}

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

