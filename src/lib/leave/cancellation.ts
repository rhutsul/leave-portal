// Скасування погодженого запису через менеджера (requirements/09-cancel-approved.md; D8
// openspec/changes/impl-cancel-approved/design.md) — чисті функції для повідомлень і кнопок. Ті самі правила в тому
// самому порядку ще раз перевіряють функції бази (request_record_cancellation, decide_record_cancellation,
// cancel_approved_record у 20261124195428_cancel_approved.sql); база — другий рубіж.

import { checkAccess, DECISION_MESSAGES, type Actor } from "./decision";
import { COMMENT_MAX, commentLength, type RecordStatus } from "./request";

export const CANCELLATION_MESSAGES = {
  /** AC-CANCEL-05. */
  past: "Records in the past cannot be cancelled",
  /** AC-CANCEL-06. */
  alreadyRequested: "Cancellation has already been requested",
  /** AC-CANCEL-10. */
  notOwn: "You can cancel only your own records",
  /** AC-CANCEL-04. */
  declineComment: "Tell the employee why the cancellation is declined",
  /** AC-CANCEL-09. */
  cancelNote: "Tell the employee why the record is cancelled",
  /** Власні тексти (AC PM немає): D3–D5. */
  notApproved: "Only an approved record can be cancelled through the manager",
  notApprovedForNote: "Only an approved record can be cancelled with a note",
  reason: "Tell the manager why you want to cancel the record",
  noRequest: "There is no cancellation request for this record",
  alreadyCancelled: "This record is already cancelled",
  requestChanged: "The employee has changed the cancellation request. Check it again before deciding",
  commentTooLong: DECISION_MESSAGES.commentTooLong,
} as const;

export const CANCELLATION_DECISIONS = ["confirm", "decline"] as const;

export type CancellationDecision = (typeof CANCELLATION_DECISIONS)[number];

export function isCancellationDecision(value: unknown): value is CancellationDecision {
  return typeof value === "string" && (CANCELLATION_DECISIONS as readonly string[]).includes(value);
}

/** Що потрібно знати про запис для скасування: дата, статус і відкрите прохання. */
export interface CancellableRecord {
  date: string;
  status: RecordStatus;
  /** Причина відкритого прохання; не null — позначка «Cancellation requested». */
  cancelReason: string | null;
  /** id події відкритого прохання (D4). */
  cancelRequestId: number | null;
}

export type TextCheck = { ok: true; text: string } | { ok: false; message: string };

/** Текст з форми: без крайових пробілів (як private.trimmed_text), порожній — повідомлення empty, понад 500 — довгий. */
function requiredText(raw: string, empty: string): TextCheck {
  const text = raw.trim();
  if (text === "") return { ok: false, message: empty };
  if (commentLength(text) > COMMENT_MAX) return { ok: false, message: CANCELLATION_MESSAGES.commentTooLong };
  return { ok: true, text };
}

/**
 * Чому працівник не може попросити скасувати власний запис — або null, якщо може (D3, кроки 3–5): не «Approved», у
 * минулому (AC-CANCEL-05; today — дата за Києвом), прохання вже є (AC-CANCEL-06). Сторінка показує цей текст замість
 * форми; причину перевіряє cancellationRequestCheck.
 */
export function cancellationBlocker(record: CancellableRecord, today: string): string | null {
  if (record.status !== "approved") return CANCELLATION_MESSAGES.notApproved;
  if (record.date < today) return CANCELLATION_MESSAGES.past;
  if (record.cancelReason !== null) return CANCELLATION_MESSAGES.alreadyRequested;
  return null;
}

/** Пункт меню «Request cancellation» у «My requests»: погоджений запис сьогодні чи пізніше без прохання. */
export function canRequestCancellation(record: CancellableRecord, today: string): boolean {
  return cancellationBlocker(record, today) === null;
}

/**
 * Прохання працівника (D3): чужий чи неіснуючий запис (null) — AC-CANCEL-10; далі cancellationBlocker; потім причина
 * обов'язкова й до 500 символів.
 */
export function cancellationRequestCheck(record: CancellableRecord | null, today: string, reason: string): TextCheck {
  if (!record) return { ok: false, message: CANCELLATION_MESSAGES.notOwn };
  const blocker = cancellationBlocker(record, today);
  if (blocker) return { ok: false, message: blocker };
  return requiredText(reason, CANCELLATION_MESSAGES.reason);
}

/** Запис для рішення менеджера: власник, відповідальні менеджери посади і стан прохання. */
export interface CancellationTarget extends CancellableRecord {
  employeeId: string;
  managerIds: readonly string[];
}

/**
 * Спільний початок рішення щодо прохання й скасування з приміткою (як private.check_cancellation_actor і перша
 * перевірка статусу в базі): право — як рішення щодо запису (checkAccess), потім уже скасований запис. null — далі.
 */
function actorRefusal(actor: Actor, target: CancellationTarget | null): string | null {
  const access = checkAccess(actor, target);
  if (!access.ok) return access.message;
  return target?.status === "cancelled" ? CANCELLATION_MESSAGES.alreadyCancelled : null;
}

export type CancellationDecisionCheck =
  | { ok: true; comment: string | null }
  | { ok: false; message: string; field?: boolean };

/**
 * Рішення щодо прохання (D4): право — як рішення щодо запису (checkAccess: адміністратор — будь-який, менеджер — посади,
 * за які відповідає, крім власних; AC-CANCEL-11) → запис уже скасовано → відкритого прохання немає (зокрема запис не
 * «Approved») → прохання не те, яке бачив менеджер → відхилення без коментаря (AC-CANCEL-04, field — під полем).
 */
export function cancellationDecisionCheck(
  actor: Actor,
  target: CancellationTarget | null,
  decision: CancellationDecision,
  comment: string,
  requestId: number | null,
): CancellationDecisionCheck {
  const refused = actorRefusal(actor, target);
  if (refused !== null || !target) return { ok: false, message: refused ?? DECISION_MESSAGES.noAccess };
  if (target.status !== "approved" || target.cancelReason === null) {
    return { ok: false, message: CANCELLATION_MESSAGES.noRequest };
  }
  if (requestId === null || target.cancelRequestId !== requestId) {
    return { ok: false, message: CANCELLATION_MESSAGES.requestChanged };
  }
  if (decision === "confirm") return { ok: true, comment: null };
  const text = requiredText(comment, CANCELLATION_MESSAGES.declineComment);
  return text.ok ? { ok: true, comment: text.text } : { ok: false, message: text.message, field: true };
}

/**
 * Скасування менеджером з приміткою (D5): право (як у рішенні) → уже скасовано → не «Approved» → у минулому → примітка
 * обов'язкова (AC-CANCEL-09, field — під полем).
 */
export function managerCancelCheck(
  actor: Actor,
  target: CancellationTarget | null,
  today: string,
  note: string,
): CancellationDecisionCheck {
  const refused = actorRefusal(actor, target);
  if (refused !== null || !target) return { ok: false, message: refused ?? DECISION_MESSAGES.noAccess };
  if (target.status !== "approved") return { ok: false, message: CANCELLATION_MESSAGES.notApprovedForNote };
  if (target.date < today) return { ok: false, message: CANCELLATION_MESSAGES.past };
  const text = requiredText(note, CANCELLATION_MESSAGES.cancelNote);
  return text.ok ? { ok: true, comment: text.text } : { ok: false, message: text.message, field: true };
}

/** Чи показувати менеджеру «Cancel record» у панелі запису: погоджений, сьогодні чи пізніше, без відкритого прохання. */
export function canCancelWithNote(record: CancellableRecord, today: string): boolean {
  return record.status === "approved" && record.date >= today && record.cancelReason === null;
}

/** Колонки скасування запису для показу працівнику. */
export interface CancellationColumns {
  cancel_reason: string | null;
  cancel_declined_comment: string | null;
  cancel_note: string | null;
}

export type CancellationMark =
  | { kind: "requested"; text: string }
  | { kind: "declined"; text: string }
  | { kind: "note"; text: string };

/**
 * Що показати на записі (D12): відкрите прохання — позначка «Cancellation requested» (AC-CANCEL-01); відхилене —
 * «Cancellation declined: <коментар>» (AC-CANCEL-03); скасований менеджером — його примітка (AC-CANCEL-08).
 */
export function cancellationMark(status: RecordStatus, columns: CancellationColumns | undefined): CancellationMark | null {
  if (!columns) return null;
  if (status === "approved" && columns.cancel_reason !== null) {
    return { kind: "requested", text: "Cancellation requested" };
  }
  if (status === "approved" && columns.cancel_declined_comment !== null) {
    return { kind: "declined", text: `Cancellation declined: ${columns.cancel_declined_comment}` };
  }
  if (status === "cancelled" && columns.cancel_note !== null) {
    return { kind: "note", text: columns.cancel_note };
  }
  return null;
}

/** Рядок прохання для менеджера в панелі запису (AC-CANCEL-01): "Cancellation requested: Plans changed". */
export function cancellationRequestLine(reason: string): string {
  return `Cancellation requested: ${reason}`;
}
