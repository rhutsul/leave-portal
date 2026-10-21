import { computeBalances, parseBalanceInputs, type Balances } from "@/lib/leave/balance";
import type { createClient } from "@/lib/supabase/server";

type Supabase = Awaited<ReturnType<typeof createClient>>;

export type BalancesResult =
  | { ok: true; balances: Balances; employee: { id: string; name: string; email: string } }
  | { ok: false; reason: "not-shown" | "failed" };

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * Параметри /balances: `employee` — чужі залишки (порожній, як із вибору «My balances» у формі, чи власний id — свої);
 * `year` — рік початку навчального року 2000–2099 (перенесення рахується від першого року до запитаного, тож
 * рік на кшталт 9999 — лише зайві цикли), інакше — поточний.
 */
export function balancesQuery(
  params: { employee?: string | string[]; year?: string | string[] },
  ownId: string,
  currentYear: number,
): { employee: string | undefined; year: number } {
  const employee = typeof params.employee === "string" && params.employee !== "" && params.employee !== ownId
    ? params.employee
    : undefined;
  const year = typeof params.year === "string" && /^20\d{2}$/.test(params.year) ? Number(params.year) : currentYear;
  return { employee, year };
}

/**
 * Залишки працівника за навчальний рік. Кому їх показати, вирішує get_balance_inputs у базі (AC-BALANCE-12,
 * AC-BALANCE-13, AC-BALANCE-20): чужі залишки без права — помилка 42501, і сторінка їх не показує.
 */
export async function loadBalances(supabase: Supabase, employeeId: string, schoolYear: number): Promise<BalancesResult> {
  if (!UUID.test(employeeId)) return { ok: false, reason: "not-shown" };
  const { data, error } = await supabase.rpc("get_balance_inputs", {
    p_employee_id: employeeId,
    p_school_year: schoolYear,
  });
  if (error) return { ok: false, reason: error.code === "42501" ? "not-shown" : "failed" };

  const employee = (data as { employee?: { id: string; full_name: string | null; email: string | null } } | null)?.employee;
  return {
    ok: true,
    balances: computeBalances(parseBalanceInputs(data), schoolYear),
    employee: {
      id: employeeId,
      // Порожні full_name і email — усе одно є що показати, чиї це залишки.
      name: employee?.full_name || employee?.email || "Employee",
      email: employee?.email ?? "",
    },
  };
}
