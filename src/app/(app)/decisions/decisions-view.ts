// Що показати на сторінці «Decisions» — чисті функції, щоб перевірити тестами без рендеру (як record-actions-view.ts).

import { DECISION_MESSAGES } from "@/lib/leave/decision";
import type { RecordStatus } from "@/lib/leave/request";

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
