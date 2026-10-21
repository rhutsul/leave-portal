// Рішення менеджера щодо запису й дії працівника із власним записом до рішення — чисті функції (D5
// openspec/changes/archive/2026-10-21-impl-leave-ws6/design.md). Ті самі правила ще раз перевіряють функції бази (decide_leave_record,
// update_leave_record_hours, resubmit_leave_record, cancel_leave_record); тут — для повідомлень і кнопок.

import {
  COMMENT_MAX,
  RECORD_STATUSES,
  commentLength,
  findOverlap,
  overlapMessage,
  type ExistingRecord,
  type RecordStatus,
} from "./request";
import { checkHours, formatKyivDateTime, parseTime, type TimeBlock } from "./time";

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
  /** Працівник змінив години, поки менеджер дивився запис (зміна годин до рішення — задача 5). */
  hoursChanged: "The employee has changed the hours of this record. Check them again before deciding",
} as const;

/** Години запису, які бачив менеджер, — у прихованому полі форми рішення: "540-720". */
export function reviewedHours(start: number, end: number): string {
  return `${start}-${end}`;
}

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

/** Дії в історії запису (leave_record_events.action) назвами для людини. */
export const HISTORY_ACTIONS: Record<string, string> = {
  submitted: "Submitted",
  approved: RECORD_STATUSES.approved,
  rejected: RECORD_STATUSES.rejected,
  returned: RECORD_STATUSES.returned,
  resubmitted: "Resubmitted",
  hours_changed: "Hours changed",
  cancelled: RECORD_STATUSES.cancelled,
};

export interface HistoryEvent {
  createdAt: string;
  action: string;
  actorName: string | null;
  comment: string | null;
}

/** Рядок історії: дата й час рішення до хвилини за Києвом, хто, що (AC-DECIDE-15). */
export function historyLine(event: HistoryEvent): { at: string; who: string; what: string } {
  return {
    at: formatKyivDateTime(event.createdAt),
    who: event.actorName ?? "Unknown user",
    what: HISTORY_ACTIONS[event.action] ?? event.action,
  };
}

/** id запису з форми: лише додатне ціле; інше — як запис без доступу. */
export function parseRecordId(raw: unknown): number | null {
  if (typeof raw !== "string" || !/^[1-9]\d{0,14}$/.test(raw)) return null;
  const id = Number(raw);
  return Number.isSafeInteger(id) ? id : null;
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

// ── Дії працівника із власним записом до рішення (requirements/02-leave-decision.md) ──
// Ті самі правила ще раз перевіряють private.update_leave_record_hours, resubmit_leave_record і cancel_leave_record.

export const EMPLOYEE_ACTIONS = ["changeHours", "resubmit", "cancel"] as const;

export type EmployeeAction = (typeof EMPLOYEE_ACTIONS)[number];

export const RECORD_EDIT_MESSAGES = {
  approved: "This record is already approved and cannot be changed",
  onlyHours:
    "Only the hours can be changed. To change the date, position or leave type, cancel this record and submit a new request",
  /** Тексти без AC PM: «Rejected» і «Cancelled» — фінальні статуси (Assumptions 02-leave-decision). */
  rejected: "This record is already rejected and cannot be changed",
  cancelled: "This record is cancelled and cannot be changed",
  notReturned: "Only a record returned for revision can be resubmitted",
  notFound: "Record not found",
} as const;

/**
 * Що працівник може зробити із власним записом: до рішення — змінити години й скасувати (AC-DECIDE-13, AC-DECIDE-16);
 * повернений — ще й подати повторно (AC-DECIDE-06, AC-DECIDE-17). «Approved», «Rejected», «Cancelled» — нічого
 * (AC-DECIDE-12; скасування погодженого запису — WS11).
 */
export function employeeActions(status: RecordStatus): EmployeeAction[] {
  if (status === "awaiting") return ["changeHours", "cancel"];
  if (status === "returned") return ["changeHours", "resubmit", "cancel"];
  return [];
}

/** Чому запис не можна змінити, як private.locked_record_message. */
export function recordLockedMessage(status: RecordStatus): string {
  if (status === "approved") return RECORD_EDIT_MESSAGES.approved;
  if (status === "rejected") return RECORD_EDIT_MESSAGES.rejected;
  return RECORD_EDIT_MESSAGES.cancelled;
}

export function checkEmployeeAction(status: RecordStatus, action: EmployeeAction): AccessCheck {
  if (employeeActions(status).includes(action)) return { ok: true };
  if (action === "resubmit" && status === "awaiting") return { ok: false, message: RECORD_EDIT_MESSAGES.notReturned };
  return { ok: false, message: recordLockedMessage(status) };
}

/** Власний запис, який працівник змінює. */
export interface OwnRecord {
  id: number;
  positionId: number;
  date: string;
  leaveType: string;
  status: RecordStatus;
}

/** Що прийшло з форми: години, а дата, посада й тип — лише якщо їх намагаються змінити. */
export interface RecordEdit {
  start: string;
  end: string;
  date?: string;
  positionId?: number;
  leaveType?: string;
}

export type RecordEditCheck = { ok: true; start: number; end: number; minutes: number } | { ok: false; message: string };

/**
 * Зміна годин власного запису до рішення: статус (AC-DECIDE-12) → змінюються лише години, не дата, посада чи тип
 * (AC-DECIDE-21) → години в розкладі тієї самої посади на ту саму дату (checkHours, AC-LEAVE-07…09) → перетин з
 * іншими записами посади, але не з самим записом (AC-DECIDE-22, Assumptions 02-leave-decision).
 * blocks — блоки розкладу посади запису на його дату; others — записи тієї самої посади й дати (цей теж можна).
 */
export function checkRecordEdit(
  record: OwnRecord,
  edit: RecordEdit,
  blocks: TimeBlock[],
  others: readonly (ExistingRecord & { id: number })[],
): RecordEditCheck {
  const status = checkEmployeeAction(record.status, "changeHours");
  if (!status.ok) return status;
  if (
    (edit.date !== undefined && edit.date !== record.date) ||
    (edit.positionId !== undefined && edit.positionId !== record.positionId) ||
    (edit.leaveType !== undefined && edit.leaveType !== record.leaveType)
  ) {
    return { ok: false, message: RECORD_EDIT_MESSAGES.onlyHours };
  }
  const start = parseTime(edit.start);
  const end = parseTime(edit.end);
  const hours = checkHours(blocks, start, end);
  if (!hours.ok) return hours;
  const draft = { positionId: record.positionId, date: record.date, start: start!, end: end!, minutes: hours.minutes };
  const conflict = findOverlap(
    [draft],
    others.filter((o) => o.id !== record.id),
  );
  if (conflict) return { ok: false, message: overlapMessage(conflict) };
  return { ok: true, start: start!, end: end!, minutes: hours.minutes };
}
