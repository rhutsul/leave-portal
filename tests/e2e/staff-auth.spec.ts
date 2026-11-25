// Облікові записи функціями бази на справжньому Supabase (ADR 0013; D1, D2, D5, D6, D14
// openspec/changes/impl-staff-management/design.md): чи GoTrue впускає людину, яку створила й змінила міграція
// 20261125082128_staff_management.sql. Без інтерфейсу — supabase-js з публічним ключем, як застосунок; PGlite цього не
// доводить, бо Auth там — шим. Лише на одноразовому стеку CI (@writes): створює й видаляє синтетичний обліковий запис.
// Пароль — випадковий і не виходить за межі тесту; значень ключів не друкуємо.
import { randomBytes } from "node:crypto";
import { expect, test } from "@playwright/test";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { adminClient } from "./support/admin";

const url = process.env.NEXT_PUBLIC_SUPABASE_URL ?? "";
const key = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ?? "";

function client(): SupabaseClient {
  return createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false } });
}

async function signedIn(email: string, password: string): Promise<SupabaseClient> {
  const supabase = client();
  const { error } = await supabase.auth.signInWithPassword({ email, password });
  expect(error, `вхід ${email}`).toBeNull();
  return supabase;
}

async function signInError(email: string, password: string) {
  const { error } = await client().auth.signInWithPassword({ email, password });
  return error;
}

test.describe("staff accounts written by database functions @writes", () => {
  test.describe.configure({ mode: "serial" });

  const suffix = randomBytes(3).toString("hex");
  const email = `staff-auth-${suffix}@example.test`;
  const renamed = `staff-auth-${suffix}-new@example.test`;
  const password = `${randomBytes(9).toString("base64url")}9a`;
  let admin: SupabaseClient;
  let employeeId = "";
  let token = "";

  test.beforeAll(async () => {
    admin = await signedIn("admin@example.test", process.env.DEMO_USER_PASSWORD ?? "");
  });

  test.afterAll(async () => {
    if (!employeeId) return;
    const { error } = await adminClient().auth.admin.deleteUser(employeeId);
    expect(error, "видалення тестового облікового запису").toBeNull();
  });

  test("AC-STAFF-01: the administrator creates an employee and gets a link valid for creation day + 7", async () => {
    const { data, error } = await admin.rpc("create_employee", { p_full_name: "Staff Auth", p_email: email });
    expect(error).toBeNull();
    const [row] = data as { employee_id: string; token: string; valid_until: string }[];
    employeeId = row.employee_id;
    token = row.token;
    expect(token).toMatch(/^[A-Za-z0-9_-]{43}$/);
    const { data: list } = await admin.rpc("staff_employees");
    expect((list as { email: string; status: string }[]).find((r) => r.email === email)?.status).toBe("invited");
    // Без пароля людина ще не входить.
    expect(await signInError(email, password)).not.toBeNull();
  });

  test("AC-STAFF-02: the person sets a password by the link and Supabase Auth lets them sign in with it", async () => {
    const guest = client();
    const { data: state } = await guest.rpc("use_one_time_link", { p_token: token });
    expect(state).toEqual([{ state: "valid", email }]);
    const { data, error } = await guest.rpc("use_one_time_link", { p_token: token, p_password: password });
    expect(error).toBeNull();
    expect(data).toEqual([{ state: "valid", email }]);

    const person = await signedIn(email, password);
    const { data: user } = await person.auth.getUser();
    expect(user.user?.id).toBe(employeeId);
    const { data: again } = await guest.rpc("use_one_time_link", { p_token: token });
    expect(again).toEqual([{ state: "invalid", email: null }]);
    const { data: list } = await admin.rpc("staff_employees");
    expect((list as { email: string; status: string }[]).find((r) => r.email === email)?.status).toBe("active");
  });

  test("AC-STAFF-02: two simultaneous uses of one link — exactly one sets the password", async () => {
    const { data, error } = await admin.rpc("issue_one_time_link", { p_employee_id: employeeId });
    expect(error).toBeNull();
    const [{ token: raced }] = data as { token: string }[];
    const results = await Promise.all(
      [client(), client()].map((guest) => guest.rpc("use_one_time_link", { p_token: raced, p_password: password })),
    );
    const states = results.map((r) => (r.data as { state: string }[])[0].state).sort();
    expect(states).toEqual(["invalid", "valid"]);
    await signedIn(email, password);
  });

  test("AC-STAFF-12: the employee cannot change their own email through Auth", async () => {
    const person = await signedIn(email, password);
    const { error } = await person.auth.updateUser({ email: `self-${suffix}@example.test` });
    // Відмову дає тригер guard_auth_email_change (GoTrue повертає текст помилки бази), а не, скажімо, пошта.
    expect(error?.message ?? "").toContain("Only an administrator can change names and emails");
    const { data } = await adminClient().auth.admin.getUserById(employeeId);
    expect(data.user?.email).toBe(email);
    expect(data.user?.new_email ?? "").toBe("");
    await signedIn(email, password);
  });

  test("AC-STAFF-11: after the administrator changes the email, the person signs in with the new email and the same password", async () => {
    const { error } = await admin.rpc("update_employee", {
      p_employee_id: employeeId,
      p_full_name: "Staff Auth-Smith",
      p_email: renamed,
    });
    expect(error).toBeNull();
    await signedIn(renamed, password);
    expect(await signInError(email, password)).not.toBeNull();
  });

  test("AC-STAFF-08: a deactivated employee is refused by Auth as banned, and reactivation lets the same password in", async () => {
    const { error } = await admin.rpc("deactivate_employee", { p_employee_id: employeeId });
    expect(error).toBeNull();
    const refused = await signInError(renamed, password);
    expect(refused?.code).toBe("user_banned");

    const { error: back } = await admin.rpc("reactivate_employee", { p_employee_id: employeeId });
    expect(back).toBeNull();
    await signedIn(renamed, password);
  });
});
