import type { ReactNode } from "react";
import { AlertIcon } from "./icons";

/** Попередження, яке не зупиняє дію (перевищення залишку): текст PM з AC дослівно. */
export function WarningNote({
  children,
  className = "",
  live = false,
}: {
  children: ReactNode;
  className?: string;
  /** Показується після дії (redirect): live region, щоб читач екрана оголосив його разом з успіхом. */
  live?: boolean;
}) {
  return (
    <p
      role={live ? "status" : "note"}
      className={`flex animate-rise items-start gap-2 rounded-md bg-warning px-3.5 py-3 text-warning-foreground ${className}`}
    >
      <span className="mt-0.5 shrink-0">
        <AlertIcon />
      </span>
      {children}
    </p>
  );
}
