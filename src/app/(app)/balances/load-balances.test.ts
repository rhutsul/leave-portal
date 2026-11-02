import { describe, expect, it, vi } from "vitest";
import { balancesQuery, loadBalances, loadRemaining, MAX_SCHOOL_YEAR, MIN_SCHOOL_YEAR } from "./load-balances";

const OWN = "a0000000-0000-0000-0000-000000000004";
const OTHER = "a0000000-0000-0000-0000-000000000005";

describe("/balances query", () => {
  it("«My balances» in the employee picker (employee=) and the own id both mean own balances", () => {
    expect(balancesQuery({ employee: "", year: "2026" }, OWN, 2026)).toEqual({ employee: undefined, year: 2026 });
    expect(balancesQuery({ employee: OWN }, OWN, 2026)).toEqual({ employee: undefined, year: 2026 });
    expect(balancesQuery({ employee: OTHER }, OWN, 2026)).toEqual({ employee: OTHER, year: 2026 });
    expect(balancesQuery({ employee: [OTHER, OWN] }, OWN, 2026).employee).toBeUndefined();
  });

  it("takes school years 2000–2099 and falls back to the current one", () => {
    expect(balancesQuery({ year: "2027" }, OWN, 2026).year).toBe(2027);
    expect(balancesQuery({ year: "9999" }, OWN, 2026).year).toBe(2026);
    expect(balancesQuery({ year: String(MIN_SCHOOL_YEAR) }, OWN, 2026).year).toBe(2000);
    expect(balancesQuery({ year: String(MAX_SCHOOL_YEAR) }, OWN, 2026).year).toBe(2099);
    expect(balancesQuery({ year: "1999" }, OWN, 2026).year).toBe(2026);
    expect(balancesQuery({ year: "2100" }, OWN, 2026).year).toBe(2026);
    expect(balancesQuery({ year: "" }, OWN, 2026).year).toBe(2026);
    expect(balancesQuery({ year: "2026abc" }, OWN, 2026).year).toBe(2026);
    expect(balancesQuery({ year: "2027.0" }, OWN, 2026).year).toBe(2026);
    expect(balancesQuery({ year: " 2027" }, OWN, 2026).year).toBe(2026);
    expect(balancesQuery({ year: ["2027"] }, OWN, 2026).year).toBe(2026);
  });
});

type Rpc = { data: unknown; error: { code: string } | null };

/** Клієнт Supabase для loadBalances — лише rpc, залежність на стику (сама відмова — у базі, tests/db/balances.test.ts). */
function clientWith(...responses: Rpc[]) {
  const rpc = vi.fn();
  for (const r of responses) rpc.mockResolvedValueOnce(r);
  return { rpc, client: { rpc } as unknown as Parameters<typeof loadBalances>[0] };
}

const inputs = (employee: { full_name: string | null; email: string | null } | null) => ({
  data: { employee, days: [], splits: [], carryovers: [] },
  error: null,
});

describe("loading balances", () => {
  // Чужі залишки відмовляє get_balance_inputs у базі (42501): це доводять tests/db/balances.test.ts і SQL-мутант S1
  // (npm run mutation:sql). Тут — лише що сторінка цю відмову не показує як залишки і не плутає з іншою помилкою.
  it("AC-BALANCE-13: the database refusal 42501 for another employee's balances means they are not shown", async () => {
    const { client, rpc } = clientWith({ data: null, error: { code: "42501" } }, { data: null, error: { code: "XX000" } });
    expect(await loadBalances(client, OTHER, 2026)).toEqual({ ok: false, reason: "not-shown" });
    expect(rpc).toHaveBeenCalledWith("get_balance_inputs", { p_employee_id: OTHER, p_school_year: 2026 });
    expect(await loadBalances(client, OTHER, 2026)).toEqual({ ok: false, reason: "failed" });
  });

  it("AC-BALANCE-13: a direct link with an employee id that is not a UUID shows no balances and asks nothing", async () => {
    const { client, rpc } = clientWith();
    for (const id of ["teacher2", "", `${OTHER}0`, `0${OTHER}`, OTHER.replace(/-/g, ""), OTHER.replace("a", "g")]) {
      expect(await loadBalances(client, id, 2026)).toEqual({ ok: false, reason: "not-shown" });
    }
    expect(rpc).not.toHaveBeenCalled();
  });

  it("names whose balances these are: the name, else the email, else «Employee»", async () => {
    const { client } = clientWith(
      inputs({ full_name: "Teacher Two", email: "teacher2@example.test" }),
      inputs({ full_name: "", email: "teacher2@example.test" }),
      inputs(null),
      { data: null, error: null },
    );
    const employee = async () => {
      const result = await loadBalances(client, OTHER, 2026);
      return result.ok ? result.employee : result;
    };
    expect(await employee()).toEqual({ id: OTHER, name: "Teacher Two", email: "teacher2@example.test" });
    expect(await employee()).toEqual({ id: OTHER, name: "teacher2@example.test", email: "teacher2@example.test" });
    expect(await employee()).toEqual({ id: OTHER, name: "Employee", email: "" });
    expect(await employee()).toEqual({ id: OTHER, name: "Employee", email: "" });
  });

  it("remaining days per school year load once per year; one failed year means «not checked» (null)", async () => {
    const ok = inputs({ full_name: "Teacher One", email: "teacher1@example.test" });
    const loaded = clientWith(ok, ok);
    const remaining = await loadRemaining(loaded.client, OWN, [2026, 2027, 2026]);
    expect(loaded.rpc).toHaveBeenCalledTimes(2);
    expect([...(remaining?.keys() ?? [])]).toEqual([2026, 2027]);
    expect(remaining?.get(2026)).toEqual({ sick: expect.any(Number), personal: expect.any(Number) });
    const failed = clientWith(ok, { data: null, error: { code: "XX000" } });
    expect(await loadRemaining(failed.client, OWN, [2026, 2027])).toBeNull();
  });
});
