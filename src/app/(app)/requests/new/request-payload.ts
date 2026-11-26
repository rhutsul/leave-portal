import type { RequestPayload } from "@/lib/leave/draft";
import { substituteIdOf } from "@/lib/leave/substitutes";

/** Заявка з прихованого поля форми (JSON від клієнта, якому не довіряємо): форма — або null. Спільне для власної заявки й заявки від імені (D10). */
export function parsePayload(raw: FormDataEntryValue | null): RequestPayload | null {
  if (typeof raw !== "string") return null;
  try {
    const value = JSON.parse(raw) as Partial<RequestPayload>;
    if (
      !Array.isArray(value.dates) ||
      !value.dates.every((d) => typeof d === "string") ||
      typeof value.leaveType !== "string" ||
      !Array.isArray(value.choices)
    ) {
      return null;
    }
    const choices = value.choices.map((c) => ({
      date: String(c.date),
      positionId: Number(c.positionId),
      include: c.include === true,
      wholeDay: c.wholeDay === true,
      start: typeof c.start === "string" ? c.start : undefined,
      end: typeof c.end === "string" ? c.end : undefined,
      substituteId: substituteIdOf(c.substituteId),
    }));
    return {
      dates: value.dates,
      leaveType: value.leaveType,
      relationship: String(value.relationship ?? ""),
      comment: typeof value.comment === "string" ? value.comment : "",
      choices,
    };
  } catch {
    return null;
  }
}
