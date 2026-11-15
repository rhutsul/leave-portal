// AC-ASSIST-04 на справжньому Postgres (PGlite, docs/decisions/0001-pglite-db-tests.md): «Save closures» помічника
// календаря зберігає кожну пропозицію окремим викликом public.add_school_closure під сесією адміністратора, тож
// правило «вже закрито» й текст повідомлення — ті самі, що для «Add closure» (вимога 04). Тест написано з тексту AC
// (openspec/specs/calendar-assistant/spec.md); maker ≠ checker.
import { afterEach, beforeAll, describe, expect, it } from "vitest";
import { createLeaveDb, type LeaveDb } from "./supabase-pglite";

let t: LeaveDb;
let admin: string;

const asOwner = async <T = Record<string, unknown>>(sql: string, params: unknown[] = []) =>
  (await t.db.query<T>(sql, params)).rows;

/** Один виклик add_school_closure, як saveSuggestions через supabase.rpc (цілі дні — без p_closes_at). */
const addWholeDays = (userId: string, name: string, start: string, end: string) =>
  t.asUser<{ id: number }>(userId, "select public.add_school_closure($1, $2, $3::date, $4::date, null) as id", [
    "whole_days",
    name,
    start,
    end,
  ]);

type ClosureRow = { name: string; start_date: string; end_date: string; closes_at: number | null };
const calendar = () =>
  asOwner<ClosureRow>(
    `select name, start_date::text as start_date, end_date::text as end_date, closes_at
       from public.school_closures order by start_date, name`,
  );

beforeAll(async () => {
  t = await createLeaveDb();
  admin = t.users["admin@example.test"];
}, 60_000);

afterEach(async () => {
  await asOwner("delete from public.school_closures");
});

describe("calendar assistant: saving suggestions one by one", () => {
  it('AC-ASSIST-04: "Winter break" on already closed dates is refused with "2026-12-28 is already closed: Winter break", "Staff day" 2027-01-12 is saved', async () => {
    await addWholeDays(admin, "Winter break", "2026-12-28", "2027-01-08");

    // Пропозиції зберігаються окремо: відмова першої не скасовує другу.
    await expect(addWholeDays(admin, "Winter break", "2026-12-28", "2027-01-08")).rejects.toMatchObject({
      code: "P0001",
      message: "2026-12-28 is already closed: Winter break",
    });
    const [saved] = await addWholeDays(admin, "Staff day", "2027-01-12", "2027-01-12");
    expect(Number(saved.id)).toBeGreaterThan(0);

    expect(await calendar()).toEqual([
      { name: "Winter break", start_date: "2026-12-28", end_date: "2027-01-08", closes_at: null },
      { name: "Staff day", start_date: "2027-01-12", end_date: "2027-01-12", closes_at: null },
    ]);
  });
});
