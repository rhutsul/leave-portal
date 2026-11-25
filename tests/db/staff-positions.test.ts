// Посади й розклад «з дати» на справжньому Postgres (PGlite, docs/decisions/0001-pglite-db-tests.md): create_position,
// set_position_schedule, set_position_managers і читачі розкладу через private.blocks_in_effect з міграції
// 20261125082128_staff_management.sql (D7, D8 openspec/changes/impl-staff-management/design.md).
// Дати AC (розклад з 2026-12-07, записи 2026-12-08 і 2026-12-09) — сталі дати сценаріїв: правило дати дії не залежить
// від «сьогодні», тож беремо їх як є.
import { beforeAll, describe, expect, it } from "vitest";
import { createLeaveDb, type LeaveDb } from "./supabase-pglite";

let t: LeaveDb;
let admin: string;
let manager1: string;
let teacher1: string;
let teacher3: string;
let elementary: number;
let high: number;

const MON_FRI = (start: number, end: number) =>
  [1, 2, 3, 4, 5].map((weekday) => ({ weekday, start_min: start, end_min: end }));

async function asOwner<T = Record<string, unknown>>(sql: string, params: unknown[] = []): Promise<T[]> {
  return (await t.db.query<T>(sql, params)).rows;
}

async function createPosition(
  employeeId: string,
  kind: string,
  divisionId: number,
  title: string,
  validFrom: string,
  blocks: unknown,
  managers: string[],
) {
  const [row] = await t.asUser<{ id: number }>(
    admin,
    "select public.create_position($1, $2, $3, $4, $5, $6::jsonb, $7::uuid[]) as id",
    [employeeId, kind, divisionId, title, validFrom, JSON.stringify(blocks), managers],
  );
  return Number(row.id);
}

const setSchedule = (user: string, positionId: number, validFrom: string, blocks: unknown) =>
  t.asUser(user, "select public.set_position_schedule($1, $2, $3::jsonb)", [
    positionId,
    validFrom,
    JSON.stringify(blocks),
  ]);

const positionsOf = (employeeId: string) =>
  asOwner<{ id: number; kind: string; title: string }>(
    "select id, kind, title from public.positions where employee_id = $1 order by id",
    [employeeId],
  );

async function mainPositionOf(employeeId: string) {
  const [row] = await asOwner<{ id: number }>(
    "select id from public.positions where employee_id = $1 and kind = 'main'",
    [employeeId],
  );
  return Number(row.id);
}

/** Блоки посади на дату, як їх бачить подання (private.blocks_on_date). */
const blocksOn = (positionId: number, date: string) =>
  asOwner<{ start_min: number; end_min: number }>("select * from private.blocks_on_date($1, $2)", [positionId, date]);

async function submit(userId: string, positionId: number, date: string, start: number, end: number) {
  await t.asUser(userId, "select public.submit_leave_request('personal', $1::jsonb)", [
    JSON.stringify([{ position_id: positionId, date, start_min: start, end_min: end }]),
  ]);
}

beforeAll(async () => {
  t = await createLeaveDb();
  admin = t.users["admin@example.test"];
  manager1 = t.users["manager1@example.test"];
  teacher1 = t.users["teacher1@example.test"];
  const [created] = await t.asUser<{ employee_id: string }>(
    admin,
    "select employee_id from public.create_employee('Teacher Three', 'teacher3@example.test')",
  );
  teacher3 = created.employee_id;
  const divisions = await asOwner<{ id: number; code: string }>("select id, code from public.divisions");
  elementary = Number(divisions.find((d) => d.code === "elementary")!.id);
  high = Number(divisions.find((d) => d.code === "high")!.id);
}, 60_000);

describe("create_position: positions with a schedule from a date and managers", () => {
  it("AC-STAFF-04: the employee sees the main position and its schedule, the manager sees the employee", async () => {
    expect(await positionsOf(teacher3)).toEqual([]);

    const id = await createPosition(teacher3, "main", elementary, "Teacher", "2026-12-07", MON_FRI(510, 930), [manager1]);

    const own = await t.asUser<{ id: number; kind: string; title: string }>(
      teacher3,
      "select id, kind, title from public.positions where employee_id = $1",
      [teacher3],
    );
    expect(own).toEqual([{ id, kind: "main", title: "Teacher" }]);
    const blocks = await t.asUser<{ weekday: number; start_min: number; end_min: number; valid_from: string }>(
      teacher3,
      "select weekday, start_min, end_min, valid_from::text from public.schedule_blocks where position_id = $1 order by weekday",
      [id],
    );
    expect(blocks).toEqual(
      [1, 2, 3, 4, 5].map((weekday) => ({ weekday, start_min: 510, end_min: 930, valid_from: "2026-12-07" })),
    );
    const employees = await t.asUser<{ email: string }>(manager1, "select email from public.balance_employees()");
    expect(employees.map((e) => e.email)).toContain("teacher3@example.test");
    // Розклад діє з дати: до неї годин немає.
    expect(await blocksOn(id, "2026-12-04")).toEqual([]);
    expect(await blocksOn(id, "2026-12-07")).toEqual([{ start_min: 510, end_min: 930 }]);
  });

  it("AC-STAFF-05: a second main position is not saved", async () => {
    await expect(
      createPosition(teacher3, "main", high, "Math teacher", "2026-12-07", MON_FRI(960, 1020), [manager1]),
    ).rejects.toThrow("An employee has exactly one main position");
    // Та сама назва й підрозділ: перевірка основної посади йде раніше за «вже має цю посаду».
    await expect(
      createPosition(teacher3, "main", elementary, "Teacher", "2026-12-07", MON_FRI(510, 930), [manager1]),
    ).rejects.toThrow("An employee has exactly one main position");
    expect((await positionsOf(teacher3)).map((p) => p.title)).toEqual(["Teacher"]);
  });

  it("AC-STAFF-06: an additional position whose schedule overlaps the main one is not saved, with the conflicting hours", async () => {
    await expect(
      createPosition(teacher3, "additional", high, "Math teacher", "2026-12-07", [
        { weekday: 1, start_min: 900, end_min: 1020 },
      ], []),
    ).rejects.toThrow("This schedule overlaps the position Elementary school / Teacher: Mon 08:30–15:30");
    expect((await positionsOf(teacher3)).map((p) => p.title)).toEqual(["Teacher"]);
  });

  it("AC-STAFF-06: a schedule that starts where the other ends is fine, and versions may differ on dates that do not overlap", async () => {
    const math = await createPosition(teacher3, "additional", high, "Math teacher", "2026-12-07", [
      { weekday: 1, start_min: 930, end_min: 1020 },
    ], []);
    const main = await mainPositionOf(teacher3);
    // Головна посада з 2027-01-04 до 16:00 у понеділок — перетинає Math teacher 15:30–17:00 у ці дати.
    await expect(setSchedule(admin, main, "2027-01-04", MON_FRI(510, 960))).rejects.toThrow(
      "This schedule overlaps the position High school / Math teacher: Mon 15:30–17:00",
    );
    // Math teacher з 2027-01-04 — з 16:00: тепер нова версія головної вже не перетинається ні на яку дату.
    await setSchedule(admin, math, "2027-01-04", [{ weekday: 1, start_min: 960, end_min: 1020 }]);
    await setSchedule(admin, main, "2027-01-04", MON_FRI(510, 960));
    expect(await blocksOn(main, "2026-12-28")).toEqual([{ start_min: 510, end_min: 930 }]);
    expect(await blocksOn(main, "2027-01-04")).toEqual([{ start_min: 510, end_min: 960 }]);
    expect(await blocksOn(math, "2026-12-28")).toEqual([{ start_min: 930, end_min: 1020 }]);
    expect(await blocksOn(math, "2027-01-04")).toEqual([{ start_min: 960, end_min: 1020 }]);
  });

  it("AC-STAFF-06: the database refuses an overlapping block at the same dates even past the functions", async () => {
    const main = await mainPositionOf(teacher3);
    await expect(
      asOwner(
        "insert into public.schedule_blocks (position_id, weekday, start_min, end_min, valid_from) values ($1, 2, 600, 700, '2026-12-08')",
        [main],
      ),
    ).rejects.toMatchObject({ code: "23P01" });
  });

  it("AC-STAFF-04: refuses a duplicate position, a bad title and a responsible manager without the manager role", async () => {
    await expect(createPosition(teacher3, "additional", elementary, "Teacher", "2026-12-07", MON_FRI(1020, 1080), []))
      .rejects.toThrow("This employee already has this position");
    await expect(createPosition(teacher3, "additional", high, "  ", "2026-12-07", MON_FRI(1020, 1080), [])).rejects.toThrow(
      "Enter a job title of up to 120 characters",
    );
    await expect(
      createPosition(teacher3, "additional", high, "Choir", "2026-12-07", MON_FRI(1080, 1140), [teacher1]),
    ).rejects.toThrow("A responsible manager must be an active manager or administrator");
  });

  it("AC-STAFF-06: checks the working periods themselves", async () => {
    await expect(createPosition(teacher3, "additional", high, "Choir", "2026-12-07", [], [])).rejects.toThrow(
      "Add at least one working period",
    );
    await expect(
      createPosition(teacher3, "additional", high, "Choir", "2026-12-07", [{ weekday: 6, start_min: 601, end_min: 700 }], []),
    ).rejects.toThrow("Each working period needs a start before its end, in 5-minute steps");
    await expect(
      createPosition(teacher3, "additional", high, "Choir", "2026-12-07", [{ weekday: 6, start_min: 600 }], []),
    ).rejects.toThrow("Each working period needs a day, a start and an end");
    await expect(
      createPosition(teacher3, "additional", high, "Choir", "2026-12-07", [
        { weekday: 6, start_min: 600, end_min: 700 },
        { weekday: 6, start_min: 660, end_min: 720 },
      ], []),
    ).rejects.toThrow("Working periods of one day must not overlap");
    await expect(createPosition(teacher3, "additional", high, "Choir", null as unknown as string, MON_FRI(1080, 1140), []))
      .rejects.toThrow("Choose the date the schedule applies from");
    expect((await positionsOf(teacher3)).map((p) => p.title)).not.toContain("Choir");
  });

  it("AC-STAFF-13: only an administrator creates positions and changes schedules or managers", async () => {
    const main = await mainPositionOf(teacher3);
    for (const user of [manager1, teacher1]) {
      await expect(
        t.asUser(user, "select public.create_position($1, 'additional', $2, 'Sneaky', '2026-12-07', $3::jsonb, '{}')", [
          teacher3,
          high,
          JSON.stringify(MON_FRI(1140, 1200)),
        ]),
      ).rejects.toMatchObject({ code: "42501", message: "Only an administrator can manage employees" });
      await expect(setSchedule(user, main, "2026-12-07", MON_FRI(510, 600))).rejects.toMatchObject({ code: "42501" });
      await expect(
        t.asUser(user, "select public.set_position_managers($1, $2::uuid[])", [main, [user]]),
      ).rejects.toMatchObject({ code: "42501" });
    }
  });

  it("AC-STAFF-04: set_position_managers replaces the responsible managers", async () => {
    const main = await mainPositionOf(teacher3);
    const manager2 = t.users["manager2@example.test"];
    await t.asUser(admin, "select public.set_position_managers($1, $2::uuid[])", [main, [manager2]]);
    const rows = await asOwner<{ manager_id: string }>(
      "select manager_id from public.position_managers where position_id = $1",
      [main],
    );
    expect(rows).toEqual([{ manager_id: manager2 }]);
    await t.asUser(admin, "select public.set_position_managers($1, $2::uuid[])", [main, [manager1]]);
  });
});

describe("set_position_schedule: a new schedule from a date", () => {
  it("AC-STAFF-07: keeps the approved record and gives the new whole day the new hours", async () => {
    const main = await mainPositionOf(teacher1);
    await submit(teacher1, main, "2026-12-08", 510, 930);
    await asOwner("update public.leave_records set status = 'approved' where employee_id = $1 and date = '2026-12-08'", [
      teacher1,
    ]);

    await setSchedule(admin, main, "2026-12-07", MON_FRI(510, 750));

    const [kept] = await asOwner<{ start_min: number; end_min: number; minutes: number; status: string }>(
      "select start_min, end_min, minutes, status from public.leave_records where employee_id = $1 and date = '2026-12-08'",
      [teacher1],
    );
    expect(kept).toEqual({ start_min: 510, end_min: 930, minutes: 420, status: "approved" });

    await expect(submit(teacher1, main, "2026-12-09", 510, 930)).rejects.toThrow(
      "Hours must be within your schedule: 08:30–12:30",
    );
    await submit(teacher1, main, "2026-12-09", 510, 750);
    const [whole] = await asOwner<{ start_min: number; end_min: number }>(
      "select start_min, end_min from public.leave_records where employee_id = $1 and date = '2026-12-09'",
      [teacher1],
    );
    expect(whole).toEqual({ start_min: 510, end_min: 750 });
    const [minutes] = await asOwner<{ wed: number; fri_before: number }>(
      "select private.working_minutes($1, '2026-12-09') as wed, private.working_minutes($1, '2026-12-04') as fri_before",
      [teacher1],
    );
    expect(minutes).toEqual({ wed: 240, fri_before: 420 });
    // До дати дії — попередній розклад.
    await submit(teacher1, main, "2026-12-04", 510, 930);
  });

  it("AC-STAFF-07: replaces a version that starts on the same date instead of stacking a second one", async () => {
    const main = await mainPositionOf(teacher1);
    await setSchedule(admin, main, "2027-02-01", MON_FRI(540, 900));
    await setSchedule(admin, main, "2027-02-01", MON_FRI(600, 900));
    expect(await blocksOn(main, "2027-02-01")).toEqual([{ start_min: 600, end_min: 900 }]);
    expect(await blocksOn(main, "2027-01-29")).toEqual([{ start_min: 510, end_min: 750 }]);
    // Версія між двома наявними закінчується там, де починається наступна.
    await setSchedule(admin, main, "2027-01-11", MON_FRI(570, 900));
    expect(await blocksOn(main, "2027-01-08")).toEqual([{ start_min: 510, end_min: 750 }]);
    expect(await blocksOn(main, "2027-01-11")).toEqual([{ start_min: 570, end_min: 900 }]);
    expect(await blocksOn(main, "2027-02-01")).toEqual([{ start_min: 600, end_min: 900 }]);
  });
});
