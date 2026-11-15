import type { SaveState } from "./actions";

/**
 * Результат «Save closures» → список пропозицій у формі (AC-ASSIST-02, -04). Сервер повертає індекси в НАДІСЛАНОМУ
 * списку, а поточний список під час збереження міг змінитися (людина прибрала картку, прийшли нові пропозиції), тож
 * результат прикладаємо лише до ключів, які були у формі: збережені зникають, відхилені лишаються з повідомленням,
 * решта — без змін. Сервер не прийняв форму взагалі (нічого не збережено й не відхилено) — список не чіпаємо.
 */
export function applySaveResult<T extends { key: number; error: string | null }>(
  current: T[],
  submittedKeys: number[],
  result: SaveState,
): T[] {
  if (result.saved === 0 && result.failed.length === 0) return current;
  const failed = new Map(result.failed.map((f) => [submittedKeys[f.index], f.message]));
  return current.flatMap((item) => {
    if (!submittedKeys.includes(item.key)) return [item];
    const message = failed.get(item.key);
    return message == null ? [] : [{ ...item, error: message }];
  });
}

/** Ключі пропозицій у тому порядку, у якому їх надіслала форма (поле `keys`). */
export function submittedKeys(form: FormData): number[] {
  return String(form.get("keys") ?? "")
    .split(",")
    .filter(Boolean)
    .map(Number);
}
