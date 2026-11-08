"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { schoolYearOf } from "@/lib/leave/balance";
import { CALENDAR_MESSAGES } from "@/lib/leave/calendar";
import { isCalendarDate, parseTime } from "@/lib/leave/time";
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

/** Помилка rpc: P0001 — тексти PM з функції бази (AC-CAL-07, -10, -11); 42501 — не адміністратор; решту не показуємо. */
function rpcMessage(error: { code: string; message: string }): string {
  if (error.code === "P0001") return error.message;
  if (error.code === "42501") return CALENDAR_MESSAGES.adminOnly;
  return FAILED;
}

/**
 * «Add closure» (AC-CAL-01, -07, -08, -10, -11): цілі дні — дата початку й кінця; скорочений день — дата й час. Правила
 * перевіряє private.add_school_closure; тут — лише роль і читабельні поля (форма вже не дає надіслати порожні).
 */
export async function addClosure(_prev: ClosureActionState, form: FormData): Promise<ClosureActionState> {
  const { supabase, access } = await admin();
  if (!access.allowed) return { message: access.message, done: false };

  const name = String(form.get("name") ?? "").trim();
  const early = form.get("kind") === "early";
  const start = String(form.get(early ? "date" : "start") ?? "");
  const end = early ? start : String(form.get("end") ?? "");
  const closesAt = early ? parseTime(String(form.get("time") ?? "")) : null;
  if (!name || !isCalendarDate(start) || !isCalendarDate(end) || (early && closesAt == null)) {
    return { message: FAILED, done: false };
  }

  const { data: id, error } = await supabase.rpc("add_school_closure", {
    p_name: name,
    p_start: start,
    p_end: end,
    ...(early ? { p_closes_at: closesAt! } : {}),
  });
  if (error) return { message: rpcMessage(error), done: false };

  revalidatePath("/calendar");
  redirect(`/calendar?year=${schoolYearOf(start)}&added=${id}`);
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
