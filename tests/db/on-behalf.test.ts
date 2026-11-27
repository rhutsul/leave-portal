// Заявка від імені працівника і правка запису до рішення на справжньому Postgres (PGlite,
// docs/decisions/0001-pglite-db-tests.md): міграція 20261125200521_on_behalf_and_edit.sql (D1–D9
// openspec/changes/impl-on-behalf/design.md).
//
// Тестові дані: teacher1@ — основна «Elementary school / Teacher» (manager1@) Mon–Fri 08:30–15:30 і додаткова
// «High school / Math teacher» (manager2@) Mon 15:45–17:00 — для AC-BEHALF-02 тест додає четвер 15:45–17:00;
// teacher3@ — без посад manager1@; manager3@ — роль manager без посад. 2026-12-03 — четвер, 2026-12-05 — субота.
//
// Правка (D7) до кроку 4 D9 закрита для authenticated: її логіку тести кличуть від власника функцій з auth.uid()
// менеджера (asOwner), а від authenticated — перевіряють, що права немає.
import { afterEach, beforeAll, describe, expect, it } from "vitest";
import { computeBalances, employeeWarning, formatDays, parseBalanceInputs } from "@/lib/leave/balance";
import { forEmployee } from "@/lib/leave/on-behalf";
import { createLeaveDb, type LeaveDb } from "./supabase-pglite";

let t: LeaveDb;
let teacher1: string;
let teacher2: string;
let teacher3: string;
let assistant1: string;
let manager1: string;
let manager2: string;
let manager3: string;
let admin: string;
let main1: number;
let additional1: number;

const THU = "2026-12-03";
const FRI = "2026-12-04";
const SAT = "2026-12-05";
const WHOLE = { start_min: 510, end_min: 930 };
const ADDITIONAL = { start_min: 945, end_min: 1020 };

const TEXT = {
  notYours: "You can submit requests only for employees of your positions",
  employee: "Only a manager or an administrator can submit a request on behalf of an employee",
  noEmployees: "You have no employees to submit requests for",
  decided: "This record is already decided and cannot be changed",
  changed: "This record has been changed. Check it again before deciding",
};

async function positionOf(email: string, kind: string) {
  const [row] = await t.asService<{ id: number }>(
    `select p.id from public.positions as p join public.profiles as pr on pr.id = p.employee_id
      where pr.email = $1 and p.kind = $2`,
    [email, kind],
  );
  return row.id;
}

type Rec = {
  position_id: number;
  date: string;
  start_min: number;
  end_min: number;
  substitute_id?: string;
};

/** Подання від імені; повертає результат функції. */
async function onBehalf(
  actor: string,
  employee: string,
  leaveType: string,
  records: Rec[],
  relationship: string | null = null,
) {
  const [{ result }] = await t.asUser<{
    result: { request_id: number; approved: number; awaiting: number };
  }>(actor, "select public.submit_leave_request_on_behalf($1, $2, $3::jsonb, $4) as result", [
    employee,
    leaveType,
    JSON.stringify(records),
    relationship,
  ]);
  return result;
}

/** Власна заявка працівника; повертає id записів у порядку дат. */
async function ownRequest(employee: string, leaveType: string, records: Rec[]) {
  const [{ id }] = await t.asUser<{ id: number }>(employee, "select public.submit_leave_request($1, $2::jsonb) as id", [
    leaveType,
    JSON.stringify(records),
  ]);
  return recordIdsOf(id);
}

const recordIdsOf = async (requestId: number) =>
  (
    await t.asService<{ id: number }>(
      "select id from public.leave_records where request_id = $1 order by date, start_min, id",
      [requestId],
    )
  ).map((r) => r.id);

const recordOf = async (id: number) =>
  (
    await t.asService<{
      date: string;
      start_min: number;
      end_min: number;
      status: string;
      leave_type: string;
      substitute: string | null;
      paid_days: string | null;
      unpaid_days: string | null;
    }>(
      `select to_char(r.date, 'YYYY-MM-DD') as date, r.start_min, r.end_min, r.status, r.leave_type, p.email as substitute,
              r.paid_days::text, r.unpaid_days::text
         from public.leave_records as r left join public.profiles as p on p.id = r.substitute_id where r.id = $1`,
      [id],
    )
  )[0];

/** Історія запису, як її бачить працівник у «My requests» (record_histories). */
const historyOf = async (viewer: string, id: number) =>
  t.asUser<{ action: string; comment: string | null; created_at: string }>(
    viewer,
    "select action, comment, created_at::text from public.record_histories(array[$1]::bigint[])",
    [id],
  );

const eventCount = async (id: number) =>
  Number(
    (
      await t.asService<{ n: number }>("select count(*) as n from public.leave_record_events where record_id = $1", [
        id,
      ])
    )[0].n,
  );

const requestCount = async (employee: string) =>
  Number(
    (
      await t.asService<{ n: number }>("select count(*) as n from public.leave_requests where employee_id = $1", [
        employee,
      ])
    )[0].n,
  );

/** SQL від власника функцій з auth.uid() = userId: виклик private-функцій і правки до гранту (крок 1 D9). */
async function asOwner<T = Record<string, unknown>>(userId: string, sql: string, params: unknown[] = []) {
  await t.db.exec("begin");
  try {
    await t.db.query("select set_config('request.jwt.claim.sub', $1, true)", [userId]);
    const result = await t.db.query<T>(sql, params);
    await t.db.exec("commit");
    return result.rows;
  } catch (error) {
    await t.db.exec("rollback").catch(() => {});
    throw error;
  }
}

type Edit = {
  date: string;
  start_min: number;
  end_min: number;
  leave_type: string;
  relationship?: string | null;
  substitute_id?: string | null;
};

/** Правка запису (D7): усі поля, як шле форма. */
async function edit(actor: string, id: number, e: Edit) {
  await asOwner(actor, "select private.edit_leave_record($1, $2::date, $3, $4, $5, $6, $7::uuid)", [
    id,
    e.date,
    e.start_min,
    e.end_min,
    e.leave_type,
    e.relationship ?? null,
    e.substitute_id ?? null,
  ]);
}

async function balancesOf(employee: string, year = 2026) {
  const [row] = await t.asUser<{ inputs: unknown }>(employee, "select public.get_balance_inputs($1, $2) as inputs", [
    employee,
    year,
  ]);
  const b = computeBalances(parseBalanceInputs(row.inputs), year);
  return {
    sick: {
      used: formatDays(b.limited.sick.used),
      remaining: formatDays(b.limited.sick.remaining),
    },
    personal: {
      used: formatDays(b.limited.personal.used),
      remaining: formatDays(b.limited.personal.remaining),
    },
    unpaid: formatDays(b.unlimited.unpaid),
  };
}

/** Given: запис teacher1@ «Awaiting decision» на основній посаді (власна заявка). */
async function givenAwaiting(date = THU, leaveType = "sick", hours = WHOLE) {
  const [id] = await ownRequest(teacher1, leaveType, [{ position_id: main1, date, ...hours }]);
  return id;
}

/** Given «Personal leave» used 17.50: погоджені вт–пт із 2027-01-05 і пів дня (210 хв). */
async function usePersonal175() {
  const dates: string[] = [];
  for (const d = new Date("2027-01-05T00:00:00Z"); dates.length < 18; d.setUTCDate(d.getUTCDate() + 1)) {
    if (![0, 1, 6].includes(d.getUTCDay())) dates.push(d.toISOString().slice(0, 10));
  }
  const records = dates.slice(0, 17).map((date) => ({ position_id: main1, date, ...WHOLE }));
  records.push({
    position_id: main1,
    date: dates[17],
    start_min: 540,
    end_min: 750,
  });
  const ids = await ownRequest(teacher1, "personal", records);
  await t.asService("update public.leave_records set status = 'approved' where id = any($1::bigint[])", [ids]);
}

beforeAll(async () => {
  t = await createLeaveDb();
  teacher1 = t.users["teacher1@example.test"];
  teacher2 = t.users["teacher2@example.test"];
  teacher3 = t.users["teacher3@example.test"];
  assistant1 = t.users["assistant1@example.test"];
  manager1 = t.users["manager1@example.test"];
  manager2 = t.users["manager2@example.test"];
  manager3 = t.users["manager3@example.test"];
  admin = t.users["admin@example.test"];
  main1 = await positionOf("teacher1@example.test", "main");
  additional1 = await positionOf("teacher1@example.test", "additional");
}, 60_000);

/** AC-BEHALF-02: «the additional position (manager manager2@example.test, Thu 15:45–17:00)» — лише на час тесту. */
async function withThursdayAdditional(run: () => Promise<void>) {
  await t.asService(
    "insert into public.schedule_blocks (employee_id, position_id, weekday, start_min, end_min) values ($1, $2, 4, 945, 1020)",
    [teacher1, additional1],
  );
  try {
    await run();
  } finally {
    await t.asService("delete from public.leave_requests");
    await t.asService("delete from public.schedule_blocks where position_id = $1 and weekday = 4", [additional1]);
  }
}

afterEach(async () => {
  await t.asService("delete from public.leave_requests");
  await t.asService("delete from public.substitute_lists");
});

describe("submitting on behalf of an employee", () => {
  it("AC-BEHALF-01: manager1@ submits Sick leave for teacher1@'s main position — Approved, history shows who submitted", async () => {
    const result = await onBehalf(manager1, teacher1, "sick", [{ position_id: main1, date: THU, ...WHOLE }]);
    expect(result).toMatchObject({ approved: 1, awaiting: 0 });

    const mine = await t.asUser<{
      id: number;
      date: string;
      start_min: number;
      end_min: number;
      leave_type: string;
      status: string;
    }>(
      teacher1,
      "select id, to_char(date, 'YYYY-MM-DD') as date, start_min, end_min, leave_type, status from public.my_leave_records",
    );
    expect(mine).toEqual([
      {
        id: expect.any(Number),
        date: THU,
        start_min: 510,
        end_min: 930,
        leave_type: "sick",
        status: "approved",
      },
    ]);

    const history = await historyOf(teacher1, mine[0].id);
    expect(history.map((h) => [h.action, h.comment])).toEqual([
      ["submitted_on_behalf", "Submitted by manager1@example.test on behalf of teacher1@example.test"],
      ["approved", null],
    ]);
    // «… and "Approved by …" with the same time» (Assumptions PM): обидві події — одна транзакція.
    expect(history[0].created_at).toBe(history[1].created_at);
    const [{ actor }] = await t.asService<{ actor: string }>(
      "select actor_id as actor from public.leave_record_events where record_id = $1 and action = 'approved'",
      [mine[0].id],
    );
    expect(actor).toBe(manager1);
  });

  it("AC-BEHALF-02: the main-position record is Approved; the additional one awaits manager2@'s decision", () =>
    withThursdayAdditional(async () => {
      const result = await onBehalf(manager1, teacher1, "sick", [
        { position_id: main1, date: THU, ...WHOLE },
        { position_id: additional1, date: THU, ...ADDITIONAL },
      ]);
      expect(result).toMatchObject({ approved: 1, awaiting: 1 });
      const [mainId, additionalId] = await recordIdsOf(result.request_id);
      expect((await recordOf(mainId)).status).toBe("approved");
      expect((await recordOf(additionalId)).status).toBe("awaiting");

      const queue = async (who: string) =>
        (await t.asUser<{ id: number }>(who, "select id from public.decision_records() where status = 'awaiting'")).map(
          (r) => r.id,
        );
      expect(await queue(manager2)).toContain(additionalId);
      expect(await queue(manager1)).not.toContain(additionalId);
      // Подію «Submitted by …» має й запис, що чекає рішення.
      expect((await historyOf(teacher1, additionalId)).map((h) => h.action)).toEqual(["submitted_on_behalf"]);
    }));

  it("AC-BEHALF-03: the administrator submits for both positions — both Approved", () =>
    withThursdayAdditional(async () => {
      const result = await onBehalf(admin, teacher1, "sick", [
        { position_id: main1, date: THU, ...WHOLE },
        { position_id: additional1, date: THU, ...ADDITIONAL },
      ]);
      expect(result).toMatchObject({ approved: 2, awaiting: 0 });
      const ids = await recordIdsOf(result.request_id);
      expect(await Promise.all(ids.map(async (id) => (await recordOf(id)).status))).toEqual(["approved", "approved"]);
      expect((await historyOf(teacher1, ids[0]))[0].comment).toBe(
        "Submitted by admin@example.test on behalf of teacher1@example.test",
      );
    }));

  it("AC-BEHALF-04: after the on-behalf record teacher1@'s Sick leave shows used 1.00, remaining 17.00", async () => {
    expect((await balancesOf(teacher1)).sick).toEqual({
      used: "0.00",
      remaining: "18.00",
    });
    await onBehalf(manager1, teacher1, "sick", [{ position_id: main1, date: THU, ...WHOLE }]);
    expect((await balancesOf(teacher1)).sick).toEqual({
      used: "1.00",
      remaining: "17.00",
    });
  });

  it("AC-BEHALF-04: a record over the balance is approved with the suggested split, as in AC-BALANCE-10", async () => {
    await usePersonal175();

    const result = await onBehalf(manager1, teacher1, "personal", [{ position_id: main1, date: THU, ...WHOLE }]);
    const [id] = await recordIdsOf(result.request_id);
    expect(await recordOf(id)).toMatchObject({
      status: "approved",
      paid_days: "0.50",
      unpaid_days: "0.50",
    });
    const b = await balancesOf(teacher1);
    expect([b.personal.used, b.personal.remaining, b.unpaid]).toEqual(["18.00", "0.00", "0.50"]);
  });

  it("AC-BEHALF-05: only Saturday — 'This employee has no working hours on this day', no request", async () => {
    await expect(onBehalf(manager1, teacher1, "sick", [{ position_id: main1, date: SAT, ...WHOLE }])).rejects.toThrow(
      /^This employee has no working hours on this day$/,
    );
    expect(await requestCount(teacher1)).toBe(0);
  });

  it("AC-BEHALF-05: other checks speak of 'this employee' too: hours outside the schedule and an overlap", async () => {
    await expect(
      onBehalf(manager1, teacher1, "sick", [{ position_id: main1, date: THU, start_min: 960, end_min: 1020 }]),
    ).rejects.toThrow(/^Hours must be within the schedule: 08:30–15:30$/);
    await givenAwaiting(THU, "sick", { start_min: 540, end_min: 660 });
    await expect(onBehalf(manager1, teacher1, "sick", [{ position_id: main1, date: THU, ...WHOLE }])).rejects.toThrow(
      /^This employee already has a request for this time: 2026-12-03 09:00–11:00$/,
    );
    expect(await requestCount(teacher1)).toBe(1);
  });

  it("the employee's own request still says 'you' and records the event 'submitted'", async () => {
    const [id] = await ownRequest(teacher1, "sick", [{ position_id: main1, date: THU, ...WHOLE }]);
    expect((await recordOf(id)).status).toBe("awaiting");
    expect((await historyOf(teacher1, id)).map((h) => [h.action, h.comment])).toEqual([["submitted", null]]);
    await expect(ownRequest(teacher1, "sick", [{ position_id: main1, date: SAT, ...WHOLE }])).rejects.toThrow(
      /^You have no working hours on this day$/,
    );
  });

  it("AC-BEHALF-05: a substitute from the employee's list is kept; one outside it is refused with 'this employee'", async () => {
    await t.asService("insert into public.substitute_lists (employee_id, substitute_id) values ($1, $2)", [
      teacher1,
      assistant1,
    ]);
    const result = await onBehalf(manager1, teacher1, "sick", [
      { position_id: main1, date: THU, ...WHOLE, substitute_id: assistant1 },
    ]);
    const [id] = await recordIdsOf(result.request_id);
    expect((await recordOf(id)).substitute).toBe("assistant1@example.test");
    await expect(
      onBehalf(manager1, teacher1, "sick", [{ position_id: main1, date: FRI, ...WHOLE, substitute_id: teacher2 }]),
    ).rejects.toThrow(/^This substitute is no longer on this employee's substitute list$/);
  });
});

describe("who may submit on behalf", () => {
  it("AC-BEHALF-11: manager1@ for teacher3@ — refused with the AC text, no record created", async () => {
    const position = await positionOf("teacher3@example.test", "main");
    await expect(
      onBehalf(manager1, teacher3, "sick", [{ position_id: position, date: THU, ...WHOLE }]),
    ).rejects.toThrow(TEXT.notYours);
    await expect(t.asUser(manager1, "select * from public.on_behalf_positions($1)", [teacher3])).rejects.toThrow(
      TEXT.notYours,
    );
    await expect(
      t.asUser(manager1, "select * from public.on_behalf_record_dates($1, '2026-09-01', '2027-08-31')", [teacher3]),
    ).rejects.toThrow(TEXT.notYours);
    expect(await requestCount(teacher3)).toBe(0);
    // Неіснуючий профіль — той самий текст: не розкриваємо, чи він існує.
    await expect(
      t.asUser(admin, "select * from public.on_behalf_positions('a0000000-0000-0000-0000-999999999999')"),
    ).rejects.toThrow(TEXT.notYours);
  });

  it("AC-BEHALF-11: a position of another employee is not accepted even for an employee of the manager", async () => {
    const other = await positionOf("teacher2@example.test", "main");
    await expect(onBehalf(manager1, teacher1, "sick", [{ position_id: other, date: THU, ...WHOLE }])).rejects.toThrow(
      "Position not found",
    );
    expect(await requestCount(teacher2)).toBe(0);
  });

  it("AC-BEHALF-12: teacher1@ (employee) for teacher2@ — refused with the AC text, no record created", async () => {
    const position = await positionOf("teacher2@example.test", "main");
    await expect(
      onBehalf(teacher1, teacher2, "sick", [{ position_id: position, date: THU, ...WHOLE }]),
    ).rejects.toThrow(TEXT.employee);
    await expect(t.asUser(teacher1, "select * from public.on_behalf_employees()")).rejects.toThrow(TEXT.employee);
    await expect(t.asUser(teacher1, "select * from public.on_behalf_positions($1)", [teacher2])).rejects.toThrow(
      TEXT.employee,
    );
    expect(await requestCount(teacher2)).toBe(0);
  });

  it("AC-BEHALF-15: manager3@ has no positions — empty-handed with the AC text", async () => {
    await expect(t.asUser(manager3, "select * from public.on_behalf_employees()")).rejects.toThrow(TEXT.noEmployees);
    await expect(onBehalf(manager3, teacher1, "sick", [{ position_id: main1, date: THU, ...WHOLE }])).rejects.toThrow(
      TEXT.noEmployees,
    );
    expect(await requestCount(teacher1)).toBe(0);
  });

  it("a manager lists only employees of their positions, the administrator everyone but themselves", async () => {
    const list = async (who: string) =>
      (await t.asUser<{ email: string }>(who, "select email from public.on_behalf_employees()")).map((r) => r.email);
    expect(await list(manager1)).toEqual(["teacher1@example.test"]);
    expect(await list(manager2)).toEqual(["teacher1@example.test", "teacher2@example.test"]);
    const everyone = await list(admin);
    expect(everyone).not.toContain("admin@example.test");
    expect(everyone).toContain("teacher3@example.test");
    // Positions of teacher1@ — обидві, зокрема посада іншого менеджера, з позначкою, чи погодяться одразу.
    const positions = await t.asUser<{
      kind: string;
      decides: boolean;
      blocks: { weekday: number }[];
    }>(manager1, "select kind, decides, blocks from public.on_behalf_positions($1)", [teacher1]);
    expect(positions.map((p) => [p.kind, p.decides])).toEqual([
      ["main", true],
      ["additional", false],
    ]);
    expect(positions[0].blocks).toHaveLength(5);
  });

  it("a manager cannot submit on behalf of themselves; a guest cannot call the functions", async () => {
    const own = await positionOf("manager1@example.test", "main");
    await expect(onBehalf(manager1, manager1, "sick", [{ position_id: own, date: THU, ...WHOLE }])).rejects.toThrow(
      "Submit your own leave from New request",
    );
    await expect(
      t.asAnon("select public.submit_leave_request_on_behalf($1, 'sick', '[]'::jsonb)", [teacher1]),
    ).rejects.toThrow(/permission denied/);
    await expect(t.asAnon("select * from public.on_behalf_employees()")).rejects.toThrow(/permission denied/);
  });

  it("the dates of the employee's active records are listed for the calendar without types", async () => {
    await givenAwaiting(THU);
    const rejected = await givenAwaiting(FRI);
    await t.asService("update public.leave_records set status = 'rejected' where id = $1", [rejected]);
    const rows = await t.asUser<{ date: string }>(
      manager1,
      "select to_char(date, 'YYYY-MM-DD') as date from public.on_behalf_record_dates($1, '2026-09-01', '2027-08-31')",
      [teacher1],
    );
    expect(rows).toEqual([{ date: THU }]);
  });
});

describe("changing a record before deciding (closed for authenticated until step 4 of D9)", () => {
  it("AC-BEHALF-06: the date 2026-12-03 → 2026-12-04 keeps the hours and status; the history line is verbatim", async () => {
    const id = await givenAwaiting();
    await edit(manager1, id, { date: FRI, ...WHOLE, leave_type: "sick" });
    expect(await recordOf(id)).toMatchObject({
      date: FRI,
      start_min: 510,
      end_min: 930,
      status: "awaiting",
    });
    const history = await historyOf(teacher1, id);
    expect(history.at(-1)).toMatchObject({
      action: "record_changed",
      comment: "manager1@example.test changed the date: 2026-12-03 → 2026-12-04",
    });
  });

  it("AC-BEHALF-06: the record is not checked against itself, but an overlap with another record is refused", async () => {
    const id = await givenAwaiting(THU, "sick", {
      start_min: 510,
      end_min: 720,
    });
    // Ті самі години зсунуто в межах себе — не перетин.
    await edit(manager1, id, {
      date: THU,
      start_min: 540,
      end_min: 780,
      leave_type: "sick",
    });
    expect(await recordOf(id)).toMatchObject({ start_min: 540, end_min: 780 });
    await givenAwaiting(FRI, "sick", { start_min: 540, end_min: 660 });
    await expect(edit(manager1, id, { date: FRI, ...WHOLE, leave_type: "sick" })).rejects.toThrow(
      /^This employee already has a request for this time: 2026-12-04 09:00–11:00$/,
    );
    expect(await recordOf(id)).toMatchObject({
      date: THU,
      start_min: 540,
      end_min: 780,
    });
  });

  it("AC-BEHALF-06: the overlap message names the other record, never the record being changed", async () => {
    const id = await givenAwaiting(THU, "sick", { start_min: 510, end_min: 600 });
    await givenAwaiting(THU, "sick", { start_min: 600, end_min: 660 });
    await expect(edit(manager1, id, { date: THU, start_min: 510, end_min: 720, leave_type: "sick" })).rejects.toThrow(
      /^This employee already has a request for this time: 2026-12-03 10:00–11:00$/,
    );
  });

  it("AC-BEHALF-07: Sick leave → Personal leave, one history line verbatim", async () => {
    const id = await givenAwaiting(FRI);
    await edit(manager1, id, { date: FRI, ...WHOLE, leave_type: "personal" });
    expect((await recordOf(id)).leave_type).toBe("personal");
    expect((await historyOf(teacher1, id)).at(-1)?.comment).toBe(
      "manager1@example.test changed the leave type: Sick leave → Personal leave",
    );
  });

  it("AC-BEHALF-08: No substitute → teacher2@ from the list; outside the list and a busy substitute are refused", async () => {
    await t.asService("insert into public.substitute_lists (employee_id, substitute_id) values ($1, $2), ($1, $3)", [
      teacher1,
      teacher2,
      assistant1,
    ]);
    const id = await givenAwaiting(FRI);
    await edit(manager1, id, {
      date: FRI,
      ...WHOLE,
      leave_type: "sick",
      substitute_id: teacher2,
    });
    expect((await recordOf(id)).substitute).toBe("teacher2@example.test");
    expect((await historyOf(teacher1, id)).at(-1)?.comment).toBe(
      "manager1@example.test changed the substitute: No substitute → teacher2@example.test",
    );

    await expect(
      edit(manager1, id, {
        date: FRI,
        ...WHOLE,
        leave_type: "sick",
        substitute_id: teacher3,
      }),
    ).rejects.toThrow(/^This substitute is not on this employee's substitute list$/);
    // assistant1@ має власний запис у п'ятницю 09:00–11:00.
    const [busy] = await ownRequest(assistant1, "sick", [
      {
        position_id: await positionOf("assistant1@example.test", "main"),
        date: FRI,
        start_min: 540,
        end_min: 660,
      },
    ]);
    expect(busy).toBeGreaterThan(0);
    await expect(
      edit(manager1, id, {
        date: FRI,
        ...WHOLE,
        leave_type: "sick",
        substitute_id: assistant1,
      }),
    ).rejects.toThrow(/^assistant1@example\.test is not available at this time: 2026-12-04 09:00–11:00$/);
    expect((await recordOf(id)).substitute).toBe("teacher2@example.test");
  });

  it("AC-BEHALF-08: several fields at once — one line per field in the order date, hours, leave type, substitute", async () => {
    await t.asService("insert into public.substitute_lists (employee_id, substitute_id) values ($1, $2)", [
      teacher1,
      teacher2,
    ]);
    const id = await givenAwaiting(THU);
    await edit(manager1, id, {
      date: FRI,
      start_min: 510,
      end_min: 720,
      leave_type: "family",
      relationship: "child",
      substitute_id: teacher2,
    });
    const lines = (await historyOf(teacher1, id)).filter((h) => h.action === "record_changed").map((h) => h.comment);
    expect(lines).toEqual([
      "manager1@example.test changed the date: 2026-12-03 → 2026-12-04",
      "manager1@example.test changed the hours: 08:30–15:30 → 08:30–12:00",
      "manager1@example.test changed the leave type: Sick leave → Family celebration (child)",
      "manager1@example.test changed the substitute: No substitute → teacher2@example.test",
    ]);
    // Нічого не змінилось — жодного нового рядка.
    const before = await eventCount(id);
    await edit(manager1, id, {
      date: FRI,
      start_min: 510,
      end_min: 720,
      leave_type: "family",
      relationship: "child",
      substitute_id: teacher2,
    });
    expect(await eventCount(id)).toBe(before);
  });

  it("AC-BEHALF-09: hours 16:00–17:00 — 'Hours must be within the schedule: 08:30–15:30', nothing saved", async () => {
    const id = await givenAwaiting(FRI);
    const before = await eventCount(id);
    await expect(
      edit(manager1, id, {
        date: FRI,
        start_min: 960,
        end_min: 1020,
        leave_type: "sick",
      }),
    ).rejects.toThrow(/^Hours must be within the schedule: 08:30–15:30$/);
    expect(await recordOf(id)).toMatchObject({
      date: FRI,
      start_min: 510,
      end_min: 930,
    });
    expect(await eventCount(id)).toBe(before);
    // Субота й закритий день — ті самі перевірки, що в новому записі.
    await expect(edit(manager1, id, { date: SAT, ...WHOLE, leave_type: "sick" })).rejects.toThrow(
      /^This employee has no working hours on this day$/,
    );
  });

  it("AC-BEHALF-10: an Approved, Rejected, Returned or Cancelled record cannot be changed", async () => {
    for (const status of ["approved", "rejected", "returned", "cancelled"]) {
      const id = await givenAwaiting(FRI);
      await t.asService("update public.leave_records set status = $2 where id = $1", [id, status]);
      const before = await eventCount(id);
      await expect(edit(manager1, id, { date: THU, ...WHOLE, leave_type: "sick" })).rejects.toThrow(TEXT.decided);
      expect(await recordOf(id)).toMatchObject({ date: FRI, status });
      expect(await eventCount(id)).toBe(before);
      await t.asService("delete from public.leave_requests");
    }
  });

  it("AC-BEHALF-13: manager2@ changing a main-position record directly is refused; nothing changes", async () => {
    await t.asService("insert into public.substitute_lists (employee_id, substitute_id) values ($1, $2)", [
      teacher1,
      teacher2,
    ]);
    const id = await givenAwaiting(THU);
    const before = { record: await recordOf(id), events: await eventCount(id) };
    // Логіка функції: manager2@ не відповідає за основну посаду.
    await expect(edit(manager2, id, { date: FRI, ...WHOLE, leave_type: "sick" })).rejects.toThrow(
      "You can't change this record",
    );
    // В обхід сторінок через Data API: функції правки authenticated не має (крок 1 D9), update таблиці — теж.
    await expect(
      t.asUser(manager2, "select public.edit_leave_record($1, $2::date, 510, 930, 'sick', null, null)", [id, FRI]),
    ).rejects.toThrow(/permission denied/);
    await expect(
      t.asUser(manager1, "select public.edit_leave_record($1, $2::date, 510, 930, 'sick', null, null)", [id, FRI]),
    ).rejects.toThrow(/permission denied/);
    await expect(
      t.asUser(manager2, "update public.leave_records set date = $2 where id = $1", [id, FRI]),
    ).rejects.toThrow(/permission denied/);
    await expect(
      t.asUser(manager2, "update public.leave_records set substitute_id = $2, leave_type = 'personal' where id = $1", [
        id,
        teacher2,
      ]),
    ).rejects.toThrow(/permission denied/);
    expect(await recordOf(id)).toEqual(before.record);
    expect(await eventCount(id)).toBe(before.events);
  });

  it("the employee cannot change their own record through edit, and a manager's own record goes to an administrator", async () => {
    const id = await givenAwaiting(FRI);
    await expect(edit(teacher1, id, { date: THU, ...WHOLE, leave_type: "sick" })).rejects.toThrow(
      "You can't change this record",
    );
    const own = await positionOf("manager1@example.test", "main");
    const [mine] = await ownRequest(manager1, "sick", [{ position_id: own, date: FRI, ...WHOLE }]);
    await expect(edit(manager1, mine, { date: THU, ...WHOLE, leave_type: "sick" })).rejects.toThrow(
      "Your own record is decided by an administrator",
    );
    await edit(admin, mine, { date: THU, ...WHOLE, leave_type: "sick" });
    expect((await recordOf(mine)).date).toBe(THU);
  });
});

describe("deciding sees another manager's change (D9)", () => {
  const decide9 = (
    actor: string,
    id: number,
    seen: { date: string; leave_type: string; substitute_id: string | null },
  ) =>
    t.asUser<{ result: { status: string } }>(
      actor,
      "select public.decide_leave_record($1, 'approve', 510, 930, $2::date, $3, $4::uuid) as result",
      [id, seen.date, seen.leave_type, seen.substitute_id],
    );

  it("AC-BEHALF-06: a decision prepared before the date changed is refused; the record stays Awaiting decision", async () => {
    const id = await givenAwaiting(THU);
    await edit(manager1, id, { date: FRI, ...WHOLE, leave_type: "sick" });
    await expect(
      decide9(manager1, id, {
        date: THU,
        leave_type: "sick",
        substitute_id: null,
      }),
    ).rejects.toThrow(TEXT.changed);
    expect((await recordOf(id)).status).toBe("awaiting");
    const [{ result }] = await decide9(manager1, id, {
      date: FRI,
      leave_type: "sick",
      substitute_id: null,
    });
    expect(result.status).toBe("approved");
  });

  it("AC-BEHALF-07: a decision prepared before the leave type changed is refused", async () => {
    const id = await givenAwaiting(FRI);
    await edit(manager1, id, { date: FRI, ...WHOLE, leave_type: "personal" });
    await expect(
      decide9(manager1, id, {
        date: FRI,
        leave_type: "sick",
        substitute_id: null,
      }),
    ).rejects.toThrow(TEXT.changed);
    expect((await recordOf(id)).status).toBe("awaiting");
  });

  it("AC-BEHALF-08: a decision prepared before the substitute changed (none → someone and back) is refused", async () => {
    await t.asService("insert into public.substitute_lists (employee_id, substitute_id) values ($1, $2)", [
      teacher1,
      teacher2,
    ]);
    const id = await givenAwaiting(FRI);
    await edit(manager1, id, {
      date: FRI,
      ...WHOLE,
      leave_type: "sick",
      substitute_id: teacher2,
    });
    await expect(
      decide9(manager1, id, {
        date: FRI,
        leave_type: "sick",
        substitute_id: null,
      }),
    ).rejects.toThrow(TEXT.changed);
    await edit(manager1, id, {
      date: FRI,
      ...WHOLE,
      leave_type: "sick",
      substitute_id: null,
    });
    await expect(
      decide9(manager1, id, {
        date: FRI,
        leave_type: "sick",
        substitute_id: teacher2,
      }),
    ).rejects.toThrow(TEXT.changed);
    expect((await recordOf(id)).status).toBe("awaiting");
  });

  it("a session without a profile cannot decide any record", async () => {
    const id = await givenAwaiting(FRI);
    await expect(
      t.asUser(
        "a0000000-0000-0000-0000-999999999999",
        "select public.decide_leave_record($1, 'approve', 510, 930, $2::date, 'sick', null) as result",
        [id, FRI],
      ),
    ).rejects.toThrow("You can't decide on this record");
    expect((await recordOf(id)).status).toBe("awaiting");
  });

  it("the old six-parameter call is gone after the contract step of D9 — a decision always names the date, type and substitute", async () => {
    const id = await givenAwaiting(FRI);
    await expect(
      t.asUser(manager1, "select public.decide_leave_record($1, 'approve', 510, 930) as result", [id]),
    ).rejects.toMatchObject({ code: "42883" });
    expect((await recordOf(id)).status).toBe("awaiting");
  });

  it("changed hours are reported before the balance check, even when the record is over the balance", async () => {
    const id = await givenAwaiting(FRI, "personal");
    await t.asService("update public.leave_records set start_min = 540, minutes = 390 where id = $1", [id]);
    // Залишку бракує (17.50 з 18.00 використано): без перевірки годин спершу відповіла б підказка розподілу.
    await usePersonal175();
    await expect(decide9(manager1, id, { date: FRI, leave_type: "personal", substitute_id: null })).rejects.toThrow(
      "The employee has changed the hours of this record. Check them again before deciding",
    );
  });

});

describe("'this employee' texts (D6)", () => {
  it("AC-BEHALF-05: private.on_behalf_message and forEmployee give the same text for the same lines", async () => {
    const lines = [
      "You have no working hours on this day",
      "Hours must be within your schedule: 08:30–12:00, 12:30–15:30",
      "You already have a request for this time: 2026-12-03 09:00–11:00",
      "This substitute is no longer on your substitute list",
      employeeWarning("personal", 150, 50)!,
      "The school is closed on this day: Holiday",
      "The comment can be at most 500 characters",
      "assistant1@example.test is not available at this time: 2026-12-04 09:00–11:00",
    ];
    for (const line of lines) {
      const [{ text }] = await asOwner<{ text: string }>(manager1, "select private.on_behalf_message($1) as text", [
        line,
      ]);
      expect(text).toBe(forEmployee(line));
    }
  });
});
