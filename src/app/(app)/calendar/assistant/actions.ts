"use server";

// Взято з https://github.com/koldovsky/2026-quitcode-10-ai-features-hw/blob/main/materials/ai-feature/src/app/ai-draft/actions.ts
// і перероблено під помічника календаря (design.md D4 impl-calendar-assistant). Два кроки, між ними — людина:
//   1. requestSuggestions — хто кличе (getClaims і роль), довжина тексту, модель → пропозиції. Нічого не пише.
//   2. saveSuggestions    — людина переглянула, виправила чи прибрала пропозиції й натиснула «Save closures»: ще раз
//                           роль, ті самі перевірки полів, що й «Add closure», і запис кожної пропозиції окремо через
//                           add_school_closure під сесією адміністратора (база перевіряє роль і правила вимоги 04).
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { PRODUCT_MODELS } from "@/lib/ai/models";
import { productModel } from "@/lib/ai/openrouter";
import {
  ASSISTANT_MESSAGES,
  ASSISTANT_TEXT_MAX,
  assistantTextLength,
  runAssistant,
  SUGGESTIONS_MAX,
  type Suggestion,
} from "@/lib/ai/suggestions";
import { schoolYearOf } from "@/lib/leave/balance";
import { closureRpcMessage } from "@/lib/leave/calendar";
import { parseClosureForm } from "@/lib/leave/closure-input";
import { kyivDate } from "@/lib/leave/time";
import { adminSession, insertClosure } from "../admin-session";

export type AssistantState =
  | { step: "idle" }
  | { step: "message"; tone: "warning" | "info" | "destructive"; message: string }
  /** `injectionSuspected` — у тексті є спроба керувати моделлю (detectInjection): форма просить перевірити уважніше. */
  | { step: "suggestions"; closures: Suggestion[]; injectionSuspected: boolean };

export interface SaveState {
  /** Пропозиції, які не збережено: індекс у надісланому списку й повідомлення (база — дослівно, AC-ASSIST-04). */
  failed: { index: number; message: string }[];
  saved: number;
}

/** Вигляд повідомлення стану (DESIGN.md, розділ 6): брак даних — попередження, відмова — довідка, збій — помилка. */
const TONE = { needs_info: "warning", refused: "info", unavailable: "destructive" } as const;

/**
 * «Suggest closures» (AC-ASSIST-01, -05…-11). Роль і довжину тексту перевіряємо ДО виклику моделі: інакше будь-хто
 * з акаунтом витратив би денний ліміт (50 запитів), а текст понад 2000 знаків пішов би моделі (AC-ASSIST-10).
 * Без ключа, на 429, таймаут 30 с чи відповідь не за схемою — повідомлення AC-ASSIST-09, без повтору.
 */
export async function requestSuggestions(_prev: AssistantState, form: FormData): Promise<AssistantState> {
  const { supabase, access } = await adminSession();
  if (!access.allowed) return { step: "message", tone: "destructive", message: access.message }; // AC-ASSIST-11

  const text = String(form.get("text") ?? "");
  if (!text.trim()) return { step: "idle" }; // кнопка вимкнена на порожньому полі; без JavaScript — нічого не робимо
  if (assistantTextLength(text) > ASSISTANT_TEXT_MAX) {
    return { step: "message", tone: "destructive", message: ASSISTANT_MESSAGES.tooLong }; // AC-ASSIST-10
  }

  const model = productModel();
  if (!model) return { step: "message", tone: "destructive", message: ASSISTANT_MESSAGES.unavailable };

  // Денний ліміт на користувача рахує база (рев'ю WS10, п. 1; private.take_ai_quota, 20 на добу за Києвом): лічильник
  // спільний для всіх екземплярів сервера. Понад ліміт чи збій лічильника — AC-ASSIST-09, модель не кличемо. Запит
  // списується й тоді, коли модель потім не відповість (429, таймаут): до постачальника він уже пішов.
  const { data: allowed, error } = await supabase.rpc("take_ai_quota");
  if (error || allowed !== true) {
    return { step: "message", tone: "destructive", message: ASSISTANT_MESSAGES.unavailable };
  }

  // WS11: один рядок llm.call у Runtime Logs Vercel — модель, затримка, токени, стан; без тексту адміністратора.
  const { outcome, injectionSuspected } = await runAssistant({ text, today: kyivDate(new Date()) }, model, {
    log: { requestId: crypto.randomUUID(), route: "/calendar/assistant", primaryModel: PRODUCT_MODELS[0] },
  });
  if (outcome.kind === "suggestions") {
    return { step: "suggestions", closures: outcome.closures, injectionSuspected };
  }
  return { step: "message", tone: TONE[outcome.kind], message: outcome.message };
}

/**
 * Одна пропозиція з форми (поля з префіксом s<i>.): ті самі поля й тексти помилок, що в «Add closure» (AC-CAL-18,
 * AC-CAL-19, Assumptions 04), потім add_school_closure; помилка бази — дослівно (AC-ASSIST-04).
 */
async function saveOne(
  supabase: Awaited<ReturnType<typeof adminSession>>["supabase"],
  form: FormData,
  index: number,
): Promise<{ ok: true; start: string } | { ok: false; message: string }> {
  const parsed = parseClosureForm((name) => String(form.get(`s${index}.${name}`) ?? ""));
  if (!parsed.ok) return { ok: false, message: parsed.message };
  const { error } = await insertClosure(supabase, parsed.input);
  return error ? { ok: false, message: closureRpcMessage(error) } : { ok: true, start: parsed.input.start };
}

/**
 * «Save closures» (AC-ASSIST-02, -03, -04): лише дія людини пише в базу. Кожна пропозиція — окремий виклик
 * add_school_closure під сесією адміністратора; ті, що пройшли, зберігаються, навіть якщо інші відхилено. Усе
 * збережено — перехід у шкільний календар, як після «Add closure».
 */
export async function saveSuggestions(_prev: SaveState, form: FormData): Promise<SaveState> {
  const { supabase, access } = await adminSession();
  const count = Number(form.get("count"));
  if (!Number.isSafeInteger(count) || count < 1 || count > SUGGESTIONS_MAX) return { failed: [], saved: 0 };
  const all = Array.from({ length: count }, (_, index) => index);
  if (!access.allowed) return { failed: all.map((index) => ({ index, message: access.message })), saved: 0 };

  const failed: SaveState["failed"] = [];
  const starts: string[] = [];
  for (const index of all) {
    const result = await saveOne(supabase, form, index);
    if (result.ok) starts.push(result.start);
    else failed.push({ index, message: result.message });
  }
  const saved = starts.length;

  if (saved > 0) revalidatePath("/calendar");
  if (failed.length === 0 && starts[0]) redirect(`/calendar?year=${schoolYearOf(starts[0])}`);
  return { failed, saved };
}
