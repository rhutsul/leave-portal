import { z } from "zod";
import { CALENDAR_MESSAGES, closureNameError, type ClosureCheck, type ClosureInput } from "@/lib/leave/calendar";
import { isCalendarDate, parseTime } from "@/lib/leave/time";

// Окремо від calendar.ts: його імпортують клієнтські форми календаря, а схема zod потрібна серверу — діям
// «Add closure» і «Save closures» та перевірці відповіді моделі.

/**
 * Поля форми «Add closure» → дані для add_school_closure або перша помилка поля текстом PM: назва порожня чи довша за
 * 100 знаків (AC-CAL-18, AC-CAL-19), немає дат, скорочений день без часу (Assumptions 04-school-calendar). Решту
 * правил (AC-CAL-07, -10, -11, -17) перевіряє база; вона ж повторює й ці перевірки для виклику напряму.
 */
export function parseClosureForm(field: (name: string) => string): ClosureCheck {
  const early = field("kind") === "early";
  const start = field(early ? "date" : "start");
  const parsed = ClosureInputSchema.safeParse({
    kind: early ? "early_dismissal" : "whole_days",
    name: field("name"),
    start,
    end: early ? start : field("end"),
    closesAt: early ? parseTime(field("time")) : null,
  });
  return parsed.success ? { ok: true, input: parsed.data } : { ok: false, ...closureIssue(parsed.error) };
}

/**
 * Одне закриття, яке можна передати в add_school_closure: обов'язкові поля з текстами PM — назва (AC-CAL-18, AC-CAL-19),
 * справжні дати й час скороченого дня (Assumptions 04-school-calendar). Спільна для форми «Add closure»
 * (parseClosureForm), збереження пропозицій помічника і перевірки відповіді моделі (checkClosure у
 * src/lib/ai/suggestions.ts) — правила в одному місці (рев'ю WS10, п. 5). Решту (AC-CAL-07, -10, -11, -17) перевіряє база.
 */
export const ClosureInputSchema = z
  .object({
    kind: z.enum(["whole_days", "early_dismissal"]),
    name: z
      .string()
      .trim()
      .superRefine((name, ctx) => {
        const message = closureNameError(name);
        if (message) ctx.addIssue({ code: "custom", message });
      }),
    start: z.string().refine(isCalendarDate, { error: CALENDAR_MESSAGES.datesRequired }),
    end: z.string().refine(isCalendarDate, { error: CALENDAR_MESSAGES.datesRequired }),
    closesAt: z.number().int().nullable(),
  })
  .refine((c) => c.kind !== "early_dismissal" || c.closesAt != null, {
    path: ["closesAt"],
    error: CALENDAR_MESSAGES.timeRequired,
  }) satisfies z.ZodType<ClosureInput>;

const ISSUE_FIELD = { kind: "name", name: "name", start: "dates", end: "dates", closesAt: "time" } as const;
const FIELD_ORDER = ["name", "dates", "time"] as const;

/** Перша помилка ClosureInputSchema в порядку полів форми — назва, дати, час — з текстом PM. */
export function closureIssue(error: z.ZodError): { field: (typeof FIELD_ORDER)[number]; message: string } {
  const issues = error.issues.map((issue) => ({
    field: ISSUE_FIELD[String(issue.path[0]) as keyof typeof ISSUE_FIELD] ?? "name",
    message: issue.message,
  }));
  issues.sort((a, b) => FIELD_ORDER.indexOf(a.field) - FIELD_ORDER.indexOf(b.field));
  return issues[0] ?? { field: "name", message: CALENDAR_MESSAGES.nameRequired };
}

