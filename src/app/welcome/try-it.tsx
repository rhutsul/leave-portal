"use client";

import { useEffect, useId, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { StatusBadge } from "@/components/ui/status-badge";
import { cn } from "@/lib/utils";
import {
  clock,
  DATES,
  DAY_END,
  DAY_START,
  duration,
  emptyReason,
  END_OPTIONS,
  INITIAL,
  PERSONAL_GRANTED,
  personalLeft,
  playgroundRecords,
  POSITIONS,
  START_OPTIONS,
  summary,
  toggleDay,
  togglePosition,
  withEnd,
  withStart,
  type Mode,
  type PlaygroundRecord,
  type PlaygroundState,
} from "@/lib/welcome/playground";

const KICKER = "font-mono text-[11px] tracking-wide text-muted-foreground uppercase";
// Менеджери «вирішують» по черзі: перший — за 0.9 с після подання, далі — кожні 0.65 с.
const FIRST_DECISION_MS = 900;
const NEXT_DECISION_MS = 650;

const pct = (minutes: number) => ((minutes - DAY_START) / (DAY_END - DAY_START)) * 100;
const reducedMotion = () => window.matchMedia("(prefers-reduced-motion: reduce)").matches;

/** Смуги робочого дня посад: пунктир — розклад, заливка — години запису. Декор: те саме є в списку записів. */
function Lanes({ state }: { state: PlaygroundState }) {
  return (
    <div aria-hidden="true" className="flex flex-col gap-1.5">
      {POSITIONS.map((position, index) => {
        const from = state.mode === "whole" ? position.from : Math.max(position.from, state.start);
        const to = state.mode === "whole" ? position.to : Math.min(position.to, state.end);
        const show = state.positions[index] && to > from;
        return (
          <div key={position.title} className="relative h-5.5 rounded-sm bg-muted/70">
            <span
              className="absolute inset-y-1 rounded-xs border border-dashed border-input"
              style={{ left: `${pct(position.from)}%`, width: `${pct(position.to) - pct(position.from)}%` }}
            />
            <span
              className="absolute inset-y-1 rounded-xs bg-primary transition-[left,width,opacity] duration-(--duration-base) ease-out"
              style={{
                left: `${pct(show ? from : position.from)}%`,
                width: `${show ? pct(to) - pct(from) : 0}%`,
                opacity: show ? 1 : 0,
              }}
            />
          </div>
        );
      })}
      <div className="flex justify-between font-mono text-[11px] text-muted-foreground">
        {[510, 630, 750, 870, 930].map((m) => (
          <span key={m}>{clock(m)}</span>
        ))}
      </div>
    </div>
  );
}

/** Вибір годин «From» і «To» з кроком 30 хв. */
function TimeSelect({
  id,
  label,
  value,
  options,
  disabled,
  onChange,
}: {
  id: string;
  label: string;
  value: number;
  options: readonly number[];
  disabled: boolean;
  onChange: (value: number) => void;
}) {
  const items = options.map((m) => ({ value: m, label: clock(m) }));
  return (
    <div className="flex flex-col gap-1.5">
      <Label htmlFor={id}>{label}</Label>
      <Select value={value} items={items} disabled={disabled} onValueChange={(v) => onChange(Number(v))}>
        <SelectTrigger id={id} className="w-full tabular-nums">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          {items.map((item) => (
            <SelectItem key={item.value} value={item.value}>
              {item.label}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  );
}

/** Ліва половина: дати, посади, час. */
function Choices({
  state,
  sent,
  onChange,
}: {
  state: PlaygroundState;
  sent: boolean;
  onChange: (next: PlaygroundState) => void;
}) {
  const ids = useId();
  return (
    <div className="flex flex-col gap-5.5 border-border p-5 @md:p-7 @3xl:border-r">
      <div className="flex flex-col gap-2.5">
        <span id={`${ids}-dates`} className={KICKER}>
          Dates · 9–13 Nov 2026
        </span>
        <div role="group" aria-labelledby={`${ids}-dates`} className="grid grid-cols-5 gap-2">
          {DATES.map((date) => (
            <Button
              key={date.day}
              variant="outline"
              aria-pressed={state.days.includes(date.day)}
              aria-label={`${date.short}, ${date.day} Nov 2026`}
              disabled={sent}
              onClick={() => onChange(toggleDay(state, date.day))}
              className="h-auto flex-col gap-0.5 bg-transparent py-2.5 aria-pressed:border-primary aria-pressed:bg-primary/15"
            >
              <span className="text-[11px] font-normal text-muted-foreground">{date.short}</span>
              <span className="text-xl leading-6 font-semibold tabular-nums">{date.day}</span>
            </Button>
          ))}
        </div>
      </div>

      <div className="flex flex-col gap-2.5">
        <span className={KICKER}>Positions</span>
        {POSITIONS.map((position, index) => (
          <Label
            key={position.title}
            htmlFor={`${ids}-pos-${index}`}
            className={cn(
              "cursor-pointer items-center gap-3 rounded-md border border-border p-3 font-normal transition-colors duration-(--duration-fast) hover:border-ring",
              state.positions[index] && "border-primary",
            )}
          >
            <Checkbox
              id={`${ids}-pos-${index}`}
              checked={state.positions[index]}
              disabled={sent}
              onCheckedChange={() => onChange(togglePosition(state, index))}
            />
            <span className="flex min-w-0 flex-col">
              <span className="truncate text-sm font-medium">{position.title}</span>
              <span className="text-xs text-muted-foreground tabular-nums">{position.schedule}</span>
            </span>
          </Label>
        ))}
      </div>

      <div className="flex flex-col gap-3">
        <div className="flex items-center justify-between gap-3">
          <span id={`${ids}-time`} className={KICKER}>
            Time
          </span>
          <RadioGroup
            aria-labelledby={`${ids}-time`}
            value={state.mode}
            disabled={sent}
            onValueChange={(value) => onChange({ ...state, mode: value as Mode })}
            className="flex w-auto gap-0.5 rounded-md border border-border p-0.5"
          >
            {(["whole", "hours"] as const).map((mode) => (
              <Label
                key={mode}
                htmlFor={`${ids}-mode-${mode}`}
                className={cn(
                  "cursor-pointer rounded-sm px-3 py-1 text-[13px] font-medium text-muted-foreground transition-colors duration-(--duration-fast) has-focus-visible:ring-2 has-focus-visible:ring-ring",
                  state.mode === mode && "bg-accent text-accent-foreground",
                )}
              >
                <RadioGroupItem id={`${ids}-mode-${mode}`} value={mode} className="sr-only" />
                {mode === "whole" ? "Whole day" : "Hours"}
              </Label>
            ))}
          </RadioGroup>
        </div>
        <Lanes state={state} />
        {state.mode === "hours" && (
          <div className="grid animate-rise grid-cols-2 gap-3.5">
            <TimeSelect
              id={`${ids}-from`}
              label="From"
              value={state.start}
              options={START_OPTIONS}
              disabled={sent}
              onChange={(v) => onChange(withStart(state, v))}
            />
            <TimeSelect
              id={`${ids}-to`}
              label="To"
              value={state.end}
              options={END_OPTIONS}
              disabled={sent}
              onChange={(v) => onChange(withEnd(state, v))}
            />
          </div>
        )}
      </div>
    </div>
  );
}

/** Рядок запису: дата, посада, години; статус і хто вирішив. */
function RecordRow({ record, index, sent, decided }: { record: PlaygroundRecord; index: number; sent: boolean; decided: boolean }) {
  return (
    <li
      className={cn(
        "flex items-center gap-3.5 border-b border-border px-0.5 py-3 transition-colors duration-(--duration-base)",
        sent && "animate-rise",
        decided && "bg-status-approved-foreground/7",
      )}
      style={sent ? { animationDelay: `${index * 60}ms` } : undefined}
    >
      <span className="w-23 flex-none text-sm font-medium tabular-nums">{record.date}</span>
      <span className="flex min-w-0 flex-1 flex-col">
        <span className="truncate text-sm">{record.position}</span>
        <span className="text-xs text-muted-foreground tabular-nums">
          {clock(record.from)}–{clock(record.to)} · {duration(record.minutes)}
        </span>
      </span>
      <span className="flex flex-none flex-col items-end gap-0.5">
        {sent ? (
          <StatusBadge status={decided ? "approved" : "awaiting"} />
        ) : (
          <span className="text-xs text-muted-foreground">Not submitted</span>
        )}
        <span className="text-[11px] text-muted-foreground">{decided ? record.manager : ""}</span>
      </span>
    </li>
  );
}

/**
 * «Try it» на landing (ADR 0007): пісочниця заявки на синтетичних даних, без бази й без входу. Дні й посади → записи,
 * по одному на посаду й дату; після «Submit request» кожен менеджер «вирішує» свій запис, а залишок відраховує.
 */
export function TryIt() {
  const [state, setState] = useState<PlaygroundState>(INITIAL);
  const [sent, setSent] = useState<PlaygroundRecord[] | null>(null);
  const [decided, setDecided] = useState(0);
  const timers = useRef<number[]>([]);
  useEffect(() => () => timers.current.forEach(clearTimeout), []);

  const records = sent ?? playgroundRecords(state);
  const left = personalLeft(records, sent ? decided : 0);

  function submit() {
    if (!records.length) return;
    setSent(records);
    setDecided(0);
    const quick = reducedMotion();
    timers.current = records.map((_, i) =>
      window.setTimeout(() => setDecided(i + 1), quick ? 0 : FIRST_DECISION_MS + i * NEXT_DECISION_MS),
    );
  }

  function restart() {
    timers.current.forEach(clearTimeout);
    setSent(null);
    setDecided(0);
  }

  return (
    <Card className="@container gap-0 overflow-hidden bg-card/85 p-0 backdrop-blur-md">
      <div className="grid @3xl:grid-cols-[minmax(0,5fr)_minmax(0,6fr)]">
        <Choices state={state} sent={sent !== null} onChange={setState} />
        <div className="flex min-w-0 flex-col gap-4 border-t border-border p-5 @md:p-7 @3xl:border-t-0">
          <div className="flex items-baseline justify-between gap-3">
            <h3 className="text-base font-semibold">Your request</h3>
            <span className="text-[13px] text-muted-foreground tabular-nums" aria-live="polite">
              {summary(records)}
            </span>
          </div>
          <div className="min-h-36 border-t border-border @3xl:min-h-65">
            {records.length ? (
              <ul aria-label="Records of your request" aria-live="polite">
                {records.map((record, i) => (
                  <RecordRow key={record.key} record={record} index={i} sent={sent !== null} decided={sent !== null && i < decided} />
                ))}
              </ul>
            ) : (
              <p className="py-10 text-center text-sm text-muted-foreground">{emptyReason(state)}</p>
            )}
          </div>
          <div className="mt-auto flex items-end justify-between gap-4 border-t border-border pt-4">
            <div className="flex max-w-50 min-w-0 flex-1 flex-col gap-1.5">
              <span className="text-[13px] text-muted-foreground">Personal leave left</span>
              <span className="text-3xl leading-9 font-semibold tracking-tight tabular-nums" aria-live="polite">
                {left.toFixed(2)}
                <span className="ml-1.5 text-sm font-medium tracking-normal text-muted-foreground">days</span>
              </span>
              <span aria-hidden="true" className="h-1 overflow-hidden rounded-full bg-muted">
                <span
                  className="block h-full rounded-full bg-primary transition-[width] duration-(--duration-slow) ease-out"
                  style={{ width: `${((left / PERSONAL_GRANTED) * 100).toFixed(1)}%` }}
                />
              </span>
            </div>
            {sent ? (
              <Button variant="outline" size="lg" onClick={restart}>
                Start over
              </Button>
            ) : (
              <Button size="lg" disabled={!records.length} onClick={submit}>
                Submit request
              </Button>
            )}
          </div>
        </div>
      </div>
    </Card>
  );
}
