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

// ТИМЧАСОВО (червоний прогін воріт WS8, буде прибрано наступним комітом): мертвий експорт без тесту.
export function shortName(name: string) {
  const [first, ...rest] = name.trim().split(/\s+/);
  return rest.length ? `${first} ${rest.at(-1)![0]}.` : first;
}
