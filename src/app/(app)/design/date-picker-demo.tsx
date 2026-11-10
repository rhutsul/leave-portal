"use client";

import { useState } from "react";
import { Card } from "@/components/ui/card";
import { DatePicker, type DayNote } from "@/components/ui/date-picker";
import type { PickMode } from "@/lib/date-picker";

// Вітрина DatePicker (/design): три режими поруч, з позначкою «already closed» на синтетичному закритті.
const TODAY = "2026-11-09";

function note(date: string): DayNote | null {
  if (date === "2026-11-20") return { label: "already closed: Teachers' meeting from 12:00", hatch: "half" };
  if (date >= "2026-12-28" && date <= "2027-01-08") return { label: "already closed: Winter break", hatch: "full" };
  return null;
}

const DEMOS: { mode: PickMode; title: string; hint: string; initial: string[]; month: string }[] = [
  {
    mode: "range",
    title: "Range",
    hint: "First click — start, second — end; hover previews the range. Esc cancels an unfinished one.",
    initial: ["2026-12-21", "2026-12-24"],
    month: "2026-12",
  },
  { mode: "single", title: "Single date", hint: "Every click replaces the date.", initial: ["2026-11-20"], month: "2026-11" },
  {
    mode: "multiple",
    title: "Several dates",
    hint: "Each click adds a date; a second click removes it.",
    initial: ["2026-11-12", "2026-11-13", "2026-11-26"],
    month: "2026-11",
  },
];

export function DatePickerDemo() {
  return (
    <div className="grid gap-4 md:grid-cols-[repeat(auto-fit,minmax(300px,1fr))]">
      {DEMOS.map((demo) => (
        <PickerCard key={demo.mode} {...demo} />
      ))}
    </div>
  );
}

function PickerCard({ mode, title, hint, initial, month }: (typeof DEMOS)[number]) {
  const [value, setValue] = useState(initial);
  const id = `ds-picker-${mode}`;
  return (
    <Card className="gap-3 px-5">
      <div>
        <h3 id={id} className="text-base font-semibold">
          {title}
        </h3>
        <p className="text-xs text-muted-foreground">{hint}</p>
      </div>
      <DatePicker
        mode={mode}
        value={value}
        onChange={setValue}
        today={TODAY}
        defaultMonth={month}
        note={note}
        labelledBy={id}
      />
    </Card>
  );
}
