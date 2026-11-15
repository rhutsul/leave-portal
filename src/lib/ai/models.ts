// Взято з https://github.com/koldovsky/2026-quitcode-10-ai-features-hw/blob/main/materials/ai-feature/src/lib/ai/models.ts
import { createOpenRouter } from "@openrouter/ai-sdk-provider";

// Кандидати на 04.11.2026 (OpenRouter GET /api/v1/models), перевірено `npm run ai:models` 15.11.2026: усі три є.
// Безкоштовні моделі з'являються й зникають: перед роботою — `npm run ai:models`, якість — `npm run eval`.
// Порядок = пріоритет. Лише ID із `:free`: платна модель у списку fallback оплачується за її ціною.
// leave-portal (ADR 0009, оновлено 15.11): Nemotron — першою. Відповідь помічника календаря — суто структура
// (статус, дати, вид, час), а Nemotron — єдина з трьох зі строгою схемою (structured_outputs): менше відповідей не за
// схемою, які людина бачить як «недоступний» (AC-ASSIST-09). Golden cases PM — англійською (українські тексти поза
// зрізом), тож те, що української немає в картці Nemotron, тут не заважає. Gemma — запасні.
//   nemotron-3.5-super-vl     — строга схема (structured_outputs) і зображення; української в її картці немає.
//   gemma-4-31b / gemma-4-26b — найкраща заявка на багатомовність; НЕ мають structured_outputs: json_schema може бути
//     проігноровано, тому поля повторено в промпті, а zod — ворота.
export const PRODUCT_MODELS = [
  "nvidia/nemotron-3.5-super-vl:free",
  "google/gemma-4-31b-it:free",
  "google/gemma-4-26b-a4b-it:free",
] as const;

// Суддя для живого eval — інша родина, ніж основна модель продукту (не оцінює відповіді своєї родини).
// Якщо відповідь дала резервна Gemma 31B, суддя тієї ж родини: колонка modelId у звіті це показує.
export const JUDGE_MODEL = "google/gemma-4-31b-it:free";
// Запасні судді: 15.11 постачальник Gemma 31B відповів 429 при вільному ліміті акаунта (4 з 50) — без запасних
// такий 429 зупиняв увесь прогін. Спершу та сама родина Gemma, Nemotron (родина основної моделі) — останнім.
const JUDGE_FALLBACKS = ["google/gemma-4-26b-a4b-it:free", "nvidia/nemotron-3.5-super-vl:free"] as const;

// Фабрики приймають ключ параметром і НЕ читають process.env: так їх можна імпортувати в eval-скрипті.
// У коді застосунку модель бере лише src/lib/ai/openrouter.ts (server-only).
export function makeProductModel(apiKey: string | undefined) {
  const openrouter = createOpenRouter({ apiKey, appName: "QuitCode slice 4" });
  return openrouter.chat(PRODUCT_MODELS[0], {
    // OpenRouter пробує наступну модель при помилці, ліміті постачальника або простої.
    // Платформний ліміт безкоштовних моделей (20/хв, 50/день на акаунт) ланцюжок НЕ обходить.
    models: [...PRODUCT_MODELS],
    // Без provider.require_parameters: з ним OpenRouter може відкинути Gemma (немає structured_outputs).
    // PDF без нативної підтримки за замовчуванням іде в ПЛАТНИЙ mistral-ocr; cloudflare-ai — безкоштовний.
    plugins: [{ id: "file-parser", pdf: { engine: "cloudflare-ai" } }],
    // Портативний параметр `reasoning` з AI SDK 7 цей провайдер не передає — лише його власний.
    reasoning: { effort: "low", exclude: true },
  });
}

export function makeJudgeModel(apiKey: string | undefined) {
  const openrouter = createOpenRouter({ apiKey, appName: "QuitCode slice 4 eval" });
  return openrouter.chat(JUDGE_MODEL, { models: [JUDGE_MODEL, ...JUDGE_FALLBACKS] });
}
