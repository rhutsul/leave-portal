// Взято з https://github.com/koldovsky/2026-quitcode-10-ai-features-hw/blob/main/materials/ai-feature/src/lib/ai/schema.ts
// і перероблено під помічника календаря (openspec/specs/calendar-assistant, design.md D2 impl-calendar-assistant).
import { z } from "zod";

// Схема відповіді моделі: три стани й пропозиції закриттів.
//   ok         — у тексті є закриття з датами: пропозиції можна показати адміністратору на перевірку (AC-ASSIST-01);
//   needs_info — бракує даних (дат, часу закриття) або дата не існує: у `missing` — що саме (AC-ASSIST-05);
//   refused    — текст не про шкільний календар або лише намагається керувати помічником (AC-ASSIST-06, GC-10).
// Кожне поле обов'язкове, «невідоме» = null (не .optional()): строгий json_schema вимагає, щоб усі властивості
// були в required. Формати дат і часу — тут; чи дата справжня, чи кінець не раніше за початок і чи є час у
// скороченого дня — у коді (src/lib/ai/suggestions.ts, checkSuggestions): модель пропонує, сервер перевіряє.
export const ClosureSuggestionSchema = z.object({
  name: z.string().describe("the closure name exactly as written in the text, e.g. Winter break"),
  kind: z
    .enum(["whole_days", "early_dismissal"])
    .describe("whole_days = the school is closed all day; early_dismissal = the school closes at a time on one date"),
  start: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/)
    .describe("YYYY-MM-DD: first closed date (for early_dismissal — its only date)"),
  end: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/)
    .nullable()
    .describe("YYYY-MM-DD: last closed date, both included; equals start for one day; null for early_dismissal"),
  closesAt: z
    .string()
    .regex(/^\d{2}:\d{2}$/)
    .nullable()
    .describe("HH:MM closing time for early_dismissal; null for whole_days"),
});

export const CalendarSuggestionsSchema = z.object({
  status: z
    .enum(["ok", "needs_info", "refused"])
    .describe("ok = closures found; needs_info = details are missing or a date does not exist; refused = not a school calendar"),
  closures: z.array(ClosureSuggestionSchema).describe("suggested closures in date order; empty unless status is ok"),
  missing: z
    .string()
    .nullable()
    .describe("for needs_info: what is missing, in English, one short sentence; otherwise null"),
});

export type ClosureSuggestion = z.infer<typeof ClosureSuggestionSchema>;
export type CalendarSuggestions = z.infer<typeof CalendarSuggestionsSchema>;
