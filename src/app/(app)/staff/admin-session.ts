import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";

/**
 * Хто керує працівниками (D10 openspec/changes/impl-staff-management/design.md): getClaims() (JWT; гість — на /login,
 * AC-STAFF-15), роль — з profiles, не з user_metadata. Це перший рубіж — сторінка показує відмову без даних
 * (AC-STAFF-13); другий — private.require_admin у кожній функції бази (і в обхід сторінок, AC-STAFF-14).
 */
export async function staffSession() {
  const supabase = await createClient();
  const { data } = await supabase.auth.getClaims();
  if (!data?.claims) redirect("/login");
  const userId = data.claims.sub;
  const { data: profile } = await supabase.from("profiles").select("role, deactivated_at").eq("id", userId).maybeSingle();
  const isAdmin = profile?.role === "admin" && !profile.deactivated_at;
  return { supabase, userId, isAdmin };
}
