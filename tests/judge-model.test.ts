// Суддя живого eval називає модель, яка справді оцінила кейс (рев'ю викладача WS10: колонка «Суддя (модель)»).
// Без AC ID у назві: суддя — інструмент eval, а не поведінка продукту (AGENTS.md, «Дизайн-система», тести інструментів).
import { MockLanguageModelV4 } from "ai/test";
import { describe, expect, it } from "vitest";
import { judgeSummary } from "@/lib/ai/scorer";

const usage = {
  inputTokens: { total: 10, noCache: 10, cacheRead: undefined, cacheWrite: undefined },
  outputTokens: { total: 20, text: 20, reasoning: undefined },
};

describe("judgeSummary", () => {
  it("returns the model that answered, not the one that was asked first", async () => {
    // OpenRouter із ланцюжком `models` повертає в response.modelId запасну модель, якщо основна не відповіла.
    const judge = new MockLanguageModelV4({
      modelId: "google/gemma-4-31b-it:free",
      doGenerate: async () => ({
        content: [{ type: "text", text: JSON.stringify({ pass: true, reason: "ok" }) }],
        finishReason: { unified: "stop", raw: undefined },
        usage,
        warnings: [],
        response: { modelId: "nvidia/nemotron-3.5-super-vl:free" },
      }),
    });
    const verdict = await judgeSummary(judge, "must mention X", "X is missing");
    expect(verdict).toEqual({ pass: true, reason: "ok", modelId: "nvidia/nemotron-3.5-super-vl:free" });
  });
});
