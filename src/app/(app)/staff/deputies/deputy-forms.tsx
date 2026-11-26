"use client";

import { useActionState, useId, useState } from "react";
import { CircleAlert, CircleCheck, Trash2 } from "lucide-react";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { DatePickerField } from "@/components/ui/date-picker";
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { RowMenu } from "@/components/ui/row-menu";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { SubmitButton } from "@/components/ui/submit-button";
import type { Person } from "../load-staff-positions";
import { assignDeputy, removeDeputy, type DeputyActionState } from "./actions";

const INITIAL: DeputyActionState = { message: "", done: false };
const TOUCH = "pointer-coarse:h-11";

function PersonSelect({
  label,
  people,
  value,
  onChange,
}: {
  label: string;
  people: Person[];
  value: string | null;
  onChange: (id: string | null) => void;
}) {
  const id = useId();
  const items = people.map((p) => ({ value: p.id, label: p.name, hint: p.email }));
  return (
    <div className="flex min-w-0 flex-col gap-1.5">
      <Label htmlFor={id}>{label}</Label>
      <Select value={value} items={items} onValueChange={(v) => onChange(v ? String(v) : null)}>
        <SelectTrigger id={id} className={`w-full ${TOUCH}`}>
          <SelectValue placeholder="Choose a person…" />
        </SelectTrigger>
        <SelectContent>
          {items.map((item) => (
            <SelectItem key={item.value} value={item.value}>
              {item.label}
              <span className="text-muted-foreground"> · {item.hint}</span>
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  );
}

/**
 * «Assign a deputy» (AC-STAFF-09; D9, D13): відсутній менеджер (той, хто відповідає хоч за одну посаду), заступник
 * (менеджер) і період — `DatePickerField` `range`, обидві дати включно. Помилки — тексти бази.
 */
export function AssignDeputyForm({ managers, deputies, today }: { managers: Person[]; deputies: Person[]; today: string }) {
  const ids = useId();
  const [state, action] = useActionState(assignDeputy, INITIAL);
  const [manager, setManager] = useState<string | null>(null);
  const [deputy, setDeputy] = useState<string | null>(null);
  const [dates, setDates] = useState<string[]>([]);
  return (
    <form action={action} className="flex flex-col gap-4" data-testid="assign-deputy-form">
      <input type="hidden" name="manager_id" value={manager ?? ""} />
      <input type="hidden" name="deputy_id" value={deputy ?? ""} />
      <input type="hidden" name="start" value={dates[0] ?? ""} />
      <input type="hidden" name="end" value={dates[1] ?? dates[0] ?? ""} />
      <div className="grid gap-4 sm:grid-cols-2">
        <PersonSelect label="Absent manager" people={managers} value={manager} onChange={setManager} />
        <PersonSelect label="Deputy" people={deputies} value={deputy} onChange={setDeputy} />
      </div>
      <div className="flex flex-col gap-1.5">
        <Label id={`${ids}-period`}>Period</Label>
        <DatePickerField
          mode="range"
          value={dates}
          onChange={setDates}
          today={today}
          placeholder="Choose the first and the last day"
          labelledBy={`${ids}-period`}
          describedBy={`${ids}-hint`}
        />
        <p id={`${ids}-hint`} className="text-xs text-muted-foreground">
          Both days are included. The deputy decides the records of all the manager&apos;s positions on these days.
        </p>
      </div>
      {state.message && (
        <Alert variant="destructive" role="alert">
          <CircleAlert />
          <AlertDescription>{state.message}</AlertDescription>
        </Alert>
      )}
      {state.done && (
        <p role="status" className="flex items-center gap-1.5 text-xs text-muted-foreground">
          <CircleCheck className="size-3.5" aria-hidden="true" />
          Deputy assigned.
        </p>
      )}
      <div className="flex justify-end">
        <SubmitButton pendingLabel="Assigning…" className="max-sm:w-full pointer-coarse:h-11">
          Assign deputy
        </SubmitButton>
      </div>
    </form>
  );
}

/** «⋯» призначення: «Remove» через Dialog (рішення заступника лишаються). */
export function DeputyMenu({ id, summary }: { id: number; summary: string }) {
  const [open, setOpen] = useState(false);
  const [state, action] = useActionState(removeDeputy, INITIAL);
  return (
    <>
      <RowMenu
        label={`Actions for ${summary}`}
        items={[{ label: "Remove", icon: <Trash2 />, destructive: true, onSelect: () => setOpen(true) }]}
      />
      <Dialog open={open && !state.done} onOpenChange={setOpen}>
        <DialogContent>
          <form action={action} className="flex flex-col gap-4">
            <DialogHeader>
              <DialogTitle>Remove this deputy assignment?</DialogTitle>
              <DialogDescription>{summary}. Decisions the deputy already made stay.</DialogDescription>
            </DialogHeader>
            <input type="hidden" name="assignment_id" value={id} />
            {state.message && (
              <Alert variant="destructive" role="alert">
                <CircleAlert />
                <AlertDescription>{state.message}</AlertDescription>
              </Alert>
            )}
            <DialogFooter>
              <DialogClose render={<Button variant="ghost" />}>Back</DialogClose>
              <SubmitButton variant="destructive" pendingLabel="Removing…">
                Remove
              </SubmitButton>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </>
  );
}
