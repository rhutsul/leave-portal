// Що кожна роль бачить у таблицях, читаючи їх напряму (як через Data API): тут діє лише RLS, без security definer
// функцій сторінок. Правило — матриця прав requirements/product.md: свої дані; менеджер — дані посад, за які він
// відповідає; адміністратор — усе. Окремого AC на кожну таблицю PM не дав, тож назви без AC ID (як profiles.test.ts);
// гілку менеджера в leave_records доводить AC-DECIDE-01 у leave-decisions.test.ts, мутації — npm run mutation:sql.
//
// Тестові дані D7 (міграція 20261020190045_leave_requests_schema.sql): кожен має основну посаду; teacher1@ — основна
// (manager1@) і додаткова (manager2@); teacher2@ — основна (manager2@); manager1@ і manager2@ відповідають і за власну.
import { beforeAll, describe, expect, it } from "vitest";
import { createLeaveDb, type LeaveDb } from "./supabase-pglite";

let t: LeaveDb;

const ROLES = ["teacher1", "teacher2", "manager1", "manager2", "admin"] as const;
type Role = (typeof ROLES)[number];
const userOf = (role: Role) => t.users[`${role}@example.test`];

// Від імені ролі читаємо лише ключ рядка (з'єднання з positions чи profiles теж пройшли б RLS і сховали б рядки), а
// мітку «<хто>:<посада>» (або «<хто>» для таблиці без посади) дає service_role — по ній видно, чий рядок прочитано.
const TABLES: Record<string, { key: string; label: string }> = {
  positions: { key: "select id as key from public.positions", label: "position" },
  schedule_blocks: { key: "select distinct position_id as key from public.schedule_blocks", label: "position" },
  leave_records: { key: "select position_id as key from public.leave_records", label: "position" },
  leave_record_events: { key: "select distinct record_id as key from public.leave_record_events", label: "record" },
  balance_carryovers: { key: "select employee_id as key from public.balance_carryovers", label: "employee" },
};

const LABELS = {
  position: `select p.id::text as key, split_part(pr.email, '@', 1) || ':' || p.kind as label
    from public.positions as p join public.profiles as pr on pr.id = p.employee_id`,
  record: `select r.id::text as key, split_part(pr.email, '@', 1) || ':' || p.kind as label from public.leave_records as r
    join public.positions as p on p.id = r.position_id join public.profiles as pr on pr.id = p.employee_id`,
  employee: "select id::text as key, split_part(email, '@', 1) as label from public.profiles",
};

async function visible(role: Role, table: string) {
  const { key, label } = TABLES[table];
  const rows = await t.asUser<{ key: string | number }>(userOf(role), key);
  const names = new Map(
    (await t.asService<{ key: string; label: string }>(LABELS[label as keyof typeof LABELS])).map((r) => [r.key, r.label]),
  );
  return rows.map((r) => names.get(String(r.key))).sort();
}

// Очікуване — з правила, а не з прогону: свої + посади менеджера (position_managers) + адміністратор усе.
const OWN_AND_MANAGED: Record<Role, string[]> = {
  teacher1: ["teacher1:additional", "teacher1:main"],
  teacher2: ["teacher2:main"],
  manager1: ["manager1:main", "teacher1:main"],
  manager2: ["manager2:main", "teacher1:additional", "teacher2:main"],
  admin: ["admin:main", "manager1:main", "manager2:main", "teacher1:additional", "teacher1:main", "teacher2:main"],
};

// Записи (і їхні події) є лише в teacher1@ (обидві посади) і teacher2@.
const RECORDS: Record<Role, string[]> = {
  teacher1: ["teacher1:additional", "teacher1:main"],
  teacher2: ["teacher2:main"],
  manager1: ["teacher1:main"],
  manager2: ["teacher1:additional", "teacher2:main"],
  admin: ["teacher1:additional", "teacher1:main", "teacher2:main"],
};

// Перенесені дні — на працівника, а не на посаду: менеджер бачить працівника, якщо відповідає за будь-яку його посаду.
const CARRYOVERS: Record<Role, string[]> = {
  teacher1: ["teacher1"],
  teacher2: ["teacher2"],
  manager1: ["teacher1"],
  manager2: ["teacher1", "teacher2"],
  admin: ["teacher1", "teacher2"],
};

const EXPECTED: Record<string, Record<Role, string[]>> = {
  positions: OWN_AND_MANAGED,
  schedule_blocks: OWN_AND_MANAGED,
  leave_records: RECORDS,
  leave_record_events: RECORDS,
  balance_carryovers: CARRYOVERS,
};

const CASES = Object.keys(TABLES).flatMap((table) => ROLES.map((role) => ({ table, role })));

beforeAll(async () => {
  t = await createLeaveDb();
  const positionOf = async (email: string, kind: string) =>
    (
      await t.asService<{ id: number }>(
        `select p.id from public.positions as p join public.profiles as pr on pr.id = p.employee_id
          where pr.email = $1 and p.kind = $2`,
        [email, kind],
      )
    )[0].id;
  const day = (positionId: number, date: string, startMin: number, endMin: number) =>
    ({ position_id: positionId, date, start_min: startMin, end_min: endMin });
  // Заявки подають самі працівники — тож події «submitted» створює та сама функція, що й на проді.
  await t.asUser(t.users["teacher1@example.test"], "select public.submit_leave_request('sick', $1::jsonb)", [
    JSON.stringify([
      day(await positionOf("teacher1@example.test", "main"), "2026-11-02", 510, 930),
      day(await positionOf("teacher1@example.test", "additional"), "2026-11-02", 945, 1020),
    ]),
  ]);
  await t.asUser(t.users["teacher2@example.test"], "select public.submit_leave_request('personal', $1::jsonb)", [
    JSON.stringify([day(await positionOf("teacher2@example.test", "main"), "2026-11-03", 510, 930)]),
  ]);
  // У даних D7 перенесені дні має лише teacher2@ (manager2@) — додаємо teacher1@, щоб розрізнити двох менеджерів.
  await t.asService(
    "insert into public.balance_carryovers (employee_id, leave_type, school_year, days) values ($1, 'personal', 2026, 2.00)",
    [t.users["teacher1@example.test"]],
  );
}, 60_000);

describe("RLS: role × table → visible rows", () => {
  it.each(CASES)("$role@ reads $table directly", async ({ table, role }) => {
    expect(await visible(role, table)).toEqual(EXPECTED[table][role]);
  });

  it("without signing in no table can be read at all", async () => {
    for (const table of Object.keys(TABLES)) {
      await expect(t.asAnon(`select 1 from public.${table}`)).rejects.toMatchObject({ code: "42501" });
    }
  });
});
