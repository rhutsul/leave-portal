import { describe, expect, it } from "vitest";
import { balancesQuery } from "./load-balances";

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
    expect(balancesQuery({ year: "" }, OWN, 2026).year).toBe(2026);
    expect(balancesQuery({ year: "2026abc" }, OWN, 2026).year).toBe(2026);
  });
});
