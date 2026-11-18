"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { schoolYearOf } from "@/lib/leave/balance";
import { CLOSURE_FAILED, closureRpcMessage } from "@/lib/leave/calendar";
import { parseClosureForm } from "@/lib/leave/closure-input";
import { adminSession, insertClosure } from "./admin-session";

export interface ClosureActionState {
  message: string;
  done: boolean;
}

/**
 * «Add closure» (AC-CAL-01, -07, -08, -10, -11, -17, -18, -19): цілі дні — дата початку й кінця; скорочений день — дата
 * й час. Правила перевіряє private.add_school_closure; тут — роль і обов'язкові поля з текстами PM.
 */
export async function addClosure(_prev: ClosureActionState, form: FormData): Promise<ClosureActionState> {
  const { supabase, access } = await adminSession();
  if (!access.allowed) return { message: access.message, done: false };

  // AC-CAL-18, AC-CAL-19: форма перевіряє поля сама, а тут — те саме для відправки без JavaScript.
  const parsed = parseClosureForm((name) => String(form.get(name) ?? ""));
  if (!parsed.ok) return { message: parsed.message, done: false };
  const input = parsed.input;

  const { data: id, error } = await insertClosure(supabase, input);
  if (error) return { message: closureRpcMessage(error), done: false };

  revalidatePath("/calendar");
  const year = schoolYearOf(input.start);
  redirect(id == null ? `/calendar?year=${year}` : `/calendar?year=${year}&added=${id}`);
}

/** «Remove closure» (AC-CAL-09): записів не змінює — дні знову робочі за розкладами. */
export async function removeClosure(_prev: ClosureActionState, form: FormData): Promise<ClosureActionState> {
  const { supabase, access } = await adminSession();
  if (!access.allowed) return { message: access.message, done: false };

  const id = Number(form.get("closure_id"));
  if (!Number.isSafeInteger(id) || id <= 0) return { message: CLOSURE_FAILED, done: false };

  const { error } = await supabase.rpc("remove_school_closure", { p_id: id });
  if (error) return { message: closureRpcMessage(error), done: false };

  revalidatePath("/calendar");
  return { message: "", done: true };
}
