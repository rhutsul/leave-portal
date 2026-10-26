import type { ReactNode } from "react";
import { CalendarDays } from "lucide-react";
import { cn } from "@/lib/utils";

/** Порожній стан списку: іконка в колі accent, текст з AC, щонайбільше одна дія. */
export function EmptyState({
  title,
  text,
  action,
  icon,
  titleAs: Title = "p",
  className,
}: {
  title: string;
  /** Коли стан — уся сторінка чи панель (відмова в доступі, 404), заголовок — справжній heading. */
  titleAs?: "p" | "h1" | "h2";
  text?: string;
  action?: ReactNode;
  icon?: ReactNode;
  className?: string;
}) {
  return (
    <div
      className={cn(
        "flex flex-col items-center gap-2.5 rounded-lg border border-dashed border-border bg-card px-6 py-12 text-center",
        className,
      )}
    >
      <span className="flex size-11 items-center justify-center rounded-full bg-accent text-accent-foreground">
        {icon ?? <CalendarDays className="size-5" aria-hidden="true" />}
      </span>
      <Title className="text-sm font-semibold">{title}</Title>
      {text && <p className="max-w-[60ch] text-muted-foreground">{text}</p>}
      {action}
    </div>
  );
}
