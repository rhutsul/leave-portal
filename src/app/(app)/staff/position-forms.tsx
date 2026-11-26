"use client";

import { useActionState, useId, useState, type FormEvent } from "react";
import { CircleAlert, Copy, Plus, X } from "lucide-react";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { DatePickerField } from "@/components/ui/date-picker";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { SubmitButton } from "@/components/ui/submit-button";
import { POSITION_MESSAGES, blocksFromWeek, copyMondayToWeekdays, DAY_NAMES, type PositionKind, type WeekDraft } from "@/lib/staff/position";
import { cn } from "@/lib/utils";
import type { Person } from "./load-staff-positions";
import { createPosition, setManagers, setSchedule, type PositionActionState } from "./position-actions";

const INITIAL: PositionActionState = { message: "" };
const TOUCH = "pointer-coarse:h-11";

function ActionError({ message }: { message: string }) {
  if (!message) return null;
  return (
    <Alert variant="destructive" role="alert">
      <CircleAlert />
      <AlertDescription>{message}</AlertDescription>
    </Alert>
  );
}

/**
 * Тижневий розклад (D13): рядок на день Mon…Sun, у дні — періоди «Start» / «End» (поле часу з кроком 5 хв, як у
 * «Add closure»), «Add period» і «Remove period»; «Copy Monday to Tue–Fri» — зручність. На телефоні день — блоком:
 * назва над періодами, поля на всю ширину.
 */
export function ScheduleEditor({ week, onChange }: { week: WeekDraft; onChange: (week: WeekDraft) => void }) {
  const ids = useId();
  const setDay = (day: number, periods: WeekDraft[number]) => onChange(week.map((p, i) => (i === day ? periods : p)));
  return (
    <fieldset className="flex flex-col gap-2" aria-labelledby={`${ids}-legend`}>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <span id={`${ids}-legend`} className="text-[13px] font-medium">
          Weekly schedule
        </span>
        <Button type="button" variant="link" size="sm" onClick={() => onChange(copyMondayToWeekdays(week))} className="h-auto px-0">
          <Copy />
          Copy Monday to Tue–Fri
        </Button>
      </div>
      <div className="flex flex-col divide-y divide-border rounded-lg border border-border">
        {week.map((periods, day) => (
          <div key={DAY_NAMES[day]} className="flex flex-col gap-2 p-3 sm:flex-row sm:items-start sm:gap-4" data-testid="schedule-day">
            <span className="w-10 shrink-0 pt-2 text-[13px] font-medium">{DAY_NAMES[day]}</span>
            <div className="flex min-w-0 flex-1 flex-col gap-2">
              {periods.length === 0 && <span className="pt-2 text-xs text-muted-foreground">No working hours</span>}
              {periods.map((period, i) => (
                <div key={i} className="flex items-end gap-2">
                  <div className="flex min-w-0 flex-1 flex-col gap-1">
                    <Label htmlFor={`${ids}-${day}-${i}-start`} className="text-xs text-muted-foreground">
                      Start
                    </Label>
                    <Input
                      id={`${ids}-${day}-${i}-start`}
                      type="time"
                      step={300}
                      value={period.start}
                      aria-label={`${DAY_NAMES[day]} period ${i + 1} start`}
                      onChange={(e) => setDay(day, periods.map((p, j) => (j === i ? { ...p, start: e.target.value } : p)))}
                      className={TOUCH}
                    />
                  </div>
                  <div className="flex min-w-0 flex-1 flex-col gap-1">
                    <Label htmlFor={`${ids}-${day}-${i}-end`} className="text-xs text-muted-foreground">
                      End
                    </Label>
                    <Input
                      id={`${ids}-${day}-${i}-end`}
                      type="time"
                      step={300}
                      value={period.end}
                      aria-label={`${DAY_NAMES[day]} period ${i + 1} end`}
                      onChange={(e) => setDay(day, periods.map((p, j) => (j === i ? { ...p, end: e.target.value } : p)))}
                      className={TOUCH}
                    />
                  </div>
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon-sm"
                    aria-label={`Remove ${DAY_NAMES[day]} period ${i + 1}`}
                    onClick={() => setDay(day, periods.filter((_, j) => j !== i))}
                    className="pointer-coarse:size-11"
                  >
                    <X />
                  </Button>
                </div>
              ))}
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={() => setDay(day, [...periods, { start: "08:30", end: "15:30" }])}
                className="self-start pointer-coarse:h-11"
              >
                <Plus />
                Add period
              </Button>
            </div>
          </div>
        ))}
      </div>
    </fieldset>
  );
}

/** Відповідальні менеджери: Checkbox-картки з ім'ям і email (DESIGN.md, розділ 5). */
export function ManagersField({
  candidates,
  selected,
  onChange,
}: {
  candidates: Person[];
  selected: string[];
  onChange: (ids: string[]) => void;
}) {
  const ids = useId();
  return (
    <fieldset className="flex flex-col gap-2" aria-labelledby={`${ids}-legend`}>
      <span id={`${ids}-legend`} className="text-[13px] font-medium">
        Responsible managers
      </span>
      <span className="text-xs text-muted-foreground">Without a manager, an administrator decides the records.</span>
      <div className="grid gap-2 sm:grid-cols-2">
        {candidates.map((m) => {
          const checked = selected.includes(m.id);
          return (
            <Label
              key={m.id}
              htmlFor={`${ids}-${m.id}`}
              className={cn(
                "min-h-11 items-start gap-3 rounded-md border border-border bg-card p-3 font-normal transition-colors duration-(--duration-fast) hover:border-ring",
                checked && "border-ring bg-accent",
              )}
            >
              <Checkbox
                id={`${ids}-${m.id}`}
                checked={checked}
                onCheckedChange={(on) => onChange(on ? [...selected, m.id] : selected.filter((id) => id !== m.id))}
                className="mt-0.5"
              />
              <span className="flex min-w-0 flex-col">
                <span className="font-medium">{m.name}</span>
                <span className="text-xs break-all text-muted-foreground">{m.email}</span>
              </span>
            </Label>
          );
        })}
      </div>
      {selected.map((id) => (
        <input key={id} type="hidden" name="manager_id" value={id} />
      ))}
    </fieldset>
  );
}

function AppliesFrom({ value, onChange, today }: { value: string | null; onChange: (v: string | null) => void; today: string }) {
  const ids = useId();
  return (
    <div className="flex flex-col gap-1.5">
      <Label id={`${ids}-label`}>Applies from</Label>
      <DatePickerField
        mode="single"
        value={value ? [value] : []}
        onChange={(dates) => onChange(dates[0] ?? null)}
        today={today}
        placeholder="Choose a date"
        labelledBy={`${ids}-label`}
        describedBy={`${ids}-hint`}
      />
      <p id={`${ids}-hint`} className="text-xs text-muted-foreground">
        The previous schedule applies before this date. Existing records keep their hours.
      </p>
      <input type="hidden" name="valid_from" value={value ?? ""} />
    </div>
  );
}

/** Перевірка розкладу до відправки — ті самі тексти, що в базі; помилку показує Alert над кнопкою. */
function useScheduleCheck(week: WeekDraft) {
  const [error, setError] = useState("");
  const check = blocksFromWeek(week);
  const blocks = check.ok ? JSON.stringify(check.blocks) : "[]";
  const guard = (event: FormEvent<HTMLFormElement>, from: string | null) => {
    if (!check.ok) setError(check.message);
    else if (!from) setError(POSITION_MESSAGES.noDate);
    else return setError("");
    event.preventDefault();
  };
  return { blocks, error, guard };
}

/**
 * Нова посада (AC-STAFF-04, -05, -06): тип, підрозділ, назва, розклад з дати й менеджери. Друга основна посада — тип
 * «Main» вимкнено з поясненням, а база однаково відмовляє текстом AC-STAFF-05.
 */
export function NewPositionForm({
  employeeId,
  divisions,
  candidates,
  hasMain,
  today,
}: {
  employeeId: string;
  divisions: { id: number; name: string }[];
  candidates: Person[];
  hasMain: boolean;
  today: string;
}) {
  const ids = useId();
  const [state, action] = useActionState(createPosition, INITIAL);
  const [kind, setKind] = useState<PositionKind>(hasMain ? "additional" : "main");
  const [division, setDivision] = useState<string | null>(null);
  const [from, setFrom] = useState<string | null>(null);
  const [week, setWeek] = useState<WeekDraft>(() => Array.from({ length: 7 }, (_, d) => (d < 5 ? [{ start: "08:30", end: "15:30" }] : [])));
  const [managers, setManagersValue] = useState<string[]>([]);
  const { blocks, error, guard } = useScheduleCheck(week);
  const items = divisions.map((d) => ({ value: String(d.id), label: d.name }));

  return (
    <form action={action} onSubmit={(e) => guard(e, from)} noValidate className="flex flex-col gap-5" data-testid="position-form">
      <input type="hidden" name="employee_id" value={employeeId} />
      <input type="hidden" name="kind" value={kind} />
      <input type="hidden" name="division_id" value={division ?? ""} />
      <input type="hidden" name="blocks" value={blocks} />
      <div className="flex flex-col gap-1.5">
        <span id={`${ids}-kind`} className="text-[13px] font-medium">
          Type
        </span>
        <RadioGroup aria-labelledby={`${ids}-kind`} value={kind} onValueChange={(v) => setKind(v as PositionKind)} className="grid-cols-2 gap-3">
          {(["main", "additional"] as const).map((k) => (
            <Label
              key={k}
              htmlFor={`${ids}-${k}`}
              className={cn(
                "min-h-11 items-center gap-3 rounded-md border border-border bg-card p-3 font-normal transition-colors duration-(--duration-fast) hover:border-ring has-focus-visible:ring-2 has-focus-visible:ring-ring",
                kind === k && "border-ring bg-accent",
                k === "main" && hasMain && "opacity-50",
              )}
            >
              <RadioGroupItem id={`${ids}-${k}`} value={k} disabled={k === "main" && hasMain} />
              {k === "main" ? "Main" : "Additional"}
            </Label>
          ))}
        </RadioGroup>
        {hasMain && <p className="text-xs text-muted-foreground">{POSITION_MESSAGES.oneMain}.</p>}
      </div>
      <div className="grid gap-4 sm:grid-cols-2">
        <div className="flex flex-col gap-1.5">
          <Label htmlFor={`${ids}-division`}>Division</Label>
          <Select value={division} items={items} onValueChange={(v) => setDivision(v ? String(v) : null)}>
            <SelectTrigger id={`${ids}-division`} className={`w-full ${TOUCH}`}>
              <SelectValue placeholder="Choose a division…" />
            </SelectTrigger>
            <SelectContent>
              {items.map((d) => (
                <SelectItem key={d.value} value={d.value}>
                  {d.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="flex flex-col gap-1.5">
          <Label htmlFor={`${ids}-title`}>Job title</Label>
          <Input id={`${ids}-title`} name="title" autoComplete="off" className={TOUCH} />
        </div>
      </div>
      <AppliesFrom value={from} onChange={setFrom} today={today} />
      <ScheduleEditor week={week} onChange={setWeek} />
      <ManagersField candidates={candidates} selected={managers} onChange={setManagersValue} />
      <ActionError message={error || state.message} />
      <div className="flex justify-end">
        <SubmitButton pendingLabel="Saving…" className="max-sm:w-full pointer-coarse:h-11">
          Save position
        </SubmitButton>
      </div>
    </form>
  );
}

/** Новий розклад посади з дати (AC-STAFF-07): редактор починає з розкладу, що діє сьогодні. */
export function ScheduleForm({
  employeeId,
  positionId,
  initial,
  today,
}: {
  employeeId: string;
  positionId: number;
  initial: WeekDraft;
  today: string;
}) {
  const [state, action] = useActionState(setSchedule, INITIAL);
  const [from, setFrom] = useState<string | null>(null);
  const [week, setWeek] = useState<WeekDraft>(initial);
  const { blocks, error, guard } = useScheduleCheck(week);
  return (
    <form action={action} onSubmit={(e) => guard(e, from)} noValidate className="flex flex-col gap-5" data-testid="schedule-form">
      <input type="hidden" name="employee_id" value={employeeId} />
      <input type="hidden" name="position_id" value={positionId} />
      <input type="hidden" name="blocks" value={blocks} />
      <AppliesFrom value={from} onChange={setFrom} today={today} />
      <ScheduleEditor week={week} onChange={setWeek} />
      <ActionError message={error || state.message} />
      <div className="flex justify-end">
        <SubmitButton pendingLabel="Saving…" className="max-sm:w-full pointer-coarse:h-11">
          Save schedule
        </SubmitButton>
      </div>
    </form>
  );
}

/** Відповідальні менеджери посади (AC-STAFF-04). */
export function ManagersForm({
  employeeId,
  positionId,
  candidates,
  initial,
}: {
  employeeId: string;
  positionId: number;
  candidates: Person[];
  initial: string[];
}) {
  const [state, action] = useActionState(setManagers, INITIAL);
  const [selected, setSelected] = useState<string[]>(initial);
  return (
    <form action={action} className="flex flex-col gap-5" data-testid="managers-form">
      <input type="hidden" name="employee_id" value={employeeId} />
      <input type="hidden" name="position_id" value={positionId} />
      <ManagersField candidates={candidates} selected={selected} onChange={setSelected} />
      <ActionError message={state.message} />
      <div className="flex justify-end">
        <SubmitButton pendingLabel="Saving…" className="max-sm:w-full pointer-coarse:h-11">
          Save managers
        </SubmitButton>
      </div>
    </form>
  );
}
