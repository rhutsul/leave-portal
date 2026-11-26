import type { ScheduleBlock } from "@/lib/leave/request";
import type { createClient } from "@/lib/supabase/server";

type Supabase = Awaited<ReturnType<typeof createClient>>;

export interface StaffPosition {
  id: number;
  kind: "main" | "additional";
  title: string;
  division: string;
  /** Усі версії розкладу (D7): з valid_from / valid_to. */
  blocks: ScheduleBlock[];
  managers: { id: string; name: string; email: string }[];
}

export interface Person {
  id: string;
  name: string;
  email: string;
}

/**
 * Посади працівника для сторінки адміністратора (D8): підрозділ, усі версії розкладу й відповідальні менеджери. RLS
 * показує адміністратору всі посади й профілі; embed `profiles` — з таблиці position_managers, де до profiles один
 * зовнішній ключ (у leave_records їх два — там лише з назвою ключа, PGRST201).
 */
export async function loadStaffPositions(supabase: Supabase, employeeId: string): Promise<StaffPosition[]> {
  const { data, error } = await supabase
    .from("positions")
    .select(
      "id, kind, title, division:divisions(name), schedule_blocks(weekday, start_min, end_min, valid_from, valid_to), position_managers(manager:profiles!position_managers_manager_id_fkey(id, full_name, email))",
    )
    .eq("employee_id", employeeId)
    .order("kind", { ascending: false })
    .order("id");
  if (error) throw error;
  return (data ?? []).map((p) => ({
    id: p.id,
    kind: p.kind === "main" ? "main" : "additional",
    title: p.title,
    division: p.division.name,
    blocks: p.schedule_blocks.map((b) => ({
      weekday: b.weekday,
      start: b.start_min,
      end: b.end_min,
      validFrom: b.valid_from,
      validTo: b.valid_to,
    })),
    managers: p.position_managers
      .map((m) => m.manager)
      .filter((m) => m != null)
      .map((m) => ({ id: m.id, name: m.full_name ?? m.email ?? "", email: m.email ?? "" })),
  }));
}

/** Хто може бути відповідальним менеджером (D8): активні manager і admin. */
export async function loadManagerCandidates(supabase: Supabase): Promise<Person[]> {
  const { data, error } = await supabase
    .from("profiles")
    .select("id, full_name, email")
    .in("role", ["manager", "admin"])
    .is("deactivated_at", null)
    .order("full_name");
  if (error) throw error;
  return (data ?? []).map((p) => ({ id: p.id, name: p.full_name ?? p.email ?? "", email: p.email ?? "" }));
}

export async function loadDivisions(supabase: Supabase): Promise<{ id: number; name: string }[]> {
  const { data, error } = await supabase.from("divisions").select("id, name").order("name");
  if (error) throw error;
  return data ?? [];
}
