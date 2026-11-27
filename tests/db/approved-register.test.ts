// Реєстр погоджених відсутностей на справжньому Postgres (PGlite, docs/decisions/0001-pglite-db-tests.md):
// public.register_divisions і public.approved_register з міграції 20261124081552_approved_register.sql.
// Ініціатива розробника до вимог PM (ADR 0012) — тож без AC ID у назвах: AC PM для реєстру ще немає.
// Тестові дані D7: teacher1@ — основна посада Teacher в elementary (manager1@) і додаткова Math teacher у high
// (manager2@); teacher2@ — Teacher у high (manager2@); manager1@ веде й власну посаду в elementary.
import { beforeAll, beforeEach, describe, expect, it } from "vitest";
import { decideAsSeen } from "./decide";
import { createLeaveDb, type LeaveDb } from "./supabase-pglite";

let t: LeaveDb;
let teacher1: string;
let teacher2: string;
let manager1: string;
let manager2: string;
let admin: string;
let elementary: number;
let high: number;
let administration: number;

type RegisterRow = {
  record_id: number;
  employee_email: string;
  employee_name: string;
  position_title: string;
  date: string;
  whole_day: boolean;
  leave_type: string;
  paid_days: string;
  unpaid_days: string;
  approved_at: string | null;
  approved_by_name: string | null;
};

async function divisionId(code: string) {
  const [row] = await t.asService<{ id: number }>("select id from public.divisions where code = $1", [code]);
  return row.id;
}

async function positionOf(email: string, divisionCode: string) {
  const [row] = await t.asService<{ id: number; employee_id: string }>(
    `select p.id, p.employee_id from public.positions as p
       join public.profiles as pr on pr.id = p.employee_id
       join public.divisions as d on d.id = p.division_id
      where pr.email = $1 and d.code = $2`,
    [email, divisionCode],
  );
  return row;
}

/** Запис у потрібному статусі напряму (service_role, як тестові дані), без перевірок розкладу. */
async function addRecord(
  email: string,
  divisionCode: string,
  rec: { date: string; start?: number; end?: number; status?: string; type?: string; paid?: number; unpaid?: number },
) {
  const position = await positionOf(email, divisionCode);
  const type = rec.type ?? "personal";
  const start = rec.start ?? 510;
  const end = rec.end ?? 930;
  const relationship = type === "family" ? "child" : null;
  const [request] = await t.asService<{ id: number }>(
    "insert into public.leave_requests (employee_id, leave_type, relationship) values ($1, $2, $3) returning id",
    [position.employee_id, type, relationship],
  );
  const [record] = await t.asService<{ id: number }>(
    `insert into public.leave_records
       (request_id, position_id, employee_id, date, start_min, end_min, minutes, leave_type, relationship, status,
        paid_days, unpaid_days)
     values ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12) returning id`,
    [
      request.id,
      position.id,
      position.employee_id,
      rec.date,
      start,
      end,
      end - start,
      type,
      relationship,
      rec.status ?? "approved",
      rec.paid ?? null,
      rec.unpaid ?? null,
    ],
  );
  return record.id;
}

const register = (userId: string, division: number, month: string) =>
  t.asUser<RegisterRow>(
    userId,
    `select r.record_id, r.employee_email, r.employee_name, r.position_title, r.date::text as date, r.whole_day,
            r.leave_type, r.paid_days, r.unpaid_days, r.approved_at, r.approved_by_name
       from public.approved_register($1, $2::date) as r`,
    [division, month],
  );

const ids = (rows: { record_id: number }[]) => rows.map((r) => r.record_id).sort((a, b) => a - b);

beforeAll(async () => {
  t = await createLeaveDb();
  teacher1 = t.users["teacher1@example.test"];
  teacher2 = t.users["teacher2@example.test"];
  manager1 = t.users["manager1@example.test"];
  manager2 = t.users["manager2@example.test"];
  admin = t.users["admin@example.test"];
  elementary = await divisionId("elementary");
  high = await divisionId("high");
  administration = await divisionId("administration");
}, 60_000);

beforeEach(async () => {
  await t.asService("delete from public.leave_requests");
});

describe("register_divisions", () => {
  it("gives the administrator every division", async () => {
    const rows = await t.asUser<{ code: string }>(admin, "select code from public.register_divisions()");
    expect(rows.map((r) => r.code).sort()).toEqual(["administration", "elementary", "high"]);
  });

  it("gives a manager only the divisions where they manage a position", async () => {
    const m1 = await t.asUser<{ code: string }>(manager1, "select code from public.register_divisions()");
    const m2 = await t.asUser<{ code: string }>(manager2, "select code from public.register_divisions()");
    expect(m1.map((r) => r.code)).toEqual(["elementary"]);
    expect(m2.map((r) => r.code)).toEqual(["high"]);
  });

  it("gives an employee no divisions, even their own", async () => {
    expect(await t.asUser(teacher1, "select * from public.register_divisions()")).toEqual([]);
  });

  it("is not callable without signing in", async () => {
    await expect(t.asAnon("select * from public.register_divisions()")).rejects.toThrow(/permission denied/);
  });
});

describe("approved_register — who sees what", () => {
  it("shows the administrator every approved record of the division, and only that division", async () => {
    const t1 = await addRecord("teacher1@example.test", "elementary", { date: "2026-11-03" });
    const m1 = await addRecord("manager1@example.test", "elementary", { date: "2026-11-04" });
    await addRecord("teacher2@example.test", "high", { date: "2026-11-03" });

    expect(ids(await register(admin, elementary, "2026-11-01"))).toEqual([t1, m1].sort((a, b) => a - b));
    expect(await register(admin, administration, "2026-11-01")).toEqual([]);
  });

  it("shows a manager only the records of positions they manage, not the employee's other position", async () => {
    // teacher1@: основна посада (manager1@) і додаткова в high (manager2@), обидві погоджені.
    const main = await addRecord("teacher1@example.test", "elementary", { date: "2026-11-02" });
    const additional = await addRecord("teacher1@example.test", "high", { date: "2026-11-02", start: 945, end: 1020 });
    const other = await addRecord("teacher2@example.test", "high", { date: "2026-11-05" });

    expect(ids(await register(manager1, elementary, "2026-11-01"))).toEqual([main]);
    // manager1@ — менеджер teacher1@, але не його посади в high: реєстр high для нього порожній.
    expect(await register(manager1, high, "2026-11-01")).toEqual([]);
    expect(ids(await register(manager2, high, "2026-11-01"))).toEqual([additional, other].sort((a, b) => a - b));
    expect(await register(manager2, elementary, "2026-11-01")).toEqual([]);
  });

  it("shows an employee nothing, not even their own approved records", async () => {
    await addRecord("teacher1@example.test", "elementary", { date: "2026-11-03" });
    expect(await register(teacher1, elementary, "2026-11-01")).toEqual([]);
    expect(await register(teacher2, high, "2026-11-01")).toEqual([]);
  });

  it("is not callable without signing in", async () => {
    await expect(t.asAnon("select * from public.approved_register(1, '2026-11-01')")).rejects.toThrow(
      /permission denied/,
    );
  });
});

describe("approved_register — which records", () => {
  it("lists only approved records: awaiting, returned, rejected and cancelled are left out", async () => {
    const approved = await addRecord("teacher1@example.test", "elementary", { date: "2026-11-09" });
    for (const [status, date] of [
      ["awaiting", "2026-11-10"],
      ["returned", "2026-11-11"],
      ["rejected", "2026-11-12"],
      ["cancelled", "2026-11-13"],
    ]) {
      await addRecord("teacher1@example.test", "elementary", { date, status });
    }
    expect(ids(await register(admin, elementary, "2026-11-01"))).toEqual([approved]);
  });

  it("drops a record that was cancelled after approval", async () => {
    const id = await addRecord("teacher1@example.test", "elementary", { date: "2026-11-09" });
    expect(ids(await register(admin, elementary, "2026-11-01"))).toEqual([id]);
    await t.asService("update public.leave_records set status = 'cancelled' where id = $1", [id]);
    expect(await register(admin, elementary, "2026-11-01")).toEqual([]);
  });

  it("keeps to the calendar month of the record date, from any date of that month", async () => {
    await addRecord("teacher1@example.test", "elementary", { date: "2026-10-30" });
    const first = await addRecord("teacher1@example.test", "elementary", { date: "2026-11-02" });
    const last = await addRecord("teacher1@example.test", "elementary", { date: "2026-11-30" });
    await addRecord("teacher1@example.test", "elementary", { date: "2026-12-01" });

    expect(ids(await register(admin, elementary, "2026-11-01"))).toEqual([first, last]);
    expect(ids(await register(admin, elementary, "2026-11-17"))).toEqual([first, last]);
    expect((await register(admin, elementary, "2026-10-01")).map((r) => r.date)).toEqual(["2026-10-30"]);
  });

  it("returns nothing without a month", async () => {
    await addRecord("teacher1@example.test", "elementary", { date: "2026-11-02" });
    expect(await t.asUser(admin, "select * from public.approved_register($1, null)", [elementary])).toEqual([]);
  });
});

describe("approved_register — columns", () => {
  it("splits days into paid and unpaid by leave type", async () => {
    // Вт–пт у teacher1@ лише основна посада (420 хв): 210 хв = 0.50 дня. Розподіл рішення — як є.
    await addRecord("teacher1@example.test", "elementary", { date: "2026-11-03", start: 510, end: 720, type: "unpaid" });
    await addRecord("teacher1@example.test", "elementary", { date: "2026-11-04", start: 510, end: 720, type: "family" });
    await addRecord("teacher1@example.test", "elementary", { date: "2026-11-05", type: "sick", paid: 0.25, unpaid: 0.75 });
    await addRecord("teacher1@example.test", "elementary", { date: "2026-11-06", type: "personal" });

    const rows = await register(admin, elementary, "2026-11-01");
    const byDate = Object.fromEntries(
      rows.map((r) => [r.date, [r.leave_type, Number(r.paid_days).toFixed(2), Number(r.unpaid_days).toFixed(2)]]),
    );
    expect(byDate).toEqual({
      "2026-11-03": ["unpaid", "0.00", "0.50"],
      "2026-11-04": ["family", "0.50", "0.00"],
      "2026-11-05": ["sick", "0.25", "0.75"],
      "2026-11-06": ["personal", "1.00", "0.00"],
    });
  });

  it("marks a record covering the whole working day of the position", async () => {
    await addRecord("teacher1@example.test", "elementary", { date: "2026-11-02" });
    await addRecord("teacher1@example.test", "elementary", { date: "2026-11-03", start: 540, end: 720 });
    const rows = await register(admin, elementary, "2026-11-01");
    expect(rows.map((r) => [r.date, r.whole_day])).toEqual([
      ["2026-11-02", true],
      ["2026-11-03", false],
    ]);
  });

  it("names who approved the record and when, from the decision", async () => {
    const position = await positionOf("teacher1@example.test", "elementary");
    const [{ id: requestId }] = await t.asUser<{ id: number }>(
      teacher1,
      "select public.submit_leave_request('personal', $1::jsonb) as id",
      [JSON.stringify([{ position_id: position.id, date: "2026-11-10", start_min: 510, end_min: 930 }])],
    );
    const [{ id: recordId }] = await t.asService<{ id: number }>(
      "select id from public.leave_records where request_id = $1",
      [requestId],
    );
    await decideAsSeen(t, manager1, recordId, "approve", 510, 930);

    const [row] = await register(manager1, elementary, "2026-11-01");
    expect(row.record_id).toBe(recordId);
    expect(row.employee_email).toBe("teacher1@example.test");
    expect(row.position_title).toBe("Teacher");
    expect(row.approved_by_name).toBe("Ірина Демо-Менеджер-Перша");
    expect(row.approved_at).not.toBeNull();
    expect(Number(row.paid_days).toFixed(2)).toBe("1.00");
  });
});
