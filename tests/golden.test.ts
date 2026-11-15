// Взято з https://github.com/koldovsky/2026-quitcode-10-ai-features-hw/blob/main/materials/ai-feature/tests/golden.test.ts
// і перероблено під помічника календаря (design.md D7–D8 impl-calendar-assistant).
import { APICallError } from "ai";
import { MockLanguageModelV4 } from "ai/test";
import { describe, expect, it } from "vitest";
import { DRAFT_PROMPT_VERSION } from "@/lib/ai/prompts/draft";
import { scoreOutcome, type GoldenCase } from "@/lib/ai/scorer";
import { ASSISTANT_MESSAGES, runAssistant } from "@/lib/ai/suggestions";
import casesJson from "./fixtures/golden/cases.json";
import recordedJson from "./fixtures/golden/recorded.json";

// Офлайн-реплей golden cases PM (requirements/05-calendar-assistant.md): без мережі й без ключа, тож працює в CI
// (`npm test`, job `app`). Реплей іде ТИМ САМИМ ланцюжком, що й дія `requestSuggestions` — модель → zod →
// checkSuggestions → стан, — тож перевіряє те, що бачить людина. Якість моделі міряє живий `npm run eval`.

type Recording = { modelId: string; recordedAt: string; promptVersion?: string; text: string };
const cases = casesJson as GoldenCase[];
const recorded = recordedJson as Record<string, Recording>;

const usage = {
  inputTokens: { total: 10, noCache: 10, cacheRead: undefined, cacheWrite: undefined },
  outputTokens: { total: 20, text: 20, reasoning: undefined },
};

// Модель, що «відповідає» записаним текстом.
function replay(text: string, modelId = "recorded") {
  return new MockLanguageModelV4({
    modelId,
    doGenerate: async () => ({
      content: [{ type: "text", text }],
      finishReason: { unified: "stop", raw: undefined },
      usage,
      warnings: [],
    }),
  });
}

async function replayCase(c: GoldenCase) {
  const rec = recorded[c.id];
  expect(rec, `немає запису для ${c.id} у recorded.json`).toBeDefined();
  const model = replay(rec.text, rec.modelId);
  const { outcome } = await runAssistant({ text: c.input, today: c.today }, model);
  // Недовірений вхід дійшов до моделі загорнутим як дані, а «сьогодні» — з golden case, не з годинника.
  const prompt = JSON.stringify(model.doGenerateCalls[0].prompt);
  expect(prompt).toContain("<document>");
  expect(prompt).toContain(`Today is ${c.today}`);
  return outcome;
}

// Назва — звичайний рядок, що ПОЧИНАЄТЬСЯ з AC ID (ac:coverage не рахує шаблонний рядок `${id} …` і .skip).
// Прив'язка кейсів до AC — design.md D7: стан ok → AC-ASSIST-01; needs_info → -05; відмова → -06; ін'єкція → -07.
const byId = (...ids: string[]) => cases.filter((c) => ids.includes(c.id));

describe("golden cases PM, офлайн-реплей", () => {
  it.each(byId("GC-01", "GC-02", "GC-03", "GC-04", "GC-05"))("AC-ASSIST-01: golden $id", async (c) => {
    const outcome = await replayCase(c);
    expect(scoreOutcome(c.expected, outcome).mismatches).toEqual([]);
  });

  it.each(byId("GC-06", "GC-07"))("AC-ASSIST-05: golden $id", async (c) => {
    const outcome = await replayCase(c);
    expect(scoreOutcome(c.expected, outcome).mismatches).toEqual([]);
    expect(outcome).toMatchObject({ message: expect.stringMatching(/^The calendar assistant needs more details: \S/) });
  });

  it.each(byId("GC-08", "GC-10"))("AC-ASSIST-06: golden $id", async (c) => {
    const outcome = await replayCase(c);
    expect(scoreOutcome(c.expected, outcome).mismatches).toEqual([]);
    expect(outcome).toEqual({ kind: "refused", message: ASSISTANT_MESSAGES.refused });
  });

  it.each(byId("GC-09"))("AC-ASSIST-07: golden $id", async (c) => {
    const outcome = await replayCase(c);
    expect(scoreOutcome(c.expected, outcome).mismatches).toEqual([]);
  });

  it("кожен golden case PM має запис, записаний поточною версією промпту", () => {
    expect(cases.map((c) => c.id)).toEqual(["GC-01", "GC-02", "GC-03", "GC-04", "GC-05", "GC-06", "GC-07", "GC-08", "GC-09", "GC-10"]);
    const missing = cases.map((c) => c.id).filter((id) => !recorded[id]);
    expect(missing).toEqual([]);
    const stale = Object.entries(recorded)
      .filter(([, r]) => r.promptVersion !== DRAFT_PROMPT_VERSION)
      .map(([id]) => id);
    // Змінили DRAFT_PROMPT_VERSION — перезапишіть записи живим прогоном (RECORD=1 npm run eval).
    expect(stale).toEqual([]);
  });
});

describe("AC-ASSIST-09: збої моделі — помічник недоступний", () => {
  const unavailable = { kind: "unavailable", message: ASSISTANT_MESSAGES.unavailable };

  it("AC-ASSIST-09: відповідь не за схемою → недоступний, жодної пропозиції", async () => {
    const { outcome } = await runAssistant({ text: "x", today: "2026-11-13" }, replay('{"status":"ok","closures":"many"}'));
    expect(outcome).toEqual({ ...unavailable, reason: "invalid_output" });
  });

  it("AC-ASSIST-09: 429 → недоступний, без повтору", async () => {
    const model = new MockLanguageModelV4({
      doGenerate: async () => {
        throw new APICallError({
          message: "Rate limit exceeded: free-models-per-day",
          url: "https://openrouter.ai/api/v1/chat/completions",
          requestBodyValues: {},
          statusCode: 429,
        });
      },
    });
    const { outcome } = await runAssistant({ text: "x", today: "2026-11-13" }, model);
    expect(outcome).toEqual({ ...unavailable, reason: "rate_limited" });
    expect(model.doGenerateCalls).toHaveLength(1);
  });

  it("AC-ASSIST-09: HTTP 200 з тілом помилки code 429 → недоступний", async () => {
    const model = new MockLanguageModelV4({
      doGenerate: async () => {
        throw new APICallError({
          message: "Provider returned error",
          url: "u",
          requestBodyValues: {},
          statusCode: 200,
          data: { code: 429, message: "upstream rate limit" },
        });
      },
    });
    const { outcome } = await runAssistant({ text: "x", today: "2026-11-13" }, model);
    expect(outcome).toEqual({ ...unavailable, reason: "rate_limited" });
    expect(model.doGenerateCalls).toHaveLength(1);
  });

  it("AC-ASSIST-09: модель не відповіла вчасно → недоступний", async () => {
    const model = new MockLanguageModelV4({
      doGenerate: async ({ abortSignal }) => {
        await new Promise((resolve, reject) => {
          const t = setTimeout(resolve, 5_000);
          abortSignal?.addEventListener("abort", () => {
            clearTimeout(t);
            reject(abortSignal.reason);
          });
        });
        throw new Error("unreachable");
      },
    });
    const { outcome } = await runAssistant({ text: "x", today: "2026-11-13" }, model, { timeoutMs: 50 });
    expect(outcome).toEqual({ ...unavailable, reason: "timeout" });
  });
});
