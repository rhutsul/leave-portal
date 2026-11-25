// Заміни для записів на справжньому Postgres (PGlite, docs/decisions/0001-pglite-db-tests.md): таблиця
// substitute_lists під RLS, заміна й позначка підвищення в submit_leave_request, зайнятість заміни і функції читання з
// міграції 20261125000321_substitutes.sql (D1–D6 openspec/changes/impl-substitutes/design.md).
//
// Тестові дані D9: teacher1@ — основна «Elementary school / Teacher» (manager1@), Mon–Fri 08:30–15:30, і додаткова
// «High school / Math teacher» (manager2@); teacher2@ — основна «High school / Teacher» (manager2@), у вівторок два
// блоки 08:30–12:00 і 12:30–15:30; assistant1@ — «Elementary school / Assistant», teacher3@ — «Elementary school /
// Teacher» (обидва Mon–Fri 08:30–15:30, без відповідального менеджера). Де «Given» AC каже інакше, тест сам приводить дані до нього.
// 2026-12-02 — середа, 2026-12-01 — вівторок.
import { afterEach, beforeAll, describe, expect, it } from "vitest";
import { createLeaveDb, type LeaveDb } from "./supabase-pglite";

let t: LeaveDb;
let teacher1: string;
let teacher2: string;
let teacher3: string;
let assistant1: string;
let manager1: string;
let manager2: string;
let admin: string;

const DAY = "2026-12-02";
const TUESDAY = "2026-12-01";
const WHOLE = { start_min: 510, end_min: 930 };
const NOT_MANAGER = "Only the manager of this employee's position can change the substitute list";

async function positionOf(email: string, kind = "main") {
  const [row] = await t.asService<{ id: number }>(
    `select p.id from public.positions as p join public.profiles as pr on pr.id = p.employee_id
      where pr.email = $1 and p.kind = $2`,
    [email, kind],
  );
  return row.id;
}

const listOf = async (employee: string) =>
  (
    await t.asService<{ email: string }>(
      `select p.email from public.substitute_lists as s join public.profiles as p on p.id = s.substitute_id
        where s.employee_id = $1 order by p.email`,
      [employee],
    )
  ).map((r) => r.email);

const addAs = (userId: string, employee: string, substitute: string) =>
  t.asUser(userId, "insert into public.substitute_lists (employee_id, substitute_id) values ($1, $2)", [
    employee,
    substitute,
  ]);

/** Список замін за «Given» (service_role, як тестові дані). */
async function givenList(employee: string, substitutes: string[]) {
  await t.asService("delete from public.substitute_lists where employee_id = $1", [employee]);
  for (const s of substitutes) {
    await t.asService("insert into public.substitute_lists (employee_id, substitute_id) values ($1, $2)", [employee, s]);
  }
}

type Rec = { date: string; start_min: number; end_min: number; substitute_id?: string | null };

/** Заявка працівника на основну посаду; повертає id записів у порядку дат. */
async function submit(userId: string, records: Rec[], positionId?: number, leaveType = "personal") {
  const position = positionId ?? (await t.asService<{ id: number }>(
    "select id from public.positions where employee_id = $1 and kind = 'main'",
    [userId],
  ))[0].id;
  const payload = records.map((r) => ({ position_id: position, ...r }));
  const [{ id }] = await t.asUser<{ id: number }>(userId, "select public.submit_leave_request($1, $2::jsonb) as id", [
    leaveType,
    JSON.stringify(payload),
  ]);
  return (
    await t.asService<{ id: number }>("select id from public.leave_records where request_id = $1 order by date, start_min", [id])
  ).map((r) => r.id);
}

/** Запис зі статусом для «Given …» (статус ставить service_role). */
async function given(userId: string, rec: Rec, status: string, positionId?: number) {
  const [id] = await submit(userId, [rec], positionId);
  if (status !== "awaiting") await t.asService("update public.leave_records set status = $2 where id = $1", [id, status]);
  return id;
}

const recordOf = async (id: number) =>
  (
    await t.asService<{ date: string; start_min: number; end_min: number; status: string; substitute: string | null; upgrade_minutes: number | null }>(
      `select to_char(r.date, 'YYYY-MM-DD') as date, r.start_min, r.end_min, r.status, p.email as substitute,
              r.upgrade_minutes
         from public.leave_records as r left join public.profiles as p on p.id = r.substitute_id where r.id = $1`,
      [id],
    )
  )[0];

const requestCount = async (userId: string) =>
  Number((await t.asService<{ n: number }>("select count(*) as n from public.leave_requests where employee_id = $1", [userId]))[0].n);

beforeAll(async () => {
  t = await createLeaveDb();
  teacher1 = t.users["teacher1@example.test"];
  teacher2 = t.users["teacher2@example.test"];
  teacher3 = t.users["teacher3@example.test"];
  assistant1 = t.users["assistant1@example.test"];
  manager1 = t.users["manager1@example.test"];
  manager2 = t.users["manager2@example.test"];
  admin = t.users["admin@example.test"];
}, 60_000);

afterEach(async () => {
  await t.asService("delete from public.leave_requests");
  await t.asService("delete from public.substitute_lists");
});

describe("substitute list: who keeps it", () => {
  it("AC-SUBST-01: the manager of the main position adds two people and the list shows exactly them", async () => {
    expect(await listOf(teacher1)).toEqual([]);
    await addAs(manager1, teacher1, assistant1);
    await addAs(manager1, teacher1, teacher2);

    expect(await listOf(teacher1)).toEqual(["assistant1@example.test", "teacher2@example.test"]);
    const rows = await t.asUser<{ email: string }>(manager1, "select email from public.substitute_list($1)", [teacher1]);
    expect(rows.map((r) => r.email)).toEqual(["assistant1@example.test", "teacher2@example.test"]);
    // added_by ставить default — той, хто додав.
    const [{ added_by }] = await t.asService<{ added_by: string }>(
      "select added_by from public.substitute_lists where employee_id = $1 limit 1",
      [teacher1],
    );
    expect(added_by).toBe(manager1);
  });

  it("AC-SUBST-01: an administrator keeps any employee's list; nobody is on their own list", async () => {
    await addAs(admin, teacher2, teacher3);
    expect(await listOf(teacher2)).toEqual(["teacher3@example.test"]);
    await expect(addAs(admin, teacher2, teacher2)).rejects.toThrow(/substitute_lists_not_self_check/);
    await expect(addAs(admin, teacher2, teacher3)).rejects.toThrow(/duplicate key/);
  });

  it("AC-SUBST-12: an employee cannot add to or remove from another employee's list", async () => {
    await givenList(teacher2, [teacher3]);
    await expect(addAs(teacher1, teacher2, assistant1)).rejects.toThrow(/row-level security/);
    const deleted = await t.asUser(
      teacher1,
      "delete from public.substitute_lists where employee_id = $1 returning substitute_id",
      [teacher2],
    );
    expect(deleted).toEqual([]);
    expect(await listOf(teacher2)).toEqual(["teacher3@example.test"]);
    await expect(t.asUser(teacher1, "select * from public.substitute_list($1)", [teacher2])).rejects.toThrow(NOT_MANAGER);
    await expect(t.asUser(teacher1, "select * from public.substitute_candidates($1)", [teacher2])).rejects.toThrow(
      NOT_MANAGER,
    );
    expect(await t.asUser(teacher1, "select * from public.manageable_employees()")).toEqual([]);
  });

  it("AC-SUBST-13: a manager of none of the employee's positions cannot add directly", async () => {
    await givenList(teacher1, [assistant1, teacher2]);
    // «Given manager2@ is not the manager of any of teacher1@'s positions»: у демоданих він веде додаткову посаду.
    const additional = await positionOf("teacher1@example.test", "additional");
    await t.asService("delete from public.position_managers where position_id = $1 and manager_id = $2", [additional, manager2]);
    try {
      await expect(addAs(manager2, teacher1, teacher3)).rejects.toThrow(/row-level security/);
      const deleted = await t.asUser(manager2, "delete from public.substitute_lists where employee_id = $1 returning 1", [teacher1]);
      expect(deleted).toEqual([]);
      await expect(t.asUser(manager2, "select * from public.substitute_list($1)", [teacher1])).rejects.toThrow(NOT_MANAGER);
      expect(await listOf(teacher1)).toEqual(["assistant1@example.test", "teacher2@example.test"]);
    } finally {
      await t.asService("insert into public.position_managers (position_id, manager_id) values ($1, $2)", [additional, manager2]);
    }
  });

  it("a guest reads nothing and an employee cannot update rows or forge added_by", async () => {
    await givenList(teacher1, [assistant1]);
    await expect(t.asAnon("select * from public.substitute_lists")).rejects.toThrow(/permission denied/);
    await expect(t.asAnon("select * from public.my_substitutions()")).rejects.toThrow(/permission denied/);
    await expect(
      t.asUser(manager1, "update public.substitute_lists set substitute_id = $1 where employee_id = $2", [teacher3, teacher1]),
    ).rejects.toThrow(/permission denied/);
    await expect(
      t.asUser(manager1, "insert into public.substitute_lists (employee_id, substitute_id, added_by) values ($1, $2, $3)", [
        teacher1,
        teacher3,
        admin,
      ]),
    ).rejects.toThrow(/permission denied/);
    // Працівник бачить рядки власного списку, але не чужого.
    expect(await t.asUser(teacher1, "select substitute_id from public.substitute_lists")).toHaveLength(1);
    expect(await t.asUser(teacher2, "select substitute_id from public.substitute_lists")).toEqual([]);
  });

  it("the manager's index lists employees of their positions with counts; candidates leave out the list", async () => {
    await givenList(teacher1, [assistant1, teacher2]);
    const index = await t.asUser<{ email: string; substitute_count: number }>(
      manager1,
      "select email, substitute_count from public.manageable_employees()",
    );
    expect(index.map((r) => r.email)).toEqual(["manager1@example.test", "teacher1@example.test"]);
    expect(index.find((r) => r.email === "teacher1@example.test")?.substitute_count).toBe(2);
    const candidates = await t.asUser<{ email: string }>(manager1, "select email from public.substitute_candidates($1)", [teacher1]);
    expect(candidates.map((r) => r.email)).not.toContain("teacher1@example.test");
    expect(candidates.map((r) => r.email)).not.toContain("assistant1@example.test");
    expect(candidates.map((r) => r.email)).toContain("teacher3@example.test");
  });
});

describe("submit_leave_request with a substitute", () => {
  it("AC-SUBST-02: the record has the substitute and the manager sees it", async () => {
    await givenList(teacher1, [assistant1, teacher2]);
    const [id] = await submit(teacher1, [{ date: DAY, ...WHOLE, substitute_id: assistant1 }]);
    expect(await recordOf(id)).toMatchObject({
      date: DAY,
      start_min: 510,
      end_min: 930,
      status: "awaiting",
      substitute: "assistant1@example.test",
    });
    const seen = await t.asUser<{ record_id: number; substitute_email: string }>(
      manager1,
      "select record_id, substitute_email from public.record_substitutes($1)",
      [[id]],
    );
    expect(seen).toEqual([{ record_id: id, substitute_email: "assistant1@example.test" }]);
    // Той, хто запису не бачить, нічого не дізнається.
    expect(await t.asUser(teacher2, "select * from public.record_substitutes($1)", [[id]])).toEqual([]);
  });

  it("AC-SUBST-03: without a substitute the record has none", async () => {
    await givenList(teacher1, [assistant1, teacher2]);
    const [id] = await submit(teacher1, [{ date: DAY, ...WHOLE }]);
    expect(await recordOf(id)).toMatchObject({ status: "awaiting", substitute: null, upgrade_minutes: null });
    expect(await t.asUser(manager1, "select * from public.record_substitutes($1)", [[id]])).toEqual([]);
  });

  it("AC-SUBST-04: the options are exactly the list, and someone off the list is refused", async () => {
    await givenList(teacher1, [assistant1, teacher2]);
    const options = await t.asUser<{ email: string }>(teacher1, "select email from public.my_substitute_options()");
    expect(options.map((r) => r.email)).toEqual(["assistant1@example.test", "teacher2@example.test"]);
    await expect(submit(teacher1, [{ date: DAY, ...WHOLE, substitute_id: teacher3 }])).rejects.toThrow(
      "This substitute is no longer on your substitute list",
    );
    expect(await requestCount(teacher1)).toBe(0);
  });

  it("AC-SUBST-11: with an empty list the request is still accepted with no substitute", async () => {
    expect(await t.asUser(teacher1, "select * from public.my_substitute_options()")).toEqual([]);
    const [id] = await submit(teacher1, [{ date: DAY, ...WHOLE }]);
    expect(await recordOf(id)).toMatchObject({ substitute: null });
  });

  it("removing someone from the list keeps the substitute of existing records", async () => {
    await givenList(teacher1, [assistant1]);
    const [id] = await submit(teacher1, [{ date: DAY, ...WHOLE, substitute_id: assistant1 }]);
    await givenList(teacher1, []);
    expect(await recordOf(id)).toMatchObject({ substitute: "assistant1@example.test" });
  });
});

describe("a busy substitute is not accepted", () => {
  it("AC-SUBST-05: the substitute's own Awaiting decision record makes them busy", async () => {
    await givenList(teacher1, [assistant1, teacher2]);
    await given(assistant1, { date: DAY, start_min: 540, end_min: 660 }, "awaiting");
    await expect(submit(teacher1, [{ date: DAY, ...WHOLE, substitute_id: assistant1 }])).rejects.toThrow(
      "assistant1@example.test is not available at this time: 2026-12-02 09:00–11:00",
    );
    expect(await requestCount(teacher1)).toBe(0);
  });

  it("AC-SUBST-06: being the substitute in another Approved record makes them busy", async () => {
    await givenList(teacher1, [assistant1, teacher2]);
    await givenList(teacher2, [assistant1]);
    await given(teacher2, { date: DAY, start_min: 600, end_min: 720, substitute_id: assistant1 }, "approved");
    await expect(submit(teacher1, [{ date: DAY, ...WHOLE, substitute_id: assistant1 }])).rejects.toThrow(
      "assistant1@example.test is not available at this time: 2026-12-02 10:00–12:00",
    );
    expect(await requestCount(teacher1)).toBe(0);
  });

  it("AC-SUBST-06: with several busy records the message names the first by time; Returned for revision counts", async () => {
    await givenList(teacher1, [assistant1]);
    await givenList(teacher3, [assistant1]);
    await given(teacher3, { date: DAY, start_min: 780, end_min: 840, substitute_id: assistant1 }, "returned");
    await given(assistant1, { date: DAY, start_min: 660, end_min: 720 }, "approved");
    await expect(submit(teacher1, [{ date: DAY, ...WHOLE, substitute_id: assistant1 }])).rejects.toThrow(
      "assistant1@example.test is not available at this time: 2026-12-02 11:00–12:00",
    );
  });

  it("AC-SUBST-07: a Rejected or Cancelled record does not make them busy", async () => {
    await givenList(teacher1, [assistant1]);
    const own = await given(assistant1, { date: DAY, ...WHOLE }, "rejected");
    const [id] = await submit(teacher1, [{ date: DAY, ...WHOLE, substitute_id: assistant1 }]);
    expect(await recordOf(id)).toMatchObject({ status: "awaiting", substitute: "assistant1@example.test" });

    await t.asService("delete from public.leave_requests where employee_id = $1", [teacher1]);
    await t.asService("update public.leave_records set status = 'cancelled' where id = $1", [own]);
    const [again] = await submit(teacher1, [{ date: DAY, ...WHOLE, substitute_id: assistant1 }]);
    expect(await recordOf(again)).toMatchObject({ substitute: "assistant1@example.test" });
  });

  it("AC-SUBST-07: records that only touch at the edge do not overlap", async () => {
    await givenList(teacher1, [assistant1]);
    await given(assistant1, { date: DAY, start_min: 720, end_min: 930 }, "approved");
    const [id] = await submit(teacher1, [{ date: DAY, start_min: 510, end_min: 720, substitute_id: assistant1 }]);
    expect(await recordOf(id)).toMatchObject({ substitute: "assistant1@example.test" });
  });

  it("AC-SUBST-07: an own record only in the break between the record's schedule blocks does not make them busy", async () => {
    // teacher2@ у вівторок: 08:30–12:00 і 12:30–15:30; запис assistant1@ 12:00–12:30 — лише в перерві.
    await givenList(teacher2, [assistant1]);
    await given(assistant1, { date: TUESDAY, start_min: 720, end_min: 750 }, "awaiting");
    const [id] = await submit(teacher2, [{ date: TUESDAY, ...WHOLE, substitute_id: assistant1 }]);
    expect(await recordOf(id)).toMatchObject({ status: "awaiting", substitute: "assistant1@example.test" });
    // Хвилиною пізніше за перерву — уже зайнята.
    await t.asService("delete from public.leave_requests where employee_id = $1", [teacher2]);
    await given(assistant1, { date: TUESDAY, start_min: 750, end_min: 780 }, "awaiting");
    await expect(submit(teacher2, [{ date: TUESDAY, ...WHOLE, substitute_id: assistant1 }])).rejects.toThrow(
      "assistant1@example.test is not available at this time: 2026-12-01 12:30–13:00",
    );
  });

  it("AC-SUBST-05: changing the hours into a busy time is refused; the record keeps its hours", async () => {
    await givenList(teacher1, [assistant1]);
    const [id] = await submit(teacher1, [{ date: DAY, start_min: 510, end_min: 600, substitute_id: assistant1 }]);
    await given(assistant1, { date: DAY, start_min: 660, end_min: 720 }, "awaiting");
    await expect(t.asUser(teacher1, "select public.update_leave_record_hours($1, 510, 720)", [id])).rejects.toThrow(
      "assistant1@example.test is not available at this time: 2026-12-02 11:00–12:00",
    );
    expect(await recordOf(id)).toMatchObject({ start_min: 510, end_min: 600 });
    // Зміна в межах вільного часу — приймається; запис не порівнюється сам із собою.
    await t.asUser(teacher1, "select public.update_leave_record_hours($1, 510, 630)", [id]);
    expect(await recordOf(id)).toMatchObject({ start_min: 510, end_min: 630 });
  });
});

describe("upgrade mark", () => {
  it("AC-SUBST-08: an assistant substituting a teacher gives With upgrade: 210 min", async () => {
    await givenList(teacher1, [assistant1, teacher2]);
    const [id] = await submit(teacher1, [{ date: DAY, start_min: 510, end_min: 720, substitute_id: assistant1 }]);
    expect(await recordOf(id)).toMatchObject({ substitute: "assistant1@example.test", upgrade_minutes: 210 });
    const [seen] = await t.asUser<{ upgrade_minutes: number }>(teacher1, "select upgrade_minutes from public.record_substitutes($1)", [[id]]);
    expect(seen.upgrade_minutes).toBe(210);
  });

  it("AC-SUBST-08: changing the hours keeps the mark equal to the record's minutes", async () => {
    await givenList(teacher1, [assistant1]);
    const [id] = await submit(teacher1, [{ date: DAY, start_min: 510, end_min: 720, substitute_id: assistant1 }]);
    await t.asUser(teacher1, "select public.update_leave_record_hours($1, 510, 600)", [id]);
    expect(await recordOf(id)).toMatchObject({ upgrade_minutes: 90 });
  });

  it("AC-SUBST-09: a Math teacher substituting a teacher gives no mark", async () => {
    // «Given teacher2@'s main position is "High school / Math teacher"».
    const main = await positionOf("teacher2@example.test");
    await t.asService("update public.positions set title = 'Math teacher' where id = $1", [main]);
    try {
      await givenList(teacher1, [assistant1, teacher2]);
      const [id] = await submit(teacher1, [{ date: DAY, start_min: 510, end_min: 720, substitute_id: teacher2 }]);
      expect(await recordOf(id)).toMatchObject({ substitute: "teacher2@example.test", upgrade_minutes: null });
    } finally {
      await t.asService("update public.positions set title = 'Teacher' where id = $1", [main]);
    }
  });

  it("AC-SUBST-09: no mark when the absent position is not a teacher's", async () => {
    await givenList(manager1, [assistant1]);
    const [id] = await submit(manager1, [{ date: DAY, start_min: 510, end_min: 720, substitute_id: assistant1 }]);
    expect(await recordOf(id)).toMatchObject({ substitute: "assistant1@example.test", upgrade_minutes: null });
  });

  it("the database refuses a mark that differs from the record's minutes", async () => {
    await givenList(teacher1, [assistant1]);
    const [id] = await submit(teacher1, [{ date: DAY, start_min: 510, end_min: 720, substitute_id: assistant1 }]);
    await expect(t.asService("update public.leave_records set upgrade_minutes = 100 where id = $1", [id])).rejects.toThrow(
      /leave_records_upgrade_minutes_check/,
    );
  });
});

describe("My substitutions", () => {
  it("AC-SUBST-10: the substitute sees one line with date, hours, employee and status", async () => {
    await givenList(teacher1, [assistant1, teacher2]);
    const [id] = await submit(teacher1, [{ date: DAY, ...WHOLE, substitute_id: assistant1 }]);
    const rows = await t.asUser<Record<string, unknown>>(
      assistant1,
      "select record_id, to_char(date, 'YYYY-MM-DD') as date, start_min, end_min, status, employee_email from public.my_substitutions()",
    );
    expect(rows).toEqual([
      { record_id: id, date: DAY, start_min: 510, end_min: 930, status: "awaiting", employee_email: "teacher1@example.test" },
    ]);
    // Без типу відсутності й коментарів.
    const [first] = await t.asUser<Record<string, unknown>>(assistant1, "select * from public.my_substitutions()");
    expect(Object.keys(first).sort()).toEqual(
      ["date", "employee_email", "end_min", "record_id", "start_min", "status", "upgrade_minutes"].sort(),
    );
  });

  it("AC-SUBST-15: only Rejected or Cancelled substitutions give an empty list", async () => {
    await givenList(teacher1, [assistant1]);
    const [id] = await submit(teacher1, [{ date: DAY, ...WHOLE, substitute_id: assistant1 }]);
    await t.asService("update public.leave_records set status = 'rejected' where id = $1", [id]);
    expect(await t.asUser(assistant1, "select * from public.my_substitutions()")).toEqual([]);
    await t.asService("update public.leave_records set status = 'cancelled' where id = $1", [id]);
    expect(await t.asUser(assistant1, "select * from public.my_substitutions()")).toEqual([]);
    expect(await t.asUser(teacher3, "select * from public.my_substitutions()")).toEqual([]);
  });
});
