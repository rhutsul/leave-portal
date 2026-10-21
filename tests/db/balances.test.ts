// Залишки на справжньому Postgres (PGlite, docs/decisions/0001-pglite-db-tests.md): public.get_balance_inputs і
// public.balance_employees — хто бачить чиї залишки, і чи дані бази разом із src/lib/leave/balance.ts дають числа з AC.
// Погодження менеджера з'явиться в задачі 4, тож тут статус ставить service_role.
// Тестові дані D7: teacher1@ — основна посада (manager1@) Mon–Fri 08:30–15:30 і додаткова (manager2@) Mon 15:45–17:00;
// teacher2@ (manager2@) — у вівторок 08:30–12:00 і 12:30–15:30, перенесено 5.00 днів Sick leave на 2026–2027.
import { afterEach, beforeAll, describe, expect, it } from "vitest";
import { computeBalances, formatDays, parseBalanceInputs } from "@/lib/leave/balance";
import { createLeaveDb, type LeaveDb } from "./supabase-pglite";

let t: LeaveDb;
let teacher1: string;
let teacher2: string;
let manager1: string;
let manager2: string;
let admin: string;
let teacher1Main: number;
let teacher1Additional: number;
let teacher2Main: number;

async function positionOf(email: string, kind: string) {
  const [row] = await t.asService<{ id: number }>(
    `select p.id from public.positions as p join public.profiles as pr on pr.id = p.employee_id
      where pr.email = $1 and p.kind = $2`,
    [email, kind],
  );
  return row.id;
}

const submit = (userId: string, leaveType: string, records: { position_id: number; date: string; start_min: number; end_min: number }[]) =>
  t.asUser<{ id: number }>(userId, "select public.submit_leave_request($1, $2::jsonb) as id", [
    leaveType,
    JSON.stringify(records),
  ]);

const setStatus = (requestId: number, status: string) =>
  t.asService("update public.leave_records set status = $2 where request_id = $1", [requestId, status]);

async function balancesAs(viewer: string, employee: string, year = 2026) {
  const [row] = await t.asUser<{ inputs: unknown }>(viewer, "select public.get_balance_inputs($1, $2) as inputs", [
    employee,
    year,
  ]);
  const b = computeBalances(parseBalanceInputs(row.inputs), year);
  const limited = (type: "sick" | "personal") => ({
    granted: formatDays(b.limited[type].granted),
    carriedOver: formatDays(b.limited[type].carriedOver),
    used: formatDays(b.limited[type].used),
    remaining: formatDays(b.limited[type].remaining),
  });
  return {
    sick: limited("sick"),
    personal: limited("personal"),
    unpaid: formatDays(b.unlimited.unpaid),
    family: formatDays(b.unlimited.family),
  };
}

/** Перші n робочих днів (пн–пт), починаючи з дати. */
function weekdaysFrom(start: string, n: number): string[] {
  const dates: string[] = [];
  const d = new Date(`${start}T00:00:00Z`);
  while (dates.length < n) {
    const wd = d.getUTCDay();
    if (wd !== 0 && wd !== 6) dates.push(d.toISOString().slice(0, 10));
    d.setUTCDate(d.getUTCDate() + 1);
  }
  return dates;
}

beforeAll(async () => {
  t = await createLeaveDb();
  teacher1 = t.users["teacher1@example.test"];
  teacher2 = t.users["teacher2@example.test"];
  manager1 = t.users["manager1@example.test"];
  manager2 = t.users["manager2@example.test"];
  admin = t.users["admin@example.test"];
  teacher1Main = await positionOf("teacher1@example.test", "main");
  teacher1Additional = await positionOf("teacher1@example.test", "additional");
  teacher2Main = await positionOf("teacher2@example.test", "main");
}, 60_000);

afterEach(async () => {
  await t.asService("delete from public.leave_requests");
});

describe("get_balance_inputs", () => {
  it("AC-BALANCE-01: teacher1@ without approved records and carry-over sees 18.00 / 0.00 / 18.00 and 0.00 used", async () => {
    expect(await balancesAs(teacher1, teacher1)).toEqual({
      sick: { granted: "18.00", carriedOver: "0.00", used: "0.00", remaining: "18.00" },
      personal: { granted: "18.00", carriedOver: "0.00", used: "0.00", remaining: "18.00" },
      unpaid: "0.00",
      family: "0.00",
    });
  });

  it("AC-BALANCE-04: an awaiting whole-day Personal leave record leaves used 0.00, remaining 18.00", async () => {
    await submit(teacher1, "personal", [{ position_id: teacher1Main, date: "2026-11-03", start_min: 510, end_min: 930 }]);
    const { personal } = await balancesAs(teacher1, teacher1);
    expect([personal.used, personal.remaining]).toEqual(["0.00", "18.00"]);
  });

  it("AC-BALANCE-06: the database counts all of the employee's working minutes on the date — 75 of 495 is 0.15", async () => {
    const [{ id }] = await submit(teacher1, "personal", [
      { position_id: teacher1Additional, date: "2026-11-02", start_min: 945, end_min: 1020 },
    ]);
    await setStatus(id, "approved");
    expect((await balancesAs(teacher1, teacher1)).personal.used).toBe("0.15");
  });

  it("AC-BALANCE-05: approved whole days on both positions on 2026-11-02 count as 1.00", async () => {
    const [{ id }] = await submit(teacher1, "personal", [
      { position_id: teacher1Main, date: "2026-11-02", start_min: 510, end_min: 930 },
      { position_id: teacher1Additional, date: "2026-11-02", start_min: 945, end_min: 1020 },
    ]);
    await setStatus(id, "approved");
    expect((await balancesAs(teacher1, teacher1)).personal.used).toBe("1.00");
  });

  it("AC-BALANCE-20: manager2@ of the additional position sees teacher1@'s full Personal leave: used 2.00, remaining 16.00", async () => {
    // 2.00 дня на основній посаді (manager1@): вівторок і середа — у ці дні в teacher1@ лише основна посада.
    const [{ id }] = await submit(teacher1, "personal", [
      { position_id: teacher1Main, date: "2026-11-03", start_min: 510, end_min: 930 },
      { position_id: teacher1Main, date: "2026-11-04", start_min: 510, end_min: 930 },
    ]);
    await setStatus(id, "approved");
    const own = await balancesAs(teacher1, teacher1);
    expect([own.personal.used, own.personal.remaining]).toEqual(["2.00", "16.00"]);
    expect(await balancesAs(manager2, teacher1)).toEqual(own);
    expect(await balancesAs(manager1, teacher1)).toEqual(own);
    expect(await balancesAs(admin, teacher1)).toEqual(own);
  });

  it("AC-BALANCE-12: manager1@ without any of teacher1@'s positions is not shown teacher1@'s balances", async () => {
    // Given AC: у teacher1@ немає посад manager1@ — знімаємо призначення з тестових даних на час тесту.
    await t.asService("delete from public.position_managers where position_id = $1 and manager_id = $2", [
      teacher1Main,
      manager1,
    ]);
    try {
      await expect(balancesAs(manager1, teacher1)).rejects.toMatchObject({
        code: "42501",
        message: "Balances are not available",
      });
      expect(await t.asUser(manager1, "select * from public.balance_employees()")).toEqual([]);
    } finally {
      await t.asService("insert into public.position_managers (position_id, manager_id) values ($1, $2)", [
        teacher1Main,
        manager1,
      ]);
    }
    // teacher2@ manager1@ не підпорядкований зовсім.
    await expect(balancesAs(manager1, teacher2)).rejects.toMatchObject({ code: "42501" });
  });

  it("AC-BALANCE-12: balances of an employee that does not exist are not shown, not even to the administrator", async () => {
    const unknown = "a0000000-0000-0000-0000-0000000000ff";
    await expect(balancesAs(admin, unknown)).rejects.toMatchObject({
      code: "42501",
      message: "Balances are not available",
    });
    await expect(balancesAs(manager1, unknown)).rejects.toMatchObject({ code: "42501" });
  });

  it("AC-BALANCE-13: teacher1@ is not shown another employee's balances", async () => {
    await expect(balancesAs(teacher1, teacher2)).rejects.toMatchObject({
      code: "42501",
      message: "Balances are not available",
    });
    await expect(balancesAs(teacher1, manager1)).rejects.toMatchObject({ code: "42501" });
    expect(await t.asUser(teacher1, "select * from public.balance_employees()")).toEqual([]);
  });

  it("AC-BALANCE-11: 5.00 Sick days left on 2027-08-31 are carried into 2027–2028 — granted 18.00, carried 5.00, remaining 23.00", async () => {
    // teacher2@: 18.00 + 5.00 перенесених на 2026–2027, погоджено 18 цілих днів — на 31 серпня 2027 лишилося 5.00.
    const dates = weekdaysFrom("2026-11-02", 18);
    const [{ id }] = await submit(
      teacher2,
      "sick",
      dates.map((date) => ({ position_id: teacher2Main, date, start_min: 510, end_min: 930 })),
    );
    await setStatus(id, "approved");
    const year2026 = await balancesAs(teacher2, teacher2, 2026);
    expect(year2026.sick).toEqual({ granted: "18.00", carriedOver: "5.00", used: "18.00", remaining: "5.00" });
    expect((await balancesAs(teacher2, teacher2, 2027)).sick).toEqual({
      granted: "18.00",
      carriedOver: "5.00",
      used: "0.00",
      remaining: "23.00",
    });
  });
});

describe("get_balance_inputs data", () => {
  it("AC-BALANCE-20: returns only approved totals, so a manager of another position learns nothing about awaiting or rejected records", async () => {
    const [{ id: awaiting }] = await submit(teacher1, "sick", [
      { position_id: teacher1Main, date: "2026-11-03", start_min: 510, end_min: 930 },
    ]);
    const [{ id: rejected }] = await submit(teacher1, "personal", [
      { position_id: teacher1Main, date: "2026-11-04", start_min: 510, end_min: 930 },
    ]);
    await setStatus(rejected, "rejected");
    const [row] = await t.asUser<{ inputs: { days: unknown[] } }>(
      manager2,
      "select public.get_balance_inputs($1, 2026) as inputs",
      [teacher1],
    );
    expect(row.inputs.days).toEqual([]);
    await setStatus(awaiting, "approved");
    const [after] = await t.asUser<{ inputs: { days: { date: string; status: string }[] } }>(
      manager2,
      "select public.get_balance_inputs($1, 2026) as inputs",
      [teacher1],
    );
    expect(after.inputs.days.map((d) => [d.date, d.status])).toEqual([["2026-11-03", "approved"]]);
  });
});

describe("balance_employees", () => {
  it("AC-BALANCE-20: lists the employees whose balances a manager or the administrator may open", async () => {
    const emails = async (userId: string) =>
      (await t.asUser<{ email: string }>(userId, "select email from public.balance_employees()")).map((r) => r.email).sort();
    expect(await emails(manager1)).toEqual(["teacher1@example.test"]);
    expect(await emails(manager2)).toEqual(["teacher1@example.test", "teacher2@example.test"]);
    expect(await emails(admin)).toEqual([
      "manager1@example.test",
      "manager2@example.test",
      "teacher1@example.test",
      "teacher2@example.test",
    ]);
  });

  it("AC-BALANCE-13: without signing in no balances or employee list are shown", async () => {
    await expect(t.asAnon("select public.get_balance_inputs($1, 2026)", [teacher1])).rejects.toMatchObject({ code: "42501" });
    await expect(t.asAnon("select * from public.balance_employees()")).rejects.toMatchObject({ code: "42501" });
  });
});
