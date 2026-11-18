// Денний ліміт запитів до моделі (рев'ю WS10, п. 1; supabase/migrations/20261118083501_ai_quota.sql) на справжньому
// Postgres (PGlite, docs/decisions/0001-pglite-db-tests.md): 20 запитів на добу на користувача, 21-й — false, і дія
// показує повідомлення AC-ASSIST-09. Лічильник у private.ai_quota — без прав для authenticated і anon.
import { afterEach, beforeAll, describe, expect, it } from "vitest";
import { createLeaveDb, type LeaveDb } from "./supabase-pglite";

let t: LeaveDb;
let admin: string;
let other: string;

const take = async (userId: string) =>
  (await t.asUser<{ allowed: boolean }>(userId, "select public.take_ai_quota() as allowed"))[0].allowed;

const takeTimes = async (userId: string, n: number) => {
  const answers: boolean[] = [];
  for (let i = 0; i < n; i++) answers.push(await take(userId));
  return answers;
};

beforeAll(async () => {
  t = await createLeaveDb();
  admin = t.users["admin@example.test"];
  other = t.users["teacher1@example.test"];
}, 60_000);

afterEach(async () => {
  await t.db.query("delete from private.ai_quota");
});

describe("private.take_ai_quota", () => {
  it("AC-ASSIST-09: the 21st request of one administrator in a day is refused, the first 20 are allowed", async () => {
    expect(await takeTimes(admin, 21)).toEqual([...Array<boolean>(20).fill(true), false]);
    expect(await take(admin)).toBe(false);
    // Лічильник не росте понад ліміт.
    const rows = (await t.db.query<{ used: number }>("select used from private.ai_quota where user_id = $1", [admin])).rows;
    expect(rows).toEqual([{ used: 20 }]);
  });

  it("AC-ASSIST-09: another user has their own counter", async () => {
    await takeTimes(admin, 20);
    expect(await take(admin)).toBe(false);
    expect(await take(other)).toBe(true);
  });

  it("AC-ASSIST-09: the day is the Kyiv date — 22:30 UTC on 17 November is already 18 November", async () => {
    // Час сесії — UTC, як у Supabase: доба за поясом сесії дала б 17 листопада.
    await t.db.exec("set timezone = 'UTC'");
    const day = async (at: string) =>
      (await t.db.query<{ day: string }>("select private.kyiv_day($1::timestamptz)::text as day", [at])).rows[0].day;
    expect(await day("2026-11-17T22:30:00Z")).toBe("2026-11-18");
    expect(await day("2026-11-17T21:59:00Z")).toBe("2026-11-17");
    // Літній час: о 20:59 UTC 1 липня в Києві вже 23:59, о 21:00 UTC — 2 липня.
    expect(await day("2027-07-01T20:59:00Z")).toBe("2027-07-01");
    expect(await day("2027-07-01T21:00:00Z")).toBe("2027-07-02");
  });

  it("AC-ASSIST-09: yesterday's 20 requests do not count today", async () => {
    await t.db.query(
      "insert into private.ai_quota (user_id, day, used) values ($1, private.kyiv_day(now()) - 1, 20)",
      [admin],
    );
    expect(await take(admin)).toBe(true);
    const { rows } = await t.db.query<{ today: boolean; used: number }>(
      `select (day = private.kyiv_day(now())) as today, used from private.ai_quota
        where user_id = $1 order by day`,
      [admin],
    );
    expect(rows).toEqual([
      { today: false, used: 20 },
      { today: true, used: 1 },
    ]);
  });

  it("AC-ASSIST-09: without a signed-in user there is no quota — anon cannot call it at all", async () => {
    await expect(t.asAnon("select public.take_ai_quota()")).rejects.toMatchObject({ code: "42501" });
  });

  it("AC-ASSIST-09: a signed-in user can neither read nor change the counter directly", async () => {
    await take(admin);
    await expect(t.asUser(admin, "select * from private.ai_quota")).rejects.toMatchObject({ code: "42501" });
    await expect(
      t.asUser(admin, "update private.ai_quota set used = 0 where user_id = $1", [admin]),
    ).rejects.toMatchObject({ code: "42501" });
    await expect(t.asUser(admin, "select private.take_ai_quota() as allowed")).resolves.toEqual([{ allowed: true }]);
  });
});
