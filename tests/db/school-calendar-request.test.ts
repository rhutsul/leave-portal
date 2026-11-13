// Заявка в закритий і скорочений день на справжньому Postgres (PGlite, docs/decisions/0001-pglite-db-tests.md):
// public.submit_leave_request і public.update_leave_record_hours із шкільним календарем — контракт design.md D4 зміни
// impl-school-calendar (задача 2). Тести написано з тексту AC-CAL-03, -04, -05, -09
// (openspec/specs/school-calendar/spec.md) і Assumptions requirements/04-school-calendar.md до коду: maker ≠ checker.
// Тестові дані D7: teacher1@ — основна посада Mon–Fri 08:30–15:30 і додаткова Mon 15:45–17:00. 2026-11-20 —
// п'ятниця, 2026-11-24 і 2026-12-29 — вівторки: у ці дні в teacher1@ лише основна посада.
import { afterEach, beforeAll, describe, expect, it } from "vitest";
import { createLeaveDb, type LeaveDb } from "./supabase-pglite";

let t: LeaveDb;
let teacher1: string;
let admin: string;
let teacher1Main: number;

const EARLY_DAY = "2026-11-20";
const BREAK_DAY = "2026-12-29";
const WORKING_TUESDAY = "2026-11-24";
const WHOLE = { start_min: 510, end_min: 930 };
const NOON = 720;

/** Перевірка результату й прибирання — від власника бази (обходить RLS і гранти). */
const asOwner = async <T = Record<string, unknown>>(
  sql: string,
  params: unknown[] = [],
) => (await t.db.query<T>(sql, params)).rows;

type RecordInput = {
  position_id: number;
  date: string;
  start_min: number;
  end_min: number;
};

/** Заявка від teacher1@, як server action подання через supabase.rpc. */
const submit = async (leaveType: string, records: RecordInput[]) =>
  (
    await t.asUser<{ id: number }>(
      teacher1,
      "select public.submit_leave_request($1, $2::jsonb) as id",
      [leaveType, JSON.stringify(records)],
    )
  )[0].id;

const addClosure = async (
  name: string,
  start: string,
  end: string,
  closesAt: number | null = null,
) =>
  (
    await t.asUser<{ id: number }>(
      admin,
      "select public.add_school_closure($1, $2::date, $3::date, $4) as id",
      [name, start, end, closesAt],
    )
  )[0].id;

const removeClosure = (id: number) =>
  t.asUser(admin, "select public.remove_school_closure($1)", [id]);

const changeHours = (recordId: number, start: number, end: number) =>
  t.asUser(teacher1, "select public.update_leave_record_hours($1, $2, $3)", [
    recordId,
    start,
    end,
  ]);

type RecordRow = {
  id: number;
  date: string;
  start_min: number;
  end_min: number;
  minutes: number;
  status: string;
};

const records = () =>
  asOwner<RecordRow>(
    `select id, date::text as date, start_min, end_min, minutes, status from public.leave_records
      order by date, start_min`,
  );

const calendarNames = async () =>
  (
    await asOwner<{ name: string }>(
      "select name from public.school_closures order by start_date",
    )
  ).map((r) => r.name);

const main = (
  date: string,
  start_min: number,
  end_min: number,
): RecordInput => ({
  position_id: teacher1Main,
  date,
  start_min,
  end_min,
});

beforeAll(async () => {
  t = await createLeaveDb();
  teacher1 = t.users["teacher1@example.test"];
  admin = t.users["admin@example.test"];
  const [row] = await asOwner<{ id: number }>(
    `select p.id from public.positions as p join public.profiles as pr on pr.id = p.employee_id
      where pr.email = 'teacher1@example.test' and p.kind = 'main'`,
  );
  teacher1Main = row.id;
}, 60_000);

afterEach(async () => {
  await asOwner("delete from public.leave_requests");
  await asOwner("delete from public.school_closures");
});

describe("submit_leave_request on a date closed by the school", () => {
  it('AC-CAL-03: 2026-12-29 in "Winter break" is not accepted — The school is closed on this day: Winter break', async () => {
    await addClosure("Winter break", "2026-12-28", "2027-01-08");
    await expect(
      submit("personal", [main(BREAK_DAY, WHOLE.start_min, WHOLE.end_min)]),
    ).rejects.toThrow("The school is closed on this day: Winter break");
    expect(await records()).toEqual([]);
  });

  it("AC-CAL-03: in a multi-date request the closed 2026-12-29 is dropped and only the working date's record is created", async () => {
    await addClosure("Winter break", "2026-12-28", "2027-01-08");
    await submit("personal", [
      main(WORKING_TUESDAY, WHOLE.start_min, WHOLE.end_min),
      main(BREAK_DAY, WHOLE.start_min, WHOLE.end_min),
    ]);
    expect(
      (await records()).map(({ date, start_min, end_min }) => ({
        date,
        start_min,
        end_min,
      })),
    ).toEqual([{ date: WORKING_TUESDAY, ...WHOLE }]);
  });
});

describe("submit_leave_request on an early dismissal day", () => {
  it('AC-CAL-04: Personal leave for the whole day 2026-11-20 with "Teachers\' meeting" from 12:00 — 1 record 08:30–12:00', async () => {
    await addClosure("Teachers' meeting", EARLY_DAY, EARLY_DAY, NOON);
    await submit("personal", [main(EARLY_DAY, 510, NOON)]);
    expect(
      (await records()).map(
        ({ date, start_min, end_min, minutes, status }) => ({
          date,
          start_min,
          end_min,
          minutes,
          status,
        }),
      ),
    ).toEqual([
      {
        date: EARLY_DAY,
        start_min: 510,
        end_min: NOON,
        minutes: 210,
        status: "awaiting",
      },
    ]);
  });

  it("AC-CAL-05: hours 13:00–14:00 on 2026-11-20 — no request, Hours must be within your schedule: 08:30–12:00", async () => {
    await addClosure("Teachers' meeting", EARLY_DAY, EARLY_DAY, NOON);
    await expect(
      submit("personal", [main(EARLY_DAY, 780, 840)]),
    ).rejects.toThrow("Hours must be within your schedule: 08:30–12:00");
    expect(await records()).toEqual([]);
    expect(await asOwner("select id from public.leave_requests")).toEqual([]);
  });

  it("AC-CAL-05: the old whole day 08:30–15:30 on 2026-11-20 runs past 12:00 and is refused with the same message", async () => {
    await addClosure("Teachers' meeting", EARLY_DAY, EARLY_DAY, NOON);
    await expect(
      submit("personal", [main(EARLY_DAY, WHOLE.start_min, WHOLE.end_min)]),
    ).rejects.toThrow("Hours must be within your schedule: 08:30–12:00");
    expect(await records()).toEqual([]);
  });

  it("AC-CAL-05: changing a record's hours on 2026-11-20 to 13:00–14:00 is refused with the same message", async () => {
    await addClosure("Teachers' meeting", EARLY_DAY, EARLY_DAY, NOON);
    await submit("personal", [main(EARLY_DAY, 510, 600)]);
    const [record] = await records();
    await expect(changeHours(record.id, 780, 840)).rejects.toThrow(
      "Hours must be within your schedule: 08:30–12:00",
    );
    const [after] = await records();
    expect([after.start_min, after.end_min]).toEqual([510, 600]);
  });
});

describe("remove_school_closure makes the date a working day again", () => {
  it('AC-CAL-09: after the admin removes "Winter break", 2026-12-29 is accepted with hours 08:30–15:30', async () => {
    const id = await addClosure("Winter break", "2026-12-28", "2027-01-08");
    await expect(
      submit("personal", [main(BREAK_DAY, WHOLE.start_min, WHOLE.end_min)]),
    ).rejects.toThrow("The school is closed on this day: Winter break");

    await removeClosure(id);
    expect(await calendarNames()).toEqual([]);

    await submit("personal", [main(BREAK_DAY, WHOLE.start_min, WHOLE.end_min)]);
    expect(
      (await records()).map(({ date, start_min, end_min }) => ({
        date,
        start_min,
        end_min,
      })),
    ).toEqual([{ date: BREAK_DAY, ...WHOLE }]);
  });
});

describe("submit_leave_request on an early dismissal that leaves no working time", () => {
  /**
   * «Дано» AC-CAL-16: єдиний блок teacher1@ у п'ятницю — 13:00–17:00 (замість 08:30–15:30); після тесту розклад
   * п'ятниці повертаємо.
   */
  async function withAfternoonFriday(run: () => Promise<void>) {
    const before = await asOwner<{ start_min: number; end_min: number }>(
      "select start_min, end_min from public.schedule_blocks where position_id = $1 and weekday = 5",
      [teacher1Main],
    );
    await asOwner("delete from public.schedule_blocks where position_id = $1 and weekday = 5", [teacher1Main]);
    await asOwner(
      "insert into public.schedule_blocks (position_id, weekday, start_min, end_min) values ($1, 5, 780, 1020)",
      [teacher1Main],
    );
    try {
      await run();
    } finally {
      await asOwner("delete from public.schedule_blocks where position_id = $1 and weekday = 5", [teacher1Main]);
      for (const b of before) {
        await asOwner(
          "insert into public.schedule_blocks (position_id, weekday, start_min, end_min) values ($1, 5, $2, $3)",
          [teacher1Main, b.start_min, b.end_min],
        );
      }
    }
  }

  it("AC-CAL-16: only 13:00–17:00 on Friday and \"Teachers' meeting\" from 12:00 — 2026-11-20 is not accepted, The school is closed on this day: Teachers' meeting", async () => {
    await addClosure("Teachers' meeting", EARLY_DAY, EARLY_DAY, NOON);
    await withAfternoonFriday(async () => {
      await expect(submit("personal", [main(EARLY_DAY, 780, 1020)])).rejects.toThrow(
        "The school is closed on this day: Teachers' meeting",
      );
      expect(await records()).toEqual([]);
    });
  });

  it("AC-CAL-16: in a multi-date request 2026-11-20 is dropped and the next Friday 2026-11-27 is created", async () => {
    await addClosure("Teachers' meeting", EARLY_DAY, EARLY_DAY, NOON);
    await withAfternoonFriday(async () => {
      await submit("personal", [main(EARLY_DAY, 780, 1020), main("2026-11-27", 780, 1020)]);
      expect((await records()).map((r) => [r.date, r.start_min, r.end_min])).toEqual([["2026-11-27", 780, 1020]]);
    });
  });

  it("AC-CAL-16: without the early dismissal the same Friday is accepted 13:00–17:00", async () => {
    await withAfternoonFriday(async () => {
      await submit("personal", [main(EARLY_DAY, 780, 1020)]);
      expect((await records()).map((r) => [r.date, r.start_min, r.end_min])).toEqual([[EARLY_DAY, 780, 1020]]);
    });
  });
});
