import type { ReactNode } from "react";
import { Card } from "./legacy-card";
import { CalendarIcon } from "./icons";

/** Порожній стан списку: іконка, заголовок, пояснення й необов'язкова дія. */
export function EmptyState({ title, text, action }: { title: string; text: string; action?: ReactNode }) {
  return (
    <Card as="div" className="flex flex-col items-center gap-2.5 border-dashed border-input px-6 py-12 text-center">
      <span className="flex size-11 items-center justify-center rounded-xl bg-muted text-foreground">
        <CalendarIcon size={22} />
      </span>
      <p className="font-semibold">{title}</p>
      <p className="text-muted-foreground">{text}</p>
      {action}
    </Card>
  );
}
