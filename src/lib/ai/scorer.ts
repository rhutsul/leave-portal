// Взято з https://github.com/koldovsky/2026-quitcode-10-ai-features-hw/blob/main/materials/ai-feature/src/lib/ai/scorer.ts
// і перероблено під помічника календаря: порівнюємо СТАН, який бачить людина (після checkSuggestions), а не сиру
// відповідь моделі (design.md D7 impl-calendar-assistant).
import { Output, generateText, type LanguageModel } from "ai";
import { z } from "zod";
import type { ClosureKind } from "@/lib/leave/calendar";
import { parseTime } from "@/lib/leave/time";
import { JUDGE_INSTRUCTIONS, judgePrompt } from "./prompts/judge";
import type { AssistantOutcome, Suggestion } from "./suggestions";

/** Закриття з таблиці PM: час — "HH:MM", як у вимозі (у пропозиції — хвилини). */
type ExpectedClosure = { kind: ClosureKind; name: string; start: string; end: string; closesAt: string | null };

// Один golden case від PM (`requirements/05-calendar-assistant.md`, розділ «Golden cases»): вхід → очікуване.
export type GoldenCase = {
  id: string; // "GC-01"
  input: string; // дослівно з таблиці PM
  today: string; // «сьогодні» з вимоги — 2026-11-13
  // Лише те, що PM фіксує точно: стан і закриття (вид, назва, дати, час), у порядку дат. Порівнюється точно.
  expected: { status: "ok" | "needs_info" | "refused"; closures: ExpectedClosure[] };
  // Слова PM: що повідомлення для людини має / не має містити. Оцінює LLM-суддя лише в живому eval.
  rubric?: string;
};

const STATUS: Record<AssistantOutcome["kind"], string> = {
  suggestions: "ok",
  needs_info: "needs_info",
  refused: "refused",
  unavailable: "unavailable",
};

const toSuggestion = (c: ExpectedClosure): Suggestion => ({
  kind: c.kind,
  name: c.name,
  start: c.start,
  end: c.end,
  closesAt: c.closesAt == null ? null : parseTime(c.closesAt),
});

// (1) Детермінована частина: стан і закриття — точний збіг з таблицею PM.
export function scoreOutcome(expected: GoldenCase["expected"], outcome: AssistantOutcome) {
  const mismatches: { field: string; expected: unknown; actual: unknown }[] = [];
  if (STATUS[outcome.kind] !== expected.status) {
    mismatches.push({ field: "status", expected: expected.status, actual: STATUS[outcome.kind] });
  }
  const actual = outcome.kind === "suggestions" ? outcome.closures : [];
  const wanted = expected.closures.map(toSuggestion);
  if (JSON.stringify(actual) !== JSON.stringify(wanted)) {
    mismatches.push({ field: "closures", expected: wanted, actual });
  }
  return { pass: mismatches.length === 0, mismatches };
}

/** Текст, який бачить людина і який оцінює суддя за `rubric`: повідомлення стану або перелік пропозицій. */
export function shownText(outcome: AssistantOutcome): string {
  if (outcome.kind === "suggestions") return JSON.stringify(outcome.closures);
  return outcome.message;
}

// (2) Нечітка частина: LLM-суддя лише для вільного тексту, двійковий вердикт із причиною.
const Verdict = z.object({ pass: z.boolean(), reason: z.string().max(300) });
// modelId — хто з ланцюжка судді (основний і запасні, models.ts) справді оцінив: OpenRouter називає модель, що
// відповіла, у response.modelId. Звіт живого eval пише її в колонку «Суддя (модель)» (рев'ю викладача WS10): запасний
// суддя Nemotron — родина основної моделі, і без цієї колонки не видно, чи не оцінювала вона саму себе.
export type JudgeVerdict = z.infer<typeof Verdict> & { modelId: string };

export async function judgeSummary(judge: LanguageModel, rubric: string, summary: string): Promise<JudgeVerdict> {
  const { output, response } = await generateText({
    model: judge,
    instructions: JUDGE_INSTRUCTIONS,
    prompt: judgePrompt(rubric, summary),
    output: Output.object({ name: "verdict", schema: Verdict }),
    temperature: 0,
    maxRetries: 0, // повтор на безкоштовному тарифі витрачає той самий денний ліміт
  });
  return { ...output, modelId: response.modelId };
}

// Частка успіху (pass rate) — визначення з WS8: прогін на задачах із відомими відповідями (ключ) → бал.
export function passRate(results: { pass: boolean }[]): { passed: number; total: number; rate: number } {
  const passed = results.filter((r) => r.pass).length;
  return { passed, total: results.length, rate: results.length ? passed / results.length : 0 };
}
