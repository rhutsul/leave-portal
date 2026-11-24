"use client";

import { useId } from "react";
import { COMMENT_MAX, commentLength } from "@/lib/leave/request";
import { cn } from "@/lib/utils";
import { FieldError } from "./field-error";
import { Label } from "./label";
import { Textarea } from "./textarea";

/**
 * Текст для іншої людини (коментар менеджера, причина прохання, примітка) — Label, лічильник до 500 знаків праворуч від
 * підпису («Optional» — там само, не в підписі), Textarea, підказка й помилка з AC під полем (FieldError,
 * aria-describedby). Кероване поле: після помилки введене лишається (DESIGN.md, розділи 5 і 6).
 */
export function NoteField({
  name,
  label,
  hint,
  value,
  error,
  onChange,
  optional = false,
  placeholder,
  autoFocus = false,
}: {
  name: string;
  label: string;
  hint: string;
  value: string;
  error: string | null;
  onChange: (value: string) => void;
  optional?: boolean;
  placeholder?: string;
  autoFocus?: boolean;
}) {
  const ids = useId();
  const chars = commentLength(value);
  return (
    <div className="flex flex-col gap-1.5">
      <div className="flex items-baseline justify-between gap-3">
        <Label htmlFor={`${ids}-field`}>{label}</Label>
        <span
          id={`${ids}-count`}
          className={cn("text-xs tabular-nums", chars > COMMENT_MAX ? "font-medium text-destructive" : "text-muted-foreground")}
        >
          {optional && "Optional · "}
          {chars}/{COMMENT_MAX}
        </span>
      </div>
      <Textarea
        id={`${ids}-field`}
        name={name}
        rows={3}
        placeholder={placeholder}
        autoFocus={autoFocus}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        aria-invalid={error ? true : undefined}
        aria-describedby={cn(`${ids}-hint`, `${ids}-count`, error && `${ids}-error`)}
      />
      <p id={`${ids}-hint`} className="text-xs text-muted-foreground">
        {hint}
      </p>
      <FieldError id={`${ids}-error`} message={error} />
    </div>
  );
}
