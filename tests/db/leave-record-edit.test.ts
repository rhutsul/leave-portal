// Дії працівника із власним записом до рішення на справжньому Postgres (PGlite, docs/decisions/0001-pglite-db-tests.md):
// public.update_leave_record_hours, resubmit_leave_record, cancel_leave_record і дата без робочих годин у
// submit_leave_request — з міграції 20261021171135_leave_record_edit.sql. Список менеджера — public.decision_records.
// Тестові дані D7: teacher1@ — основна посада (manager1@) Mon–Fri 08:30–15:30 і додаткова (manager2@) Mon 15:45–17:00.
import { afterEach, beforeAll, describe, expect, it } from "vitest";
import { formatRange } from "@/lib/leave/time";
import { createLeaveDb, type LeaveDb } from "./supabase-pglite";

let t: LeaveDb;
let teacher1: string;
let teacher2: string;
let manager1: string;
let mainPosition: number;
let additionalPosition: number;

// 08:30 = 510, 09:00 = 540, 10:00 = 600, 12:00 = 720, 13:00 = 780, 15:30 = 930.
const WHOLE = { start_min: 510, end_min: 930 };

/** Подає заявку teacher1@ на основну посаду й повертає id записів у порядку дат і годин. */
async function submit(records: { date: string; start_min: number; end_min: number }[], leaveType = "sick") {
  const [{ id }] = await t.asUser<{ id: number }>(
    teacher1,
    "select public.submit_leave_request($1, $2::jsonb) as id",
    [leaveType, JSON.stringify(records.map((r) => ({ position_id: mainPosition, ...r })))],
  );
  const rows = await t.asService<{ id: number }>(
    "select id from public.leave_records where request_id = $1 order by date, start_min",
    [id],
  );
  return rows.map((r) => r.id);
}

const changeHours = (userId: string, recordId: number, start: number, end: number) =>
  t.asUser(userId, "select public.update_leave_record_hours($1, $2, $3)", [recordId, start, end]);
const resubmit = (userId: string, recordId: number) =>
  t.asUser(userId, "select public.resubmit_leave_record($1)", [recordId]);
const cancel = (userId: string, recordId: number) => t.asUser(userId, "select public.cancel_leave_record($1)", [recordId]);
const setStatus = (recordId: number, status: string) =>
  t.asService("update public.leave_records set status = $2 where id = $1", [recordId, status]);

async function recordOf(recordId: number) {
  const [r] = await t.asService<{ start_min: number; end_min: number; minutes: number; status: string; leave_type: string }>(
    "select start_min, end_min, minutes, status, leave_type from public.leave_records where id = $1",
    [recordId],
  );
  return { hours: formatRange(r.start_min, r.end_min), minutes: r.minutes, status: r.status, leave_type: r.leave_type };
}

/** «Awaiting decision» менеджера: id і години записів. */
const awaitingFor = async (userId: string) =>
  (
    await t.asUser<{ id: number; start_min: number; end_min: number }>(
      userId,
      "select id, start_min, end_min from public.decision_records() where status = 'awaiting'",
    )
  ).map((r) => ({ id: r.id, hours: [r.start_min, r.end_min] }));

const actionsOf = async (recordId: number) =>
  (
    await t.asService<{ action: string; actor_id: string; comment: string | null }>(
      "select action, actor_id, comment from public.leave_record_events where record_id = $1 order by id",
      [recordId],
    )
  ).map((e) => [e.action, e.actor_id === teacher1 ? "teacher1" : e.actor_id, e.comment]);

beforeAll(async () => {
  t = await createLeaveDb();
  teacher1 = t.users["teacher1@example.test"];
  teacher2 = t.users["teacher2@example.test"];
  manager1 = t.users["manager1@example.test"];
  const positions = await t.asService<{ id: number; kind: string }>(
    `select p.id, p.kind from public.positions as p join public.profiles as pr on pr.id = p.employee_id
      where pr.email = 'teacher1@example.test'`,
  );
  mainPosition = positions.find((p) => p.kind === "main")!.id;
  additionalPosition = positions.find((p) => p.kind === "additional")!.id;
}, 60_000);

afterEach(async () => {
  await t.asService("delete from public.leave_requests");
});

describe("changing the hours of an own record", () => {
  it("AC-DECIDE-16: 2026-11-02 08:30–15:30 becomes 09:00–12:00, stays Awaiting decision, and manager1@ sees 09:00–12:00", async () => {
    const [id] = await submit([{ date: "2026-11-02", ...WHOLE }]);
    await changeHours(teacher1, id, 540, 720);
    expect(await recordOf(id)).toEqual({ hours: "09:00–12:00", minutes: 180, status: "awaiting", leave_type: "sick" });
    expect(await awaitingFor(manager1)).toEqual([{ id, hours: [540, 720] }]);
    expect(await actionsOf(id)).toEqual([
      ["submitted", "teacher1", null],
      ["hours_changed", "teacher1", "08:30–15:30 → 09:00–12:00"],
    ]);
  });

  it("AC-DECIDE-12: an approved record keeps its hours, with “This record is already approved and cannot be changed”", async () => {
    const [id] = await submit([{ date: "2026-11-02", ...WHOLE }]);
    await setStatus(id, "approved");
    await expect(changeHours(teacher1, id, 540, 720)).rejects.toMatchObject({
      code: "P0001",
      message: "This record is already approved and cannot be changed",
    });
    expect((await recordOf(id)).hours).toBe("08:30–15:30");
  });

  it("AC-DECIDE-22: the second record 13:00–15:30 cannot become 09:00–15:30 over the first one 08:30–10:00", async () => {
    const [first, second] = await submit([
      { date: "2026-11-02", start_min: 510, end_min: 600 },
      { date: "2026-11-02", start_min: 780, end_min: 930 },
    ]);
    await expect(changeHours(teacher1, second, 540, 930)).rejects.toMatchObject({
      code: "P0001",
      message: "You already have a request for this time: 2026-11-02 08:30–10:00",
    });
    expect([(await recordOf(first)).hours, (await recordOf(second)).hours]).toEqual(["08:30–10:00", "13:00–15:30"]);
    // Із самим собою запис не перетинається: 13:00–15:30 → 12:00–15:30.
    await changeHours(teacher1, second, 720, 930);
    expect((await recordOf(second)).hours).toBe("12:00–15:30");
  });

  it("AC-DECIDE-21: the leave type cannot be changed — no function takes it and a direct update is denied", async () => {
    const [id] = await submit([{ date: "2026-11-02", ...WHOLE }]);
    await expect(
      t.asUser(teacher1, "update public.leave_records set leave_type = 'personal' where id = $1", [id]),
    ).rejects.toMatchObject({ code: "42501" });
    expect((await recordOf(id)).leave_type).toBe("sick");
  });

  it("new hours are checked against the schedule of the same position and date", async () => {
    const [id] = await submit([{ date: "2026-11-02", ...WHOLE }]);
    await expect(changeHours(teacher1, id, 480, 600)).rejects.toThrow("Hours must be within your schedule: 08:30–15:30");
    await expect(changeHours(teacher1, id, 660, 600)).rejects.toThrow("The end must be later than the start");
    expect((await recordOf(id)).hours).toBe("08:30–15:30");
  });

  it("the same hours change nothing and add no history line", async () => {
    const [id] = await submit([{ date: "2026-11-02", ...WHOLE }]);
    await changeHours(teacher1, id, 510, 930);
    expect(await actionsOf(id)).toEqual([["submitted", "teacher1", null]]);
  });

  it("a rejected record cannot change its hours or be cancelled", async () => {
    const [id] = await submit([{ date: "2026-11-02", ...WHOLE }]);
    await setStatus(id, "rejected");
    await expect(changeHours(teacher1, id, 540, 720)).rejects.toThrow("This record is already rejected and cannot be changed");
    await expect(cancel(teacher1, id)).rejects.toThrow("This record is already rejected and cannot be changed");
    expect(await recordOf(id)).toMatchObject({ hours: "08:30–15:30", status: "rejected" });
  });

  it("another employee and a record that does not exist get the same answer, nothing changes", async () => {
    const [id] = await submit([{ date: "2026-11-02", ...WHOLE }]);
    // По черзі: одна база PGlite — одна транзакція за раз.
    for (const attempt of [
      () => changeHours(teacher2, id, 540, 720),
      () => changeHours(manager1, id, 540, 720),
      () => cancel(teacher2, id),
      () => resubmit(teacher2, id),
      () => changeHours(teacher1, 999_999, 540, 720),
    ]) {
      await expect(attempt()).rejects.toMatchObject({ code: "42501", message: "Record not found" });
    }
    await expect(t.asAnon("select public.cancel_leave_record(1)")).rejects.toMatchObject({ code: "42501" });
    expect(await recordOf(id)).toMatchObject({ hours: "08:30–15:30", status: "awaiting" });
  });
});

describe("resubmitting and cancelling", () => {
  it("AC-DECIDE-06: a returned record changed to 09:00–12:00 and resubmitted is again in manager1@'s Awaiting decision list", async () => {
    const [id] = await submit([{ date: "2026-11-02", ...WHOLE }]);
    await t.asUser(manager1, "select public.decide_leave_record($1, 'return', 510, 930, 'Enter hours instead of a whole day')", [id]);
    expect(await awaitingFor(manager1)).toEqual([]);

    await changeHours(teacher1, id, 540, 720);
    expect((await recordOf(id)).status).toBe("returned");
    await resubmit(teacher1, id);
    expect(await recordOf(id)).toMatchObject({ hours: "09:00–12:00", status: "awaiting" });
    // Коментар повернення лишається в історії, а запис знову чекає нового рішення без нього.
    const [{ manager_comment }] = await t.asService<{ manager_comment: string | null }>(
      "select manager_comment from public.leave_records where id = $1",
      [id],
    );
    expect(manager_comment).toBeNull();
    expect((await actionsOf(id)).map(([action]) => action)).toEqual(["submitted", "returned", "hours_changed", "resubmitted"]);
    expect(await awaitingFor(manager1)).toEqual([{ id, hours: [540, 720] }]);
  });

  it("AC-DECIDE-13: a cancelled record awaiting decision disappears from manager1@'s Awaiting decision list", async () => {
    const [id] = await submit([{ date: "2026-11-02", ...WHOLE }]);
    expect((await awaitingFor(manager1)).map((r) => r.id)).toEqual([id]);
    await cancel(teacher1, id);
    expect((await recordOf(id)).status).toBe("cancelled");
    expect(await awaitingFor(manager1)).toEqual([]);
    // «Cancelled» не блокує ті самі години.
    await submit([{ date: "2026-11-02", ...WHOLE }]);
  });

  it("AC-DECIDE-17: a cancelled returned record cannot be resubmitted", async () => {
    const [id] = await submit([{ date: "2026-11-02", ...WHOLE }]);
    await setStatus(id, "returned");
    await cancel(teacher1, id);
    expect((await recordOf(id)).status).toBe("cancelled");
    await expect(resubmit(teacher1, id)).rejects.toMatchObject({
      code: "P0001",
      message: "This record is cancelled and cannot be changed",
    });
    expect((await recordOf(id)).status).toBe("cancelled");
  });

  it("only a returned record is resubmitted, and an approved one is not cancelled", async () => {
    const [awaiting, approved] = await submit([
      { date: "2026-11-02", ...WHOLE },
      { date: "2026-11-03", ...WHOLE },
    ]);
    await setStatus(approved, "approved");
    await expect(resubmit(teacher1, awaiting)).rejects.toThrow("Only a record returned for revision can be resubmitted");
    await expect(cancel(teacher1, approved)).rejects.toThrow("This record is already approved and cannot be changed");
    expect([(await recordOf(awaiting)).status, (await recordOf(approved)).status]).toEqual(["awaiting", "approved"]);
  });
});

describe("the manager decides on the hours they saw", () => {
  it("AC-DECIDE-16: after the hours change to 09:00–12:00, a decision on the old 08:30–15:30 is not saved", async () => {
    const [id] = await submit([{ date: "2026-11-02", ...WHOLE }]);
    await changeHours(teacher1, id, 540, 720);
    // Менеджер бачив 08:30–15:30: рішення не зберігається, запис чекає далі.
    await expect(
      t.asUser(manager1, "select public.decide_leave_record($1, 'approve', p_start_min => 510, p_end_min => 930)", [id]),
    ).rejects.toMatchObject({
      code: "P0001",
      message: "The employee has changed the hours of this record. Check them again before deciding",
    });
    expect((await recordOf(id)).status).toBe("awaiting");
    // Без годин — відмова, а не рішення без перевірки (rpc доступна й напряму).
    await expect(
      t.asUser(manager1, "select public.decide_leave_record($1, 'approve', null, null)", [id]),
    ).rejects.toMatchObject({ code: "22023" });
    await expect(t.asUser(manager1, "select public.decide_leave_record($1, 'approve')", [id])).rejects.toThrow();
    expect((await recordOf(id)).status).toBe("awaiting");
    // З новими годинами — погоджено.
    await t.asUser(manager1, "select public.decide_leave_record($1, 'approve', p_start_min => 540, p_end_min => 720)", [id]);
    expect((await recordOf(id)).status).toBe("approved");
  });
});

describe("a date without working hours in a request", () => {
  it("AC-LEAVE-21: Friday 2026-11-06 and Saturday 2026-11-07 whole day — Saturday is not accepted, 1 record for Friday", async () => {
    const ids = await submit([
      { date: "2026-11-06", ...WHOLE },
      { date: "2026-11-07", ...WHOLE },
    ]);
    const rows = await t.asService<{ date: string }>(
      "select to_char(date, 'YYYY-MM-DD') as date from public.leave_records where id = any($1)",
      [ids],
    );
    expect(rows).toEqual([{ date: "2026-11-06" }]);
  });

  it("only dates without working hours give no request at all", async () => {
    await expect(submit([{ date: "2026-11-07", ...WHOLE }, { date: "2026-11-08", ...WHOLE }])).rejects.toThrow(
      "You have no working hours on this day",
    );
    expect(await t.asService("select id from public.leave_requests")).toEqual([]);
  });

  it("a position without a schedule on a day when another position works is still refused", async () => {
    // Додаткова посада працює лише в понеділок, основна — і у вівторок 2026-11-03.
    await expect(
      t.asUser(teacher1, "select public.submit_leave_request('sick', $1::jsonb)", [
        JSON.stringify([{ position_id: additionalPosition, date: "2026-11-03", start_min: 945, end_min: 1020 }]),
      ]),
    ).rejects.toThrow("You have no working hours on this day");
    expect(await t.asService("select id from public.leave_requests")).toEqual([]);
  });
});
