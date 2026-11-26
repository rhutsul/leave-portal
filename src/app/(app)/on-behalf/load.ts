import type { createClient } from "@/lib/supabase/server";
import { positionLabel, type PositionSchedule, type ScheduleBlock } from "@/lib/leave/request";
import { toSubstituteOption, type SubstituteOption } from "@/lib/leave/substitutes";

type Supabase = Awaited<ReturnType<typeof createClient>>;

/** Посада працівника для форми від імені: та сама форма, що в «New request», плюс чи погодиться запис одразу (D8). */
export interface OnBehalfPosition extends PositionSchedule {
  decides: boolean;
}

export type PositionsLoad = { ok: true; positions: OnBehalfPosition[] } | { ok: false; message: string | null };

type RawBlock = { weekday?: unknown; start_min?: unknown; end_min?: unknown };

const isBlock = (b: RawBlock): b is { weekday: number; start_min: number; end_min: number } =>
  [b?.weekday, b?.start_min, b?.end_min].every((n) => typeof n === "number");

function blocksOf(value: unknown): ScheduleBlock[] {
  const raw: RawBlock[] = Array.isArray(value) ? value : [];
  return raw.filter(isBlock).map((b) => ({ weekday: b.weekday, start: b.start_min, end: b.end_min }));
}

/**
 * Усі посади працівника з розкладом через on_behalf_positions (D8): і посади інших менеджерів (AC-BEHALF-02). Відмова
 * бази (AC-BEHALF-11, AC-BEHALF-12, AC-BEHALF-15) — її текст; інший збій — message: null.
 */
export async function loadOnBehalfPositions(supabase: Supabase, employeeId: string): Promise<PositionsLoad> {
  const { data, error } = await supabase.rpc("on_behalf_positions", { p_employee_id: employeeId });
  if (error) return { ok: false, message: error.message ?? null };
  return {
    ok: true,
    positions: (data ?? []).map((p) => ({
      id: p.id,
      label: positionLabel(p.division_name, p.title),
      title: p.title,
      kind: p.kind === "main" ? "main" : "additional",
      blocks: blocksOf(p.blocks),
      decides: p.decides === true,
    })),
  };
}

/** Список замін працівника (substitute_list зрізу substitutes); збій — null, і форма не показує поля «Substitute». */
export async function loadEmployeeSubstitutes(supabase: Supabase, employeeId: string): Promise<SubstituteOption[] | null> {
  const { data, error } = await supabase.rpc("substitute_list", { p_employee_id: employeeId });
  if (error) return null;
  return (data ?? []).map(toSubstituteOption);
}
