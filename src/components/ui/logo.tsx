import { cn } from "@/lib/utils";

/**
 * Знак Leave Portal: аркуш відривного календаря з кільцями, нижній кут загортається — день «відірвано», він вільний;
 * галочка — відсутність погоджено. Малюнок — `currentColor`, тож колір дає обгортка. Той самий знак — у
 * `src/app/icon.svg` (favicon).
 */
export function LogoMark({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.75}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      className={className}
    >
      <path d="M4.5 7A2 2 0 0 1 6.5 5h11a2 2 0 0 1 2 2v8l-5 5h-8a2 2 0 0 1-2-2Z" />
      <path d="M19.5 15h-3a2 2 0 0 0-2 2v3" />
      <path d="M8.5 3v4M15.5 3v4M4.5 9.5h15" />
      <path d="m8.5 14 2 2 3.5-3.5" />
    </svg>
  );
}

/** Знак у квадраті `primary` (шапка бічної панелі, сторінка входу); розмір і радіус — через `className`. */
export function Logo({ className }: { className?: string }) {
  return (
    <span
      aria-hidden="true"
      className={cn("grid size-6 shrink-0 place-items-center rounded-sm bg-primary text-primary-foreground", className)}
    >
      <LogoMark className="size-[78%]" />
    </span>
  );
}
