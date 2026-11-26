// Гонка «відкликання права менеджера ↔ заявка від імені» (міграція 20261126152206_staff_manager_locks.sql): зміна
// менеджерів посади, зняття заступника й заявка від імені беруть lock тих самих людей (hashtextextended(uid::text, 0)),
// тож одна чекає кінця іншої. PGlite — одне з'єднання, справжньої гонки тут не відтворити; тому перевіряємо, що кожна
// функція всередині своєї транзакції тримає саме ці advisory lock (pg_locks), а поведінку права — тести staff-deputies
// і on-behalf.
import { beforeAll, describe, expect, it } from "vitest";
import { kyivDate } from "@/lib/leave/time";
import { createLeaveDb, type LeaveDb } from "./supabase-pglite";

let t: LeaveDb;
let admin: string;
let manager1: string;
let manager2: string;
let teacher1: string;
let teacher1Main: number;

async function asOwner<T = Record<string, unknown>>(sql: string, params: unknown[] = []): Promise<T[]> {
  return (await t.db.query<T>(sql, params)).rows;
}

/**
 * Виконує `sql` від імені користувача в транзакції й повертає, чиї lock людини він тримає наприкінці (до rollback).
 * Ключ advisory lock у pg_locks — два 32-бітні числа (classid, objid); збираємо з них 64-бітний ключ.
 */
async function lockedPeople(userId: string, sql: string, params: unknown[], people: Record<string, string>) {
  await t.db.exec("begin; set local role authenticated;");
  try {
    await t.db.query("select set_config('request.jwt.claim.sub', $1, true)", [userId]);
    await t.db.query(sql, params);
    await t.db.exec("reset role");
    const held: string[] = [];
    for (const [name, id] of Object.entries(people)) {
      const { rows } = await t.db.query<{ held: boolean }>(
        `select exists (
           select 1 from pg_locks as l
           where l.locktype = 'advisory' and l.granted
             and ((l.classid::bigint << 32) | l.objid::bigint) = (hashtextextended($1, 0) & x'ffffffffffffffff'::bigint)
         ) as held`,
        [id],
      );
      if (rows[0].held) held.push(name);
    }
    return held;
  } finally {
    await t.db.exec("rollback");
  }
}

beforeAll(async () => {
  t = await createLeaveDb();
  admin = t.users["admin@example.test"];
  manager1 = t.users["manager1@example.test"];
  manager2 = t.users["manager2@example.test"];
  teacher1 = t.users["teacher1@example.test"];
  const [main] = await asOwner<{ id: number }>("select id from public.positions where employee_id = $1 and kind = 'main'", [
    teacher1,
  ]);
  teacher1Main = Number(main.id);
}, 60_000);

describe("locks that close the race between revoking a manager's right and a request on behalf", () => {
  it("AC-STAFF-04: changing the managers of a position locks the employee of the position and the managers", async () => {
    const held = await lockedPeople(admin, "select public.set_position_managers($1, $2::uuid[])", [teacher1Main, [manager2]], {
      teacher1,
      manager2,
      manager1,
    });
    expect(held).toEqual(["teacher1", "manager2"]);
  });

  it("AC-STAFF-09: removing a deputy locks the absent manager", async () => {
    const today = kyivDate(new Date());
    const [assignment] = await asOwner<{ id: number }>(
      "insert into public.deputy_assignments (manager_id, deputy_id, start_date, end_date) values ($1, $2, $3, $3) returning id",
      [manager1, manager2, today],
    );
    try {
      const held = await lockedPeople(admin, "select public.remove_deputy($1)", [assignment.id], { manager1, manager2 });
      expect(held).toEqual(["manager1"]);
    } finally {
      await asOwner("delete from public.deputy_assignments where id = $1", [assignment.id]);
    }
  });

  it("AC-STAFF-09: a deputy submitting on behalf locks the employee and the absent manager they act for", async () => {
    const today = kyivDate(new Date());
    // Посада teacher1@ лише з manager1@ (Given AC-STAFF-09): manager2@ діє як заступник.
    await asOwner(
      `delete from public.position_managers as pm using public.positions as p
        where pm.position_id = p.id and p.employee_id = $1 and pm.manager_id = $2`,
      [teacher1, manager2],
    );
    await asOwner(
      "insert into public.deputy_assignments (manager_id, deputy_id, start_date, end_date) values ($1, $2, $3, $3)",
      [manager1, manager2, today],
    );
    const records = JSON.stringify([{ position_id: teacher1Main, date: "2026-12-16", start_min: 510, end_min: 600 }]);
    const held = await lockedPeople(
      manager2,
      "select public.submit_leave_request_on_behalf($1, 'unpaid', $2::jsonb)",
      [teacher1, records],
      { teacher1, manager1 },
    );
    expect(held).toEqual(["teacher1", "manager1"]);
  });
});
