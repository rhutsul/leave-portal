// Зріз substitutes разом зі зрізом staff-management (PGlite, docs/decisions/0001-pglite-db-tests.md): деактивований
// працівник не пропонується заміною й не вибирається в поданні, а зайнятість заміни рахує хвилини за розкладом дати
// (D12 openspec/changes/impl-staff-management/design.md; міграція 20261125082128_staff_management.sql).
import { beforeAll, describe, expect, it } from "vitest";
import { createLeaveDb, type LeaveDb } from "./supabase-pglite";

let t: LeaveDb;
let admin: string;
let manager1: string;
let teacher1: string;
let teacher2: string;
let teacher1Main: number;

async function asOwner<T = Record<string, unknown>>(sql: string, params: unknown[] = []): Promise<T[]> {
  return (await t.db.query<T>(sql, params)).rows;
}

beforeAll(async () => {
  t = await createLeaveDb();
  admin = t.users["admin@example.test"];
  manager1 = t.users["manager1@example.test"];
  teacher1 = t.users["teacher1@example.test"];
  teacher2 = t.users["teacher2@example.test"];
  const [main] = await asOwner<{ id: number }>(
    "select id from public.positions where employee_id = $1 and kind = 'main'",
    [teacher1],
  );
  teacher1Main = Number(main.id);
  await asOwner(
    "insert into public.substitute_lists (employee_id, substitute_id) values ($1, $2) on conflict do nothing",
    [teacher1, teacher2],
  );
}, 60_000);

describe("a deactivated employee is not a substitute", () => {
  it("AC-STAFF-08: is neither offered in a new request nor among candidates, and cannot be chosen", async () => {
    const offered = async () =>
      (await t.asUser<{ email: string }>(teacher1, "select email from public.my_substitute_options()")).map((r) => r.email);
    expect(await offered()).toContain("teacher2@example.test");

    await t.asUser(admin, "select public.deactivate_employee($1)", [teacher2]);

    expect(await offered()).not.toContain("teacher2@example.test");
    const candidates = await t.asUser<{ email: string }>(
      manager1,
      "select email from public.substitute_candidates($1)",
      [teacher1],
    );
    expect(candidates.map((c) => c.email)).not.toContain("teacher2@example.test");
    await expect(
      t.asUser(teacher1, "select public.submit_leave_request('unpaid', $1::jsonb)", [
        JSON.stringify([
          { position_id: teacher1Main, date: "2026-12-17", start_min: 510, end_min: 600, substitute_id: teacher2 },
        ]),
      ]),
    ).rejects.toThrow("This substitute is deactivated. Choose another substitute");
    expect(
      await asOwner("select id from public.leave_records where employee_id = $1 and date = '2026-12-17'", [teacher1]),
    ).toEqual([]);

    await t.asUser(admin, "select public.reactivate_employee($1)", [teacher2]);
    expect(await offered()).toContain("teacher2@example.test");
  });
});

describe("substitute busy time follows the schedule of the record date", () => {
  it("AC-STAFF-07: minutes of a record come from the schedule version in effect on its date", async () => {
    await t.asUser(admin, "select public.set_position_schedule($1, '2026-12-07', $2::jsonb)", [
      teacher1Main,
      JSON.stringify([1, 2, 3, 4, 5].map((weekday) => ({ weekday, start_min: 510, end_min: 750 }))),
    ]);
    const ranges = async (date: string) =>
      (
        await asOwner<{ r: string }>("select r::text from private.record_minute_ranges($1, $2, 510, 930) as r", [
          teacher1Main,
          date,
        ])
      ).map((x) => x.r);
    expect(await ranges("2026-12-04")).toEqual(["[510,930)"]);
    expect(await ranges("2026-12-09")).toEqual(["[510,750)"]);
  });
});
