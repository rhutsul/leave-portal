// Завантаження реєстру для /register і CSV (ADR 0012) — ініціатива розробника до вимог PM, тож без AC ID у назвах.
// Хто що бачить, вирішує база (tests/db/approved-register.test.ts); тут — лише стик: вибір підрозділу й місяця, помилки.
import { describe, expect, it, vi } from "vitest";
import { CSV_HEADER } from "@/lib/register/csv";
import { loadRegister, registerExport, type RegisterLoad } from "./load-register";

type Rpc = { data: unknown; error: { code: string } | null };

const DIVISIONS = [
  { id: 2, code: "elementary", name: "Elementary school" },
  { id: 3, code: "high", name: "High school" },
];
const NOW = new Date("2026-11-24T10:00:00Z");

function clientWith(...responses: Rpc[]) {
  const rpc = vi.fn();
  for (const r of responses) rpc.mockResolvedValueOnce(r);
  return { rpc, client: { rpc } as unknown as Parameters<typeof loadRegister>[0] };
}

describe("loading the register page", () => {
  it("defaults to the first division and the current Kyiv month", async () => {
    const { rpc, client } = clientWith({ data: DIVISIONS, error: null }, { data: [{ record_id: 1 }], error: null });
    const result = await loadRegister(client, {}, { now: NOW });
    expect(result).toEqual({
      ok: true,
      divisions: DIVISIONS,
      division: DIVISIONS[0],
      month: "2026-11",
      monthLabel: "November 2026",
      currentMonth: "2026-11",
      rows: [{ record_id: 1 }],
    });
    expect(rpc).toHaveBeenNthCalledWith(1, "register_divisions");
    expect(rpc).toHaveBeenNthCalledWith(2, "approved_register", { p_division_id: 2, p_month: "2026-11-01" });
  });

  it("uses the division and month from the address", async () => {
    const { rpc, client } = clientWith({ data: DIVISIONS, error: null }, { data: null, error: null });
    const result = await loadRegister(client, { division: "high", month: "2026-10" }, { now: NOW });
    expect(result.ok && [result.division.code, result.month, result.rows]).toEqual(["high", "2026-10", []]);
    expect(rpc).toHaveBeenLastCalledWith("approved_register", { p_division_id: 3, p_month: "2026-10-01" });
  });

  it("says there are no divisions when the database gives none", async () => {
    const { client } = clientWith({ data: [], error: null });
    expect(await loadRegister(client, {}, { now: NOW })).toEqual({ ok: false, reason: "no-divisions" });
    const empty = clientWith({ data: null, error: null });
    expect(await loadRegister(empty.client, {}, { now: NOW })).toEqual({ ok: false, reason: "no-divisions" });
  });

  it("reports an error when the divisions cannot be loaded", async () => {
    const { client } = clientWith({ data: null, error: { code: "PGRST202" } });
    expect(await loadRegister(client, {}, { now: NOW })).toEqual({ ok: false, reason: "error" });
  });

  it("keeps the divisions when only the records cannot be loaded", async () => {
    const { client } = clientWith({ data: DIVISIONS, error: null }, { data: null, error: { code: "PGRST202" } });
    const result = await loadRegister(client, {}, { now: NOW });
    expect(result.ok && result.rows).toBeNull();
    expect(result.ok && result.divisions).toEqual(DIVISIONS);
  });

  it("uses the current time when none is given", async () => {
    const { client } = clientWith({ data: DIVISIONS, error: null }, { data: [], error: null });
    const result = await loadRegister(client, {});
    expect(result.ok && result.month).toMatch(/^\d{4}-\d{2}$/);
  });
});

describe("loading the register for the CSV", () => {
  it("needs an explicit division and a month within range", async () => {
    for (const params of [
      {},
      { division: "high" },
      { month: "2026-11" },
      { division: "high", month: "2026-13" },
      { division: "high", month: "2024-11" },
      { division: ["high"], month: "2026-11" },
    ]) {
      const { client } = clientWith({ data: DIVISIONS, error: null });
      expect(await loadRegister(client, params, { strict: true, now: NOW })).toEqual({ ok: false, reason: "bad-request" });
    }
  });

  it("refuses a division the user cannot see", async () => {
    const { rpc, client } = clientWith({ data: DIVISIONS, error: null });
    expect(await loadRegister(client, { division: "administration", month: "2026-11" }, { strict: true, now: NOW })).toEqual({
      ok: false,
      reason: "not-available",
    });
    expect(rpc).toHaveBeenCalledTimes(1);
  });

  it("refuses everything when the user has no divisions", async () => {
    const { client } = clientWith({ data: [], error: null });
    expect(await loadRegister(client, { division: "high", month: "2026-11" }, { strict: true, now: NOW })).toEqual({
      ok: false,
      reason: "not-available",
    });
  });

  it("loads the chosen division and month", async () => {
    const { rpc, client } = clientWith({ data: DIVISIONS, error: null }, { data: [], error: null });
    const result = await loadRegister(client, { division: "high", month: "2026-11" }, { strict: true, now: NOW });
    expect(result.ok && result.division.code).toBe("high");
    expect(rpc).toHaveBeenLastCalledWith("approved_register", { p_division_id: 3, p_month: "2026-11-01" });
  });
});

describe("the CSV response", () => {
  const loaded: RegisterLoad = {
    ok: true,
    divisions: DIVISIONS,
    division: DIVISIONS[1],
    month: "2026-11",
    monthLabel: "November 2026",
    currentMonth: "2026-11",
    rows: [],
  };

  it("names the file after the division and month; the file itself is a clean table", () => {
    const result = registerExport(loaded);
    expect(result.ok && result.fileName).toBe("register-high-2026-11.csv");
    expect(result.ok && result.csv.split("\r\n")[0]).toBe(String.fromCharCode(0xfeff) + CSV_HEADER.join(","));
  });

  it("maps each failure to a status and a plain message", () => {
    expect(registerExport({ ok: false, reason: "bad-request" })).toEqual({
      ok: false,
      status: 400,
      message: "Choose a division and a month.",
    });
    for (const reason of ["not-available", "no-divisions"] as const) {
      expect(registerExport({ ok: false, reason })).toMatchObject({ ok: false, status: 403 });
    }
    expect(registerExport({ ok: false, reason: "error" })).toMatchObject({ ok: false, status: 500 });
    expect(registerExport({ ...loaded, rows: null })).toMatchObject({ ok: false, status: 500 });
  });
});
