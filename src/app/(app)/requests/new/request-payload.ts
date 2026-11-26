import type { RequestPayload } from "@/lib/leave/draft";
import { toRpcRecords, type DraftRecord, type LeaveTypeCheck } from "@/lib/leave/request";
import { substituteIdOf } from "@/lib/leave/substitutes";

// Спільне для власної заявки (actions.ts) і заявки від імені (on-behalf/actions.ts, D10 impl-on-behalf): розбір
// прихованого поля форми й аргументи RPC подання.

type RawChoice = Partial<Record<keyof RequestPayload["choices"][number], unknown>>;

const textOrUndefined = (value: unknown) => (typeof value === "string" ? value : undefined);

function parseChoice(c: RawChoice): RequestPayload["choices"][number] {
  return {
    date: String(c.date),
    positionId: Number(c.positionId),
    include: c.include === true,
    wholeDay: c.wholeDay === true,
    start: textOrUndefined(c.start),
    end: textOrUndefined(c.end),
    substituteId: substituteIdOf(c.substituteId),
  };
}

function isPayloadShape(value: Partial<RequestPayload>): value is Partial<RequestPayload> & Pick<RequestPayload, "dates" | "leaveType" | "choices"> {
  return (
    Array.isArray(value.dates) &&
    value.dates.every((d) => typeof d === "string") &&
    typeof value.leaveType === "string" &&
    Array.isArray(value.choices) &&
    // Кожен вибір — об'єкт: `[null]` від підробленого клієнта — не заявка, а не виняток у server action (рев'ю CodeRabbit).
    value.choices.every((c: unknown) => typeof c === "object" && c !== null && !Array.isArray(c))
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
