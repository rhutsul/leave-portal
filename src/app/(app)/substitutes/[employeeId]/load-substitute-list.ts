import { substituteIdOf, toSubstituteOption, type SubstituteOption } from "@/lib/leave/substitutes";
import type { createClient } from "@/lib/supabase/server";

type Supabase = Awaited<ReturnType<typeof createClient>>;

export type SubstituteListLoad =
  | { kind: "denied" }
  | { kind: "failed" }
  | { kind: "ok"; email: string; position: string; members: SubstituteOption[]; options: SubstituteOption[] };

/**
 * Дані редактора списку замін (D6, D7): список, кандидати й сам працівник. Право вирішує база — substitute_list() і
 * substitute_candidates() без права відповідають 42501 (AC-SUBST-12); нечитабельний id і працівник, якого користувач не
 * веде, — та сама відмова: не розкриваємо, хто є.
 */
export async function loadSubstituteList(supabase: Supabase, rawId: string): Promise<SubstituteListLoad> {
  const employeeId = substituteIdOf(rawId);
  if (!employeeId) return { kind: "denied" };
  const [list, candidates, employees] = await Promise.all([
    supabase.rpc("substitute_list", { p_employee_id: employeeId }),
    supabase.rpc("substitute_candidates", { p_employee_id: employeeId }),
    supabase.rpc("manageable_employees"),
  ]);
  const errors = [list.error, candidates.error, employees.error];
  if (errors.some((e) => e?.code === "42501")) return { kind: "denied" };
  if (errors.some(Boolean)) return { kind: "failed" };
  const employee = (employees.data ?? []).find((e) => e.employee_id === employeeId);
  if (!employee) return { kind: "denied" };
  const self = toSubstituteOption({ ...employee, substitute_id: employee.employee_id });
  return {
    kind: "ok",
    email: self.email,
    position: self.position,
    members: (list.data ?? []).map(toSubstituteOption),
    options: (candidates.data ?? []).map((c) => toSubstituteOption({ ...c, substitute_id: c.profile_id })),
  };
}
