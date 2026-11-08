// Шкільний календар на справжньому Postgres (PGlite, docs/decisions/0001-pglite-db-tests.md): таблиця
// public.school_closures, функції public.add_school_closure / public.remove_school_closure і частка дня в скорочений
// день через get_balance_inputs — контракти design.md D1–D3 зміни impl-school-calendar. Тести написано з тексту AC
// (openspec/specs/school-calendar/spec.md) до коду: maker ≠ checker.
// Тестові дані D7: teacher1@ — основна посада (manager1@) Mon–Fri 08:30–15:30 і додаткова (manager2@) Mon 15:45–17:00;
// teacher2@ (manager2@) — у понеділок 08:30–15:30. 2026-11-20 і 2026-11-27 — п'ятниці, 2026-12-28 — понеділок,
// 2026-12-29 — вівторок.
import { afterEach, beforeAll, describe, expect, it } from "vitest";
import { computeBalances, formatDays, parseBalanceInputs } from "@/lib/leave/balance";
import { createLeaveDb, type LeaveDb } from "./supabase-pglite";

let t: LeaveDb;
let teacher1: string;
let teacher2: string;
let manager1: string;
let admin: string;
let teacher1Main: number;
let teacher2Main: number;

const WHOLE = { start_min: 510, end_min: 930 };
const NOON = 720;

/**
 * Перевірка результату й прибирання — від власника бази (обходить RLS і гранти): контракт D1 не визначає грантів
 * таблиці для service_role, а тест не має від них залежати.
 */
const asOwner = async <T = Record<string, unknown>>(sql: string, params: unknown[] = []) =>
  (await t.db.query<T>(sql, params)).rows;

async function positionOf(email: string, kind: string) {
  const [row] = await asOwner<{ id: number }>(
    `select p.id from public.positions as p join public.profiles as pr on pr.id = p.employee_id
      where pr.email = $1 and p.kind = $2`,
    [email, kind],
  );
  return row.id;
}

type RecordInput = { position_id: number; date: string; start_min: number; end_min: number };

const submit = async (userId: string, leaveType: string, records: RecordInput[]) =>
  (
    await t.asUser<{ id: number }>(userId, "select public.submit_leave_request($1, $2::jsonb) as id", [
      leaveType,
      JSON.stringify(records),
    ])
  )[0].id;

const setStatus = (requestId: number, status: string) =>
  asOwner("update public.leave_records set status = $2 where request_id = $1", [requestId, status]);

/** Закриття від імені користувача, як server action «Add closure» через supabase.rpc. */
const addClosure = async (userId: string, name: string, start: string, end: string, closesAt: number | null = null) =>
  (
    await t.asUser<{ id: number }>(
      userId,
      "select public.add_school_closure($1, $2::date, $3::date, $4) as id",
      [name, start, end, closesAt],
    )
  )[0].id;

type ClosureRow = { name: string; start_date: string; end_date: string; closes_at: number | null };

/** Шкільний календар, як його читає сторінка: колонки з колонкового grant select, дати текстом YYYY-MM-DD. */
const CALENDAR_SQL = `select name, start_date::text as start_date, end_date::text as end_date, closes_at
  from public.school_closures order by start_date, name`;

const calendar = () => asOwner<ClosureRow>(CALENDAR_SQL);
const calendarAs = (userId: string) => t.asUser<ClosureRow>(userId, CALENDAR_SQL);

const WINTER_BREAK: ClosureRow = { name: "Winter break", start_date: "2026-12-28", end_date: "2027-01-08", closes_at: null };

beforeAll(async () => {
  t = await createLeaveDb();
  teacher1 = t.users["teacher1@example.test"];
  teacher2 = t.users["teacher2@example.test"];
  manager1 = t.users["manager1@example.test"];
  admin = t.users["admin@example.test"];
  teacher1Main = await positionOf("teacher1@example.test", "main");
  teacher2Main = await positionOf("teacher2@example.test", "main");
}, 60_000);

afterEach(async () => {
  await asOwner("delete from public.leave_requests");
  await asOwner("delete from public.school_closures");
});

describe("add_school_closure: an administrator adds a closure", () => {
  it('AC-CAL-01: admin@ adds "Winter break" as whole days 2026-12-28 – 2027-01-08 and the calendar shows it', async () => {
    expect(await calendar()).toEqual([]);
    const id = await addClosure(admin, "Winter break", "2026-12-28", "2027-01-08");
    expect(Number(id)).toBeGreaterThan(0);
    expect(await calendar()).toEqual([WINTER_BREAK]);
  });

  it("AC-CAL-10: an end date before the start date is not saved — The end date cannot be earlier than the start date", async () => {
    await expect(addClosure(admin, "Winter break", "2027-01-08", "2026-12-28")).rejects.toThrow(
      "The end date cannot be earlier than the start date",
    );
    expect(await calendar()).toEqual([]);
  });

  it('AC-CAL-11: "Staff day" on 2026-12-30 inside "Winter break" is not saved — 2026-12-30 is already closed: Winter break', async () => {
    await addClosure(admin, "Winter break", "2026-12-28", "2027-01-08");
    await expect(addClosure(admin, "Staff day", "2026-12-30", "2026-12-30")).rejects.toThrow(
      "2026-12-30 is already closed: Winter break",
    );
    expect(await calendar()).toEqual([WINTER_BREAK]);
  });
});

describe("add_school_closure: leave records that block a closure", () => {
  it('AC-CAL-07: teacher1@\'s Approved record on 2026-12-29 blocks "Winter break" — not saved, the records are listed', async () => {
    const requestId = await submit(teacher1, "personal", [{ position_id: teacher1Main, date: "2026-12-29", ...WHOLE }]);
    await setStatus(requestId, "approved");

    await expect(addClosure(admin, "Winter break", "2026-12-28", "2027-01-08")).rejects.toThrow(
      "These days have leave records and cannot be closed: 2026-12-29 teacher1@example.test",
    );
    expect(await calendar()).toEqual([]);
  });

  it("AC-CAL-07: Awaiting decision and Returned for revision block too; every record is listed by date, then email", async () => {
    // teacher1@: 2026-12-28 повернуто на доопрацювання, 2026-12-29 погоджено; teacher2@: 2026-12-28 чекає рішення.
    const returned = await submit(teacher1, "sick", [{ position_id: teacher1Main, date: "2026-12-28", ...WHOLE }]);
    await setStatus(returned, "returned");
    const approved = await submit(teacher1, "personal", [{ position_id: teacher1Main, date: "2026-12-29", ...WHOLE }]);
    await setStatus(approved, "approved");
    await submit(teacher2, "personal", [{ position_id: teacher2Main, date: "2026-12-28", ...WHOLE }]);

    await expect(addClosure(admin, "Winter break", "2026-12-28", "2027-01-08")).rejects.toThrow(
      "These days have leave records and cannot be closed: " +
        "2026-12-28 teacher1@example.test, 2026-12-28 teacher2@example.test, 2026-12-29 teacher1@example.test",
    );
    expect(await calendar()).toEqual([]);
  });

  it("AC-CAL-07: on an early dismissal only a record with minutes after the closing time blocks", async () => {
    // Запис 08:30–12:00 закінчується саме о 12:00 — після часу закриття хвилин немає, тож він не заважає.
    const morning = await submit(teacher1, "personal", [
      { position_id: teacher1Main, date: "2026-11-20", start_min: 510, end_min: NOON },
    ]);
    await setStatus(morning, "approved");
    await addClosure(admin, "Teachers' meeting", "2026-11-20", "2026-11-20", NOON);
    expect(await calendar()).toEqual([
      { name: "Teachers' meeting", start_date: "2026-11-20", end_date: "2026-11-20", closes_at: NOON },
    ]);

    // Запис 08:30–15:30 має хвилини після 12:00 — закриття не збережено.
    await asOwner("delete from public.school_closures");
    await asOwner("delete from public.leave_requests");
    const wholeDay = await submit(teacher1, "personal", [{ position_id: teacher1Main, date: "2026-11-20", ...WHOLE }]);
    await setStatus(wholeDay, "approved");
    await expect(addClosure(admin, "Teachers' meeting", "2026-11-20", "2026-11-20", NOON)).rejects.toThrow(
      "These days have leave records and cannot be closed: 2026-11-20 teacher1@example.test",
    );
    expect(await calendar()).toEqual([]);
  });

  it('AC-CAL-08: the only record on 2026-12-29 is Rejected — "Winter break" is saved and shown', async () => {
    const requestId = await submit(teacher1, "personal", [{ position_id: teacher1Main, date: "2026-12-29", ...WHOLE }]);
    await setStatus(requestId, "rejected");

    await addClosure(admin, "Winter break", "2026-12-28", "2027-01-08");
    expect(await calendar()).toEqual([WINTER_BREAK]);
  });

  it("AC-CAL-08: a Cancelled record does not block either", async () => {
    const requestId = await submit(teacher1, "personal", [{ position_id: teacher1Main, date: "2026-12-29", ...WHOLE }]);
    await setStatus(requestId, "cancelled");

    await addClosure(admin, "Winter break", "2026-12-28", "2027-01-08");
    expect(await calendar()).toEqual([WINTER_BREAK]);
  });
});

describe("school_closures: who reads the calendar", () => {
  it('AC-CAL-02: teacher1@ sees "Winter break" 2026-12-28 – 2027-01-08 added by the administrator', async () => {
    await addClosure(admin, "Winter break", "2026-12-28", "2027-01-08");
    expect(await calendarAs(teacher1)).toEqual([WINTER_BREAK]);
  });

  it('AC-CAL-02: manager1@ sees the same "Winter break"', async () => {
    await addClosure(admin, "Winter break", "2026-12-28", "2027-01-08");
    expect(await calendarAs(manager1)).toEqual([WINTER_BREAK]);
  });

  it("AC-CAL-02: who added the closure is not readable — only the calendar's own columns are granted", async () => {
    await addClosure(admin, "Winter break", "2026-12-28", "2027-01-08");
    await expect(t.asUser(teacher1, "select created_by from public.school_closures")).rejects.toMatchObject({
      code: "42501",
    });
  });

  it("AC-CAL-14: without signing in the calendar cannot be read — no names or dates", async () => {
    await addClosure(admin, "Winter break", "2026-12-28", "2027-01-08");
    await expect(t.asAnon("select name, start_date, end_date from public.school_closures")).rejects.toMatchObject({
      code: "42501",
    });
  });
});

describe("only an administrator changes the calendar", () => {
  it("AC-CAL-13: manager1@ closing 2026-11-27 through the function is refused and the calendar is unchanged", async () => {
    await expect(addClosure(manager1, "Staff day", "2026-11-27", "2026-11-27")).rejects.toThrow(
      "Only an administrator can change the school calendar",
    );
    expect(await calendar()).toEqual([]);
  });

  it("AC-CAL-13: manager1@ inserting into school_closures directly is refused and the calendar is unchanged", async () => {
    await expect(
      t.asUser(
        manager1,
        "insert into public.school_closures (name, start_date, end_date) values ('Staff day', '2026-11-27', '2026-11-27')",
      ),
    ).rejects.toMatchObject({ code: "42501" });
    expect(await calendar()).toEqual([]);
  });

  it("AC-CAL-13: after manager1@'s attempts 2026-11-27 is still accepted in a new request", async () => {
    await addClosure(manager1, "Staff day", "2026-11-27", "2026-11-27").catch(() => {});
    await t
      .asUser(
        manager1,
        "insert into public.school_closures (name, start_date, end_date) values ('Staff day', '2026-11-27', '2026-11-27')",
      )
      .catch(() => {});

    const requestId = await submit(teacher1, "personal", [{ position_id: teacher1Main, date: "2026-11-27", ...WHOLE }]);
    expect(
      await asOwner<{ date: string; start_min: number; end_min: number }>(
        "select date::text as date, start_min, end_min from public.leave_records where request_id = $1",
        [requestId],
      ),
    ).toEqual([{ date: "2026-11-27", ...WHOLE }]);
  });

  it("AC-CAL-13: manager1@ can neither remove nor change an existing closure — directly or through the function", async () => {
    const id = await addClosure(admin, "Winter break", "2026-12-28", "2027-01-08");

    await expect(t.asUser(manager1, "select public.remove_school_closure($1)", [id])).rejects.toThrow(
      "Only an administrator can change the school calendar",
    );
    await expect(t.asUser(manager1, "delete from public.school_closures where id = $1", [id])).rejects.toMatchObject({
      code: "42501",
    });
    await expect(
      t.asUser(manager1, "update public.school_closures set end_date = '2026-12-31' where id = $1", [id]),
    ).rejects.toMatchObject({ code: "42501" });
    expect(await calendar()).toEqual([WINTER_BREAK]);
  });

  it("AC-CAL-13: an employee and a guest are refused the same way", async () => {
    await expect(addClosure(teacher1, "Staff day", "2026-11-27", "2026-11-27")).rejects.toThrow(
      "Only an administrator can change the school calendar",
    );
    await expect(
      t.asAnon("select public.add_school_closure('Staff day', '2026-11-27'::date, '2026-11-27'::date)"),
    ).rejects.toMatchObject({ code: "42501" });
    expect(await calendar()).toEqual([]);
  });

  it("admin@ removes a closure: it leaves the calendar and no leave record changes", async () => {
    const rejected = await submit(teacher1, "personal", [{ position_id: teacher1Main, date: "2026-12-29", ...WHOLE }]);
    await setStatus(rejected, "rejected");
    const id = await addClosure(admin, "Winter break", "2026-12-28", "2027-01-08");
    const recordsBefore = await asOwner("select * from public.leave_records order by id");

    await t.asUser(admin, "select public.remove_school_closure($1)", [id]);
    expect(await calendar()).toEqual([]);
    expect(await asOwner("select * from public.leave_records order by id")).toEqual(recordsBefore);
  });
});

describe("day share without closed minutes", () => {
  it('AC-CAL-06: approved Sick leave 08:30–12:00 on the early dismissal 2026-11-20 counts as used 1.00 (210 of 210), not 0.50', async () => {
    await addClosure(admin, "Teachers' meeting", "2026-11-20", "2026-11-20", NOON);
    const requestId = await submit(teacher1, "sick", [
      { position_id: teacher1Main, date: "2026-11-20", start_min: 510, end_min: NOON },
    ]);
    const [{ id: recordId }] = await asOwner<{ id: number }>("select id from public.leave_records where request_id = $1", [
      requestId,
    ]);
    // Погоджує менеджер основної посади — так само, як на /decisions.
    await t.asUser(manager1, "select public.decide_leave_record($1, 'approve', $2, $3) as result", [recordId, 510, NOON]);
    expect(
      (await asOwner<{ status: string }>("select status from public.leave_records where id = $1", [recordId]))[0].status,
    ).toBe("approved");

    const [row] = await t.asUser<{ inputs: unknown }>(teacher1, "select public.get_balance_inputs($1, $2) as inputs", [
      teacher1,
      2026,
    ]);
    const inputs = parseBalanceInputs(row.inputs);
    expect(inputs.days.find((d) => d.date === "2026-11-20")?.workingMinutes).toBe(210);
    expect(formatDays(computeBalances(inputs, 2026).limited.sick.used)).toBe("1.00");
  });

  it("AC-CAL-06: working_minutes of 2026-11-20 counts only the minutes before 12:00 — 210", async () => {
    await addClosure(admin, "Teachers' meeting", "2026-11-20", "2026-11-20", NOON);
    const [{ minutes }] = await asOwner<{ minutes: number }>(
      "select private.working_minutes($1, '2026-11-20'::date) as minutes",
      [teacher1],
    );
    expect(Number(minutes)).toBe(210);
  });
});
