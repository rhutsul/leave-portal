"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { schoolYearOf } from "@/lib/leave/balance";
import { CALENDAR_MESSAGES, parseClosureForm } from "@/lib/leave/calendar";
import { createClient } from "@/lib/supabase/server";
import { manageAccess } from "./manage/access";

export interface ClosureActionState {
  message: string;
  done: boolean;
}

const FAILED = "The school calendar could not be changed. Please try again.";

/** Хто діє: getClaims() (JWT), роль — з profiles (не з user_metadata). База перевіряє роль удруге (AC-CAL-13). */
async function admin() {
  const supabase = await createClient();
  const { data } = await supabase.auth.getClaims();
  if (!data?.claims) redirect("/login");
  const { data: profile } = await supabase.from("profiles").select("role").eq("id", data.claims.sub).maybeSingle();
  return { supabase, access: manageAccess(profile?.role ?? null) };
}

/** Помилка rpc: P0001 — тексти PM з функції бази (AC-CAL-07, -10, -11, -17, -18, -19); 42501 — не адміністратор; решту не показуємо. */
function rpcMessage(error: { code: string; message: string }): string {
  if (error.code === "P0001") return error.message;
  if (error.code === "42501") return CALENDAR_MESSAGES.adminOnly;
  return FAILED;
}

/**
 * «Add closure» (AC-CAL-01, -07, -08, -10, -11, -17, -18, -19): цілі дні — дата початку й кінця; скорочений день — дата
 * й час. Правила перевіряє private.add_school_closure; тут — роль і обов'язкові поля з текстами PM.
 */
export async function addClosure(_prev: ClosureActionState, form: FormData): Promise<ClosureActionState> {
  const { supabase, access } = await admin();
  if (!access.allowed) return { message: access.message, done: false };

  // AC-CAL-18, AC-CAL-19: форма перевіряє поля сама, а тут — те саме для відправки без JavaScript.
  const parsed = parseClosureForm((name) => String(form.get(name) ?? ""));
  if (!parsed.ok) return { message: parsed.message, done: false };
  const input = parsed.input;

  const { data: id, error } = await supabase.rpc("add_school_closure", {
    p_name: input.name,
    p_start: input.start,
    p_end: input.end,
    ...(input.closesAt != null ? { p_closes_at: input.closesAt } : {}),
  });
  if (error) return { message: rpcMessage(error), done: false };

  revalidatePath("/calendar");
  const year = schoolYearOf(input.start);
  redirect(id == null ? `/calendar?year=${year}` : `/calendar?year=${year}&added=${id}`);
}

/** «Remove closure» (AC-CAL-09): записів не змінює — дні знову робочі за розкладами. */
export async function removeClosure(_prev: ClosureActionState, form: FormData): Promise<ClosureActionState> {
  const { supabase, access } = await admin();
  if (!access.allowed) return { message: access.message, done: false };

  const id = Number(form.get("closure_id"));
  if (!Number.isSafeInteger(id) || id <= 0) return { message: FAILED, done: false };

  const { error } = await supabase.rpc("remove_school_closure", { p_id: id });
  if (error) return { message: rpcMessage(error), done: false };

  revalidatePath("/calendar");
  return { message: "", done: true };
}
