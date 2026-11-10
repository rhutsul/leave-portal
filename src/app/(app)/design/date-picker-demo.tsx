"use client";

import { useState } from "react";
import { Card } from "@/components/ui/card";
import { DatePicker, DatePickerField, type DayNote } from "@/components/ui/date-picker";
import type { PickMode } from "@/lib/date-picker";

// Вітрина DatePicker (/design): поле з календарем у спливній панелі в трьох режимах і сама сітка, що в тій панелі,
// з позначкою «already closed» на синтетичних закриттях.
const TODAY = "2026-11-09";

function note(date: string): DayNote | null {
  if (date === "2026-11-20") return { label: "already closed: Teachers' meeting from 12:00", hatch: "half" };
  if (date >= "2026-12-28" && date <= "2027-01-08") return { label: "already closed: Winter break", hatch: "full" };
  return null;
}

const FIELDS: { mode: PickMode; title: string; hint: string; placeholder: string; initial: string[]; month: string }[] = [
  {
    mode: "range",
    title: "Range",
    hint: "First click — start, second — end; the panel closes on the end.",
    placeholder: "Choose dates",
    initial: ["2026-12-21", "2026-12-24"],
    month: "2026-12",
  },
  {
    mode: "single",
    title: "Single date",
    hint: "One click picks the date and closes the panel.",
    placeholder: "Choose a date",
    initial: [],
    month: "2026-11",
  },
  {
    mode: "multiple",
    title: "Several dates",
    hint: "Each click adds or removes a date; the panel stays open.",
    placeholder: "Choose dates",
    initial: ["2026-11-12", "2026-11-13", "2026-11-26"],
    month: "2026-11",
  },
];

export function DatePickerDemo() {
  const [grid, setGrid] = useState<string[]>(["2026-12-21"]);
  return (
    <div className="flex flex-col gap-4">
      <div className="grid gap-4 md:grid-cols-3">
        {FIELDS.map((field) => (
          <FieldCard key={field.mode} {...field} />
        ))}
      </div>
      <Card className="w-fit max-w-full gap-3 px-5">
        <div>
          <h3 id="ds-picker-grid" className="text-base font-semibold">
            Calendar in the panel
          </h3>
          <p className="text-xs text-muted-foreground">Range started on 21 Dec: hover a later day for the preview.</p>
        </div>
        <DatePicker
          mode="range"
          value={grid}
          onChange={setGrid}
          today={TODAY}
          defaultMonth="2026-12"
          note={note}
          labelledBy="ds-picker-grid"
          className="w-84 max-w-full"
        />
      </Card>
    </div>
  );
}

function FieldCard({ mode, title, hint, placeholder, initial, month }: (typeof FIELDS)[number]) {
  const [value, setValue] = useState(initial);
  const id = `ds-picker-${mode}`;
  return (
    <Card className="gap-3 px-5">
      <div className="flex flex-col gap-0.5">
        <span id={id} className="text-[13px] font-medium">
          {title}
        </span>
        <p className="text-xs text-muted-foreground">{hint}</p>
      </div>
      <DatePickerField
        mode={mode}
        value={value}
        onChange={setValue}
        today={TODAY}
        defaultMonth={month}
        note={note}
        placeholder={placeholder}
        labelledBy={id}
      />
    </Card>
  );
}
