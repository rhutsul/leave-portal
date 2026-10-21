import type { ReactNode } from "react";
import { Card } from "./card";
import { CalendarIcon } from "./icons";

/** Порожній стан списку: іконка, заголовок, пояснення й необов'язкова дія. */
export function EmptyState({ title, text, action }: { title: string; text: string; action?: ReactNode }) {
  return (
    <Card as="div" className="flex flex-col items-center gap-2.5 border-dashed border-line-strong px-6 py-12 text-center">
      <span className="flex size-11 items-center justify-center rounded-xl bg-subtle text-ink-2">
        <CalendarIcon size={22} />
      </span>
      <p className="font-semibold">{title}</p>
      <p className="text-muted">{text}</p>
      {action}
    </Card>
  );
}
