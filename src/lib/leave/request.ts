// Записи заявки з вибору працівника — чисті функції (D5 openspec/changes/impl-leave-ws6/design.md).
// Один запис — одна посада на одну дату (глосарій requirements/product.md); «цілий день» — усі блоки посади на дату.

import { checkHours, isoWeekday, parseTime, sortBlocks, TIME_MESSAGES, wholeDay, type TimeBlock } from "./time";

export const LEAVE_TYPES = {
  sick: "Sick leave",
  personal: "Personal leave",
  unpaid: "Unpaid leave",
  family: "Family celebration",
} as const;

export type LeaveType = keyof typeof LEAVE_TYPES;

export const RECORD_STATUSES = {
  awaiting: "Awaiting decision",
  approved: "Approved",
  rejected: "Rejected",
  returned: "Returned for revision",
  cancelled: "Cancelled",
} as const;

export type RecordStatus = keyof typeof RECORD_STATUSES;

/** Спорідненість для «Family celebration» — список PM з AC-LEAVE-12 (вибір, а не текст: docs/spec-reading.md). */
export const RELATIONSHIPS = ["sibling", "child", "parent", "grandchild", "grandparent"] as const;

export type Relationship = (typeof RELATIONSHIPS)[number];

export const REQUEST_MESSAGES = {
  choosePosition: "Choose at least one position",
  relationship:
    "State your relationship to this person: sibling, child, parent, grandchild or grandparent. Not applicable to cousins, friends, neighbours or siblings-in-law",
  chooseLeaveType: "Choose a leave type",
} as const;

export interface ScheduleBlock extends TimeBlock {
  weekday: number;
}

export interface PositionSchedule {
  id: number;
  /** "Elementary school / Teacher" — підрозділ / посада. */
  label: string;
  kind: "main" | "additional";
  blocks: ScheduleBlock[];
}

export interface PositionDay {
  id: number;
  label: string;
  kind: "main" | "additional";
  blocks: TimeBlock[];
}

export function positionLabel(division: string, title: string): string {
  return `${division} / ${title}`;
}

export function isLeaveType(value: string): value is LeaveType {
  return Object.hasOwn(LEAVE_TYPES, value);
}

export function isRelationship(value: string): value is Relationship {
  return (RELATIONSHIPS as readonly string[]).includes(value);
}

export type DateCheck = { ok: true; positions: PositionDay[] } | { ok: false; message: string };

/** Посади, що мають розклад у день тижня дати, з їхніми блоками; основна — першою. Немає жодної — AC-LEAVE-06. */
export function positionsOnDate(positions: PositionSchedule[], date: string): DateCheck {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return { ok: false, message: TIME_MESSAGES.noWorkingHours };
  const weekday = isoWeekday(date);
  const onDate = positions
    .map((p) => ({
      id: p.id,
      label: p.label,
      kind: p.kind,
      blocks: sortBlocks(p.blocks.filter((b) => b.weekday === weekday).map(({ start, end }) => ({ start, end }))),
    }))
    .filter((p) => p.blocks.length > 0)
    .sort((a, b) => (a.kind === b.kind ? a.label.localeCompare(b.label) : a.kind === "main" ? -1 : 1));
  if (onDate.length === 0) return { ok: false, message: TIME_MESSAGES.noWorkingHours };
  return { ok: true, positions: onDate };
}

/** Що працівник вибрав для однієї посади на дату. */
export interface PositionChoice {
  positionId: number;
  include: boolean;
  wholeDay: boolean;
  /** "HH:MM", якщо не цілий день. */
  start?: string;
  end?: string;
}

export interface DraftRecord {
  positionId: number;
  date: string;
  start: number;
  end: number;
  minutes: number;
}

export type RecordsCheck =
  | { ok: true; records: DraftRecord[] }
  | { ok: false; message: string; positionId?: number };

/** Записи однієї дати: по одному на кожну включену посаду (AC-LEAVE-01…03), години — за розкладом (AC-LEAVE-04). */
export function buildDayRecords(date: string, positions: PositionDay[], choices: PositionChoice[]): RecordsCheck {
  const records: DraftRecord[] = [];
  for (const position of positions) {
    const choice = choices.find((c) => c.positionId === position.id);
    if (!choice?.include) continue;
    if (choice.wholeDay) {
      const day = wholeDay(position.blocks);
      records.push({ positionId: position.id, date, ...day });
      continue;
    }
    const start = parseTime(choice.start ?? "");
    const end = parseTime(choice.end ?? "");
    const check = checkHours(position.blocks, start, end);
    if (!check.ok) return { ok: false, message: check.message, positionId: position.id };
    records.push({ positionId: position.id, date, start: start!, end: end!, minutes: check.minutes });
  }
  if (records.length === 0) return { ok: false, message: REQUEST_MESSAGES.choosePosition };
  return { ok: true, records };
}

export type LeaveTypeCheck =
  | { ok: true; leaveType: LeaveType; relationship: Relationship | null }
  | { ok: false; message: string };

/** Тип відпустки; для «Family celebration» — ще й спорідненість. */
export function checkLeaveType(leaveType: string, relationship: string): LeaveTypeCheck {
  if (!isLeaveType(leaveType)) return { ok: false, message: REQUEST_MESSAGES.chooseLeaveType };
  if (leaveType !== "family") return { ok: true, leaveType, relationship: null };
  if (!isRelationship(relationship)) return { ok: false, message: REQUEST_MESSAGES.relationship };
  return { ok: true, leaveType, relationship };
}

/** Параметр p_records функції submit_leave_request. */
export function toRpcRecords(records: DraftRecord[]) {
  return records.map((r) => ({ position_id: r.positionId, date: r.date, start_min: r.start, end_min: r.end }));
}
