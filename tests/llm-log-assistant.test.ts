// WS11, B: журнал llm.call у помічнику календаря (runAssistant з опцією `log`). Один рядок на виклик моделі: модель,
// затримка, токени, стан того, що побачила людина, fallback, версія промпту, id запиту — і жодного тексту
// адміністратора, промпту чи відповіді моделі. Без `log` (golden-реплей, живий eval) — журналу немає.
// Назви тестів без AC ID: це журнал експлуатації, а не поведінка за AC PM.
import { APICallError } from "ai";
import { MockLanguageModelV4 } from "ai/test";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { PRODUCT_MODELS } from "@/lib/ai/models";
import { DRAFT_PROMPT_VERSION } from "@/lib/ai/prompts/draft";
import { runAssistant } from "@/lib/ai/suggestions";

// Текст календаря з вигаданими персональними даними: жодна його частина не має опинитися в журналі.
const TEXT = "Teachers' meeting 20.11.2026, school closed. Contact olena.test@example.test, diagnosis note";
const MARKERS = ["Teachers", "meeting", "olena.test", "@example.test", "diagnosis", "<document>", "closures"];
const TODAY = "2026-11-13";
const log = { requestId: "3f0c2a9e-1b7d-4c55-9a3e-2f6d8e1c0b4a", route: "/calendar/assistant", primaryModel: PRODUCT_MODELS[0] };

const OK_ANSWER = JSON.stringify({
  status: "ok",
  closures: [{ kind: "whole_days", name: "Teachers' meeting", start: "2026-11-20", end: null, closesAt: null }],
  missing: null,
});

function answering(text: string, modelId: string = PRODUCT_MODELS[0]) {
  return new MockLanguageModelV4({
    modelId,
    doGenerate: async () => ({
      content: [{ type: "text", text }],
      finishReason: { unified: "stop", raw: undefined },
      usage: {
        inputTokens: { total: 612, noCache: 612, cacheRead: undefined, cacheWrite: undefined },
        outputTokens: { total: 144, text: 144, reasoning: undefined },
      },
      providerMetadata: { openrouter: { usage: { cost: 0 } } },
      warnings: [],
    }),
  });
}

describe("llm.call у runAssistant", () => {
  let info: ReturnType<typeof vi.spyOn>;
  let error: ReturnType<typeof vi.spyOn>;
  beforeEach(() => {
    info = vi.spyOn(console, "info").mockImplementation(() => {});
    error = vi.spyOn(console, "error").mockImplementation(() => {});
  });
  afterEach(() => vi.restoreAllMocks());

  const lines = () => [...info.mock.calls, ...error.mock.calls].map(([line]) => String(line));

  it("пише один рядок з моделлю, токенами, станом і версією промпту — без тексту адміністратора", async () => {
    const { outcome } = await runAssistant({ text: TEXT, today: TODAY }, answering(OK_ANSWER), { log });
    expect(outcome.kind).toBe("suggestions");
    expect(lines()).toHaveLength(1);
    const line = lines()[0];
    for (const marker of MARKERS) expect(line).not.toContain(marker);
    const parsed = JSON.parse(line);
    expect(parsed).toMatchObject({
      event: "llm.call",
      requestId: log.requestId,
      route: "/calendar/assistant",
      model: PRODUCT_MODELS[0],
      fallbackUsed: false,
      state: "ok",
      inputTokens: 612,
      outputTokens: 144,
      costUsd: 0,
      promptVersion: DRAFT_PROMPT_VERSION,
    });
    expect(parsed.latencyMs).toBeGreaterThanOrEqual(0);
    expect(parsed).not.toHaveProperty("errorKind");
  });

  it("відповідь запасної моделі позначає fallbackUsed", async () => {
    await runAssistant({ text: TEXT, today: TODAY }, answering(OK_ANSWER, PRODUCT_MODELS[1]), { log });
    expect(JSON.parse(lines()[0])).toMatchObject({ model: PRODUCT_MODELS[1], fallbackUsed: true });
  });

  it("відповідь, яку відкинув код, — стан unavailable з кодом invalid_output рівнем error", async () => {
    const invented = OK_ANSWER.replace("Teachers' meeting", "Every Monday");
    const { outcome } = await runAssistant({ text: TEXT, today: TODAY }, answering(invented), { log });
    expect(outcome.kind).toBe("unavailable");
    expect(info).not.toHaveBeenCalled();
    const parsed = JSON.parse(String(error.mock.calls[0][0]));
    expect(parsed).toMatchObject({ state: "unavailable", errorKind: "invalid_output", model: PRODUCT_MODELS[0] });
    expect(String(error.mock.calls[0][0])).not.toContain("Every Monday");
  });

  it("збій постачальника — unavailable з кодом причини, без тексту помилки", async () => {
    const model = new MockLanguageModelV4({
      doGenerate: async () => {
        throw new APICallError({
          message: `Rate limit for ${TEXT}`,
          url: "https://openrouter.ai/api/v1/chat/completions",
          requestBodyValues: { text: TEXT },
          statusCode: 429,
        });
      },
    });
    await runAssistant({ text: TEXT, today: TODAY }, model, { log });
    expect(lines()).toHaveLength(1);
    const line = lines()[0];
    for (const marker of [...MARKERS, "Rate limit"]) expect(line).not.toContain(marker);
    expect(JSON.parse(line)).toMatchObject({ state: "unavailable", errorKind: "rate_limited", model: PRODUCT_MODELS[0] });
    expect(JSON.parse(line)).not.toHaveProperty("inputTokens");
  });

  it("без опції log журналу немає", async () => {
    await runAssistant({ text: TEXT, today: TODAY }, answering(OK_ANSWER));
    expect(info).not.toHaveBeenCalled();
    expect(error).not.toHaveBeenCalled();
  });
});
