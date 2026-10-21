// Рішення менеджера щодо запису — чисті функції (D5 openspec/changes/impl-leave-ws6/design.md).
// Ті самі правила ще раз перевіряє private.decide_leave_record у базі; тут — для повідомлень і кнопок на /decisions.

import { COMMENT_MAX, RECORD_STATUSES, commentLength, type RecordStatus } from "./request";

export type Role = "employee" | "manager" | "admin";

export const DECISIONS = ["approve", "reject", "return"] as const;

export type Decision = (typeof DECISIONS)[number];

/** Статус, у який переходить запис «Awaiting decision» після рішення (requirements/02-leave-decision.md). */
export const DECISION_STATUS = {
  approve: "approved",
  reject: "rejected",
  return: "returned",
} as const satisfies Record<Decision, RecordStatus>;

export const DECISION_MESSAGES = {
  returnComment: "Tell the employee what to fix",
  ownRecord: "Your own record is decided by an administrator",
  alreadyDecided: (status: RecordStatus) => `Another manager has already decided: ${RECORD_STATUSES[status]}`,
  /** Тексти без AC PM: AC-DECIDE-08 і AC-DECIDE-09 кажуть лише, що рішення не збережено. */
  noAccess: "You can't decide on this record",
  cancelled: "This record was cancelled by the employee",
  commentTooLong: `The comment can be at most ${COMMENT_MAX} characters`,
} as const;

export interface Actor {
  id: string;
  role: Role;
}

/** Те, що потрібно знати про запис для рішення: власник, статус і відповідальні менеджери його посади. */
export interface DecisionTarget {
  employeeId: string;
  status: RecordStatus;
  managerIds: readonly string[];
}

export function isDecision(value: string): value is Decision {
  return (DECISIONS as readonly string[]).includes(value);
}

export type AccessCheck = { ok: true } | { ok: false; message: string };

/**
 * Чи може людина вирішувати цей запис (матриця прав requirements/product.md): адміністратор — будь-який запис
 * (AC-DECIDE-10, AC-DECIDE-19); менеджер — лише записи посад, за які відповідає, і ніколи власні (AC-DECIDE-08,
 * AC-DECIDE-18); працівник — жодного (AC-DECIDE-09). Неіснуючий запис — та сама відповідь, що й чужий.
 */
export function checkAccess(actor: Actor, record: DecisionTarget | null): AccessCheck {
  if (!record) return { ok: false, message: DECISION_MESSAGES.noAccess };
  if (actor.role === "admin") return { ok: true };
  if (actor.role !== "manager" || !record.managerIds.includes(actor.id)) {
    return { ok: false, message: DECISION_MESSAGES.noAccess };
  }
  if (record.employeeId === actor.id) return { ok: false, message: DECISION_MESSAGES.ownRecord };
  return { ok: true };
}

export type DecisionCheck =
  | { ok: true; status: RecordStatus; comment: string | null }
  | { ok: false; message: string };

/**
 * Рішення щодо запису: право (checkAccess) → запис ще чекає рішення (інакше хтось уже вирішив, AC-DECIDE-07) →
 * коментар: обов'язковий лише при поверненні (AC-DECIDE-04), при погодженні й відхиленні — необов'язковий
 * (AC-DECIDE-23, AC-DECIDE-24). Порожній коментар — без коментаря, як nullif(btrim(…)) у базі.
 */
export function checkDecision(
  actor: Actor,
  record: DecisionTarget | null,
  decision: Decision,
  comment: string,
): DecisionCheck {
  const access = checkAccess(actor, record);
  if (!access.ok || !record) return { ok: false, message: access.ok ? DECISION_MESSAGES.noAccess : access.message };
  const { status } = record;
  if (status === "cancelled") return { ok: false, message: DECISION_MESSAGES.cancelled };
  if (status !== "awaiting") return { ok: false, message: DECISION_MESSAGES.alreadyDecided(status) };
  const trimmed = comment.trim();
  if (commentLength(trimmed) > COMMENT_MAX) return { ok: false, message: DECISION_MESSAGES.commentTooLong };
  if (decision === "return" && trimmed === "") return { ok: false, message: DECISION_MESSAGES.returnComment };
  return { ok: true, status: DECISION_STATUS[decision], comment: trimmed === "" ? null : trimmed };
}
