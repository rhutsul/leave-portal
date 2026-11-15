import type { LanguageModel } from "ai";
import { closureNameError, type ClosureKind } from "@/lib/leave/calendar";
import { isCalendarDate, parseTime } from "@/lib/leave/time";
import { proposeDraft, type DraftFailure, type DraftOptions } from "./draft";
import type { CalendarSuggestions, ClosureSuggestion } from "./schema";

/**
 * Помічник календаря (openspec/specs/calendar-assistant, design.md D2–D4 impl-calendar-assistant): що бачить
 * адміністратор після «Suggest closures». Модель пропонує, а цей модуль перевіряє відповідь кодом і перетворює її на
 * один зі станів AC з дослівними текстами. Чистий модуль: без process.env і без ключа — його імпортують дія, golden-
 * тести й живий eval, тож усі три бачать той самий результат.
 */

export const ASSISTANT_MESSAGES = {
  needsDetails: "The calendar assistant needs more details:", // AC-ASSIST-05
  refused: "The calendar assistant only helps to add school closures. Paste the text of the school calendar.", // AC-ASSIST-06
  unavailable: "The calendar assistant is unavailable right now. Try again later or add closures manually.", // AC-ASSIST-09
  tooLong: "The text can be at most 2000 characters", // AC-ASSIST-10
  preparing: "Preparing suggestions…", // AC-ASSIST-08
} as const;

/** Найдовший текст календаря (AC-ASSIST-10). */
export const ASSISTANT_TEXT_MAX = 2000;

/**
 * Найбільше пропозицій за одну відповідь — і за одне збереження (`saveSuggestions`): довший список відповідь
 * непридатна (AC-ASSIST-09), інакше форма показала б те, що «Save closures» потім не прийме.
 */
export const SUGGESTIONS_MAX = 50;

/** Найдовше пояснення «чого бракує» від моделі, яке показуємо людині. */
const MISSING_MAX = 300;

/**
 * Довжина тексту в знаках — однаково у формі й на сервері (design.md D1): переноси рядків браузер надсилає як CRLF,
 * тож спершу CRLF → LF; далі кодові точки, як closureNameLength (емодзі — один знак, а не два UTF-16).
 */
export function assistantTextLength(text: string): number {
  return [...text.replace(/\r\n/g, "\n")].length;
}

/** Пропозиція закриття, перевірена кодом: ті самі поля, що в «Add closure», час — хвилини від півночі. */
export interface Suggestion {
  kind: ClosureKind;
  name: string;
  start: string;
  end: string;
  closesAt: number | null;
}

export type AssistantOutcome =
  | { kind: "suggestions"; closures: Suggestion[] } // AC-ASSIST-01, -07
  | { kind: "needs_info"; message: string } // AC-ASSIST-05
  | { kind: "refused"; message: string } // AC-ASSIST-06
  | { kind: "unavailable"; message: string; reason: DraftFailure }; // AC-ASSIST-09

const unavailable = (reason: DraftFailure): Extract<AssistantOutcome, { kind: "unavailable" }> => ({
  kind: "unavailable",
  message: ASSISTANT_MESSAGES.unavailable,
  reason,
});
const needsInfo = (what: string): Extract<AssistantOutcome, { kind: "needs_info" }> => ({
  kind: "needs_info",
  message: `${ASSISTANT_MESSAGES.needsDetails} ${what}`,
});

const MONTHS = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October",
  "November", "December"];

/** "2027-02-31" → "31 February 2027" — як дату пише людина (GC-07); формат, що не схожий на дату, — як є. */
function humanDate(date: string): string {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(date);
  const month = match ? MONTHS[Number(match[2]) - 1] : undefined;
  return match && month ? `${Number(match[3])} ${month} ${match[1]}` : date;
}

/** Час скороченого дня: 00:05–23:55 з кроком 5 хвилин, як перевіряє база (private.add_school_closure). */
function closingMinutes(value: string): number | null {
  const minutes = parseTime(value);
  return minutes != null && minutes >= 5 && minutes <= 1435 && minutes % 5 === 0 ? minutes : null;
}

/**
 * Відповідь моделі (уже за схемою zod) → стан для людини (design.md D2). Правила, які можна перевірити кодом, — тут:
 * - refused → відмова AC-ASSIST-06 без пропозицій, навіть якщо модель їх повернула;
 * - needs_info → повідомлення AC-ASSIST-05 з тим, чого бракує; без `missing` — відповідь непридатна;
 * - дата, якої не існує, чи скорочений день без часу → needs_info текстом коду, без підстановки іншої дати (GC-06, GC-07);
 * - понад SUGGESTIONS_MAX закриттів, кінець раніше за початок, час поза 00:05–23:55 чи не кратний 5 хв, порожня назва чи понад 100 знаків, ok без
 *   жодного закриття → відповідь непридатна: «недоступний» (AC-ASSIST-09), а не «майже пропозиція»;
 * - пропозиції — за датою початку (GC-03).
 */
export function checkSuggestions(draft: CalendarSuggestions): AssistantOutcome {
  if (draft.status === "refused") return { kind: "refused", message: ASSISTANT_MESSAGES.refused };
  if (draft.status === "needs_info") return checkMissing(draft.missing);
  if (draft.closures.length === 0 || draft.closures.length > SUGGESTIONS_MAX) return unavailable("invalid_output");

  const closures: Suggestion[] = [];
  for (const c of draft.closures) {
    const checked = checkClosure(c);
    if ("message" in checked) return checked;
    closures.push(checked);
  }
  closures.sort((a, b) => a.start.localeCompare(b.start));
  return { kind: "suggestions", closures };
}

/** Стан замість усіх пропозицій, коли одне закриття з відповіді не пройшло перевірку. */
type Problem = Exclude<AssistantOutcome, { kind: "suggestions" }>;

/** needs_info: що саме бракує — непорожнє й не довше за MISSING_MAX, інакше відповідь непридатна. */
function checkMissing(missing: string | null): AssistantOutcome {
  const text = missing?.trim() ?? "";
  return text && [...text].length <= MISSING_MAX ? needsInfo(text) : unavailable("invalid_output");
}

/** Одне закриття з відповіді: перевірена пропозиція або стан, який людина бачить замість усіх пропозицій. */
function checkClosure(c: ClosureSuggestion): Suggestion | Problem {
  const name = c.name.trim();
  if (closureNameError(name)) return unavailable("invalid_output");
  const end = c.end ?? c.start;
  const missingDate = [c.start, end].find((date) => !isCalendarDate(date));
  if (missingDate) return needsInfo(`${humanDate(missingDate)} does not exist.`);
  return c.kind === "early_dismissal" ? checkEarly(c, name, end) : checkWholeDays(c, name, end);
}

function checkEarly(c: ClosureSuggestion, name: string, end: string): Suggestion | Problem {
  if (c.closesAt == null) return needsInfo(`the closing time for "${name}" on ${humanDate(c.start)}.`);
  const closesAt = closingMinutes(c.closesAt);
  if (closesAt == null || end !== c.start) return unavailable("invalid_output");
  return { kind: "early_dismissal", name, start: c.start, end: c.start, closesAt };
}

function checkWholeDays(c: ClosureSuggestion, name: string, end: string): Suggestion | Problem {
  if (end < c.start || c.closesAt != null) return unavailable("invalid_output");
  return { kind: "whole_days", name, start: c.start, end, closesAt: null };
}

export type AssistantRun = { outcome: AssistantOutcome; modelId: string | null; draft: CalendarSuggestions | null };

/**
 * Увесь ланцюжок помічника: модель → схема zod → checkSuggestions → стан. Його викликають дія `requestSuggestions`,
 * офлайн-реплей golden cases і живий eval (design.md D7) — тож golden перевіряє те, що бачить людина. Збій виклику
 * (немає відповіді за 30 с, 429, відповідь не за схемою, помилка постачальника) — стан AC-ASSIST-09, без повторів.
 */
export async function runAssistant(
  input: { text: string; today: string },
  model: LanguageModel,
  opts: DraftOptions = {},
): Promise<AssistantRun> {
  const result = await proposeDraft(input, model, { maxRetries: 0, timeoutMs: 30_000, ...opts });
  if (!result.ok) return { outcome: unavailable(result.reason), modelId: null, draft: null };
  return { outcome: checkSuggestions(result.draft), modelId: result.modelId, draft: result.draft };
}
