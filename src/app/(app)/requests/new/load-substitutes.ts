import type { createClient } from "@/lib/supabase/server";
import { toSubstituteOption, type SubstituteOption } from "@/lib/leave/substitutes";

type Supabase = Awaited<ReturnType<typeof createClient>>;

/**
 * Власний список замін (AC-SUBST-04, AC-SUBST-11) через my_substitute_options() — профілі колег напряму не читаються.
 * Збій (зокрема функції ще немає, поки міграція не застосована, D11) — null: форма не показує поля «Substitute».
 */
export async function loadSubstituteOptions(supabase: Supabase): Promise<SubstituteOption[] | null> {
  const { data, error } = await supabase.rpc("my_substitute_options");
  if (error) return null;
  return (data ?? []).map(toSubstituteOption);
}
