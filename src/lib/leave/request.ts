// Записи заявки з вибору працівника — чисті функції (D5 openspec/changes/impl-leave-ws6/design.md).
// Один запис — одна посада на одну дату (глосарій requirements/product.md); «цілий день» — усі блоки посади на дату.

import {
  checkHours,
  formatBlocks,
  formatRange,
  isoWeekday,
  parseTime,
  sortBlocks,
  TIME_MESSAGES,
  WEEKDAY_SHORT,
  wholeDay,
  type TimeBlock,
} from "./time";

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

export const RELATIONSHIP_LABELS: Record<Relationship, string> = {
  sibling: "Sibling",
  child: "Child",
  parent: "Parent",
  grandchild: "Grandchild",
  grandparent: "Grandparent",
};

/** Статуси, з якими запис блокує ті самі години посади (Assumptions 01-leave-request); як where у leave_records_no_overlap. */
export const BLOCKING_STATUSES = ["awaiting", "returned", "approved"] as const satisfies readonly RecordStatus[];

export const COMMENT_MAX = 500;

export const REQUEST_MESSAGES = {
  choosePosition: "Choose at least one position",
  relationship:
    "State your relationship to this person: sibling, child, parent, grandchild or grandparent. Not applicable to cousins, friends, neighbours or siblings-in-law",
  /** Тексти без AC PM — підказки форми. */
  chooseLeaveType: "Choose a leave type",
  chooseDate: "Choose at least one date",
  commentTooLong: `The comment can be at most ${COMMENT_MAX} characters`,
  overlap: (date: string, start: number, end: number) =>
    `You already have a request for this time: ${date} ${formatRange(start, end)}`,
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

export type RecordCheck = { ok: true; record: DraftRecord } | { ok: false; message: string };

/** Запис однієї включеної посади: цілий день — усі блоки, інакше години перевіряє checkHours. */
export function recordForChoice(date: string, position: PositionDay, choice: PositionChoice): RecordCheck {
  if (choice.wholeDay) return { ok: true, record: { positionId: position.id, date, ...wholeDay(position.blocks) } };
  const start = parseTime(choice.start ?? "");
  const end = parseTime(choice.end ?? "");
  const check = checkHours(position.blocks, start, end);
  if (!check.ok) return check;
  return { ok: true, record: { positionId: position.id, date, start: start!, end: end!, minutes: check.minutes } };
}

/** Записи однієї дати: по одному на кожну включену посаду (AC-LEAVE-01…03), години — за розкладом (AC-LEAVE-04). */
export function buildDayRecords(date: string, positions: PositionDay[], choices: PositionChoice[]): RecordsCheck {
  const records: DraftRecord[] = [];
  for (const position of positions) {
    const choice = choices.find((c) => c.positionId === position.id);
    if (!choice?.include) continue;
    const result = recordForChoice(date, position, choice);
    if (!result.ok) return { ok: false, message: result.message, positionId: position.id };
    records.push(result.record);
  }
  if (records.length === 0) return { ok: false, message: REQUEST_MESSAGES.choosePosition };
  return { ok: true, records };
}

/** Вибір для посади на конкретну дату заявки з кількома датами. */
export interface DateChoice extends PositionChoice {
  date: string;
}

export type RequestRecordsCheck =
  | { ok: true; records: DraftRecord[] }
  | { ok: false; message: string; date?: string; positionId?: number };

/**
 * Усі записи заявки: дати × включені посади, в одній заявці (AC-LEAVE-05). Кожна дата — як заявка на одну дату:
 * без розкладу — AC-LEAVE-06, без жодної посади — AC-LEAVE-10. Перша помилка зупиняє: заявку зберігаємо цілком.
 */
export function buildRequestRecords(
  positions: PositionSchedule[],
  dates: string[],
  choices: DateChoice[],
): RequestRecordsCheck {
  const unique = [...new Set(dates)].sort();
  if (unique.length === 0) return { ok: false, message: REQUEST_MESSAGES.chooseDate };
  const records: DraftRecord[] = [];
  for (const date of unique) {
    const day = positionsOnDate(positions, date);
    if (!day.ok) return { ok: false, message: day.message, date };
    const result = buildDayRecords(
      date,
      day.positions,
      choices.filter((c) => c.date === date),
    );
    if (!result.ok) return { ...result, date };
    records.push(...result.records);
  }
  return { ok: true, records };
}

/** Наявний запис посади, з яким нова заявка може перетнутися. */
export interface ExistingRecord {
  positionId: number;
  date: string;
  start: number;
  end: number;
  status: string;
}

/**
 * Перший (за датою й часом) наявний запис тієї самої посади й дати, з яким перетинається хоч один запис заявки
 * (AC-LEAVE-13, AC-LEAVE-16). Межі [start, end): суміжні записи не перетинаються. «Rejected» і «Cancelled» не
 * блокують. Той самий порядок і текст — у private.submit_leave_request (другий рубіж, тримає й одночасні заявки).
 */
export function findOverlap(records: DraftRecord[], existing: ExistingRecord[]): ExistingRecord | null {
  const conflicts = existing.filter(
    (e) =>
      (BLOCKING_STATUSES as readonly string[]).includes(e.status) &&
      records.some((r) => r.positionId === e.positionId && r.date === e.date && r.start < e.end && e.start < r.end),
  );
  conflicts.sort((a, b) => a.date.localeCompare(b.date) || a.start - b.start);
  return conflicts[0] ?? null;
}

export function overlapMessage(conflict: ExistingRecord): string {
  return REQUEST_MESSAGES.overlap(conflict.date, conflict.start, conflict.end);
}

/** Кількість символів так, як її рахує char_length у Postgres (кодові точки, не UTF-16). */
export function commentLength(comment: string): number {
  return [...comment.trim()].length;
}

export type CommentCheck = { ok: true; comment: string | null } | { ok: false; message: string };

/** Необов'язковий коментар заявки до 500 символів (AC-LEAVE-18); порожній — без коментаря, як nullif(btrim(…)) у базі. */
export function checkComment(comment: string): CommentCheck {
  const trimmed = comment.trim();
  if (commentLength(trimmed) > COMMENT_MAX) return { ok: false, message: REQUEST_MESSAGES.commentTooLong };
  return { ok: true, comment: trimmed === "" ? null : trimmed };
}

/** Тижневий розклад посади одним рядком: "Mon–Fri 08:30–15:30", "Mon, Wed–Fri 08:30–15:30; Tue 08:30–12:00, …". */
export function weeklySchedule(blocks: ScheduleBlock[]): string {
  const byDay = new Map<number, string>();
  for (let day = 1; day <= 7; day++) {
    const ofDay = blocks.filter((b) => b.weekday === day);
    if (ofDay.length) byDay.set(day, formatBlocks(ofDay));
  }
  // Дні з однаковими годинами — разом; поспіль ідучі дні — діапазоном.
  const groups = new Map<string, number[]>();
  for (const [day, hours] of byDay) groups.set(hours, [...(groups.get(hours) ?? []), day]);
  return [...groups.entries()]
    .map(([hours, days]) => {
      const ranges: string[] = [];
      for (let i = 0; i < days.length; i++) {
        let j = i;
        while (j + 1 < days.length && days[j + 1] === days[j] + 1) j++;
        const first = WEEKDAY_SHORT[days[i] - 1];
        const last = WEEKDAY_SHORT[days[j] - 1];
        ranges.push(j - i >= 2 ? `${first}–${last}` : j > i ? `${first}, ${last}` : first);
        i = j;
      }
      return `${ranges.join(", ")} ${hours}`;
    })
    .join("; ");
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
