"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { isRecordStatus } from "@/components/ui/status-badge";
import {
  checkDecision,
  DECISION_MESSAGES,
  isDecision,
  parseRecordId,
  reviewedHours,
  type Role,
} from "@/lib/leave/decision";
import { createClient } from "@/lib/supabase/server";

export interface DecideState {
  message: string;
}

const FAILED = "The decision could not be saved. Please try again.";
const ROLES: readonly string[] = ["employee", "manager", "admin"] satisfies Role[];

// Рішення щодо запису (/decisions). Спершу ті самі правила, що й decide_leave_record, чистими функціями
// (src/lib/leave/decision.ts) — для повідомлення; потім rpc, де база перевіряє все ще раз, сама рахує розподіл понад
// залишок і ухвалює лише перше рішення. Розподіл із форми не приходить — лише прапорець «з розподілом».
export async function decideRecord(_prev: DecideState, formData: FormData): Promise<DecideState> {
  const supabase = await createClient();
  const { data } = await supabase.auth.getClaims();
  const claims = data?.claims;
  if (!claims) redirect("/login");

  const recordId = parseRecordId(formData.get("record_id"));
  const decision = formData.get("decision");
  const comment = formData.get("comment") ?? "";
  if (recordId === null) return { message: DECISION_MESSAGES.noAccess };
  if (typeof decision !== "string" || !isDecision(decision) || typeof comment !== "string") return { message: FAILED };
  const split = formData.get("split") === "1";

  // decision_records віддає лише записи посад користувача (адміністратору — усі): немає рядка — немає доступу.
  const [{ data: profile, error: profileError }, { data: row, error: rowError }] = await Promise.all([
    supabase.from("profiles").select("role").eq("id", claims.sub).maybeSingle(),
    supabase.rpc("decision_records").eq("id", recordId).maybeSingle(),
  ]);
  if (profileError || rowError) return { message: FAILED };
  if (!profile || !ROLES.includes(profile.role)) return { message: DECISION_MESSAGES.noAccess };

  const target =
    row && isRecordStatus(row.status)
      ? { employeeId: row.employee_id, status: row.status, managerIds: profile.role === "manager" ? [claims.sub] : [] }
      : null;
  const check = checkDecision({ id: claims.sub, role: profile.role as Role }, target, decision, comment);
  // Запис уже не чекає рішення (інший менеджер вирішив — AC-DECIDE-07, або працівник скасував): форми для нього вже
  // немає, тож повідомлення показує панель запису за його поточним статусом.
  if (!check.ok && row && row.status !== "awaiting") redirect(`/decisions?record=${recordId}&notice=decided`);
  if (!check.ok) return { message: check.message };
  // Працівник міг змінити години, поки менеджер дивився запис: рішення — лише щодо тих годин, які він бачив. Тут —
  // для повідомлення; ті самі години decide_leave_record ще раз звіряє атомарно в update (одночасна зміна не пройде).
  if (!row || formData.get("hours") !== reviewedHours(row.start_min, row.end_min)) {
    revalidatePath("/decisions");
    return { message: DECISION_MESSAGES.hoursChanged };
  }

  const { error } = await supabase.rpc("decide_leave_record", {
    p_record_id: recordId,
    p_decision: decision,
    p_comment: check.comment ?? undefined,
    p_split: split,
    p_start_min: row.start_min,
    p_end_min: row.end_min,
  });
  if (error) {
    // Інший менеджер вирішив чи працівник скасував між читанням і rpc: те саме, що вище, — панель запису за статусом.
    if (error.code === "P0001") {
      const { data: now } = await supabase.rpc("decision_records").eq("id", recordId).maybeSingle();
      if (now && now.status !== "awaiting") {
        revalidatePath("/decisions");
        redirect(`/decisions?record=${recordId}&notice=decided`);
      }
    }
    // Залишок змінився з моменту рендеру (погодили інший запис — AC-BALANCE-14): оновлюємо сторінку, щоб попередження
    // й кнопка «Approve with split» відповідали стану бази; запис лишається в «Awaiting decision» разом із формою.
    revalidatePath("/decisions");
    // P0001 — тексти PM з функції бази (той самий другий рубіж); 42501 — без доступу; решту не показуємо.
    if (error.code === "P0001") return { message: error.message };
    if (error.code === "42501") return { message: DECISION_MESSAGES.noAccess };
    return { message: FAILED };
  }

  revalidatePath("/decisions");
  redirect(`/decisions?decided=${check.status}`);
}
