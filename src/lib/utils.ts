export { cn } from "cn"

/** Ініціали для аватара: перші літери двох перших частин імені (через пробіл чи дефіс), великими. */
export function initials(name: string) {
  return name
    .split(/[\s-]+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]!.toUpperCase())
    .join("");
}
