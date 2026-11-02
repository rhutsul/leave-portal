// Спільне для Server Actions: хто ввійшов і з якою роллю. Клієнт Supabase — новий на кожен виклик (server.ts).
import { redirect } from "next/navigation";
import type { JwtPayload } from "@supabase/supabase-js";
import type { Role } from "@/lib/leave/decision";
import { createClient } from "./server";

type Supabase = Awaited<ReturnType<typeof createClient>>;

const ROLES: readonly string[] = ["employee", "manager", "admin"] satisfies Role[];

function isRole(value: unknown): value is Role {
  return typeof value === "string" && ROLES.includes(value);
}

/** Користувач, що ввійшов: клієнт цього запиту й claims, перевірені getClaims(); без входу — на /login. */
export async function requireUser() {
  const supabase = await createClient();
  const { data } = await supabase.auth.getClaims();
  const claims = data?.claims;
  if (!claims) redirect("/login");
  return { supabase, claims, userId: claims.sub };
}

export type RoleResult = { error: true } | { error: false; role: Role | null };

/**
 * Роль користувача. Якщо токен уже несе роль — без запиту до бази; інакше — з profiles.
 * null — профілю немає або роль невідома.
 */
export async function currentRole(supabase: Supabase, claims: JwtPayload): Promise<RoleResult> {
  const fromToken = claims.user_metadata?.role;
  if (isRole(fromToken)) return { error: false, role: fromToken };
  const { data, error } = await supabase.from("profiles").select("role").eq("id", claims.sub).maybeSingle();
  if (error) return { error: true };
  return { error: false, role: data && isRole(data.role) ? data.role : null };
}
