// Заявка з кількома датами, коментарем, «Family celebration» і перетинами — на справжньому Postgres (PGlite,
// docs/decisions/0001-pglite-db-tests.md). Окрема база й очищення після кожного тесту — щоб дати й години були
// дослівно як в AC PM (requirements/01-leave-request.md), без записів інших тестів.
// teacher1@ — основна Elementary school / Teacher Mon–Fri 08:30–15:30 і додаткова High school / Math teacher
// Mon 15:45–17:00 (тестові дані D7).
import { afterEach, beforeAll, describe, expect, it } from "vitest";
import { createLeaveDb, type LeaveDb } from "./supabase-pglite";

let t: LeaveDb;
let teacher1: string;
let mainPosition: number;
let additionalPosition: number;

const MONDAY = "2026-11-02";
const TUESDAY = "2026-11-03";
// 08:30 = 510, 09:00 = 540, 10:00 = 600, 11:00 = 660, 12:00 = 720, 15:30 = 930, 15:45 = 945, 17:00 = 1020.
const wholeMain = (date: string) => ({ position_id: mainPosition, date, start_min: 510, end_min: 930 });
const hours = (date: string, start: number, end: number) => ({ position_id: mainPosition, date, start_min: start, end_min: end });

const submit = (records: object[], leaveType = "personal", options: { relationship?: string; comment?: string } = {}) =>
  t.asUser<{ id: number }>(
    teacher1,
    "select public.submit_leave_request($1, $2::jsonb, p_relationship => $3, p_comment => $4) as id",
    [leaveType, JSON.stringify(records), options.relationship ?? null, options.comment ?? null],
  );

const countRows = async () => {
  const [row] = await t.asService<{ requests: number; records: number }>(
    `select (select count(*)::int from public.leave_requests) as requests,
            (select count(*)::int from public.leave_records) as records`,
  );
  return row;
};

beforeAll(async () => {
  t = await createLeaveDb();
  teacher1 = t.users["teacher1@example.test"];
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

describe("submit_leave_request with several dates", () => {
  it("AC-LEAVE-05: the whole day on 2026-11-02 and 2026-11-03 creates 2 records of the same request", async () => {
    const [{ id }] = await submit([wholeMain(MONDAY), wholeMain(TUESDAY)]);
    const records = await t.asService<{ request_id: number; date: string; start_min: number; end_min: number }>(
      `select request_id, to_char(date, 'YYYY-MM-DD') as date, start_min, end_min
         from public.leave_records order by date`,
    );
    expect(records).toEqual([
      { request_id: id, date: MONDAY, start_min: 510, end_min: 930 },
      { request_id: id, date: TUESDAY, start_min: 510, end_min: 930 },
    ]);
  });

  it("AC-LEAVE-17: both records of a two-position request carry the comment \"Doctor's appointment\"", async () => {
    const [{ id }] = await submit(
      [wholeMain(MONDAY), { position_id: additionalPosition, date: MONDAY, start_min: 945, end_min: 1020 }],
      "sick",
      { comment: "Doctor's appointment" },
    );
    const records = await t.asUser<{ employee_comment: string }>(
      teacher1,
      "select employee_comment from public.my_leave_records where request_id = $1",
      [id],
    );
    expect(records).toEqual([{ employee_comment: "Doctor's appointment" }, { employee_comment: "Doctor's appointment" }]);
  });

  it("AC-LEAVE-18: a comment of 501 characters creates no request", async () => {
    await expect(submit([wholeMain(MONDAY)], "sick", { comment: "x".repeat(501) })).rejects.toThrow(
      "The comment can be at most 500 characters",
    );
    expect(await countRows()).toEqual({ requests: 0, records: 0 });
    await submit([wholeMain(MONDAY)], "sick", { comment: "x".repeat(500) });
    expect(await countRows()).toEqual({ requests: 1, records: 1 });
  });

  it("AC-LEAVE-12: Family celebration without a relationship creates no request; with one it is stored on the record", async () => {
    await expect(submit([wholeMain(MONDAY)], "family")).rejects.toThrow(
      "State your relationship to this person: sibling, child, parent, grandchild or grandparent. Not applicable to cousins, friends, neighbours or siblings-in-law",
    );
    await expect(submit([wholeMain(MONDAY)], "family", { relationship: "cousin" })).rejects.toThrow(
      "State your relationship to this person",
    );
    expect(await countRows()).toEqual({ requests: 0, records: 0 });
    await submit([wholeMain(MONDAY)], "family", { relationship: "child" });
    const [record] = await t.asService<{ relationship: string }>("select relationship from public.leave_records");
    expect(record.relationship).toBe("child");
  });

  it("AC-LEAVE-13: 10:00–12:00 over an awaiting 09:00–11:00 record of the main position creates no request", async () => {
    await submit([hours(MONDAY, 540, 660)]);
    const before = await countRows();
    await expect(submit([hours(MONDAY, 600, 720)])).rejects.toThrow(
      "You already have a request for this time: 2026-11-02 09:00–11:00",
    );
    expect(await countRows()).toEqual(before);
  });

  it("AC-LEAVE-16: an overlap on 2026-11-03 creates no record for either date", async () => {
    await submit([hours(TUESDAY, 540, 660)]);
    const before = await countRows();
    await expect(submit([wholeMain(MONDAY), wholeMain(TUESDAY)], "sick")).rejects.toThrow(
      "You already have a request for this time: 2026-11-03 09:00–11:00",
    );
    expect(await countRows()).toEqual(before);
  });

  it("a rejected or cancelled record does not block the same hours", async () => {
    const [{ id }] = await submit([hours(MONDAY, 540, 660)]);
    await t.asService("update public.leave_records set status = 'rejected' where request_id = $1", [id]);
    const [second] = await submit([hours(MONDAY, 540, 660)]);
    await t.asService("update public.leave_records set status = 'cancelled' where request_id = $1", [second.id]);
    await expect(submit([hours(MONDAY, 540, 660)])).resolves.toHaveLength(1);
  });
});
