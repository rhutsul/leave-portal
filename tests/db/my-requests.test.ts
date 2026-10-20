// «My requests» на справжньому Postgres (PGlite, docs/decisions/0001-pglite-db-tests.md): RLS і view
// public.my_leave_records, які читає сторінка /requests. Окрема база — щоб у teacher1@ було рівно 2 записи.
import { beforeAll, describe, expect, it } from "vitest";
import { createLeaveDb, type LeaveDb } from "./supabase-pglite";

let t: LeaveDb;
let teacher1: string;
let teacher2: string;
let manager1: string;

const MY_REQUESTS = `
  select to_char(date, 'YYYY-MM-DD') as date,
         private.format_minutes(start_min) || '–' || private.format_minutes(end_min) as hours,
         division_name || ' / ' || position_title as position,
         leave_type, status
    from public.my_leave_records
   order by date, start_min`;

async function positionOf(email: string, kind: string) {
  const [row] = await t.asService<{ id: number }>(
    `select p.id from public.positions as p join public.profiles as pr on pr.id = p.employee_id
      where pr.email = $1 and p.kind = $2`,
    [email, kind],
  );
  return row.id;
}

const submit = (userId: string, leaveType: string, positionId: number, date: string, start: number, end: number) =>
  t.asUser(userId, "select public.submit_leave_request($1, $2::jsonb)", [
    leaveType,
    JSON.stringify([{ position_id: positionId, date, start_min: start, end_min: end }]),
  ]);

beforeAll(async () => {
  t = await createLeaveDb();
  teacher1 = t.users["teacher1@example.test"];
  teacher2 = t.users["teacher2@example.test"];
  manager1 = t.users["manager1@example.test"];
  const teacher1Main = await positionOf("teacher1@example.test", "main");
  const teacher1Additional = await positionOf("teacher1@example.test", "additional");
  const teacher2Main = await positionOf("teacher2@example.test", "main");
  const manager1Main = await positionOf("manager1@example.test", "main");

  // Фіксовані дані AC-LEAVE-14: 2 записи teacher1@ і 3 записи teacher2@.
  await submit(teacher1, "sick", teacher1Main, "2026-11-02", 510, 930);
  await submit(teacher1, "personal", teacher1Additional, "2026-11-02", 945, 1020);
  await submit(teacher2, "sick", teacher2Main, "2026-11-02", 510, 930);
  await submit(teacher2, "personal", teacher2Main, "2026-11-03", 660, 780);
  await submit(teacher2, "unpaid", teacher2Main, "2026-11-04", 510, 600);
  // Власний запис manager1@, який відповідає за основну посаду teacher1@.
  await submit(manager1, "personal", manager1Main, "2026-11-05", 540, 600);
}, 60_000);

describe("My requests", () => {
  it("AC-LEAVE-14: teacher1@example.test sees exactly their 2 records with date, hours, position, type and status", async () => {
    expect(await t.asUser(teacher1, MY_REQUESTS)).toEqual([
      {
        date: "2026-11-02",
        hours: "08:30–15:30",
        position: "Elementary school / Teacher",
        leave_type: "sick",
        status: "awaiting",
      },
      {
        date: "2026-11-02",
        hours: "15:45–17:00",
        position: "High school / Math teacher",
        leave_type: "personal",
        status: "awaiting",
      },
    ]);
  });

  it("AC-LEAVE-14: RLS hides other employees' records and requests even without a filter", async () => {
    const records = await t.asUser<{ employee_id: string }>(teacher1, "select employee_id from public.leave_records");
    expect(records).toHaveLength(2);
    expect(records.every((r) => r.employee_id === teacher1)).toBe(true);
    const requests = await t.asUser<{ employee_id: string }>(teacher1, "select employee_id from public.leave_requests");
    expect(requests.map((r) => r.employee_id)).toEqual([teacher1, teacher1]);
    expect(await t.asUser(teacher2, MY_REQUESTS)).toHaveLength(3);
  });

  it("AC-LEAVE-14: a manager's My requests shows only their own record, not the records of positions they manage", async () => {
    const mine = await t.asUser<{ position: string }>(manager1, MY_REQUESTS);
    expect(mine.map((r) => r.position)).toEqual(["Elementary school / Head of elementary school"]);
  });

  it("without signing in nothing is readable", async () => {
    await expect(t.asAnon("select * from public.my_leave_records")).rejects.toMatchObject({ code: "42501" });
    await expect(t.asAnon("select * from public.leave_records")).rejects.toMatchObject({ code: "42501" });
  });
});
