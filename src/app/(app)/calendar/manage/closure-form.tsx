"use client";

import Link from "next/link";
import { useActionState, useId, useState } from "react";
import { CalendarRange, CircleAlert, Clock } from "lucide-react";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { buttonVariants } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { SubmitButton } from "@/components/ui/submit-button";
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
export function ClosureForm() {
  const ids = useId();
  const [state, action] = useActionState(addClosure, INITIAL);
  const [kind, setKind] = useState<Kind>("days");
  const [fields, setFields] = useState({ name: "", start: "", end: "", date: "", time: "" });
  const set = (key: keyof typeof fields) => (e: React.ChangeEvent<HTMLInputElement>) =>
    setFields((f) => ({ ...f, [key]: e.target.value }));
  const error = state.message;

  return (
    <Card className="max-w-2xl">
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
  );
}
