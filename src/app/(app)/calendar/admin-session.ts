import { redirect } from "next/navigation";
import type { ClosureInput } from "@/lib/leave/calendar";
import { createClient } from "@/lib/supabase/server";
import { manageAccess } from "./manage/access";

/**
 * Хто змінює шкільний календар: getClaims() (JWT; гість — на /login), роль — з profiles, не з user_metadata
 * (AC-CAL-12, AC-ASSIST-11). Спільне для сторінок «Add closure» і помічника календаря та їхніх дій. Це перший рубіж;
 * другий — private.add_school_closure у базі (AC-CAL-13).
 */
export async function adminSession() {
  const supabase = await createClient();
  const { data } = await supabase.auth.getClaims();
  if (!data?.claims) redirect("/login");
  const { data: profile } = await supabase.from("profiles").select("role").eq("id", data.claims.sub).maybeSingle();
  return { supabase, access: manageAccess(profile?.role ?? null) };
}

type Session = Awaited<ReturnType<typeof adminSession>>;

/**
 * Одне закриття через add_school_closure під сесією адміністратора: вид закриття — теж (скорочений день без часу база
 * не збереже, «Enter the closing time»). Правила й тексти вимоги 04 — у функції бази. Спільне для «Add closure» і
 * збереження пропозицій помічника (AC-ASSIST-02…04).
 */
export function insertClosure(supabase: Session["supabase"], input: ClosureInput) {
  return supabase.rpc("add_school_closure", {
    p_kind: input.kind,
    p_name: input.name,
    p_start: input.start,
    p_end: input.end,
    ...(input.closesAt != null ? { p_closes_at: input.closesAt } : {}),
  });
}
