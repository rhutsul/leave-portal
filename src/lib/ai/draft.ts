// Взято з https://github.com/koldovsky/2026-quitcode-10-ai-features-hw/blob/main/materials/ai-feature/src/lib/ai/draft.ts
// і перероблено під помічника календаря: лише вставлений текст (файли — поза зрізом), «сьогодні» — параметром.
import { APICallError, NoObjectGeneratedError, Output, RetryError, generateText, type LanguageModel } from "ai";
import { draftInstructions, wrapDocument } from "./prompts/draft";
import { CalendarSuggestionsSchema, type CalendarSuggestions } from "./schema";

// `ProviderOptions` не експортується з "ai" 7.0.162 — беремо тип із параметрів generateText.
type ProviderOptions = NonNullable<Parameters<typeof generateText>[0]["providerOptions"]>;

// Чиста функція: модель передають параметром. Застосунок передає модель OpenRouter (src/lib/ai/openrouter.ts),
// тести — MockLanguageModelV4 із записаною відповіддю. Тут немає `import "server-only"` і немає process.env,
// тому Vitest може імпортувати цей файл.

export type DraftInput = {
  text: string;
  /** «Сьогодні» за Києвом, "YYYY-MM-DD": від нього рахуються відносні дати й навчальний рік. */
  today: string;
};

export type DraftFailure = "invalid_output" | "rate_limited" | "timeout" | "provider_error";

export type DraftResult =
  | { ok: true; draft: CalendarSuggestions; modelId: string }
  | { ok: false; reason: DraftFailure; message: string };

export type DraftOptions = {
  maxRetries?: number;
  timeoutMs?: number;
  providerOptions?: ProviderOptions;
};

export async function proposeDraft(input: DraftInput, model: LanguageModel, opts: DraftOptions = {}): Promise<DraftResult> {
  try {
    const result = await generateText({
      model,
      instructions: draftInstructions(input.today), // `system` в AI SDK 7 застаріле
      messages: [{ role: "user", content: [{ type: "text", text: wrapDocument(input.text) }] }],
      output: Output.object({ name: "calendar_suggestions", schema: CalendarSuggestionsSchema }), // generateObject застарілий
      temperature: 0,
      // На безкоштовному тарифі повтор витрачає той самий денний ліміт: 0–1, не типові 2.
      maxRetries: opts.maxRetries ?? 0,
      timeout: opts.timeoutMs ?? 30_000, // AC-ASSIST-09: не відповів за 30 с — недоступний
      providerOptions: opts.providerOptions,
    });
    // result.output уже перевірено за схемою (інакше — виняток NoObjectGeneratedError).
    return { ok: true, draft: result.output, modelId: result.response.modelId };
  } catch (error) {
    return classifyError(error);
  }
}

export function classifyError(error: unknown): Extract<DraftResult, { ok: false }> {
  // Після повторів AI SDK загортає останню помилку в RetryError — спершу розгортаємо.
  const cause = RetryError.isInstance(error) ? error.lastError : error;
  if (NoObjectGeneratedError.isInstance(cause)) {
    return { ok: false, reason: "invalid_output", message: "model output did not match the schema" };
  }
  if (APICallError.isInstance(cause)) {
    // OpenRouter може відповісти HTTP 200 з тілом `error`; провайдер тоді кидає statusCode 200 + data.
    const code = cause.statusCode === 200 ? (cause.data as { code?: unknown } | undefined)?.code : cause.statusCode;
    if (code === 429 || code === "429") {
      return { ok: false, reason: "rate_limited", message: "free-model limit reached, try later" };
    }
  }
  if (cause instanceof Error && (cause.name === "TimeoutError" || cause.name === "AbortError")) {
    return { ok: false, reason: "timeout", message: "model did not answer in time" };
  }
  return { ok: false, reason: "provider_error", message: cause instanceof Error ? cause.message : String(cause) };
}
