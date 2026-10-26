import { AlertIcon } from "./icons";

/** Повідомлення про помилку під полем чи карткою — текст PM з AC дослівно. */
export function FieldError({ message, id, className = "" }: { message: string | null | undefined; id?: string; className?: string }) {
  if (!message) return null;
  return (
    <p
      id={id}
      role="alert"
      className={`flex items-center gap-2 rounded-lg border border-destructive/50 bg-destructive/10 px-3 py-2 text-sm text-destructive ${className}`}
    >
      <span className="shrink-0">
        <AlertIcon />
      </span>
      {message}
    </p>
  );
}
