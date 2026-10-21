// Попередження працівнику про перевищення залишку на справжньому Postgres (PGlite, docs/decisions/0001-pglite-db-tests.md):
// заявка понад залишок створюється (submit_leave_request), а попередження рахує src/lib/leave/balance.ts за залишком
// з get_balance_inputs на момент подання — як server action /requests/new.
// Тестові дані D7: teacher1@ — основна посада Mon–Fri 08:30–15:30 і додаткова Mon 15:45–17:00 (у вівторок — лише
// основна, 420 хв); teacher2@ — одна посада Mon–Fri, у вівторок блоки 08:30–12:00 і 12:30–15:30.
import { afterEach, beforeAll, describe, expect, it } from "vitest";
import {
  computeBalances,
  employeeWarning,
  parseBalanceInputs,
  requestOverBalance,
  type WeekdayBlock,
} from "@/lib/leave/balance";
import { createLeaveDb, type LeaveDb } from "./supabase-pglite";

let t: LeaveDb;
let teacher1: string;
let teacher2: string;

type RecordInput = { position_id: number; date: string; start_min: number; end_min: number };

async function mainPositionOf(userId: string) {
  const [row] = await t.asService<{ id: number }>(
    "select id from public.positions where employee_id = $1 and kind = 'main'",
    [userId],
  );
  return row.id;
}

/** Блоки розкладу всіх посад працівника — як loadOwnPositions у формі. */
const blocksOf = async (userId: string) =>
  (
    await t.asUser<{ weekday: number; start_min: number; end_min: number }>(
      userId,
      "select weekday, start_min, end_min from public.schedule_blocks where employee_id = $1",
      [userId],
    )
  ).map((b): WeekdayBlock => ({ weekday: b.weekday, start: b.start_min, end: b.end_min }));

const submit = (userId: string, records: RecordInput[]) =>
  t.asUser<{ id: number }>(userId, "select public.submit_leave_request('personal', $1::jsonb) as id", [
    JSON.stringify(records),
  ]);

/** Залишок «Personal leave» у сотих за навчальний рік 2026–2027. */
async function personalRemaining(userId: string) {
  const [row] = await t.asUser<{ inputs: unknown }>(userId, "select public.get_balance_inputs($1, 2026) as inputs", [
    userId,
  ]);
  return computeBalances(parseBalanceInputs(row.inputs), 2026).limited.personal.remaining;
}

/**
 * Given: «Personal leave» used = hundredths — погоджені записи на основній посаді в ср–пт з грудня 2026 (у ці дні
 * працівник має лише основну посаду, 420 хв): цілі дні 08:30–15:30 і решта — від 08:30 на потрібні хвилини.
 */
async function usePersonal(userId: string, hundredths: number) {
  const position = await mainPositionOf(userId);
  const whole = Math.floor(hundredths / 100);
  const rest = hundredths % 100;
  const dates: string[] = [];
  const d = new Date("2026-12-02T00:00:00Z");
  while (dates.length < whole + 1) {
    if ([3, 4, 5].includes(d.getUTCDay())) dates.push(d.toISOString().slice(0, 10));
    d.setUTCDate(d.getUTCDate() + 1);
  }
  const records: RecordInput[] = dates.slice(0, whole).map((date) => ({ position_id: position, date, start_min: 510, end_min: 930 }));
  // Хвилини, кратні 5, чия частка дня з 420 дає rest сотих (0.50 → 210 хв, 0.80 → 335 хв).
  if (rest) records.push({ position_id: position, date: dates[whole], start_min: 510, end_min: 510 + Math.round((rest * 4.2) / 5) * 5 });
  const [{ id }] = await submit(userId, records);
  await t.asService("update public.leave_records set status = 'approved' where request_id = $1", [id]);
}

/** Подає заявку й повертає попередження, яке побачить працівник, і кількість створених записів. */
async function requestWithWarning(userId: string, records: RecordInput[]) {
  const remaining = await personalRemaining(userId);
  const [{ id }] = await submit(userId, records);
  // Хвилини записів — з бази (у вівторок teacher2@ проміжок 12:00–12:30 не рахується).
  const created = await t.asService<{ date: string; minutes: number }>(
    "select to_char(date, 'YYYY-MM-DD') as date, minutes from public.leave_records where request_id = $1",
    [id],
  );
  const over = requestOverBalance("personal", created, await blocksOf(userId), () => remaining);
  return { created: created.length, warnings: over.map((o) => employeeWarning("personal", o.share, o.remaining)) };
}

beforeAll(async () => {
  t = await createLeaveDb();
  teacher1 = t.users["teacher1@example.test"];
  teacher2 = t.users["teacher2@example.test"];
}, 60_000);

afterEach(async () => {
  await t.asService("delete from public.leave_requests");
});

describe("the employee's warning about exceeding the balance", () => {
  it("AC-BALANCE-08: a whole day 2026-11-03 with a balance of 0.50 is created and warns about 0.50 day unpaid", async () => {
    await usePersonal(teacher1, 1750);
    expect(await personalRemaining(teacher1)).toBe(50);
    const position = await mainPositionOf(teacher1);
    const result = await requestWithWarning(teacher1, [{ position_id: position, date: "2026-11-03", start_min: 510, end_min: 930 }]);
    expect(result).toEqual({
      created: 1,
      warnings: ["Your Personal leave balance is 0.50 day. Another 0.50 day will be counted as Unpaid leave"],
    });
  });

  it("AC-BALANCE-15: 09:00–11:30 on 2026-11-03 with a balance of 0.20 is created and warns about 0.16 day unpaid", async () => {
    await usePersonal(teacher1, 1780);
    expect(await personalRemaining(teacher1)).toBe(20);
    const position = await mainPositionOf(teacher1);
    const result = await requestWithWarning(teacher1, [{ position_id: position, date: "2026-11-03", start_min: 540, end_min: 690 }]);
    expect(result).toEqual({
      created: 1,
      warnings: ["Your Personal leave balance is 0.20 day. Another 0.16 day will be counted as Unpaid leave"],
    });
  });

  it("AC-BALANCE-17: three whole days with a balance of 1.50 are created with one warning for the whole request", async () => {
    await usePersonal(teacher2, 1650);
    expect(await personalRemaining(teacher2)).toBe(150);
    const position = await mainPositionOf(teacher2);
    const result = await requestWithWarning(
      teacher2,
      ["2026-11-02", "2026-11-03", "2026-11-04"].map((date) => ({ position_id: position, date, start_min: 510, end_min: 930 })),
    );
    expect(result).toEqual({
      created: 3,
      warnings: ["Your Personal leave balance is 1.50 day. Another 1.50 day will be counted as Unpaid leave"],
    });
  });
});
