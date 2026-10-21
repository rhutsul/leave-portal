// Рішення менеджера на справжньому Postgres (PGlite, docs/decisions/0001-pglite-db-tests.md): public.decide_leave_record,
// public.decision_balance, public.decision_records і public.record_history з міграції 20261021133002_leave_decisions.sql,
// а залишки після рішення — через get_balance_inputs і src/lib/leave/balance.ts, як на /balances.
// Тестові дані D7: teacher1@ — основна посада (manager1@) Mon–Fri 08:30–15:30 і додаткова (manager2@) Mon 15:45–17:00;
// teacher2@ (manager2@) — Mon–Fri, перенесено 5.00 днів Sick leave на 2026–2027; manager1@ відповідає й за власну посаду.
import { afterEach, beforeAll, describe, expect, it } from "vitest";
import { computeBalances, formatDays, parseBalanceInputs } from "@/lib/leave/balance";
import { createLeaveDb, type LeaveDb } from "./supabase-pglite";

let t: LeaveDb;
let teacher1: string;
let teacher2: string;
let manager1: string;
let manager2: string;
let admin: string;
let teacher1Main: number;
let teacher1Additional: number;
let teacher2Main: number;
let manager1Main: number;

const WHOLE = { start_min: 510, end_min: 930 };

async function positionOf(email: string, kind: string) {
  const [row] = await t.asService<{ id: number }>(
    `select p.id from public.positions as p join public.profiles as pr on pr.id = p.employee_id
      where pr.email = $1 and p.kind = $2`,
    [email, kind],
  );
  return row.id;
}

type RecordInput = { position_id: number; date: string; start_min: number; end_min: number };

/** Подає заявку від імені працівника й повертає id її записів у порядку дат і годин. */
async function submit(userId: string, leaveType: string, records: RecordInput[], comment: string | null = null) {
  const [{ id }] = await t.asUser<{ id: number }>(
    userId,
    "select public.submit_leave_request($1, $2::jsonb, p_comment => $3) as id",
    [leaveType, JSON.stringify(records), comment],
  );
  const rows = await t.asService<{ id: number }>(
    "select id from public.leave_records where request_id = $1 order by date, start_min",
    [id],
  );
  return { requestId: id, recordIds: rows.map((r) => r.id) };
}

const decide = (userId: string, recordId: number, decision: string, comment: string | null = null, split = false) =>
  t.asUser<{ result: { status: string; paid_days: number | null; unpaid_days: number | null } }>(
    userId,
    "select public.decide_leave_record($1, $2, $3, $4) as result",
    [recordId, decision, comment, split],
  ).then(([row]) => row.result);

const statusOf = async (recordId: number) =>
  (await t.asService<{ status: string }>("select status from public.leave_records where id = $1", [recordId]))[0].status;

/** «My requests» працівника: його записи з рішенням і коментарем менеджера. */
const myRecord = async (userId: string, recordId: number) =>
  (
    await t.asUser<{ status: string; manager_comment: string | null; paid_days: string | null; unpaid_days: string | null }>(
      userId,
      "select status, manager_comment, paid_days, unpaid_days from public.my_leave_records where id = $1",
      [recordId],
    )
  )[0];

const awaitingFor = async (userId: string) =>
  t.asUser<{ id: number; employee_email: string; position_kind: string; employee_comment: string | null; can_decide: boolean }>(
    userId,
    "select id, employee_email, position_kind, employee_comment, can_decide from public.decision_records() where status = 'awaiting'",
  );

async function balancesOf(employee: string, year = 2026) {
  const [row] = await t.asUser<{ inputs: unknown }>(employee, "select public.get_balance_inputs($1, $2) as inputs", [
    employee,
    year,
  ]);
  const b = computeBalances(parseBalanceInputs(row.inputs), year);
  const limited = (type: "sick" | "personal") => ({
    carriedOver: formatDays(b.limited[type].carriedOver),
    used: formatDays(b.limited[type].used),
    remaining: formatDays(b.limited[type].remaining),
  });
  return { sick: limited("sick"), personal: limited("personal"), unpaid: formatDays(b.unlimited.unpaid) };
}

/** Перші n робочих днів (пн–пт) або лише вт–пт, починаючи з дати. */
function weekdaysFrom(start: string, n: number, skipMondays = false): string[] {
  const dates: string[] = [];
  const d = new Date(`${start}T00:00:00Z`);
  while (dates.length < n) {
    const wd = d.getUTCDay();
    if (wd !== 0 && wd !== 6 && !(skipMondays && wd === 1)) dates.push(d.toISOString().slice(0, 10));
    d.setUTCDate(d.getUTCDate() + 1);
  }
  return dates;
}

/**
 * Given «Personal leave» teacher1@ показує used = days (0.50 кроками): погоджені вт–пт з грудня 2026 на основній
 * посаді (420 хв на день, лише вона), половина дня — 09:00–12:30 (210 хв = 0.50). Статус ставить service_role.
 */
async function usePersonal(days: number) {
  const whole = Math.floor(days);
  const dates = weekdaysFrom("2026-12-01", whole + 1, true);
  const records: RecordInput[] = dates.slice(0, whole).map((date) => ({ position_id: teacher1Main, date, ...WHOLE }));
  if (days > whole) records.push({ position_id: teacher1Main, date: dates[whole], start_min: 540, end_min: 750 });
  if (records.length === 0) return;
  const { requestId } = await submit(teacher1, "personal", records);
  await t.asService("update public.leave_records set status = 'approved' where request_id = $1", [requestId]);
}

beforeAll(async () => {
  t = await createLeaveDb();
  teacher1 = t.users["teacher1@example.test"];
  teacher2 = t.users["teacher2@example.test"];
  manager1 = t.users["manager1@example.test"];
  manager2 = t.users["manager2@example.test"];
  admin = t.users["admin@example.test"];
  teacher1Main = await positionOf("teacher1@example.test", "main");
  teacher1Additional = await positionOf("teacher1@example.test", "additional");
  teacher2Main = await positionOf("teacher2@example.test", "main");
  manager1Main = await positionOf("manager1@example.test", "main");
}, 60_000);

afterEach(async () => {
  await t.asService("delete from public.leave_requests");
});

describe("who decides", () => {
  it("AC-DECIDE-01: manager1@'s Awaiting decision list has teacher1@'s main-position record, not the additional one", async () => {
    const { recordIds } = await submit(teacher1, "sick", [
      { position_id: teacher1Main, date: "2026-11-02", ...WHOLE },
      { position_id: teacher1Additional, date: "2026-11-02", start_min: 945, end_min: 1020 },
    ]);
    const list = await awaitingFor(manager1);
    expect(list.map((r) => [r.id, r.position_kind])).toEqual([[recordIds[0], "main"]]);
    expect((await awaitingFor(manager2)).map((r) => r.id)).toEqual([recordIds[1]]);
  });

  it("AC-DECIDE-08: manager2@ cannot approve a record of teacher1@'s main position — status unchanged, nothing saved", async () => {
    const { recordIds } = await submit(teacher1, "sick", [{ position_id: teacher1Main, date: "2026-11-03", ...WHOLE }]);
    await expect(decide(manager2, recordIds[0], "approve")).rejects.toMatchObject({
      code: "42501",
      message: "You can't decide on this record",
    });
    expect(await statusOf(recordIds[0])).toBe("awaiting");
    expect(await t.asService("select 1 from public.leave_record_events where action = 'approved'")).toEqual([]);
  });

  it("AC-DECIDE-09: teacher1@ cannot approve their own record", async () => {
    const { recordIds } = await submit(teacher1, "sick", [{ position_id: teacher1Main, date: "2026-11-03", ...WHOLE }]);
    await expect(decide(teacher1, recordIds[0], "approve")).rejects.toMatchObject({ code: "42501" });
    expect(await statusOf(recordIds[0])).toBe("awaiting");
  });

  it("a record that does not exist gets the same answer as a record without access, even for the administrator", async () => {
    await expect(decide(admin, 999_999, "approve")).rejects.toMatchObject({
      code: "42501",
      message: "You can't decide on this record",
    });
    await expect(t.asAnon("select public.decide_leave_record(1, 'approve')")).rejects.toMatchObject({ code: "42501" });
  });

  it("AC-DECIDE-18: manager1@ cannot approve their own record of a position they manage", async () => {
    const { recordIds } = await submit(manager1, "sick", [{ position_id: manager1Main, date: "2026-11-03", ...WHOLE }]);
    expect((await awaitingFor(manager1)).map((r) => [r.id, r.can_decide])).toEqual([[recordIds[0], false]]);
    await expect(decide(manager1, recordIds[0], "approve")).rejects.toMatchObject({
      message: "Your own record is decided by an administrator",
    });
    expect(await statusOf(recordIds[0])).toBe("awaiting");
  });

  it("AC-DECIDE-19: the administrator approves manager1@'s own record", async () => {
    const { recordIds } = await submit(manager1, "sick", [{ position_id: manager1Main, date: "2026-11-03", ...WHOLE }]);
    expect((await decide(admin, recordIds[0], "approve")).status).toBe("approved");
    expect(await statusOf(recordIds[0])).toBe("approved");
  });

  it("AC-DECIDE-10: the administrator approves a record of a position they don't manage; the history shows the administrator", async () => {
    const { recordIds } = await submit(teacher1, "sick", [{ position_id: teacher1Main, date: "2026-11-03", ...WHOLE }]);
    await decide(admin, recordIds[0], "approve");
    expect(await statusOf(recordIds[0])).toBe("approved");
    const history = await t.asUser<{ action: string; actor_name: string }>(
      teacher1,
      "select action, actor_name from public.record_history($1)",
      [recordIds[0]],
    );
    expect(history).toEqual([
      { action: "submitted", actor_name: "Андрій Демо-Вчитель-Перший" },
      { action: "approved", actor_name: "Олена Демо-Адмін" },
    ]);
  });

  it("AC-DECIDE-07: after manager1@ approves, the second manager's reject is refused and the record stays Approved", async () => {
    // Given AC: у посади 2 відповідальні менеджери — додаємо manager2@ до основної посади teacher1@ лише на час тесту.
    await t.asService("insert into public.position_managers (position_id, manager_id) values ($1, $2)", [
      teacher1Main,
      manager2,
    ]);
    try {
      const { recordIds } = await submit(teacher1, "sick", [{ position_id: teacher1Main, date: "2026-11-03", ...WHOLE }]);
      expect((await awaitingFor(manager2)).map((r) => r.id)).toContain(recordIds[0]);
      await decide(manager1, recordIds[0], "approve");
      await expect(decide(manager2, recordIds[0], "reject")).rejects.toMatchObject({
        message: "Another manager has already decided: Approved",
      });
      expect(await statusOf(recordIds[0])).toBe("approved");
    } finally {
      await t.asService("delete from public.position_managers where position_id = $1 and manager_id = $2", [
        teacher1Main,
        manager2,
      ]);
    }
  });
});

describe("decisions and comments", () => {
  it("AC-DECIDE-02: approving one of 2 records leaves the other Awaiting decision", async () => {
    const { recordIds } = await submit(teacher1, "sick", [
      { position_id: teacher1Main, date: "2026-11-03", ...WHOLE },
      { position_id: teacher1Main, date: "2026-11-04", ...WHOLE },
    ]);
    await decide(manager1, recordIds[0], "approve");
    expect([await statusOf(recordIds[0]), await statusOf(recordIds[1])]).toEqual(["approved", "awaiting"]);
  });

  it("AC-DECIDE-03: a rejected record is Rejected in the employee's My requests", async () => {
    const { recordIds } = await submit(teacher1, "sick", [{ position_id: teacher1Main, date: "2026-11-03", ...WHOLE }]);
    await decide(manager1, recordIds[0], "reject");
    expect(await myRecord(teacher1, recordIds[0])).toMatchObject({ status: "rejected", manager_comment: null });
  });

  it("AC-DECIDE-04: returning without a comment is refused with “Tell the employee what to fix”", async () => {
    const { recordIds } = await submit(teacher1, "sick", [{ position_id: teacher1Main, date: "2026-11-03", ...WHOLE }]);
    await expect(decide(manager1, recordIds[0], "return", "  ")).rejects.toMatchObject({
      message: "Tell the employee what to fix",
    });
    expect(await statusOf(recordIds[0])).toBe("awaiting");
  });

  it("AC-DECIDE-05: returning with a comment — Returned for revision, the employee sees the comment", async () => {
    const { recordIds } = await submit(teacher1, "sick", [{ position_id: teacher1Main, date: "2026-11-03", ...WHOLE }]);
    await decide(manager1, recordIds[0], "return", "Enter hours instead of a whole day");
    expect(await myRecord(teacher1, recordIds[0])).toMatchObject({
      status: "returned",
      manager_comment: "Enter hours instead of a whole day",
    });
  });

  it("AC-DECIDE-23: rejecting with a comment — the employee sees “Not enough staff that day”", async () => {
    const { recordIds } = await submit(teacher1, "sick", [{ position_id: teacher1Main, date: "2026-11-03", ...WHOLE }]);
    await decide(manager1, recordIds[0], "reject", "Not enough staff that day");
    expect(await myRecord(teacher1, recordIds[0])).toMatchObject({
      status: "rejected",
      manager_comment: "Not enough staff that day",
    });
  });

  it("AC-DECIDE-24: approving with a comment — the employee sees “Get well soon”", async () => {
    const { recordIds } = await submit(teacher1, "sick", [{ position_id: teacher1Main, date: "2026-11-03", ...WHOLE }]);
    await decide(manager1, recordIds[0], "approve", "Get well soon");
    expect(await myRecord(teacher1, recordIds[0])).toMatchObject({ status: "approved", manager_comment: "Get well soon" });
  });

  it("a manager comment longer than 500 characters is refused", async () => {
    const { recordIds } = await submit(teacher1, "sick", [{ position_id: teacher1Main, date: "2026-11-03", ...WHOLE }]);
    await expect(decide(manager1, recordIds[0], "reject", "a".repeat(501))).rejects.toMatchObject({
      message: "The comment can be at most 500 characters",
    });
    await expect(decide(manager1, recordIds[0], "cancel")).rejects.toMatchObject({ code: "22023" });
    expect(await statusOf(recordIds[0])).toBe("awaiting");
  });

  it("AC-DECIDE-20: the manager sees the employee's comment “Doctor's appointment”", async () => {
    await submit(teacher1, "sick", [{ position_id: teacher1Main, date: "2026-11-03", ...WHOLE }], "Doctor's appointment");
    expect((await awaitingFor(manager1)).map((r) => r.employee_comment)).toEqual(["Doctor's appointment"]);
  });
});

describe("Awaiting decision and History", () => {
  it("AC-DECIDE-11: of 3 awaiting records, 1 approved — 2 remain awaiting and the approved one is in History", async () => {
    const { recordIds } = await submit(teacher1, "sick", [
      { position_id: teacher1Main, date: "2026-11-03", ...WHOLE },
      { position_id: teacher1Main, date: "2026-11-04", ...WHOLE },
      { position_id: teacher1Main, date: "2026-11-05", ...WHOLE },
    ]);
    await decide(manager1, recordIds[1], "approve");
    expect((await awaitingFor(manager1)).map((r) => r.id)).toEqual([recordIds[0], recordIds[2]]);
    const decided = await t.asUser<{ id: number; decided_by_name: string }>(
      manager1,
      "select id, decided_by_name from public.decision_records() where status <> 'awaiting'",
    );
    expect(decided).toEqual([{ id: recordIds[1], decided_by_name: "Ірина Демо-Менеджер-Перша" }]);
  });

  it("AC-DECIDE-14: a manager with no awaiting records gets an empty Awaiting decision list", async () => {
    expect(await awaitingFor(manager1)).toEqual([]);
  });

  it("AC-DECIDE-15: the employee and the position's manager see the history line — time, who, Approved", async () => {
    const { recordIds } = await submit(teacher1, "sick", [{ position_id: teacher1Main, date: "2026-11-03", ...WHOLE }]);
    await decide(manager1, recordIds[0], "approve");
    const line = async (userId: string) =>
      t.asUser<{ created_at: Date; action: string; actor_name: string }>(
        userId,
        "select created_at, action, actor_name from public.record_history($1) where action = 'approved'",
        [recordIds[0]],
      );
    const [forEmployee] = await line(teacher1);
    expect(forEmployee).toMatchObject({ action: "approved", actor_name: "Ірина Демо-Менеджер-Перша" });
    expect(forEmployee.created_at).toBeInstanceOf(Date);
    expect(await line(manager1)).toEqual([forEmployee]);
    // Менеджер чужої посади й неіснуючий запис — порожньо, однаково.
    expect(await line(manager2)).toEqual([]);
    expect(await t.asUser(teacher1, "select * from public.record_history(999999)")).toEqual([]);
  });
});

describe("balance after a decision", () => {
  it("AC-BALANCE-02: approving a whole-day Sick leave on Tue 2026-11-03 — used 1.00, remaining 17.00", async () => {
    const { recordIds } = await submit(teacher1, "sick", [{ position_id: teacher1Main, date: "2026-11-03", ...WHOLE }]);
    await decide(manager1, recordIds[0], "approve");
    expect((await balancesOf(teacher1)).sick).toMatchObject({ used: "1.00", remaining: "17.00" });
  });

  it("AC-BALANCE-03: approving Sick leave 09:00–11:30 on Tue 2026-11-03 — used 0.36, remaining 17.64", async () => {
    const { recordIds } = await submit(teacher1, "sick", [
      { position_id: teacher1Main, date: "2026-11-03", start_min: 540, end_min: 690 },
    ]);
    await decide(manager1, recordIds[0], "approve");
    expect((await balancesOf(teacher1)).sick).toMatchObject({ used: "0.36", remaining: "17.64" });
  });

  it("AC-BALANCE-05: both whole-day records on 2026-11-02 approved one by one by their managers count as 1.00, not 2.00", async () => {
    const { recordIds } = await submit(teacher1, "personal", [
      { position_id: teacher1Main, date: "2026-11-02", ...WHOLE },
      { position_id: teacher1Additional, date: "2026-11-02", start_min: 945, end_min: 1020 },
    ]);
    // Частка по даті: 420 з 495 хв — 0.85, потім 495 з 495 — 1.00, тож друге погодження додає 0.15.
    expect(await decide(manager1, recordIds[0], "approve")).toMatchObject({ paid_days: 0.85, unpaid_days: 0 });
    expect(await decide(manager2, recordIds[1], "approve")).toMatchObject({ paid_days: 0.15, unpaid_days: 0 });
    expect((await balancesOf(teacher1)).personal).toMatchObject({ used: "1.00", remaining: "17.00" });
  });

  it("AC-BALANCE-06: approving the whole day on the additional position only — used 0.15 (75 of 495 minutes)", async () => {
    const { recordIds } = await submit(teacher1, "personal", [
      { position_id: teacher1Additional, date: "2026-11-02", start_min: 945, end_min: 1020 },
    ]);
    await decide(manager2, recordIds[0], "approve");
    expect((await balancesOf(teacher1)).personal.used).toBe("0.15");
  });

  it("AC-BALANCE-07: rejecting a whole-day Sick leave record — used 0.00, remaining 18.00", async () => {
    const { recordIds } = await submit(teacher1, "sick", [{ position_id: teacher1Main, date: "2026-11-03", ...WHOLE }]);
    await decide(manager1, recordIds[0], "reject");
    expect((await balancesOf(teacher1)).sick).toMatchObject({ used: "0.00", remaining: "18.00" });
  });
});

describe("over-balance split", () => {
  const decisionBalance = async (userId: string, recordId: number) =>
    (
      await t.asUser<{ b: { leave_type: string; share: number; remaining: number } | null }>(
        userId,
        "select public.decision_balance($1) as b",
        [recordId],
      )
    )[0].b;

  it("AC-BALANCE-09: Personal used 17.50, remaining 0.50 — opening a whole-day record shows share 1.00 over remaining 0.50", async () => {
    await usePersonal(17.5);
    expect((await balancesOf(teacher1)).personal).toMatchObject({ used: "17.50", remaining: "0.50" });
    const { recordIds } = await submit(teacher1, "personal", [{ position_id: teacher1Main, date: "2026-11-03", ...WHOLE }]);
    expect(await decisionBalance(manager1, recordIds[0])).toEqual({ leave_type: "personal", share: 1, remaining: 0.5 });
    // Лише тому, хто може вирішити запис.
    await expect(decisionBalance(manager2, recordIds[0])).rejects.toMatchObject({ code: "42501" });
    await expect(decisionBalance(teacher1, recordIds[0])).rejects.toMatchObject({ code: "42501" });
  });

  it("AC-BALANCE-16: approving the record from AC-BALANCE-09 entirely as Personal leave is refused", async () => {
    await usePersonal(17.5);
    const { recordIds } = await submit(teacher1, "personal", [{ position_id: teacher1Main, date: "2026-11-03", ...WHOLE }]);
    await expect(decide(manager1, recordIds[0], "approve")).rejects.toMatchObject({
      message: "The Personal leave balance is 0.50 day: approve with the suggested split or reject",
    });
    expect(await statusOf(recordIds[0])).toBe("awaiting");
  });

  it("AC-BALANCE-10: approving with the split — Personal used 18.00, remaining 0.00; Unpaid used 0.50", async () => {
    await usePersonal(17.5);
    const { recordIds } = await submit(teacher1, "personal", [{ position_id: teacher1Main, date: "2026-11-03", ...WHOLE }]);
    expect(await decide(manager1, recordIds[0], "approve", null, true)).toEqual({
      status: "approved",
      paid_days: 0.5,
      unpaid_days: 0.5,
    });
    const b = await balancesOf(teacher1);
    expect([b.personal.used, b.personal.remaining, b.unpaid]).toEqual(["18.00", "0.00", "0.50"]);
  });

  it("AC-BALANCE-18: the split record is one Personal leave record, Approved, with 0.50 + 0.50 in My requests", async () => {
    await usePersonal(17.5);
    const { recordIds } = await submit(teacher1, "personal", [{ position_id: teacher1Main, date: "2026-11-03", ...WHOLE }]);
    await decide(manager1, recordIds[0], "approve", null, true);
    const mine = await t.asUser<{ leave_type: string; status: string; paid_days: string; unpaid_days: string }>(
      teacher1,
      "select leave_type, status, paid_days, unpaid_days from public.my_leave_records where date = '2026-11-03'",
    );
    expect(mine).toEqual([{ leave_type: "personal", status: "approved", paid_days: "0.50", unpaid_days: "0.50" }]);
  });

  it("AC-BALANCE-14: remaining 1.50; after 2026-11-03 is approved, opening 2026-11-04 shows remaining 0.50", async () => {
    await usePersonal(16.5);
    const { recordIds } = await submit(teacher1, "personal", [
      { position_id: teacher1Main, date: "2026-11-03", ...WHOLE },
      { position_id: teacher1Main, date: "2026-11-04", ...WHOLE },
    ]);
    expect(await decisionBalance(manager1, recordIds[1])).toMatchObject({ share: 1, remaining: 1.5 });
    await decide(manager1, recordIds[0], "approve");
    expect(await decisionBalance(manager1, recordIds[1])).toMatchObject({ share: 1, remaining: 0.5 });
    await expect(decide(manager1, recordIds[1], "approve")).rejects.toMatchObject({
      message: "The Personal leave balance is 0.50 day: approve with the suggested split or reject",
    });
  });

  it("AC-BALANCE-19: remaining 0.00 — approved with the split 0.00 Personal leave + 1.00 Unpaid leave", async () => {
    await usePersonal(18);
    const { recordIds } = await submit(teacher1, "personal", [{ position_id: teacher1Main, date: "2026-11-03", ...WHOLE }]);
    expect(await decide(manager1, recordIds[0], "approve", null, true)).toEqual({
      status: "approved",
      paid_days: 0,
      unpaid_days: 1,
    });
    expect(await myRecord(teacher1, recordIds[0])).toMatchObject({ paid_days: "0.00", unpaid_days: "1.00" });
    expect((await balancesOf(teacher1)).unpaid).toBe("1.00");
  });

  it("a split is computed by date: a second record on a date already partly used adds only the date's remainder", async () => {
    // Залишок 0.50: основна посада в понеділок — 420 з 495 хв = 0.85, з них 0.50 оплачено; далі додаткова — дата
    // стає 1.00, тож запис додає 0.15, увесь неоплачений. Разом — рівно 1.00 дня, як на /balances.
    await usePersonal(17.5);
    const { recordIds } = await submit(teacher1, "personal", [
      { position_id: teacher1Main, date: "2026-11-02", ...WHOLE },
      { position_id: teacher1Additional, date: "2026-11-02", start_min: 945, end_min: 1020 },
    ]);
    expect(await decide(manager1, recordIds[0], "approve", null, true)).toMatchObject({ paid_days: 0.5, unpaid_days: 0.35 });
    expect(await decide(manager2, recordIds[1], "approve", null, true)).toMatchObject({ paid_days: 0, unpaid_days: 0.15 });
    const b = await balancesOf(teacher1);
    expect([b.personal.used, b.personal.remaining, b.unpaid]).toEqual(["18.00", "0.00", "0.50"]);
  });
});

describe("school year of the record's date", () => {
  it("AC-BALANCE-21: 5.00 Sick left in 2026–2027; 2027-08-30 approved late — 2026–2027 remaining 4.00, 2027–2028 carried 4.00, remaining 22.00", async () => {
    // teacher2@: 18.00 + 5.00 перенесених, погоджено 18 цілих днів — у 2026–2027 лишилося 5.00.
    const dates = weekdaysFrom("2026-11-02", 18);
    const used = await submit(
      teacher2,
      "sick",
      dates.map((date) => ({ position_id: teacher2Main, date, ...WHOLE })),
    );
    await t.asService("update public.leave_records set status = 'approved' where request_id = $1", [used.requestId]);
    expect((await balancesOf(teacher2, 2026)).sick.remaining).toBe("5.00");
    const { recordIds } = await submit(teacher2, "sick", [{ position_id: teacher2Main, date: "2027-08-30", ...WHOLE }]);
    await decide(manager2, recordIds[0], "approve");
    expect((await balancesOf(teacher2, 2026)).sick.remaining).toBe("4.00");
    expect((await balancesOf(teacher2, 2027)).sick).toEqual({ carriedOver: "4.00", used: "0.00", remaining: "22.00" });
  });

  it("AC-BALANCE-22: a request for 2027-08-31 and 2027-09-01 adds 1.00 used in 2026–2027 and 1.00 in 2027–2028", async () => {
    const before2026 = (await balancesOf(teacher1, 2026)).personal.used;
    const before2027 = (await balancesOf(teacher1, 2027)).personal.used;
    expect([before2026, before2027]).toEqual(["0.00", "0.00"]);
    const { recordIds } = await submit(teacher1, "personal", [
      { position_id: teacher1Main, date: "2027-08-31", ...WHOLE },
      { position_id: teacher1Main, date: "2027-09-01", ...WHOLE },
    ]);
    for (const id of recordIds) await decide(manager1, id, "approve");
    expect((await balancesOf(teacher1, 2026)).personal.used).toBe("1.00");
    expect((await balancesOf(teacher1, 2027)).personal.used).toBe("1.00");
  });
});
