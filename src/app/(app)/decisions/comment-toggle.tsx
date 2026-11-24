"use client";

import { Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { NoteField } from "@/components/ui/note-field";

/**
 * Коментар менеджера в панелі запису (v2): поле сховане за «Add a comment for the employee» і відкривається кнопкою або
 * саме, коли є помилка про коментар (дія, що потребує коментаря, натиснута без нього) — тоді текст AC стоїть під полем.
 * Поки поле сховане, форма надсилає порожній коментар. Спільне для рішення щодо запису й щодо прохання про скасування.
 */
export function CommentToggle({
  open,
  error,
  value,
  label,
  hint,
  optional = false,
  onOpen,
  onChange,
}: {
  open: boolean;
  error: string | null;
  value: string;
  label: string;
  hint: string;
  optional?: boolean;
  onOpen: () => void;
  onChange: (value: string) => void;
}) {
  if (open || error !== null) {
    return (
      <NoteField
        name="comment"
        label={label}
        hint={hint}
        optional={optional}
        placeholder="Shown to the employee"
        // Поле щойно відкрили кнопкою чи дією без коментаря — одразу можна писати.
        autoFocus
        value={value}
        error={error}
        onChange={onChange}
      />
    );
  }
  return (
    <>
      <input type="hidden" name="comment" value="" />
      <Button
        type="button"
        variant="ghost"
        size="sm"
        className="-ml-3 self-start text-primary hover:text-primary pointer-coarse:h-11"
        onClick={onOpen}
      >
        <Plus />
        Add a comment for the employee
      </Button>
    </>
  );
}
