import type { ReactNode } from "react";
import { AlertIcon } from "./icons";

/** Попередження, яке не зупиняє дію (перевищення залишку): текст PM з AC дослівно. */
export function WarningNote({ children, className = "" }: { children: ReactNode; className?: string }) {
  return (
    <p
      role="note"
      className={`flex items-start gap-2 rounded-lg border border-awaiting-dot/30 bg-awaiting-soft px-3 py-2 text-awaiting ${className}`}
    >
      <span className="mt-0.5 shrink-0">
        <AlertIcon />
      </span>
      {children}
    </p>
  );
}
