// Що показати на сторінці «Decisions» — чисті функції, щоб перевірити тестами без рендеру (як record-actions-view.ts).

import { DECISION_MESSAGES } from "@/lib/leave/decision";
import type { RecordStatus } from "@/lib/leave/request";
import { formatDuration, formatRange } from "@/lib/leave/time";

export type DecisionsTab = "awaiting" | "history";

export function decisionsTab(param: string | undefined): DecisionsTab {
  return param === "history" ? "history" : "awaiting";
}

/** Посилання на запис у списку: вкладка лишається тією самою. */
export function recordHref(tab: DecisionsTab, id: number): string {
  return tab === "history" ? `/decisions?tab=history&record=${id}` : `/decisions?record=${id}`;
}

/**
 * Запис для панелі справа. Без `record` у посиланні панель закрита — лише список. Запис, якого немає серед записів
 * користувача (public.decision_records дає лише записи його посад, адміністратору — усі), — відмова без даних:
 * чужий він чи його немає зовсім, не розрізняємо (AC-DECIDE-08, AC-DECIDE-09).
 */
export function pickRecord<T extends { id: number }>(records: readonly T[], param: string | undefined): { record: T | null; denied: boolean } {
  if (param === undefined) return { record: null, denied: false };
  const id = /^\d+$/.test(param) ? Number(param) : NaN;
  const record = records.find((r) => r.id === id) ?? null;
  return { record, denied: record === null };
}

/**
 * Рішення не збережено, бо запис уже не чекає рішення: інший менеджер вирішив (AC-DECIDE-07) або працівник скасував.
 * Текст — за поточним статусом запису, а не з відповіді дії: після redirect форми вже немає.
 */
export function decidedNotice(status: RecordStatus): string | null {
  if (status === "awaiting") return null;
  return status === "cancelled" ? DECISION_MESSAGES.cancelled : DECISION_MESSAGES.alreadyDecided(status);
}

/**
 * Де показати відповідь на рішення: про коментар — під полем коментаря, решту (інший менеджер уже вирішив, працівник
 * змінив години, немає доступу) — над формою (DESIGN.md, розділ 6).
 */
export function decisionErrorPlacement(message: string): "field" | "form" | null {
  if (!message) return null;
  return message === DECISION_MESSAGES.returnComment || message === DECISION_MESSAGES.commentTooLong ? "field" : "form";
}

/** Сусіди запису в показаному списку — для «Previous / Next» у панелі; поза списком (History ↔ Awaiting) — немає. */
export function neighbours<T extends { id: number }>(
  shown: readonly T[],
  id: number,
): { index: number; prev: T | null; next: T | null } {
  const index = shown.findIndex((r) => r.id === id);
  if (index < 0) return { index, prev: null, next: null };
  return { index, prev: shown[index - 1] ?? null, next: shown[index + 1] ?? null };
}

/**
 * Куди після рішення (ADR 0007): наступний запис черги «Awaiting decision» після вирішеного, а якщо він був
 * останнім — попередній; порожня черга — список без панелі. `queue` — id черги до рішення, у порядку списку.
 */
export function afterDecision(queue: readonly number[], decidedId: number, status: RecordStatus): string {
  const index = queue.indexOf(decidedId);
  const rest = queue.filter((id) => id !== decidedId);
  const next = index < 0 ? rest[0] : (rest[index] ?? rest[index - 1]);
  return next === undefined ? `/decisions?decided=${status}` : `/decisions?record=${next}&decided=${status}`;
}

/** Робочий день посади на дату запису: від початку першого блоку до кінця останнього, хвилини — лише в блоках. */
export interface PositionDay {
  start: number;
  end: number;
  minutes: number;
}

/**
 * Години запису на тлі робочого дня посади (панель рішення v2): де на смузі дня стоїть запис (частки 0–1), підпис
 * «08:30–15:30 · Whole day» і скільки це з робочого дня — «7 h of 7 h». Без розкладу (`day` null: не завантажився чи
 * змінився) — смуга на всю ширину й лише тривалість запису.
 */
export function dayBar(
  record: { start_min: number; end_min: number; minutes: number },
  day: PositionDay | null,
): { left: number; width: number; label: string; total: string } {
  const range = formatRange(record.start_min, record.end_min);
  const duration = formatDuration(record.minutes);
  if (!day || day.end <= day.start) return { left: 0, width: 1, label: range, total: duration };
  const span = day.end - day.start;
  const clamp = (v: number) => Math.min(1, Math.max(0, v));
  const left = clamp((record.start_min - day.start) / span);
  const width = Math.max(0, clamp((record.end_min - day.start) / span) - left);
  const whole = record.start_min <= day.start && record.end_min >= day.end;
  return { left, width, label: whole ? `${range} · Whole day` : range, total: `${duration} of ${formatDuration(day.minutes)}` };
}

/**
 * Залишок до й після погодження запису, у сотих дня (панель рішення v2): «15.36 → 14.36 days after approval». Понад
 * залишок оплачується лише залишок (розподіл AC-BALANCE-10), тож після — 0.00. `total` — нараховане й перенесене за
 * рік; з ним — частки для двоколірної смуги й «2.64 of 18.00 used», без нього (не завантажилось) — лише числа.
 */
export function balanceShift(remaining: number, share: number, total: number | null) {
  const before = Math.max(remaining, 0);
  const after = Math.max(before - share, 0);
  const bar = total && total > 0 ? { before: Math.min(1, before / total), after: Math.min(1, after / total) } : null;
  return { before, after, bar, used: total === null ? null : Math.max(total - before, 0) };
}
