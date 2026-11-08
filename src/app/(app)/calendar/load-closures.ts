import { toClosure, type Closure } from "@/lib/leave/calendar";
import type { createClient } from "@/lib/supabase/server";

type Supabase = Awaited<ReturnType<typeof createClient>>;

/**
 * Закриття шкільного календаря, що перетинають дати from…to (включно; "YYYY-MM-DD"). Читає кожен, хто увійшов
 * (RLS, AC-CAL-02). Помилку кидає: хто викликає, вирішує, що показати — дані заявки без закриттів були б хибними.
 */
export async function loadClosures(supabase: Supabase, from: string, to: string): Promise<Closure[]> {
  const { data, error } = await supabase
    .from("school_closures")
    .select("id, name, start_date, end_date, closes_at")
    .lte("start_date", to)
    .gte("end_date", from);
  if (error) throw error;
  return (data ?? []).map(toClosure);
}

/** Межі набору дат для loadClosures: найраніша й найпізніша. */
export function dateSpan(dates: readonly string[]): { from: string; to: string } | null {
  if (dates.length === 0) return null;
  const sorted = [...dates].sort();
  return { from: sorted[0], to: sorted[sorted.length - 1] };
}
