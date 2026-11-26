"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { DEPUTY_MESSAGES } from "@/lib/staff/deputy";
import { messageOfDbError, uuidOf } from "@/lib/staff/employee";
import { isCalendarDate } from "@/lib/leave/time";
import { createClient } from "@/lib/supabase/server";

export type DeputyActionState = { message: string; done: boolean };

async function signedIn() {
  const supabase = await createClient();
  const { data } = await supabase.auth.getClaims();
  if (!data?.claims) redirect("/login");
  return supabase;
}

function date(formData: FormData, name: string): string | null {
  const value = formData.get(name);
  return typeof value === "string" && isCalendarDate(value) ? value : null;
}

/**
 * Заступник відсутнього менеджера на період (AC-STAFF-09): лише адміністратор — база перевіряє право першим кроком,
 * і в обхід сторінки теж (AC-STAFF-14).
 */
export async function assignDeputy(_prev: DeputyActionState, formData: FormData): Promise<DeputyActionState> {
  const managerId = uuidOf(formData.get("manager_id"));
  const deputyId = uuidOf(formData.get("deputy_id"));
  const start = date(formData, "start");
  const end = date(formData, "end") ?? start;
  if (!managerId) return { message: DEPUTY_MESSAGES.noManager, done: false };
  if (!deputyId) return { message: DEPUTY_MESSAGES.noDeputy, done: false };
  if (!start || !end) return { message: DEPUTY_MESSAGES.noDates, done: false };

  const supabase = await signedIn();
  const { error } = await supabase.rpc("assign_deputy", {
    p_manager_id: managerId,
    p_deputy_id: deputyId,
    p_start: start,
    p_end: end,
  });
  if (error) return { message: messageOfDbError(error), done: false };
  revalidatePath("/staff/deputies");
  return { message: "", done: true };
}

/** Прибрати призначення: рішення, які заступник уже ухвалив, лишаються (D9). */
export async function removeDeputy(_prev: DeputyActionState, formData: FormData): Promise<DeputyActionState> {
  const id = Number(formData.get("assignment_id"));
  if (!Number.isInteger(id) || id <= 0) return { message: "The change was not saved. Please try again.", done: false };
  const supabase = await signedIn();
  const { error } = await supabase.rpc("remove_deputy", { p_assignment_id: id });
  if (error) return { message: messageOfDbError(error), done: false };
  revalidatePath("/staff/deputies");
  return { message: "", done: true };
}
