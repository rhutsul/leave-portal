import type { RequestPayload } from "@/lib/leave/draft";
import { toRpcRecords, type DraftRecord, type LeaveTypeCheck } from "@/lib/leave/request";
import { substituteIdOf } from "@/lib/leave/substitutes";

// Спільне для власної заявки (actions.ts) і заявки від імені (on-behalf/actions.ts, D10 impl-on-behalf): розбір
// прихованого поля форми й аргументи RPC подання.

type RawChoice = Partial<Record<keyof RequestPayload["choices"][number], unknown>>;

const textOrUndefined = (value: unknown) => (typeof value === "string" ? value : undefined);

function parseChoice(c: RawChoice): RequestPayload["choices"][number] {
  return {
    date: c.date as string,
    positionId: c.positionId as number,
    include: c.include === true,
    wholeDay: c.wholeDay === true,
    start: textOrUndefined(c.start),
    end: textOrUndefined(c.end),
    substituteId: substituteIdOf(c.substituteId),
  };
}

function isChoiceShape(c: unknown): boolean {
  if (typeof c !== "object" || c === null || Array.isArray(c)) return false;
  const choice = c as RawChoice;
  return typeof choice.date === "string" && typeof choice.positionId === "number";
}

function isPayloadShape(value: Partial<RequestPayload>): value is Partial<RequestPayload> & Pick<RequestPayload, "dates" | "leaveType" | "choices"> {
  return (
    Array.isArray(value.dates) &&
    value.dates.every((d) => typeof d === "string") &&
    typeof value.leaveType === "string" &&
    Array.isArray(value.choices) &&
    ["string", "undefined"].includes(typeof value.relationship) &&
    // Кожен вибір — об'єкт із датою-рядком і числом посади: `[null]` чи `{date: {…}}` від підробленого клієнта — не
    // заявка, а не виняток у server action (рев'ю CodeRabbit).
    value.choices.every(isChoiceShape)
  );
}

/** Заявка з прихованого поля форми (JSON від клієнта, якому не довіряємо): форма — або null. */
export function parsePayload(raw: FormDataEntryValue | null): RequestPayload | null {
  if (typeof raw !== "string") return null;
  let value: Partial<RequestPayload>;
  try {
    value = JSON.parse(raw) as Partial<RequestPayload>;
  } catch {
    return null;
  }
  if (!value || !isPayloadShape(value)) return null;
  return {
    dates: value.dates,
    leaveType: value.leaveType,
    relationship: String(value.relationship ?? ""),
    comment: textOrUndefined(value.comment) ?? "",
    choices: value.choices.map((c) => parseChoice(c as RawChoice)),
  };
}

/** Тип, записи й коментар заявки → спільні аргументи submit_leave_request і submit_leave_request_on_behalf. */
export function requestRpcArgs(
  type: Extract<LeaveTypeCheck, { ok: true }>,
  records: DraftRecord[],
  comment: string | null,
) {
  return {
    p_leave_type: type.leaveType,
    p_records: toRpcRecords(records),
    p_relationship: type.relationship ?? undefined,
    p_comment: comment ?? undefined,
  };
}
