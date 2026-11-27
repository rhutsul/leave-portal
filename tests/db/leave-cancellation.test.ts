// Скасування погодженого запису на справжньому Postgres (PGlite, docs/decisions/0001-pglite-db-tests.md):
// public.request_record_cancellation, public.decide_record_cancellation і public.cancel_approved_record з міграції
// 20261124195428_cancel_approved.sql (D3–D5 openspec/changes/impl-cancel-approved/design.md); залишки — через
// get_balance_inputs і src/lib/leave/balance.ts, як на /balances.
// Дати — від сьогодні за Києвом («today or later», Assumptions 09), а не сталі дати AC: функції порівнюють із now().
// Тестові дані D7: teacher1@ — основна посада (manager1@) Mon–Fri 08:30–15:30 і додаткова (manager2@) Mon 15:45–17:00.
import { afterEach, beforeAll, describe, expect, it } from "vitest";
import { computeBalances, formatDays, parseBalanceInputs } from "@/lib/leave/balance";
import { kyivDate } from "@/lib/leave/time";
import { decideAsSeen } from "./decide";
import { createLeaveDb, type LeaveDb } from "./supabase-pglite";

let t: LeaveDb;
let teacher1: string;
let teacher2: string;
let manager1: string;
let manager2: string;
let admin: string;
let teacher1Main: number;
let manager1Main: number;

const WHOLE = { start_min: 510, end_min: 930 };

/** n-й вівторок–п'ятниця від сьогодні (за Києвом): n > 0 — у майбутньому, n < 0 — у минулому. Без понеділків — там
 * у teacher1@ ще й додаткова посада, і частка дня була б іншою. */
function weekday(n: number): string {
  const d = new Date(`${kyivDate(new Date())}T00:00:00Z`);
  const step = n > 0 ? 1 : -1;
  let left = Math.abs(n);
  while (left > 0) {
    d.setUTCDate(d.getUTCDate() + step);
    const wd = d.getUTCDay();
    if (wd >= 2 && wd <= 5) left -= 1;
  }
  return d.toISOString().slice(0, 10);
}

async function positionOf(email: string, kind: string) {
  const [row] = await t.asService<{ id: number }>(
    `select p.id from public.positions as p join public.profiles as pr on pr.id = p.employee_id
      where pr.email = $1 and p.kind = $2`,
    [email, kind],
  );
  return row.id;
}

/** Заявка працівника на дати (цілі дні основної посади) — id записів у порядку дат. */
async function submit(userId: string, positionId: number, leaveType: string, dates: string[], hours = WHOLE) {
  const records = dates.map((date) => ({ position_id: positionId, date, ...hours }));
  const [{ id }] = await t.asUser<{ id: number }>(userId, "select public.submit_leave_request($1, $2::jsonb) as id", [
    leaveType,
    JSON.stringify(records),
  ]);
  const rows = await t.asService<{ id: number }>(
    "select id from public.leave_records where request_id = $1 order by date, start_min",
    [id],
  );
  return rows.map((r) => r.id);
}

/** Погоджений запис для «Given … with status "Approved"»: статус ставить service_role (тригер фіксує частку дня). */
async function approved(userId: string, positionId: number, dates: string[], leaveType = "personal", hours = WHOLE) {
  const ids = await submit(userId, positionId, leaveType, dates, hours);
  await t.asService("update public.leave_records set status = 'approved' where id = any($1)", [ids]);
  return ids;
}

const request = (userId: string, recordId: number, reason: string | null) =>
  t.asUser(userId, "select public.request_record_cancellation($1, $2)", [recordId, reason]);

type RecordState = {
  status: string;
  cancel_reason: string | null;
  cancel_request_id: number | null;
  cancel_declined_comment: string | null;
  cancel_note: string | null;
};

const stateOf = async (recordId: number) =>
  (
    await t.asService<RecordState>(
      `select status, cancel_reason, cancel_request_id, cancel_declined_comment, cancel_note
         from public.leave_records where id = $1`,
      [recordId],
    )
  )[0];

const requestIdOf = async (recordId: number) => (await stateOf(recordId)).cancel_request_id;

/** Рішення щодо прохання, яке менеджер бачить зараз (на /decisions його id передає форма). */
async function decide(userId: string, recordId: number, decision: string, comment: string | null = null, requestId?: number | null) {
  const id = requestId === undefined ? ((await requestIdOf(recordId)) ?? 1) : requestId;
  const [row] = await t.asUser<{ status: string }>(
    userId,
    "select public.decide_record_cancellation($1, $2, $3, $4) as status",
    [recordId, id, decision, comment],
  );
  return row.status;
}

const cancelWithNote = (userId: string, recordId: number, note: string | null) =>
  t.asUser(userId, "select public.cancel_approved_record($1, $2)", [recordId, note]);

const eventsOf = (recordId: number) =>
  t.asService<{ action: string; comment: string | null; actor: string }>(
    `select ev.action, ev.comment, split_part(p.email, '@', 1) as actor
       from public.leave_record_events as ev left join public.profiles as p on p.id = ev.actor_id
      where ev.record_id = $1 and ev.action <> 'submitted' order by ev.id`,
    [recordId],
  );

async function balancesOf(employee: string) {
  const year = Number(weekday(1).slice(0, 4)) - (Number(weekday(1).slice(5, 7)) >= 9 ? 0 : 1);
  const [row] = await t.asUser<{ inputs: unknown }>(employee, "select public.get_balance_inputs($1, $2) as inputs", [
    employee,
    year,
  ]);
  const b = computeBalances(parseBalanceInputs(row.inputs), year);
  return {
    personal: { used: formatDays(b.limited.personal.used), remaining: formatDays(b.limited.personal.remaining) },
    unpaid: formatDays(b.unlimited.unpaid),
  };
}

beforeAll(async () => {
  t = await createLeaveDb();
  teacher1 = t.users["teacher1@example.test"];
  teacher2 = t.users["teacher2@example.test"];
  manager1 = t.users["manager1@example.test"];
  manager2 = t.users["manager2@example.test"];
  admin = t.users["admin@example.test"];
  teacher1Main = await positionOf("teacher1@example.test", "main");
  manager1Main = await positionOf("manager1@example.test", "main");
}, 60_000);

afterEach(async () => {
  await t.asService("delete from public.school_closures");
  await t.asService("delete from public.leave_requests");
});

describe("request_record_cancellation: the employee asks", () => {
  it("AC-CANCEL-01: teacher1@ asks to cancel with 'Plans changed' — still Approved, marked, in manager1@'s Awaiting decision", async () => {
    const [id] = await approved(teacher1, teacher1Main, [weekday(7)]);
    await request(teacher1, id, "  Plans changed \n");
    expect(await stateOf(id)).toMatchObject({ status: "approved", cancel_reason: "Plans changed" });
    expect(await eventsOf(id)).toEqual([{ action: "cancellation_requested", comment: "Plans changed", actor: "teacher1" }]);
    // Черга менеджера: рядок decision_records і позначка з leave_records (RLS — посади manager1@), як на /decisions.
    const rows = await t.asUser<{ id: number; status: string; cancel_reason: string; can_decide: boolean }>(
      manager1,
      `select d.id, d.status, r.cancel_reason, d.can_decide from public.decision_records() as d
         join public.leave_records as r on r.id = d.id where r.cancel_reason is not null`,
    );
    expect(rows).toEqual([{ id, status: "approved", cancel_reason: "Plans changed", can_decide: true }]);
    expect(await t.asUser(manager2, "select id from public.leave_records where cancel_reason is not null")).toEqual([]);
  });

  it("AC-CANCEL-05: a record in the past — no request, still Approved, 'Records in the past cannot be cancelled'", async () => {
    const [id] = await approved(teacher1, teacher1Main, [weekday(-2)]);
    await expect(request(teacher1, id, "Plans changed")).rejects.toMatchObject({
      code: "P0001",
      message: "Records in the past cannot be cancelled",
    });
    expect(await stateOf(id)).toMatchObject({ status: "approved", cancel_reason: null, cancel_request_id: null });
    expect(await eventsOf(id)).toEqual([]);
  });

  it("AC-CANCEL-06: asking again — 'Cancellation has already been requested', still one request", async () => {
    const [id] = await approved(teacher1, teacher1Main, [weekday(7)]);
    await request(teacher1, id, "Plans changed");
    const first = await requestIdOf(id);
    await expect(request(teacher1, id, "Plans changed again")).rejects.toMatchObject({
      message: "Cancellation has already been requested",
    });
    expect(await stateOf(id)).toMatchObject({ cancel_reason: "Plans changed", cancel_request_id: first });
    expect((await eventsOf(id)).map((e) => e.action)).toEqual(["cancellation_requested"]);
  });

  it("AC-CANCEL-10: teacher2@ cannot ask to cancel teacher1@'s record — 'You can cancel only your own records'", async () => {
    const [id] = await approved(teacher1, teacher1Main, [weekday(7)]);
    await expect(request(teacher2, id, "Plans changed")).rejects.toMatchObject({
      code: "42501",
      message: "You can cancel only your own records",
    });
    // Неіснуючий запис — та сама відповідь; без входу — відмова.
    await expect(request(teacher2, 999_999, "x")).rejects.toMatchObject({ message: "You can cancel only your own records" });
    await expect(t.asAnon("select public.request_record_cancellation(1, 'x')")).rejects.toMatchObject({ code: "42501" });
    expect(await stateOf(id)).toMatchObject({ status: "approved", cancel_reason: null });
  });

  it("AC-CANCEL-10: nobody writes the cancellation columns directly — only through the functions", async () => {
    const [id] = await approved(teacher1, teacher1Main, [weekday(7)]);
    await expect(
      t.asUser(teacher1, "update public.leave_records set cancel_reason = 'x' where id = $1", [id]),
    ).rejects.toMatchObject({ code: "42501" });
    await expect(
      t.asUser(admin, "update public.leave_records set status = 'cancelled' where id = $1", [id]),
    ).rejects.toMatchObject({ code: "42501" });
    expect(await stateOf(id)).toMatchObject({ status: "approved", cancel_reason: null });
  });

  it("a record that is not approved, an empty reason and a reason over 500 characters are refused", async () => {
    const [awaiting] = await submit(teacher1, teacher1Main, "personal", [weekday(7)]);
    await expect(request(teacher1, awaiting, "x")).rejects.toMatchObject({
      message: "Only an approved record can be cancelled through the manager",
    });
    const [id] = await approved(teacher1, teacher1Main, [weekday(8)]);
    await expect(request(teacher1, id, " \n ")).rejects.toMatchObject({
      message: "Tell the manager why you want to cancel the record",
    });
    await expect(request(teacher1, id, "a".repeat(501))).rejects.toMatchObject({
      message: "The comment can be at most 500 characters",
    });
    expect(await stateOf(id)).toMatchObject({ cancel_reason: null });
  });
});

describe("decide_record_cancellation: confirm", () => {
  it("AC-CANCEL-02: confirming — Cancelled; Personal leave used 3.00 → 2.00, remaining 15.00 → 16.00", async () => {
    const [id, ...others] = await approved(teacher1, teacher1Main, [weekday(7), weekday(8), weekday(9)]);
    expect(others).toHaveLength(2);
    await request(teacher1, id, "Plans changed");
    expect((await balancesOf(teacher1)).personal).toEqual({ used: "3.00", remaining: "15.00" });

    expect(await decide(manager1, id, "confirm")).toBe("cancelled");
    expect(await stateOf(id)).toMatchObject({ status: "cancelled", cancel_reason: null, cancel_request_id: null });
    expect((await balancesOf(teacher1)).personal).toEqual({ used: "2.00", remaining: "16.00" });
    expect((await eventsOf(id)).map((e) => [e.action, e.actor])).toEqual([
      ["cancellation_requested", "teacher1"],
      ["cancelled", "manager1"],
    ]);
  });

  it("AC-CANCEL-07: confirming a split record — Personal leave used −0.50 and Unpaid leave used −0.50", async () => {
    // Залишок «Personal leave» 0.50: 17 цілих днів і пів дня погоджено (вт–пт), потім цілий день — з розподілом.
    const dates = Array.from({ length: 19 }, (_, i) => weekday(i + 2));
    await approved(teacher1, teacher1Main, dates.slice(0, 17));
    await approved(teacher1, teacher1Main, [dates[17]], "personal", { start_min: 540, end_min: 750 });
    const [id] = await submit(teacher1, teacher1Main, "personal", [weekday(1)]);
    const result = await decideAsSeen(t, manager1, id, "approve", 510, 930, null, true);
    expect([result.paid_days, result.unpaid_days]).toEqual([0.5, 0.5]);
    const before = await balancesOf(teacher1);
    expect([before.personal.used, before.unpaid]).toEqual(["18.00", "0.50"]);

    await request(teacher1, id, "Plans changed");
    await decide(manager1, id, "confirm");
    const after = await balancesOf(teacher1);
    expect([after.personal.used, after.unpaid]).toEqual(["17.50", "0.00"]);
  });

  it("AC-CANCEL-11: manager2@ (not a manager of the position) confirms directly — still Approved with the request, balances unchanged", async () => {
    const [id] = await approved(teacher1, teacher1Main, [weekday(7)]);
    await request(teacher1, id, "Plans changed");
    const before = await balancesOf(teacher1);
    await expect(decide(manager2, id, "confirm")).rejects.toMatchObject({
      code: "42501",
      message: "You can't decide on this record",
    });
    await expect(decide(teacher2, id, "confirm")).rejects.toMatchObject({ code: "42501" });
    await expect(decide(manager2, 999_999, "confirm", null, 1)).rejects.toMatchObject({ code: "42501" });
    await expect(t.asAnon("select public.decide_record_cancellation(1, 1, 'confirm')")).rejects.toMatchObject({
      code: "42501",
    });
    expect(await stateOf(id)).toMatchObject({ status: "approved", cancel_reason: "Plans changed" });
    expect(await balancesOf(teacher1)).toEqual(before);
  });

  it("a manager never decides a request for their own record; the administrator does (Assumptions 09)", async () => {
    const [id] = await approved(manager1, manager1Main, [weekday(7)]);
    await request(manager1, id, "Plans changed");
    await expect(decide(manager1, id, "confirm")).rejects.toMatchObject({
      message: "Your own record is decided by an administrator",
    });
    expect((await stateOf(id)).status).toBe("approved");
    expect(await decide(admin, id, "confirm")).toBe("cancelled");
  });

  it("AC-CANCEL-11: a signed-in user without a profile row (no role) cannot confirm or cancel with a note", async () => {
    const [id] = await approved(teacher1, teacher1Main, [weekday(7)]);
    await request(teacher1, id, "Plans changed");
    const nobody = "b0000000-0000-0000-0000-000000000001";
    await expect(decide(nobody, id, "confirm")).rejects.toMatchObject({ code: "42501" });
    await expect(cancelWithNote(nobody, id, "x")).rejects.toMatchObject({ code: "42501" });
    expect(await stateOf(id)).toMatchObject({ status: "approved", cancel_reason: "Plans changed" });
  });

  it("confirm or decline without an open request — an awaiting record or an approved one without it — changes nothing", async () => {
    const [awaiting] = await submit(teacher1, teacher1Main, "personal", [weekday(7)]);
    await expect(decide(manager1, awaiting, "confirm", null, 1)).rejects.toMatchObject({
      message: "There is no cancellation request for this record",
    });
    expect((await stateOf(awaiting)).status).toBe("awaiting");
    const [id] = await approved(teacher1, teacher1Main, [weekday(8)]);
    await expect(decide(manager1, id, "decline", "Exam week", 1)).rejects.toMatchObject({
      message: "There is no cancellation request for this record",
    });
    expect(await stateOf(id)).toMatchObject({ status: "approved", cancel_declined_comment: null });
    await request(teacher1, id, "Plans changed");
    await decide(manager1, id, "confirm");
    await expect(decide(manager1, id, "confirm", null, 1)).rejects.toMatchObject({ message: "This record is already cancelled" });
  });

  it("a stale request id (A declined, B asked) does not decide B", async () => {
    const [id] = await approved(teacher1, teacher1Main, [weekday(7)]);
    await request(teacher1, id, "Plans changed");
    const a = await requestIdOf(id);
    await decide(admin, id, "decline", "Exam week");
    await request(teacher1, id, "Plans changed again");
    await expect(decide(manager1, id, "confirm", null, a)).rejects.toMatchObject({
      message: "The employee has changed the cancellation request. Check it again before deciding",
    });
    expect(await stateOf(id)).toMatchObject({ status: "approved", cancel_reason: "Plans changed again" });
  });

  it("AC-CANCEL-13: after the only record of the date is cancelled, the administrator adds 'Staff day' on that date", async () => {
    const date = weekday(7);
    const [id] = await approved(teacher1, teacher1Main, [date]);
    await request(teacher1, id, "Plans changed");
    const add = () =>
      t.asUser(admin, "select public.add_school_closure('whole_days', 'Staff day', $1::date, $1::date)", [date]);
    // Поки прохання відкрите, запис ще «Approved» і блокує закриття (Assumptions 09, AC-CAL-07).
    await expect(add()).rejects.toMatchObject({
      message: `These days have leave records and cannot be closed: ${date} teacher1@example.test`,
    });
    await decide(manager1, id, "confirm");
    await add();
    expect(
      await t.asUser(admin, "select name, start_date::text as start_date from public.school_closures"),
    ).toEqual([{ name: "Staff day", start_date: date }]);
  });
});

describe("decide_record_cancellation: decline", () => {
  it("AC-CANCEL-03: declining with 'Exam week' — Approved without the mark, 'Exam week' for the employee", async () => {
    const [id] = await approved(teacher1, teacher1Main, [weekday(7)]);
    await request(teacher1, id, "Plans changed");
    const before = await balancesOf(teacher1);
    expect(await decide(manager1, id, "decline", "Exam week")).toBe("approved");
    expect(await stateOf(id)).toMatchObject({
      status: "approved",
      cancel_reason: null,
      cancel_request_id: null,
      cancel_declined_comment: "Exam week",
    });
    expect(
      await t.asUser(teacher1, "select cancel_declined_comment from public.leave_records where id = $1", [id]),
    ).toEqual([{ cancel_declined_comment: "Exam week" }]);
    expect(await balancesOf(teacher1)).toEqual(before);
    expect((await eventsOf(id)).at(-1)).toEqual({ action: "cancellation_declined", comment: "Exam week", actor: "manager1" });
  });

  it("AC-CANCEL-04: declining without a comment — still requested, 'Tell the employee why the cancellation is declined'", async () => {
    const [id] = await approved(teacher1, teacher1Main, [weekday(7)]);
    await request(teacher1, id, "Plans changed");
    await expect(decide(manager1, id, "decline", "   ")).rejects.toMatchObject({
      code: "P0001",
      message: "Tell the employee why the cancellation is declined",
    });
    expect(await stateOf(id)).toMatchObject({ status: "approved", cancel_reason: "Plans changed" });
  });

  it("AC-CANCEL-03: after a decline the employee can ask again; the declined comment is cleared", async () => {
    const [id] = await approved(teacher1, teacher1Main, [weekday(7)]);
    await request(teacher1, id, "Plans changed");
    await decide(manager1, id, "decline", "Exam week");
    await request(teacher1, id, "Plans changed again");
    expect(await stateOf(id)).toMatchObject({ cancel_reason: "Plans changed again", cancel_declined_comment: null });
  });
});

describe("cancel_approved_record: the manager cancels with a note", () => {
  it("AC-CANCEL-08: manager1@ cancels with 'Event moved to January' — Cancelled, the note on the record", async () => {
    const [id] = await approved(teacher1, teacher1Main, [weekday(7)]);
    await cancelWithNote(manager1, id, "Event moved to January");
    expect(await stateOf(id)).toMatchObject({ status: "cancelled", cancel_note: "Event moved to January" });
    expect(
      await t.asUser(teacher1, "select status, cancel_note from public.leave_records where id = $1", [id]),
    ).toEqual([{ status: "cancelled", cancel_note: "Event moved to January" }]);
    expect(await eventsOf(id)).toEqual([{ action: "cancelled", comment: "Event moved to January", actor: "manager1" }]);
  });

  it("AC-CANCEL-08: cancelling with a note also closes an open request", async () => {
    const [id] = await approved(teacher1, teacher1Main, [weekday(7)]);
    await request(teacher1, id, "Plans changed");
    await cancelWithNote(admin, id, "Event moved to January");
    expect(await stateOf(id)).toMatchObject({ status: "cancelled", cancel_reason: null, cancel_request_id: null });
  });

  it("AC-CANCEL-09: without a note — still Approved, 'Tell the employee why the record is cancelled'", async () => {
    const [id] = await approved(teacher1, teacher1Main, [weekday(7)]);
    await expect(cancelWithNote(manager1, id, "")).rejects.toMatchObject({
      code: "P0001",
      message: "Tell the employee why the record is cancelled",
    });
    expect((await stateOf(id)).status).toBe("approved");
  });

  it("AC-CANCEL-11: manager2@ and teacher2@ cannot cancel teacher1@'s record with a note", async () => {
    const [id] = await approved(teacher1, teacher1Main, [weekday(7)]);
    await expect(cancelWithNote(manager2, id, "x")).rejects.toMatchObject({ code: "42501" });
    await expect(cancelWithNote(teacher1, id, "x")).rejects.toMatchObject({ code: "42501" });
    expect((await stateOf(id)).status).toBe("approved");
  });

  it("AC-CANCEL-05: a record dated today (Kyiv) can still be asked to cancel and cancelled with a note — today is not the past", async () => {
    const [asked, noted] = await approved(teacher1, teacher1Main, [weekday(7), weekday(8)]);
    // Дата «сьогодні» — напряму (service_role): сьогодні може бути вихідний без розкладу, а правило — лише про дату.
    // По черзі: два записи тих самих годин на одну дату не дає обмеження leave_records_no_overlap.
    const moveTo = (id: number, date: string) =>
      t.asService("update public.leave_records set date = $1 where id = $2", [date, id]);
    await moveTo(asked, kyivDate(new Date()));
    await request(teacher1, asked, "Plans changed");
    expect((await stateOf(asked)).cancel_reason).toBe("Plans changed");
    await moveTo(asked, weekday(7));
    await moveTo(noted, kyivDate(new Date()));
    await cancelWithNote(manager1, noted, "Event moved to January");
    expect((await stateOf(noted)).status).toBe("cancelled");
  });

  it("a record in the past or not approved cannot be cancelled with a note", async () => {
    const [past] = await approved(teacher1, teacher1Main, [weekday(-2)]);
    await expect(cancelWithNote(manager1, past, "x")).rejects.toMatchObject({
      message: "Records in the past cannot be cancelled",
    });
    const [awaiting] = await submit(teacher1, teacher1Main, "personal", [weekday(7)]);
    await expect(cancelWithNote(manager1, awaiting, "x")).rejects.toMatchObject({
      message: "Only an approved record can be cancelled with a note",
    });
    const [done] = await approved(teacher1, teacher1Main, [weekday(8)]);
    await cancelWithNote(manager1, done, "x");
    await expect(cancelWithNote(manager1, done, "x")).rejects.toMatchObject({ message: "This record is already cancelled" });
  });
});
