import type { createClient } from "@/lib/supabase/server";
import { positionLabel, type PositionSchedule } from "@/lib/leave/request";

type Supabase = Awaited<ReturnType<typeof createClient>>;

/** Власні посади працівника з тижневим розкладом. RLS показує менеджеру й чужі посади — тож фільтр за employee_id. */
export async function loadOwnPositions(supabase: Supabase, employeeId: string): Promise<PositionSchedule[]> {
  const { data, error } = await supabase
    .from("positions")
    .select("id, kind, title, division:divisions(name), schedule_blocks(weekday, start_min, end_min)")
    .eq("employee_id", employeeId);
  if (error) throw error;

  return (data ?? []).map((p) => ({
    id: p.id,
    label: positionLabel(p.division.name, p.title),
    kind: p.kind === "main" ? "main" : "additional",
    blocks: p.schedule_blocks.map((b) => ({ weekday: b.weekday, start: b.start_min, end: b.end_min })),
  }));
}
