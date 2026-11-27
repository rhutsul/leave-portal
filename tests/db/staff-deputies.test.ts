// Заступники на справжньому Postgres (PGlite, docs/decisions/0001-pglite-db-tests.md): public.deputy_assignments,
// assign_deputy / remove_deputy і хелпер private.acting_manager_ids усередині manages_position / manages_employee з
// міграції 20261125082128_staff_management.sql (D9 openspec/changes/impl-staff-management/design.md).
// Права заступника діють, поки сьогодні (Київ) у періоді призначення (уточнення 2026-11-24-clarify-new-slices-review),
// тож сценарії AC беруть період відносно справжнього сьогодні; правило дат AC (2026-12-07…11, перегляд 08 і 14 грудня)
// перевіряємо на acting_manager_ids з явним днем.
// «Given … a position whose only manager is manager1»: у демоданих manager2@ веде додаткову посаду teacher1@ — прибираємо.
import { beforeAll, describe, expect, it } from "vitest";
import { kyivDate } from "@/lib/leave/time";
import { createLeaveDb, type LeaveDb } from "./supabase-pglite";

let t: LeaveDb;
let admin: string;
let manager1: string;
let manager2: string;
let teacher1: string;
let teacher1Main: number;

function addDays(date: string, days: number): string {
  const d = new Date(`${date}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}
const today = () => kyivDate(new Date());

async function asOwner<T = Record<string, unknown>>(sql: string, params: unknown[] = []): Promise<T[]> {
  return (await t.db.query<T>(sql, params)).rows;
}

const assign = (user: string, managerId: string, deputyId: string, start: string, end: string) =>
  t.asUser<{ id: number }>(user, "select public.assign_deputy($1, $2, $3, $4) as id", [managerId, deputyId, start, end]);

/** Запис «Awaiting decision» основної посади teacher1@ — напряму, бо дата може бути будь-якою. */
async function awaitingRecord(employeeId: string, positionId: number, date: string) {
  const [request] = await asOwner<{ id: number }>(
    "insert into public.leave_requests (employee_id, leave_type) values ($1, 'unpaid') returning id",
    [employeeId],
  );
  const [record] = await asOwner<{ id: number }>(
    `insert into public.leave_records (request_id, position_id, employee_id, date, start_min, end_min, minutes, leave_type)
     values ($1, $2, $3, $4, 510, 930, 420, 'unpaid') returning id`,
    [request.id, positionId, employeeId, date],
  );
  await asOwner("insert into public.leave_record_events (record_id, actor_id, action) values ($1, $2, 'submitted')", [
    record.id,
    employeeId,
  ]);
  return Number(record.id);
}

const queueIds = async (user: string, employeeId: string) =>
  (
    await t.asUser<{ id: number; can_decide: boolean }>(
      user,
      "select id, can_decide from public.decision_records() where employee_id = $1 and status = 'awaiting'",
      [employeeId],
    )
  ).map((r) => Number(r.id));

const actingIds = async (user: string, day: string) =>
  (await t.asUser<{ id: string }>(user, "select private.acting_manager_ids($1) as id", [day])).map((r) => r.id);

beforeAll(async () => {
  t = await createLeaveDb();
  admin = t.users["admin@example.test"];
  manager1 = t.users["manager1@example.test"];
  manager2 = t.users["manager2@example.test"];
  teacher1 = t.users["teacher1@example.test"];
  await asOwner(
    `delete from public.position_managers as pm using public.positions as p
      where pm.position_id = p.id and p.employee_id = $1 and pm.manager_id = $2`,
    [teacher1, manager2],
  );
  const [main] = await asOwner<{ id: number }>(
    "select id from public.positions where employee_id = $1 and kind = 'main'",
    [teacher1],
  );
  teacher1Main = Number(main.id);
}, 60_000);

describe("deputy rights while today is inside the assignment period", () => {
  it("AC-STAFF-19: the administrator sees no deputies before any is assigned", async () => {
    expect(await t.asUser(admin, "select id from public.deputy_assignments")).toEqual([]);
  });

  it("AC-STAFF-09: the deputy sees and approves the absent manager's record, and the manager still sees it", async () => {
    const record = await awaitingRecord(teacher1, teacher1Main, addDays(today(), 3));
    expect(await queueIds(manager2, teacher1)).toEqual([]);

    const [assignment] = await assign(admin, manager1, manager2, addDays(today(), -1), addDays(today(), 3));

    const deputyQueue = await t.asUser<{ id: number; can_decide: boolean }>(
      manager2,
      "select id, can_decide from public.decision_records() where id = $1",
      [record],
    );
    expect(deputyQueue).toEqual([{ id: record, can_decide: true }]);
    expect(await queueIds(manager1, teacher1)).toContain(record);

    await t.asUser(manager2, "select public.decide_leave_record($1, 'approve', 510, 930)", [record]);

    const [state] = await asOwner<{ status: string; actor: string }>(
      `select r.status, e.actor_id as actor from public.leave_records as r
         join public.leave_record_events as e on e.record_id = r.id and e.action = 'approved' where r.id = $1`,
      [record],
    );
    expect(state).toEqual({ status: "approved", actor: manager2 });
    expect(
      await t.asUser(manager1, "select id from public.decision_records() where id = $1 and status = 'approved'", [record]),
    ).toEqual([{ id: record }]);

    // Той самий хелпер — у реєстрі й залишках.
    const divisions = await t.asUser<{ code: string }>(manager2, "select code from public.register_divisions()");
    expect(divisions.map((d) => d.code)).toContain("elementary");
    const employees = await t.asUser<{ email: string }>(manager2, "select email from public.balance_employees()");
    expect(employees.map((e) => e.email)).toContain("teacher1@example.test");

    // Рішення заступника лишається й після того, як призначення прибрано.
    await t.asUser(admin, "select public.remove_deputy($1)", [assignment.id]);
    const [after] = await asOwner<{ status: string }>("select status from public.leave_records where id = $1", [record]);
    expect(after.status).toBe("approved");
  });

  it("AC-STAFF-09: the deputy never decides their own record", async () => {
    const [division] = await asOwner<{ id: number }>("select id from public.divisions where code = 'elementary'");
    const [own] = await asOwner<{ id: number }>(
      "insert into public.positions (employee_id, division_id, title, kind) values ($1, $2, 'Reading club', 'additional') returning id",
      [manager2, division.id],
    );
    await asOwner("insert into public.position_managers (position_id, manager_id) values ($1, $2)", [own.id, manager1]);
    const record = await awaitingRecord(manager2, Number(own.id), addDays(today(), 4));
    const [assignment] = await assign(admin, manager1, manager2, today(), today());

    await expect(
      t.asUser(manager2, "select public.decide_leave_record($1, 'approve', 510, 930)", [record]),
    ).rejects.toThrow("Your own record is decided by an administrator");
    await t.asUser(admin, "select public.remove_deputy($1)", [assignment.id]);
  });

  it("AC-STAFF-10: outside the period (starts tomorrow or ended yesterday) the deputy sees no record of the employee", async () => {
    await awaitingRecord(teacher1, teacher1Main, addDays(today(), 20));
    for (const [start, end] of [
      [addDays(today(), 1), addDays(today(), 5)],
      [addDays(today(), -5), addDays(today(), -1)],
    ]) {
      const [assignment] = await assign(admin, manager1, manager2, start, end);
      expect(await queueIds(manager2, teacher1)).toEqual([]);
      expect(
        await t.asUser(manager2, "select id from public.leave_records where employee_id = $1", [teacher1]),
      ).toEqual([]);
      await t.asUser(admin, "select public.remove_deputy($1)", [assignment.id]);
    }
  });

  it("AC-STAFF-09, AC-STAFF-10: both dates of the period count, the days around it do not", async () => {
    const [assignment] = await assign(admin, manager1, manager2, "2026-12-07", "2026-12-11");
    expect(await actingIds(manager2, "2026-12-08")).toEqual(expect.arrayContaining([manager2, manager1]));
    expect(await actingIds(manager2, "2026-12-07")).toContain(manager1);
    expect(await actingIds(manager2, "2026-12-11")).toContain(manager1);
    expect(await actingIds(manager2, "2026-12-06")).toEqual([manager2]);
    expect(await actingIds(manager2, "2026-12-12")).toEqual([manager2]);
    expect(await actingIds(manager2, "2026-12-14")).toEqual([manager2]);
    await t.asUser(admin, "select public.remove_deputy($1)", [assignment.id]);
  });
});

describe("only the administrator assigns deputies", () => {
  it("AC-STAFF-14: a manager cannot assign themselves as a deputy, neither through the table nor through the function", async () => {
    await expect(
      t.asUser(
        manager1,
        "insert into public.deputy_assignments (manager_id, deputy_id, start_date, end_date) values ($1, $2, current_date, current_date)",
        [manager2, manager1],
      ),
    ).rejects.toMatchObject({ code: "42501" });
    await expect(assign(manager1, manager2, manager1, today(), today())).rejects.toMatchObject({
      code: "42501",
      message: "Only an administrator can manage employees",
    });
    expect(await asOwner("select id from public.deputy_assignments")).toEqual([]);
    // manager1@ і далі бачить лише записи посад, за які відповідає сам.
    const managed = await asOwner<{ id: number }>(
      "select position_id as id from public.position_managers where manager_id = $1",
      [manager1],
    );
    const visible = await t.asUser<{ position_id: number }>(
      manager1,
      "select distinct position_id from public.leave_records where employee_id <> $1",
      [manager1],
    );
    // Порожній список довів би «every» без жодного запису — тож спершу: manager1@ справді бачить чужі записи.
    expect(visible.length).toBeGreaterThan(0);
    expect(visible.every((r) => managed.some((m) => Number(m.id) === Number(r.position_id)))).toBe(true);
  });

  it("AC-STAFF-19: other roles see no assignment rows, even when some exist", async () => {
    const [assignment] = await assign(admin, manager1, manager2, today(), addDays(today(), 1));
    expect(await t.asUser(manager2, "select id from public.deputy_assignments")).toEqual([]);
    expect(await t.asUser(teacher1, "select id from public.deputy_assignments")).toEqual([]);
    expect(await t.asUser(admin, "select id from public.deputy_assignments")).toEqual([{ id: assignment.id }]);
    await t.asUser(admin, "select public.remove_deputy($1)", [assignment.id]);
  });

  it("AC-STAFF-09: checks the assignment itself", async () => {
    await expect(assign(admin, manager1, manager2, today(), addDays(today(), -1))).rejects.toThrow(
      "The end date must be on or after the start date",
    );
    await expect(assign(admin, manager1, manager1, today(), today())).rejects.toThrow(
      "A manager can't be their own deputy",
    );
    await expect(assign(admin, teacher1, manager2, today(), today())).rejects.toThrow(
      "Choose a manager of at least one position",
    );
    await expect(assign(admin, manager1, teacher1, today(), today())).rejects.toThrow("A deputy must be a manager");
    await expect(assign(admin, manager1, manager2, null as unknown as string, today())).rejects.toThrow(
      "Choose the dates of the deputy assignment",
    );
    const [first] = await assign(admin, manager1, manager2, "2027-03-01", "2027-03-05");
    await expect(assign(admin, manager1, manager2, "2027-03-05", "2027-03-09")).rejects.toThrow(
      "This deputy is already assigned to this manager for these dates",
    );
    await t.asUser(admin, "select public.remove_deputy($1)", [first.id]);
    await expect(t.asUser(admin, "select public.remove_deputy($1)", [first.id])).rejects.toThrow(
      "Deputy assignment not found",
    );
  });
});
