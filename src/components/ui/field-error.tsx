import { CircleAlert } from "lucide-react";
import { cn } from "@/lib/utils";

/**
 * Помилка під полем чи групою полів — текст PM з AC дослівно (DESIGN.md, розділ 6). Поле позначає aria-invalid і
 * aria-describedby з цим id; помилку всієї дії над формою показує Alert.
 */
export function FieldError({ message, id, className }: { message: string | null | undefined; id?: string; className?: string }) {
  if (!message) return null;
  return (
    <p id={id} role="alert" className={cn("flex items-start gap-1.5 text-xs text-destructive", className)}>
      <CircleAlert className="mt-px size-3.5 shrink-0" aria-hidden="true" />
      {message}
    </p>
  );
}
