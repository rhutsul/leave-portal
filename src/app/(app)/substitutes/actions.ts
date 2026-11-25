"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { substituteIdOf, SUBSTITUTE_MESSAGES } from "@/lib/leave/substitutes";
import { createClient } from "@/lib/supabase/server";

export interface SubstituteActionState {
  message: string;
}

const FAILED = "The substitute list could not be saved. Please try again.";

/** Код помилки PostgREST → текст для людини: без права — текст AC-SUBST-12, дубль — власний текст. */
function messageOf(code: string | undefined): string {
  if (code === "42501") return SUBSTITUTE_MESSAGES.notManager;
  if (code === "23505") return SUBSTITUTE_MESSAGES.alreadyOnList;
  return FAILED;
}

/**
 * Додати людину до списку замін працівника (AC-SUBST-01). Одна операція — insert під RLS (D1): без права база
 * відкидає його з 42501, тож перевірка на сторінці лише пояснює, а не захищає (AC-SUBST-12, AC-SUBST-13).
 */
export async function addSubstitute(_prev: SubstituteActionState, formData: FormData): Promise<SubstituteActionState> {
  const supabase = await createClient();
  const { data } = await supabase.auth.getClaims();
  if (!data?.claims) redirect("/login");

  const employeeId = substituteIdOf(formData.get("employeeId"));
  const substituteId = substituteIdOf(formData.get("substituteId"));
  if (!employeeId) return { message: SUBSTITUTE_MESSAGES.notManager };
  if (!substituteId) return { message: "Choose a person to add" };

  const { error } = await supabase.from("substitute_lists").insert({ employee_id: employeeId, substitute_id: substituteId });
  if (error) return { message: messageOf(error.code) };

  revalidatePath("/substitutes");
  redirect(`/substitutes/${employeeId}?added=${substituteId}`);
}

/**
 * Прибрати людину зі списку (D7). Без права RLS не дає помилки, а видаляє 0 рядків — тому видаляємо з поверненням
 * рядків, а 0 рядків без права теж вважаємо відмовою (той самий текст AC-SUBST-12). Наявні записи зберігають заміну
 * (Assumptions 06).
 */
export async function removeSubstitute(employeeId: string, substituteId: string): Promise<SubstituteActionState> {
  const supabase = await createClient();
  const { data } = await supabase.auth.getClaims();
  if (!data?.claims) redirect("/login");

  const employee = substituteIdOf(employeeId);
  const substitute = substituteIdOf(substituteId);
  if (!employee || !substitute) return { message: SUBSTITUTE_MESSAGES.notManager };

  const { data: deleted, error } = await supabase
    .from("substitute_lists")
    .delete()
    .eq("employee_id", employee)
    .eq("substitute_id", substitute)
    .select("substitute_id");
  if (error) return { message: messageOf(error.code) };
  if (!deleted || deleted.length === 0) {
    // 0 рядків: або права немає, або людину вже прибрали (повторне натискання). Право перевіряє substitute_list().
    const { error: denied } = await supabase.rpc("substitute_list", { p_employee_id: employee });
    if (denied) return { message: messageOf(denied.code) };
  }

  revalidatePath("/substitutes");
  revalidatePath(`/substitutes/${employee}`);
  return { message: "" };
}
