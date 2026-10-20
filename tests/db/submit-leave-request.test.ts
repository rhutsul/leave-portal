// public.submit_leave_request на справжньому Postgres (PGlite, docs/decisions/0001-pglite-db-tests.md):
// записи, які створює база, і «заявка цілком або нічого», якого чисті функції не перевірять.
// Тестові посади й розклади — з міграції (D7): teacher1@ — основна Elementary school / Teacher Mon–Fri 08:30–15:30
// і додаткова High school / Math teacher Mon 15:45–17:00; teacher2@ — High school / Teacher, у вівторок
// 08:30–12:00 і 12:30–15:30.
import { beforeAll, describe, expect, it } from "vitest";
import { formatRange } from "@/lib/leave/time";
import { createLeaveDb, type LeaveDb } from "./supabase-pglite";

let t: LeaveDb;
let teacher1: string;
let teacher2: string;
let mainPosition: number;
let additionalPosition: number;
let teacher2Position: number;

interface RecordRow {
  request_id: number;
  position: string;
  date: string;
  hours: string;
  minutes: number;
  leave_type: string;
  status: string;
}

const submit = (userId: string, leaveType: string, records: object[]) =>
  t.asUser<{ id: number }>(userId, "select public.submit_leave_request($1, $2::jsonb) as id", [
    leaveType,
    JSON.stringify(records),
  ]);

const recordsOf = async (requestId: number): Promise<RecordRow[]> => {
  const rows = await t.asService<Omit<RecordRow, "hours"> & { start_min: number; end_min: number }>(
    `select r.request_id, d.name || ' / ' || p.title as position, to_char(r.date, 'YYYY-MM-DD') as date,
            r.start_min, r.end_min, r.minutes, r.leave_type, r.status
       from public.leave_records as r
       join public.positions as p on p.id = r.position_id
       join public.divisions as d on d.id = p.division_id
      where r.request_id = $1
      order by p.kind desc, r.start_min`,
    [requestId],
  );
  return rows.map(({ start_min, end_min, ...r }) => ({ ...r, hours: formatRange(start_min, end_min) }));
};

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
  teacher2 = t.users["teacher2@example.test"];
  const positions = await t.asService<{ id: number; email: string; kind: string }>(
    `select p.id, pr.email, p.kind from public.positions as p join public.profiles as pr on pr.id = p.employee_id`,
  );
  const find = (email: string, kind: string) => positions.find((p) => p.email === email && p.kind === kind)!.id;
  mainPosition = find("teacher1@example.test", "main");
  additionalPosition = find("teacher1@example.test", "additional");
  teacher2Position = find("teacher2@example.test", "main");
}, 60_000);

describe("submit_leave_request", () => {
  it("AC-LEAVE-01: Sick leave for the whole Monday creates 1 awaiting record on the main position", async () => {
    const [{ id }] = await submit(teacher1, "sick", [
      { position_id: mainPosition, date: "2026-11-02", start_min: 510, end_min: 930 },
    ]);
    expect(await recordsOf(id)).toEqual([
      {
        request_id: id,
        position: "Elementary school / Teacher",
        date: "2026-11-02",
        hours: "08:30–15:30",
        minutes: 420,
        leave_type: "sick",
        status: "awaiting",
      },
    ]);
  });

  it("AC-LEAVE-02: both positions on one date give 2 records in one request", async () => {
    const [{ id }] = await submit(teacher1, "personal", [
      { position_id: mainPosition, date: "2026-11-09", start_min: 510, end_min: 930 },
      { position_id: additionalPosition, date: "2026-11-09", start_min: 945, end_min: 1020 },
    ]);
    const records = await recordsOf(id);
    expect(records.map((r) => [r.position, r.hours, r.status])).toEqual([
      ["Elementary school / Teacher", "08:30–15:30", "awaiting"],
      ["High school / Math teacher", "15:45–17:00", "awaiting"],
    ]);
    expect(new Set(records.map((r) => r.request_id))).toEqual(new Set([id]));
  });

  it("AC-LEAVE-04: 09:00–11:30 is stored with a duration of 150 minutes", async () => {
    const [{ id }] = await submit(teacher1, "personal", [
      { position_id: mainPosition, date: "2026-11-16", start_min: 540, end_min: 690 },
    ]);
    expect((await recordsOf(id)).map((r) => [r.hours, r.minutes])).toEqual([["09:00–11:30", 150]]);
  });

  it("AC-LEAVE-07: hours outside the schedule on one position — no request and no record for any position", async () => {
    const before = await countRows();
    await expect(
      submit(teacher1, "personal", [
        { position_id: mainPosition, date: "2026-11-23", start_min: 510, end_min: 930 },
        { position_id: additionalPosition, date: "2026-11-23", start_min: 900, end_min: 960 },
      ]),
    ).rejects.toThrow("Hours must be within your schedule: 15:45–17:00");
    expect(await countRows()).toEqual(before);
  });

  it("AC-LEAVE-15: 11:00–13:00 across the Tuesday gap is stored as 90 minutes", async () => {
    const [{ id }] = await submit(teacher2, "personal", [
      { position_id: teacher2Position, date: "2026-11-03", start_min: 660, end_min: 780 },
    ]);
    expect((await recordsOf(id)).map((r) => [r.hours, r.minutes])).toEqual([["11:00–13:00", 90]]);
  });

  it("AC-LEAVE-06: a Saturday is refused by the database too", async () => {
    await expect(
      submit(teacher1, "sick", [{ position_id: mainPosition, date: "2026-11-07", start_min: 540, end_min: 600 }]),
    ).rejects.toThrow("You have no working hours on this day");
  });

  it("AC-LEAVE-10: an empty list of positions is refused by the database too", async () => {
    await expect(submit(teacher1, "sick", [])).rejects.toThrow("Choose at least one position");
  });

  it("AC-LEAVE-20: the end of a block before the gap cannot be the start in the database either", async () => {
    await expect(
      submit(teacher2, "personal", [
        { position_id: teacher2Position, date: "2026-11-10", start_min: 720, end_min: 780 },
      ]),
    ).rejects.toThrow("12:00 is the end of working time and can only be chosen as the end of leave");
  });

  it("an employee cannot submit a request for another employee's position", async () => {
    await expect(
      submit(teacher2, "sick", [{ position_id: mainPosition, date: "2026-11-30", start_min: 510, end_min: 930 }]),
    ).rejects.toMatchObject({ code: "42501" });
  });

  it("an employee cannot write leave tables directly, only through the function", async () => {
    await expect(
      t.asUser(teacher1, "update public.leave_records set status = 'approved' where employee_id = $1", [teacher1]),
    ).rejects.toMatchObject({ code: "42501" });
    await expect(
      t.asUser(teacher1, "insert into public.leave_requests (employee_id, leave_type) values ($1, 'sick')", [teacher1]),
    ).rejects.toMatchObject({ code: "42501" });
  });

  it("without signing in the function cannot be called", async () => {
    await expect(
      t.asAnon("select public.submit_leave_request('sick', '[]'::jsonb)"),
    ).rejects.toMatchObject({ code: "42501" });
  });
});
