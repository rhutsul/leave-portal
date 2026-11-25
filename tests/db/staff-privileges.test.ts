// Права на функції зрізу staff-management (PGlite, docs/decisions/0001-pglite-db-tests.md; ADR 0013,
// 20261125082128_staff_management.sql): хто може їх виконати і що функції, які пишуть у auth.*, лишаються security
// definer у схемі private з порожнім search_path. Гість має рівно один вхід — use_one_time_link (D2).
import { beforeAll, describe, expect, it } from "vitest";
import { createLeaveDb, type LeaveDb } from "./supabase-pglite";

let t: LeaveDb;

// Функції адміністратора: виконувати може authenticated, право перевіряє перший крок (private.require_admin).
const ADMIN_CALLS: [string, unknown[]][] = [
  ["select * from public.staff_employees()", []],
  ["select * from public.create_employee('X', 'x-priv@example.test')", []],
  ["select * from public.issue_one_time_link($1)", ["a0000000-0000-0000-0000-000000000004"]],
  ["select public.update_employee($1, 'X', 'x-priv@example.test')", ["a0000000-0000-0000-0000-000000000004"]],
  ["select public.set_employee_role($1, 'manager')", ["a0000000-0000-0000-0000-000000000004"]],
  ["select public.deactivate_employee($1)", ["a0000000-0000-0000-0000-000000000004"]],
  ["select public.reactivate_employee($1)", ["a0000000-0000-0000-0000-000000000004"]],
  ["select public.create_position($1, 'additional', 1, 'X', '2026-12-07', '[]'::jsonb, '{}')", ["a0000000-0000-0000-0000-000000000004"]],
  ["select public.set_position_schedule(1, '2026-12-07', '[]'::jsonb)", []],
  ["select public.set_position_managers(1, '{}')", []],
  ["select public.assign_deputy($1, $2, current_date, current_date)", ["a0000000-0000-0000-0000-000000000002", "a0000000-0000-0000-0000-000000000003"]],
  ["select public.remove_deputy(1)", []],
];

// Внутрішні хелпери: нікому, крім власника й інших функцій.
const INTERNAL = [
  "private.require_admin()",
  "private.lock_employee(uuid)",
  "private.lock_admins()",
  "private.lock_people(uuid[])",
  "private.clean_full_name(text)",
  "private.clean_email(text)",
  "private.check_email_free(text, uuid)",
  "private.employee_status(uuid)",
  "private.new_one_time_link(uuid)",
  "private.guard_auth_email_change()",
  "private.blocks_in_effect(uuid, date)",
  "private.parse_schedule(jsonb)",
  "private.put_position_schedule(bigint, date, jsonb)",
  "private.check_position_managers(uuid[])",
];

beforeAll(async () => {
  t = await createLeaveDb();
}, 60_000);

describe("who can run the staff functions", () => {
  it("AC-STAFF-15: anon can run exactly schema_version and the one-time link function, nothing else in public or private", async () => {
    const rows = await t.db.query<{ name: string }>(`
      select n.nspname || '.' || p.proname as name
      from pg_proc as p
      join pg_namespace as n on n.oid = p.pronamespace
      where n.nspname in ('public', 'private') and has_function_privilege('anon', p.oid, 'execute')
      order by 1
    `);
    expect(rows.rows.map((r) => r.name)).toEqual([
      "private.use_one_time_link",
      "public.schema_version",
      "public.use_one_time_link",
    ]);
  });

  it("AC-STAFF-14: every function that writes to auth is a security definer in private with an empty search_path", async () => {
    const rows = await t.db.query<{ name: string; secdef: boolean; config: string[] | null }>(`
      select n.nspname || '.' || p.proname as name, p.prosecdef as secdef, p.proconfig as config
      from pg_proc as p
      join pg_namespace as n on n.oid = p.pronamespace
      where n.nspname in ('public', 'private')
        and p.prosrc ~* '(insert into|update|delete from)\\s+auth\\.'
      order by 1
    `);
    expect(rows.rows.map((r) => r.name)).toEqual([
      "private.create_employee",
      "private.deactivate_employee",
      "private.reactivate_employee",
      "private.update_employee",
      "private.use_one_time_link",
    ]);
    for (const row of rows.rows) {
      expect(row).toMatchObject({ secdef: true, config: ['search_path=""'] });
    }
  });

  it("AC-STAFF-14: authenticated cannot run the internal helpers", async () => {
    for (const signature of INTERNAL) {
      const [row] = (
        await t.db.query<{ allowed: boolean }>(`select has_function_privilege('authenticated', '${signature}', 'execute') as allowed`)
      ).rows;
      expect({ signature, allowed: row.allowed }).toEqual({ signature, allowed: false });
    }
  });

  it("AC-STAFF-13, AC-STAFF-14: a manager and an employee get the administrator refusal from every staff function", async () => {
    for (const user of [t.users["manager1@example.test"], t.users["teacher1@example.test"]]) {
      for (const [sql, params] of ADMIN_CALLS) {
        await expect(t.asUser(user, sql, params)).rejects.toMatchObject({
          code: "42501",
          message: "Only an administrator can manage employees",
        });
      }
    }
  });

  it("AC-STAFF-15: anon is refused by every staff function except the one-time link", async () => {
    for (const [sql, params] of ADMIN_CALLS) {
      await expect(t.asAnon(sql, params)).rejects.toMatchObject({ code: "42501" });
    }
    const [row] = await t.asAnon<{ state: string }>("select state from public.use_one_time_link('nope')");
    expect(row.state).toBe("invalid");
  });
});
