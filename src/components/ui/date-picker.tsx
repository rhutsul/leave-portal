"use client";

import { useEffect, useId, useRef, useState, type KeyboardEvent } from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { CLOSED_HATCH } from "@/components/ui/calendar-day";
import {
  dayLabel,
  dayMark,
  focusStart,
  isSelected,
  joinIds,
  moveFocus,
  pickDate,
  pickSummary,
  type DayMark,
  type DayNote,
  type PickMode,
  type PickValue,
} from "@/lib/date-picker";
import { addMonths, formatMonth, monthGrid, WEEKDAY_SHORT } from "@/lib/leave/time";
import { cn } from "@/lib/utils";

export type { DayNote } from "@/lib/date-picker";

const WEEKDAY_LONG = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"] as const;

const PICKED = "bg-primary text-primary-foreground hover:bg-primary/90";
const MARK: Record<Exclude<DayMark, null>, string> = {
  single: PICKED,
  start: PICKED,
  end: PICKED,
  inside: "bg-accent text-accent-foreground",
  preview: "border-dashed border-ring bg-accent/60 text-accent-foreground",
};

const HATCH: Record<DayNote["hatch"], string> = {
  full: CLOSED_HATCH,
  half: `${CLOSED_HATCH} bg-no-repeat bg-bottom bg-[length:100%_50%]`,
};

const FREE = "border-border text-foreground hover:bg-accent hover:text-accent-foreground";

/** Клас дня: позначка вибору перекриває штриховку позначки; сьогодні без вибору — підкреслене число. */
export function dayClass(mark: DayMark, note: DayNote | null, isToday: boolean): string {
  const look = mark ? MARK[mark] : cn(FREE, note && HATCH[note.hatch]);
  return cn(look, isToday && !isSelected(mark) && "underline underline-offset-4");
}

/** Тижні місяця з понеділка: null — порожні клітинки до 1-го числа й після останнього. */
export function weeks(month: string): (string | null)[][] {
  const cells: (string | null)[] = monthGrid(month);
  while (cells.length % 7) cells.push(null);
  return Array.from({ length: cells.length / 7 }, (_, r) => cells.slice(r * 7, r * 7 + 7));
}

/**
 * Вибір дат кліками (DESIGN.md, розділ 5): місяць із понеділка, у якому клік вибирає одну дату (`single`), діапазон
 * (`range`: перший клік — початок, другий — кінець, між ними — попередній перегляд за курсором чи фокусом) або кілька
 * окремих дат (`multiple`). Сітка — `role="grid"` з одним днем у Tab (стрілки, Home / End, PageUp / PageDown — шаблон
 * WAI-ARIA «Date picker»), Enter чи пробіл вибирає, Esc скасовує незавершений діапазон. Підсумок вибору — жива
 * область під сіткою. Від 360 px: клітинка 44 px заввишки і ≥ 40 px завширшки (ADR 0008). Значення — у `value`
 * (контрольоване); поля форми (`<input type="hidden">`) додає сторінка, бо їхні імена й правила — її.
 */
export function DatePicker({
  mode,
  value,
  onChange,
  today = null,
  defaultMonth,
  note,
  labelledBy,
  describedBy,
  className,
}: {
  mode: PickMode;
  value: PickValue;
  onChange: (value: string[]) => void;
  /** Сьогодні "YYYY-MM-DD" — підкреслене число; і перший місяць, якщо нічого не вибрано й немає defaultMonth. */
  today?: string | null;
  /** Перший показаний місяць "YYYY-MM", якщо нічого не вибрано. */
  defaultMonth?: string;
  /** Позначка дня, що не забороняє вибір (правила перевіряє форма). */
  note?: (date: string) => DayNote | null;
  /** id підпису поля (Label чи заголовок) — назва сітки для зчитувача разом із місяцем. */
  labelledBy?: string;
  /** id тексту помилки чи підказки поля. */
  describedBy?: string;
  className?: string;
}) {
  const ids = useId();
  const { month, focus, hover, grid, setFocus, setHover, showMonth, pick, onKeyDown } = usePicker(
    mode,
    value,
    onChange,
    today,
    defaultMonth,
  );
  const monthId = `${ids}-month`;
  const summaryId = `${ids}-summary`;

  return (
    <div className={cn("flex flex-col gap-2.5", className)} data-testid="date-picker">
      <MonthHeader id={monthId} month={month} onMonth={showMonth} />
      <div
        ref={grid}
        role="grid"
        aria-labelledby={joinIds(labelledBy, monthId)}
        aria-describedby={joinIds(summaryId, describedBy)}
        aria-multiselectable={mode !== "single" || undefined}
        onKeyDown={onKeyDown}
        onPointerLeave={() => setHover(null)}
        className="flex flex-col gap-0.5 md:gap-1"
      >
        <div role="row" className="grid grid-cols-7 gap-0.5 md:gap-1">
          {WEEKDAY_SHORT.map((w, i) => (
            <div key={w} role="columnheader" aria-label={WEEKDAY_LONG[i]} className="py-1 text-center text-xs text-muted-foreground">
              {w}
            </div>
          ))}
        </div>
        {weeks(month).map((row, r) => (
          <div key={r} role="row" className="grid grid-cols-7 gap-0.5 md:gap-1">
            {row.map((date, c) =>
              date ? (
                <DayCell
                  key={date}
                  date={date}
                  mark={dayMark(mode, value, date, hover)}
                  note={note?.(date) ?? null}
                  today={today}
                  focused={date === focus}
                  onPick={pick}
                  onHover={setHover}
                  onFocusDay={setFocus}
                />
              ) : (
                <div key={`blank-${c}`} role="gridcell" />
              ),
            )}
          </div>
        ))}
      </div>
      <p id={summaryId} role="status" className="text-xs text-muted-foreground tabular-nums">
        {pickSummary(mode, value)}
      </p>
    </div>
  );
}

/** Назва місяця між «Previous month» і «Next month» (так само, як у календарі «New request»). */
function MonthHeader({ id, month, onMonth }: { id: string; month: string; onMonth: (month: string) => void }) {
  return (
    <div className="flex items-center justify-between">
      <Button
        variant="ghost"
        size="icon-sm"
        className="pointer-coarse:size-11"
        aria-label="Previous month"
        onClick={() => onMonth(addMonths(month, -1))}
      >
        <ChevronLeft />
      </Button>
      <div id={id} className="font-semibold" aria-live="polite">
        {formatMonth(month)}
      </div>
      <Button
        variant="ghost"
        size="icon-sm"
        className="pointer-coarse:size-11"
        aria-label="Next month"
        onClick={() => onMonth(addMonths(month, 1))}
      >
        <ChevronRight />
      </Button>
    </div>
  );
}

/** День сітки: кнопка в `gridcell` з `aria-selected`. */
function DayCell({
  date,
  mark,
  note,
  today,
  focused,
  onPick,
  onHover,
  onFocusDay,
}: {
  date: string;
  mark: DayMark;
  note: DayNote | null;
  today: string | null;
  focused: boolean;
  onPick: (date: string) => void;
  onHover: (date: string) => void;
  onFocusDay: (date: string) => void;
}) {
  return (
    <div role="gridcell" aria-selected={isSelected(mark)}>
      <button
        type="button"
        data-date={date}
        tabIndex={focused ? 0 : -1}
        aria-label={dayLabel(date, note, today)}
        title={note?.label}
        onClick={() => onPick(date)}
        onPointerEnter={() => onHover(date)}
        onFocus={() => onFocusDay(date)}
        className={cn(
          "h-9 w-full rounded-md border border-transparent text-[13px] font-medium tabular-nums transition-colors duration-(--duration-fast) ease-out max-md:h-11 pointer-coarse:h-11",
          dayClass(mark, note, date === today),
        )}
      >
        {Number(date.slice(8))}
      </button>
    </div>
  );
}

/** Стан сітки: показаний місяць, день у Tab, день під курсором і вибір до нового діапазону (його повертає Esc). */
function usePicker(
  mode: PickMode,
  value: PickValue,
  onChange: (value: string[]) => void,
  today: string | null,
  defaultMonth: string | undefined,
) {
  const [month, setMonth] = useState(() => (value[0] ?? defaultMonth ?? today ?? "2026-01").slice(0, 7));
  const [focus, setFocus] = useState(() => focusStart(month, value, today));
  const [hover, setHover] = useState<string | null>(null);
  const before = useRef<string[] | null>(null);
  const grid = useRef<HTMLDivElement>(null);
  const moved = useRef(false);

  // Фокус у сітці переходить за клавішами (у тому числі в інший місяць) — лише після руху з клавіатури.
  useEffect(() => {
    if (!moved.current) return;
    moved.current = false;
    grid.current?.querySelector<HTMLElement>(`[data-date="${focus}"]`)?.focus();
  }, [focus, month]);

  const showMonth = (next: string) => {
    setMonth(next);
    setFocus(focusStart(next, value, today));
  };

  const pick = (date: string) => {
    const next = pickDate(mode, value, date);
    before.current = mode === "range" && next.length === 1 ? [...value] : null;
    setFocus(date);
    onChange(next);
  };

  /** Esc посеред діапазону: назад до вибору, що був до першого кліку. Інакше Esc лишається діалогу чи панелі. */
  const cancel = (event: KeyboardEvent) => {
    if (mode !== "range" || value.length !== 1) return;
    event.preventDefault();
    event.stopPropagation();
    onChange(before.current ?? []);
    before.current = null;
    setHover(null);
  };

  const move = (event: KeyboardEvent, next: string) => {
    event.preventDefault();
    moved.current = true;
    setFocus(next);
    setHover(next);
    setMonth(next.slice(0, 7));
  };

  const onKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    if (event.key === "Escape") return cancel(event);
    // Alt+← / Alt+→ (історія браузера), Ctrl+Home та інші комбінації лишаються браузеру.
    if (event.altKey || event.ctrlKey || event.metaKey) return;
    const next = moveFocus(focus, event.key);
    if (next) move(event, next);
  };

  return { month, focus, hover, grid, setFocus, setHover, showMonth, pick, onKeyDown };
}
