"use client";

import Link from "next/link";
import { useActionState, useId, useState, type ReactNode } from "react";
import { CircleAlert } from "lucide-react";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button, buttonVariants } from "@/components/ui/button";
import { DatePickerField } from "@/components/ui/date-picker";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { SubmitButton } from "@/components/ui/submit-button";
import { isHoursMessage } from "@/lib/leave/record-edit";
import { LEAVE_TYPES, RELATIONSHIP_LABELS, RELATIONSHIPS, type LeaveType } from "@/lib/leave/request";
import { NO_SUBSTITUTE } from "@/lib/leave/substitutes";
import { formatTime } from "@/lib/leave/time";
import { cn } from "@/lib/utils";
import { editRecord, type EditState } from "./actions";

const INITIAL: EditState = { message: "" };

export interface EditValues {
  date: string;
  wholeDay: boolean;
  start: number;
  end: number;
  leaveType: string;
  relationship: string | null;
  substituteId: string | null;
}

type Item = { value: string; label: string };

const TYPE_ITEMS: Item[] = (Object.keys(LEAVE_TYPES) as LeaveType[]).map((t) => ({ value: t, label: LEAVE_TYPES[t] }));
const RELATIONSHIP_ITEMS: Item[] = RELATIONSHIPS.map((r) => ({ value: r, label: RELATIONSHIP_LABELS[r] }));
const HOURS_MODES = [
  { whole: true, label: "Whole day" },
  { whole: false, label: "Specific hours" },
] as const;

/**
 * Вибір заміни: «No substitute» першим, далі список працівника. Нинішня заміна запису може бути вже поза списком —
 * лишаємо її у виборі, щоб правка інших полів не прибрала її мовчки.
 */
function substituteItems(list: Item[], current: string | null, currentLabel: string | undefined): Item[] {
  const items = [{ value: NO_SUBSTITUTE, label: "No substitute" }, ...list];
  if (current && !list.some((s) => s.value === current)) items.push({ value: current, label: currentLabel ?? "Current substitute" });
  return items;
}

/** Поле вибору з підписом (Select у порядку з вимоги). */
function ChoiceField({
  id,
  label,
  items,
  value,
  placeholder,
  onChange,
}: {
  id: string;
  label: string;
  items: Item[];
  value: string;
  placeholder?: string;
  onChange: (value: string) => void;
}) {
  return (
    <div className="flex flex-col gap-1.5">
      <Label htmlFor={id}>{label}</Label>
      <Select value={value || null} items={items} onValueChange={(next) => onChange(String(next ?? ""))}>
        <SelectTrigger id={id} className="w-full">
          <SelectValue placeholder={placeholder} />
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

/** Поле часу «From» чи «to» з межею destructive, коли відповідь стосується годин (AC-BEHALF-09). */
function TimeInput({ id, name, value, errorId, onChange }: { id: string; name: string; value: string; errorId: string | null; onChange: (value: string) => void }) {
  return (
    <Input
      id={id}
      name={name}
      type="time"
      step={300}
      value={value}
      onChange={(e) => onChange(e.target.value)}
      aria-invalid={errorId ? true : undefined}
      aria-describedby={errorId ?? undefined}
      className="w-30 max-md:w-auto max-md:min-w-0 max-md:flex-1 pointer-coarse:h-11"
    />
  );
}

/** Години: «Whole day» чи «Specific hours» з полями часу — ті самі компоненти, що в кроці годин нової заявки. */
function HoursField({ initial, error }: { initial: EditValues; error: string | null }) {
  const ids = useId();
  const [wholeDay, setWholeDay] = useState(initial.wholeDay);
  const [start, setStart] = useState(formatTime(initial.start));
  const [end, setEnd] = useState(formatTime(initial.end));
  const errorId = error ? `${ids}-error` : null;
  return (
    <div className="flex flex-col gap-1.5">
      <input type="hidden" name="whole_day" value={wholeDay ? "1" : "0"} />
      <Label id={`${ids}-label`}>Hours</Label>
      <div className="flex flex-wrap items-center gap-3">
        <div role="group" aria-labelledby={`${ids}-label`} className="inline-flex gap-1 rounded-md bg-muted p-1">
          {HOURS_MODES.map((mode) => (
            <Button
              key={mode.label}
              type="button"
              variant="ghost"
              size="sm"
              aria-pressed={wholeDay === mode.whole}
              onClick={() => setWholeDay(mode.whole)}
              className={cn("pointer-coarse:h-11", wholeDay === mode.whole && "bg-card text-foreground shadow-sm hover:bg-card")}
            >
              {mode.label}
            </Button>
          ))}
        </div>
        {!wholeDay && (
          <div className="flex items-center gap-2 max-md:w-full">
            <Label htmlFor={`${ids}-from`}>From</Label>
            <TimeInput id={`${ids}-from`} name="start" value={start} errorId={errorId} onChange={setStart} />
            <Label htmlFor={`${ids}-to`}>to</Label>
            <TimeInput id={`${ids}-to`} name="end" value={end} errorId={errorId} onChange={setEnd} />
          </div>
        )}
      </div>
      {errorId && (
        <p id={errorId} className="text-[13px] text-destructive">
          {error}
        </p>
      )}
    </div>
  );
}

/**
 * Правка запису до рішення в панелі «Decisions» (крок 4 D9, D10 і D11 impl-on-behalf; AC-BEHALF-06…10): дата, години,
 * тип (і стосунок для «Family celebration») та заміна — замість розділу «Record». Поля керовані, тож після відповіді
 * бази введене лишається; текст бази — дослівно в Alert над формою, текст про години ще й під полем годин. Смуга дій
 * унизу панелі: «Cancel» повертає до запису без змін, «Save changes» — одна основна дія (дії рішення сховані, поки
 * триває правка). Без Dialog: правку можна змінити наступною правкою.
 */
export function EditRecordForm({
  recordId,
  initial,
  substitutes,
  currentSubstitute,
  today,
  cancelHref,
  children,
}: {
  recordId: number;
  initial: EditValues;
  /** Список замін працівника (substitute_list): email і id. */
  substitutes: Item[];
  /** Email нинішньої заміни запису — якщо її вже немає в списку працівника. */
  currentSubstitute?: string;
  today: string;
  cancelHref: string;
  /** Розділи під формою: коментарі й історія запису. */
  children: ReactNode;
}) {
  const [state, action] = useActionState(editRecord, INITIAL);
  const ids = useId();
  const [date, setDate] = useState(initial.date);
  const [leaveType, setLeaveType] = useState(initial.leaveType);
  const [relationship, setRelationship] = useState(initial.relationship ?? "");
  const [substitute, setSubstitute] = useState(initial.substituteId ?? NO_SUBSTITUTE);
  const family = leaveType === "family";

  return (
    <form action={action} className="flex flex-1 flex-col gap-6.5">
      <input type="hidden" name="record_id" value={recordId} />
      <input type="hidden" name="date" value={date} />
      <input type="hidden" name="leave_type" value={leaveType} />
      <input type="hidden" name="relationship" value={family ? relationship : ""} />
      <input type="hidden" name="substitute_id" value={substitute} />

      {state.message && (
        <Alert variant="destructive" role="alert">
          <CircleAlert />
          <AlertDescription>{state.message}</AlertDescription>
        </Alert>
      )}

      <section aria-label="Edit record" className="flex flex-col gap-4">
        <h3 className="font-mono text-[11px] font-normal tracking-wide text-muted-foreground uppercase">Edit record</h3>
        <div className="flex flex-col gap-1.5">
          <Label id={`${ids}-date`}>Date</Label>
          <DatePickerField
            mode="single"
            value={[date]}
            onChange={(next) => next[0] && setDate(next[0])}
            today={today}
            placeholder="Choose a date"
            labelledBy={`${ids}-date`}
            className="sm:max-w-none"
          />
        </div>
        <HoursField initial={initial} error={isHoursMessage(state.message) ? state.message : null} />
        <ChoiceField id={`${ids}-type`} label="Leave type" items={TYPE_ITEMS} value={leaveType} onChange={setLeaveType} />
        {family && (
          <ChoiceField
            id={`${ids}-relationship`}
            label="Relationship"
            items={RELATIONSHIP_ITEMS}
            value={relationship}
            placeholder="Choose…"
            onChange={setRelationship}
          />
        )}
        <ChoiceField
          id={`${ids}-substitute`}
          label="Substitute"
          items={substituteItems(substitutes, initial.substituteId, currentSubstitute)}
          value={substitute}
          onChange={(value) => setSubstitute(value || NO_SUBSTITUTE)}
        />
      </section>

      {children}

      <div
        data-slot="decision-actions"
        className="sticky bottom-0 z-10 -mx-5 mt-auto flex items-center gap-1 border-t border-border bg-popover/95 px-5 py-3.5 backdrop-blur-md max-md:grid max-md:grid-cols-2 max-md:gap-2 max-md:pb-[calc(0.875rem+env(safe-area-inset-bottom))] max-md:*:h-11"
      >
        <Link href={cancelHref} replace scroll={false} className={cn(buttonVariants({ variant: "ghost" }), "-ml-3.5 max-md:ml-0")}>
          Cancel
        </Link>
        <SubmitButton pendingLabel="Saving…" className="ml-auto h-10 min-w-33 max-md:ml-0">
          Save changes
        </SubmitButton>
      </div>
    </form>
  );
}
