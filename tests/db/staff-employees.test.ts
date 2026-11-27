// Працівники й одноразове посилання на справжньому Postgres (PGlite, docs/decisions/0001-pglite-db-tests.md):
// функції адміністратора й гостя з міграції 20261125082128_staff_management.sql (D1–D6, D11
// openspec/changes/impl-staff-management/design.md; ADR 0013). Auth тут — шим зі схемою auth.users, яку пишуть наші
// функції; що GoTrue справді впускає з таким рядком, доводить tests/e2e/staff-auth.spec.ts на Supabase у CI.
// Дати AC (2026-12-01 → до 2026-12-08) — сталі дати сценаріїв: функції рахують від now() за Києвом, тож строк
// перевіряємо від сьогодні (сьогодні + 7, учора — прострочене).
import { beforeAll, describe, expect, it } from "vitest";
import { decideAsSeen } from "./decide";
import { createLeaveDb, DEMO_PASSWORD, type LeaveDb } from "./supabase-pglite";

let t: LeaveDb;
let admin: string;
let manager1: string;
let teacher1: string;

function addDays(date: string, days: number): string {
  const d = new Date(`${date}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

type Created = { employee_id: string; token: string; valid_until: string; kyiv_today: string };

/** Створення й «сьогодні» за Києвом — одним оператором: та сама now(), що й у функції (опівночі дата не «перескочить»). */
async function createEmployee(name: string, email: string, role = "employee"): Promise<Created> {
  const [row] = await t.asUser<Created>(
    admin,
    `select c.employee_id, c.token, c.valid_until::text, (now() at time zone 'Europe/Kyiv')::date::text as kyiv_today
       from public.create_employee($1, $2, $3) as c`,
    [name, email, role],
  );
  return row;
}

async function useLink(token: string | null, password: string | null = null) {
  const [row] = await t.asAnon<{ state: string; email: string | null }>(
    "select * from public.use_one_time_link($1, $2)",
    [token, password],
  );
  return row;
}

type StaffRow = { id: string; full_name: string; email: string; role: string; status: string };
const staffList = () =>
  t.asUser<StaffRow>(admin, "select id, full_name, email, role, status from public.staff_employees()");
const statusOf = async (id: string) => (await staffList()).find((r) => r.id === id)?.status;

/** Чи підходить пароль до збереженого bcrypt (як перевіряє GoTrue). */
async function passwordMatches(userId: string, password: string) {
  const [row] = await asOwner<{ ok: boolean }>(
    "select encrypted_password <> '' and encrypted_password = extensions.crypt($2, encrypted_password) as ok from auth.users where id = $1",
    [userId, password],
  );
  return row.ok;
}

/** SQL власником бази (як міграції): підготовка й перевірка, зокрема auth.* і private.*, у які service_role не ходить. */
async function asOwner<T = Record<string, unknown>>(sql: string, params: unknown[] = []): Promise<T[]> {
  return (await t.db.query<T>(sql, params)).rows;
}

/** SQL роллю supabase_auth_admin — так працює GoTrue (updateUser, Admin API). */
async function asAuthService(sql: string, params: unknown[] = []) {
  await t.db.exec("begin; set local role supabase_auth_admin;");
  try {
    await t.db.query(sql, params);
    await t.db.exec("commit");
  } catch (error) {
    await t.db.exec("rollback");
    throw error;
  }
}

beforeAll(async () => {
  t = await createLeaveDb();
  // «Given … there is no employee teacher3@example.test»: демодані зрізу substitutes його вже мають — прибираємо
  // (каскад з auth.users: профіль, посади, записи).
  await t.db.query("delete from auth.users where email = 'teacher3@example.test'");
  admin = t.users["admin@example.test"];
  manager1 = t.users["manager1@example.test"];
  teacher1 = t.users["teacher1@example.test"];
}, 60_000);

describe("create_employee: the administrator creates an employee", () => {
  it("AC-STAFF-01: lists the new employee as Invited and returns a one-time link valid until creation day + 7", async () => {
    const before = await staffList();
    expect(before.some((r) => r.email === "teacher3@example.test")).toBe(false);

    const created = await createEmployee("Teacher Three", "Teacher3@Example.test");

    expect(created.token).toMatch(/^[A-Za-z0-9_-]{43}$/);
    expect(created.valid_until).toBe(addDays(created.kyiv_today, 7));
    const row = (await staffList()).find((r) => r.id === created.employee_id);
    expect(row).toEqual({
      id: created.employee_id,
      full_name: "Teacher Three",
      email: "teacher3@example.test",
      role: "employee",
      status: "invited",
    });
    // Користувач Auth без пароля, email підтверджено, identity email — як рядок, який читає GoTrue.
    const [user] = await asOwner<{ email: string; encrypted_password: string; confirmed: boolean; token: string }>(
      `select u.email, u.encrypted_password, u.email_confirmed_at is not null as confirmed, u.confirmation_token as token
         from auth.users as u where u.id = $1`,
      [created.employee_id],
    );
    expect(user).toEqual({ email: "teacher3@example.test", encrypted_password: "", confirmed: true, token: "" });
    const identities = await asOwner("select provider from auth.identities where user_id = $1", [
      created.employee_id,
    ]);
    expect(identities).toEqual([{ provider: "email" }]);
  });

  it("AC-STAFF-01: keeps only a SHA-256 hash of the token, never the token itself", async () => {
    const created = await createEmployee("Hash Check", "hash-check@example.test");
    const [row] = await asOwner<{ same: boolean; count: number }>(
      `select bool_and(token_hash = extensions.digest($2, 'sha256')) as same, count(*)::int as count
         from private.one_time_links where employee_id = $1`,
      [created.employee_id, created.token],
    );
    expect(row).toEqual({ same: true, count: 1 });
    const columns = await asOwner<{ column_name: string }>(
      "select column_name from information_schema.columns where table_schema = 'private' and table_name = 'one_time_links'",
    );
    expect(columns.map((c) => c.column_name)).not.toContain("token");
  });

  it("AC-STAFF-01: refuses an email that already exists, in any case and also for a deactivated employee", async () => {
    await expect(createEmployee("Copy", "TEACHER1@example.test")).rejects.toThrow(
      "An employee with this email already exists",
    );
    const gone = await createEmployee("Gone Soon", "gone-soon@example.test");
    await t.asUser(admin, "select public.deactivate_employee($1)", [gone.employee_id]);
    await expect(createEmployee("Again", "gone-soon@example.test")).rejects.toThrow(
      "An employee with this email already exists",
    );
  });

  it("AC-STAFF-01: checks the name, the email and the role", async () => {
    await expect(createEmployee("  ", "blank@example.test")).rejects.toThrow("Enter a name of up to 200 characters");
    await expect(createEmployee("x".repeat(201), "long@example.test")).rejects.toThrow(
      "Enter a name of up to 200 characters",
    );
    await expect(createEmployee("No Email", "not-an-email")).rejects.toThrow("Enter a valid email");
    await expect(createEmployee("Bad Role", "bad-role@example.test", "owner")).rejects.toMatchObject({ code: "22023" });
  });

  it("AC-STAFF-04: does not attach test positions to an employee the administrator creates, even with a test email", async () => {
    await asOwner(
      "insert into private.test_positions (email, division_code, title, kind) values ('fresh@example.test', 'elementary', 'Teacher', 'main')",
    );
    const created = await createEmployee("Fresh", "fresh@example.test");
    const positions = await asOwner("select id from public.positions where employee_id = $1", [
      created.employee_id,
    ]);
    expect(positions).toEqual([]);
  });

  it("AC-STAFF-13: refuses a manager and an employee, also called directly", async () => {
    for (const user of [manager1, teacher1]) {
      await expect(
        t.asUser(user, "select * from public.create_employee('X', 'x-by-non-admin@example.test')"),
      ).rejects.toMatchObject({ code: "42501", message: "Only an administrator can manage employees" });
      await expect(t.asUser(user, "select * from public.staff_employees()")).rejects.toMatchObject({ code: "42501" });
    }
    const [{ count }] = await asOwner<{ count: number }>(
      "select count(*)::int as count from public.profiles where email = 'x-by-non-admin@example.test'",
    );
    expect(count).toBe(0);
  });
});

describe("use_one_time_link: the person sets a password", () => {
  it("AC-STAFF-02: a valid link sets the password once, the employee becomes Active and the link stops working", async () => {
    const created = await createEmployee("Link User", "link-user@example.test");
    await asOwner("insert into auth.sessions (user_id) values ($1)", [created.employee_id]);

    expect(await useLink(created.token)).toEqual({ state: "valid", email: "link-user@example.test" });
    expect(await useLink(created.token, "ten-chars!")).toEqual({ state: "valid", email: "link-user@example.test" });

    expect(await passwordMatches(created.employee_id, "ten-chars!")).toBe(true);
    expect(await statusOf(created.employee_id)).toBe("active");
    expect(await useLink(created.token)).toEqual({ state: "invalid", email: null });
    expect(await useLink(created.token, "another-pass")).toEqual({ state: "invalid", email: null });
    expect(await passwordMatches(created.employee_id, "ten-chars!")).toBe(true);
    const sessions = await asOwner("select id from auth.sessions where user_id = $1", [created.employee_id]);
    expect(sessions).toEqual([]);
  });

  it("AC-STAFF-13: a link for a profile that does not exist gets the same refusal as no right", async () => {
    await expect(
      t.asUser(admin, "select * from public.issue_one_time_link('a0000000-0000-0000-0000-0000000000ff')"),
    ).rejects.toMatchObject({ code: "42501", message: "Only an administrator can manage employees" });
  });

  // Гонку двох одночасних use_one_time_link з одним посиланням тут не відтворити: PGlite — одне з'єднання, тож
  // транзакції йдуть по черзі. Її доводить tests/e2e/staff-auth.spec.ts на Supabase (рівно один «valid»).
  it("AC-STAFF-02: a new link makes the previous one invalid", async () => {
    const created = await createEmployee("Two Links", "two-links@example.test");
    const [second] = await t.asUser<{ token: string; valid_until: string }>(
      admin,
      "select token, valid_until::text from public.issue_one_time_link($1)",
      [created.employee_id],
    );
    expect(await useLink(created.token)).toEqual({ state: "invalid", email: null });
    expect(await useLink(second.token)).toEqual({ state: "valid", email: "two-links@example.test" });
  });

  it("AC-STAFF-03: an expired link only says so and sets no password", async () => {
    const created = await createEmployee("Late User", "late-user@example.test");
    // Учора за Києвом: строк і перевірка — в одній транзакції (та сама now()), тож це рівно «перший день після строку».
    await t.db.exec("begin");
    try {
      await t.db.query(
        "update private.one_time_links set valid_until = (now() at time zone 'Europe/Kyiv')::date - 1 where employee_id = $1",
        [created.employee_id],
      );
      const { rows } = await t.db.query("select * from public.use_one_time_link($1)", [created.token]);
      expect(rows).toEqual([{ state: "expired", email: null }]);
      await t.db.exec("commit");
    } catch (error) {
      await t.db.exec("rollback");
      throw error;
    }
    expect(await useLink(created.token)).toEqual({ state: "expired", email: null });
    expect(await useLink(created.token, "long-enough-1")).toEqual({ state: "expired", email: null });
    expect(await passwordMatches(created.employee_id, "long-enough-1")).toBe(false);
    expect(await statusOf(created.employee_id)).toBe("invited");
  });

  it("AC-STAFF-03: the last valid day still works (valid until … inclusive)", async () => {
    const created = await createEmployee("Last Day", "last-day@example.test");
    // Строк і перевірка — в одній транзакції: та сама now(), тож опівночі «сьогодні» не зміниться між ними.
    await t.db.exec("begin");
    try {
      await t.db.query(
        "update private.one_time_links set valid_until = (now() at time zone 'Europe/Kyiv')::date where employee_id = $1",
        [created.employee_id],
      );
      const { rows } = await t.db.query<{ state: string; email: string }>(
        "select * from public.use_one_time_link($1)",
        [created.token],
      );
      expect(rows).toEqual([{ state: "valid", email: "last-day@example.test" }]);
    } finally {
      await t.db.exec("rollback");
    }
  });

  it("AC-STAFF-02: refuses a short or an over-long password and keeps the link usable", async () => {
    const created = await createEmployee("Short Pass", "short-pass@example.test");
    await expect(useLink(created.token, "seven77")).rejects.toThrow("Use at least 8 characters.");
    await expect(useLink(created.token, "é".repeat(37))).rejects.toThrow("This password is too long.");
    expect(await useLink(created.token)).toEqual({ state: "valid", email: "short-pass@example.test" });
  });

  it("AC-STAFF-02: answers invalid for an unknown or malformed token and for a deactivated employee", async () => {
    expect(await useLink(null)).toEqual({ state: "invalid", email: null });
    expect(await useLink("short")).toEqual({ state: "invalid", email: null });
    expect(await useLink("A".repeat(43))).toEqual({ state: "invalid", email: null });
    const created = await createEmployee("Left Before", "left-before@example.test");
    await asOwner("update public.profiles set deactivated_at = now() where id = $1", [created.employee_id]);
    expect(await useLink(created.token)).toEqual({ state: "invalid", email: null });
  });
});

describe("require_active: a deactivated employee with a still-valid token", () => {
  it("AC-STAFF-08: cannot submit, change, resubmit, cancel or ask to cancel own records", async () => {
    const created = await createEmployee("Still Token", "still-token@example.test");
    await useLink(created.token, "still-token-1");
    const [division] = await asOwner<{ id: number }>("select id from public.divisions where code = 'elementary'");
    const [position] = await asOwner<{ id: number }>(
      "insert into public.positions (employee_id, division_id, title, kind) values ($1, $2, 'Teacher', 'main') returning id",
      [created.employee_id, division.id],
    );
    await asOwner(
      "insert into public.schedule_blocks (position_id, weekday, start_min, end_min) select $1, d, 510, 930 from generate_series(1, 5) as d",
      [position.id],
    );
    const submit = (date: string) =>
      t.asUser(created.employee_id, "select public.submit_leave_request('unpaid', $1::jsonb)", [
        JSON.stringify([{ position_id: position.id, date, start_min: 510, end_min: 600 }]),
      ]);
    await submit("2026-12-21");
    const [record] = await asOwner<{ id: number }>("select id from public.leave_records where employee_id = $1", [
      created.employee_id,
    ]);

    await t.asUser(admin, "select public.deactivate_employee($1)", [created.employee_id]);

    const refused = { code: "42501", message: "Your account is deactivated. Contact the administrator" };
    await expect(submit("2026-12-22")).rejects.toMatchObject(refused);
    for (const sql of [
      "select public.update_leave_record_hours($1, 510, 570)",
      "select public.resubmit_leave_record($1)",
      "select public.cancel_leave_record($1)",
      "select public.request_record_cancellation($1, 'Plans changed')",
    ]) {
      await expect(t.asUser(created.employee_id, sql, [record.id])).rejects.toMatchObject(refused);
    }
    const rows = await asOwner<{ status: string; end_min: number }>(
      "select status, end_min from public.leave_records where employee_id = $1",
      [created.employee_id],
    );
    expect(rows).toEqual([{ status: "awaiting", end_min: 600 }]);
  });
});

describe("update_employee: the administrator changes a name and an email", () => {
  it("AC-STAFF-11: shows the new name and email everywhere, keeps the password and the records", async () => {
    const created = await createEmployee("Teacher One", "renamed-before@example.test");
    await useLink(created.token, "same-password-1");
    const [hashBefore] = await asOwner<{ encrypted_password: string }>(
      "select encrypted_password from auth.users where id = $1",
      [created.employee_id],
    );

    await t.asUser(admin, "select public.update_employee($1, $2, $3)", [
      created.employee_id,
      "Teacher One-Smith",
      "renamed-after@example.test",
    ]);

    const row = (await staffList()).find((r) => r.id === created.employee_id);
    expect(row).toMatchObject({ full_name: "Teacher One-Smith", email: "renamed-after@example.test" });
    const [user] = await asOwner<{ email: string; encrypted_password: string; identity_email: string }>(
      `select u.email, u.encrypted_password, i.identity_data ->> 'email' as identity_email
         from auth.users as u join auth.identities as i on i.user_id = u.id where u.id = $1`,
      [created.employee_id],
    );
    expect(user).toEqual({
      email: "renamed-after@example.test",
      encrypted_password: hashBefore.encrypted_password,
      identity_email: "renamed-after@example.test",
    });
    expect(await passwordMatches(created.employee_id, "same-password-1")).toBe(true);
  });

  it("AC-STAFF-11: a demo employee keeps their records and the manager sees the new name on them", async () => {
    const [main] = await asOwner<{ id: number }>(
      "select id from public.positions where employee_id = $1 and kind = 'main'",
      [teacher1],
    );
    await t.asUser(teacher1, "select public.submit_leave_request('unpaid', $1::jsonb)", [
      JSON.stringify([{ position_id: main.id, date: "2026-12-16", start_min: 510, end_min: 600 }]),
    ]);
    const [control] = await asOwner<{ id: number }>(
      "select id from public.leave_records where employee_id = $1 and date = '2026-12-16'",
      [teacher1],
    );
    const [before] = await asOwner<{ count: number }>(
      "select count(*)::int as count from public.leave_records where employee_id = $1",
      [teacher1],
    );
    await t.asUser(admin, "select public.update_employee($1, $2, $3)", [
      teacher1,
      "Teacher One-Smith",
      "teacher1-new@example.test",
    ]);
    const [after] = await asOwner<{ count: number; email: string }>(
      `select (select count(*)::int from public.leave_records where employee_id = $1) as count,
              (select email from auth.users where id = $1) as email`,
      [teacher1],
    );
    expect(after).toEqual({ count: before.count, email: "teacher1-new@example.test" });
    expect(await passwordMatches(teacher1, DEMO_PASSWORD)).toBe(true);
    const seen = await t.asUser<{ id: number; employee_name: string; employee_email: string }>(
      manager1,
      "select id, employee_name, employee_email from public.decision_records() where id = $1",
      [control.id],
    );
    expect(seen).toEqual([
      { id: control.id, employee_name: "Teacher One-Smith", employee_email: "teacher1-new@example.test" },
    ]);
    await t.asUser(admin, "select public.update_employee($1, $2, $3)", [
      teacher1,
      "Teacher One",
      "teacher1@example.test",
    ]);
  });

  it("AC-STAFF-11: refuses an email another person already has", async () => {
    await expect(
      t.asUser(admin, "select public.update_employee($1, 'Teacher One', 'manager1@example.test')", [teacher1]),
    ).rejects.toThrow("An employee with this email already exists");
  });

  it("AC-STAFF-12: an employee cannot change their own name or email, neither through the table nor through Auth", async () => {
    await expect(
      t.asUser(teacher1, "update public.profiles set full_name = 'Self Renamed' where id = $1", [teacher1]),
    ).rejects.toMatchObject({ code: "42501" });
    await expect(
      asAuthService("update auth.users set email = 'self-renamed@example.test' where id = $1", [teacher1]),
    ).rejects.toMatchObject({ code: "42501", message: "Only an administrator can change names and emails" });
    await expect(
      asAuthService("update auth.users set email_change = 'self-renamed@example.test' where id = $1", [teacher1]),
    ).rejects.toMatchObject({ message: "Only an administrator can change names and emails" });
    // Інші оновлення GoTrue (вхід, той самий email) не заважають.
    await asAuthService("update auth.users set updated_at = now(), email = email where id = $1", [teacher1]);
    const [row] = await asOwner<{ full_name: string; email: string; auth_email: string }>(
      `select p.full_name, p.email, u.email as auth_email
         from public.profiles as p join auth.users as u on u.id = p.id where p.id = $1`,
      [teacher1],
    );
    expect(row.email).toBe("teacher1@example.test");
    expect(row.auth_email).toBe("teacher1@example.test");
    expect(row.full_name).not.toBe("Self Renamed");
  });
});

describe("set_employee_role: roles", () => {
  it("AC-STAFF-18: the only administrator cannot remove their own administrator role", async () => {
    await expect(t.asUser(admin, "select public.set_employee_role($1, 'employee')", [admin])).rejects.toThrow(
      "You cannot change your own role",
    );
    const [row] = await asOwner<{ role: string }>("select role from public.profiles where id = $1", [admin]);
    expect(row.role).toBe("admin");
  });

  it("AC-STAFF-18: changes another person's role and keeps a responsible manager a manager", async () => {
    const created = await createEmployee("Promoted", "promoted@example.test");
    await t.asUser(admin, "select public.set_employee_role($1, 'manager')", [created.employee_id]);
    expect((await staffList()).find((r) => r.id === created.employee_id)?.role).toBe("manager");
    await expect(t.asUser(admin, "select public.set_employee_role($1, 'employee')", [manager1])).rejects.toThrow(
      "Remove this person from the managers of positions and deputies first",
    );
  });

  it("AC-STAFF-18: an administrator whose role was just removed can no longer change roles", async () => {
    const created = await createEmployee("Second Admin", "second-admin@example.test", "admin");
    await t.asUser(admin, "select public.set_employee_role($1, 'employee')", [created.employee_id]);
    await expect(
      t.asUser(created.employee_id, "select public.set_employee_role($1, 'employee')", [admin]),
    ).rejects.toMatchObject({ code: "42501" });
  });

  it("AC-STAFF-13: refuses a manager who tries to change roles", async () => {
    await expect(
      t.asUser(manager1, "select public.set_employee_role($1, 'admin')", [teacher1]),
    ).rejects.toMatchObject({ code: "42501", message: "Only an administrator can manage employees" });
  });
});

describe("deactivate_employee: a person who leaves", () => {
  it("AC-STAFF-08: cannot sign in, loses sessions and links, and the manager still sees the approved record in History", async () => {
    const created = await createEmployee("Teacher Leaving", "teacher-leaving@example.test");
    await useLink(created.token, "leaving-pass-1");
    const [division] = await asOwner<{ id: number }>("select id from public.divisions where code = 'elementary'");
    const [position] = await asOwner<{ id: number }>(
      "insert into public.positions (employee_id, division_id, title, kind) values ($1, $2, 'Teacher', 'main') returning id",
      [created.employee_id, division.id],
    );
    await asOwner("insert into public.position_managers (position_id, manager_id) values ($1, $2)", [
      position.id,
      manager1,
    ]);
    await asOwner(
      "insert into public.schedule_blocks (position_id, weekday, start_min, end_min) select $1, d, 510, 930 from generate_series(1, 5) as d",
      [position.id],
    );
    const [request] = await asOwner<{ id: number }>(
      "insert into public.leave_requests (employee_id, leave_type) values ($1, 'personal') returning id",
      [created.employee_id],
    );
    const [record] = await asOwner<{ id: number }>(
      `insert into public.leave_records (request_id, position_id, employee_id, date, start_min, end_min, minutes, status, leave_type)
       values ($1, $2, $3, '2026-12-08', 510, 930, 420, 'approved', 'personal') returning id`,
      [request.id, position.id, created.employee_id],
    );
    await asOwner("insert into auth.sessions (user_id) values ($1)", [created.employee_id]);
    const [link] = await t.asUser<{ token: string }>(admin, "select token from public.issue_one_time_link($1)", [
      created.employee_id,
    ]);

    await t.asUser(admin, "select public.deactivate_employee($1)", [created.employee_id]);

    const [user] = await asOwner<{ banned: boolean }>(
      "select banned_until > now() + interval '99 years' as banned from auth.users where id = $1",
      [created.employee_id],
    );
    expect(user.banned).toBe(true);
    expect(await asOwner("select id from auth.sessions where user_id = $1", [created.employee_id])).toEqual([]);
    expect(await useLink(link.token)).toEqual({ state: "invalid", email: null });
    expect(await statusOf(created.employee_id)).toBe("deactivated");
    const [role] = await t.asUser<{ role: string | null }>(
      created.employee_id,
      "select private.current_app_role() as role",
    );
    expect(role.role).toBe("");

    const history = await t.asUser<{ id: number; status: string; employee_email: string }>(
      manager1,
      "select id, status, employee_email from public.decision_records() where id = $1",
      [record.id],
    );
    expect(history).toEqual([{ id: record.id, status: "approved", employee_email: "teacher-leaving@example.test" }]);
    const register = await t.asUser<{ record_id: number }>(
      admin,
      "select record_id from public.approved_register($1, '2026-12-01')",
      [division.id],
    );
    expect(register.map((r) => r.record_id)).toContain(record.id);
  });

  it("AC-STAFF-08: a deactivated manager with a still-valid token sees and decides nothing of their positions", async () => {
    const created = await createEmployee("Manager Leaving", "manager-leaving@example.test", "manager");
    const [division] = await asOwner<{ id: number }>("select id from public.divisions where code = 'high'");
    const [position] = await asOwner<{ id: number }>(
      "insert into public.positions (employee_id, division_id, title, kind) values ($1, $2, 'Guest teacher', 'additional') returning id",
      [teacher1, division.id],
    );
    await asOwner("insert into public.position_managers (position_id, manager_id) values ($1, $2)", [
      position.id,
      created.employee_id,
    ]);
    const [request] = await asOwner<{ id: number }>(
      "insert into public.leave_requests (employee_id, leave_type) values ($1, 'unpaid') returning id",
      [teacher1],
    );
    const [record] = await asOwner<{ id: number }>(
      `insert into public.leave_records (request_id, position_id, employee_id, date, start_min, end_min, minutes, leave_type)
       values ($1, $2, $3, '2026-12-19', 600, 660, 60, 'unpaid') returning id`,
      [request.id, position.id, teacher1],
    );
    const visible = () =>
      t.asUser<{ id: number }>(created.employee_id, "select id from public.leave_records where id = $1", [record.id]);
    expect(await visible()).toEqual([{ id: record.id }]);

    await t.asUser(admin, "select public.deactivate_employee($1)", [created.employee_id]);

    expect(await visible()).toEqual([]);
    expect(
      await t.asUser(created.employee_id, "select id from public.decision_records() where id = $1", [record.id]),
    ).toEqual([]);
    await expect(
      decideAsSeen(t, created.employee_id, record.id, "approve", 600, 660),
    ).rejects.toMatchObject({ code: "42501", message: "You can't decide on this record" });
    const [state] = await asOwner<{ status: string }>("select status from public.leave_records where id = $1", [
      record.id,
    ]);
    expect(state.status).toBe("awaiting");

    // Реактивація — той самий доступ знову.
    await t.asUser(admin, "select public.reactivate_employee($1)", [created.employee_id]);
    expect(await visible()).toEqual([{ id: record.id }]);
  });

  it("AC-STAFF-08: reactivation lifts the ban and the same password works again", async () => {
    const created = await createEmployee("Comes Back", "comes-back@example.test");
    await useLink(created.token, "comeback-pass");
    await t.asUser(admin, "select public.deactivate_employee($1)", [created.employee_id]);
    await t.asUser(admin, "select public.reactivate_employee($1)", [created.employee_id]);
    const [user] = await asOwner<{ banned_until: string | null }>(
      "select banned_until from auth.users where id = $1",
      [created.employee_id],
    );
    expect(user.banned_until).toBeNull();
    expect(await statusOf(created.employee_id)).toBe("active");
    expect(await passwordMatches(created.employee_id, "comeback-pass")).toBe(true);
  });

  it("AC-STAFF-08: an administrator cannot deactivate themselves, and others cannot deactivate anyone", async () => {
    await expect(t.asUser(admin, "select public.deactivate_employee($1)", [admin])).rejects.toThrow(
      "You cannot deactivate yourself",
    );
    await expect(t.asUser(manager1, "select public.deactivate_employee($1)", [teacher1])).rejects.toMatchObject({
      code: "42501",
    });
    expect(await statusOf(teacher1)).toBe("active");
  });
});
