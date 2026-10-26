// Профілі на справжньому Postgres (PGlite, docs/decisions/0001-pglite-db-tests.md): ім'я та email змінює лише
// адміністратор (матриця прав requirements/product.md, рішення PM mkozlovskyi-ops/course-staff-management-spec#12;
// інтерфейс адміністратора — WS10). Через Data API ніхто, хто ввійшов, профіль не змінює — навіть власний і навіть
// з роллю admin: зараз профілі змінюють лише серверні скрипти (service_role). AC PM про це немає — тож без AC ID.
import { beforeAll, describe, expect, it } from "vitest";
import { createLeaveDb, type LeaveDb } from "./supabase-pglite";

let t: LeaveDb;

beforeAll(async () => {
  t = await createLeaveDb();
}, 60_000);

const nameOf = async (id: string) =>
  (await t.asService<{ full_name: string | null }>("select full_name from public.profiles where id = $1", [id]))[0]
    .full_name;

describe("profile names are changed by the administrator only", () => {
  it("a signed-in user cannot change their own full name", async () => {
    for (const email of ["teacher1@example.test", "manager1@example.test", "admin@example.test"]) {
      const id = t.users[email];
      const before = await nameOf(id);
      await expect(
        t.asUser(id, "update public.profiles set full_name = 'Someone Else' where id = $1", [id]),
      ).rejects.toMatchObject({ code: "42501" });
      expect(await nameOf(id)).toBe(before);
    }
  });

  it("a signed-in user cannot change anyone's email or role either", async () => {
    const teacher = t.users["teacher1@example.test"];
    const other = t.users["teacher2@example.test"];
    for (const target of [teacher, other]) {
      for (const column of ["full_name = 'Someone Else'", "email = 'other@example.test'", "role = 'admin'"]) {
        await expect(
          t.asUser(teacher, `update public.profiles set ${column} where id = $1`, [target]),
        ).rejects.toMatchObject({ code: "42501" });
      }
    }
    const [row] = await t.asService<{ email: string; role: string }>(
      "select email, role from public.profiles where id = $1",
      [teacher],
    );
    expect(row).toEqual({ email: "teacher1@example.test", role: "employee" });
  });

  it("the server scripts (service_role) still change a name", async () => {
    const teacher = t.users["teacher2@example.test"];
    const before = await nameOf(teacher);
    await t.asService("update public.profiles set full_name = 'Renamed Teacher' where id = $1", [teacher]);
    expect(await nameOf(teacher)).toBe("Renamed Teacher");
    await t.asService("update public.profiles set full_name = $2 where id = $1", [teacher, before]);
  });

  it("a signed-in user still reads their own profile", async () => {
    const teacher = t.users["teacher1@example.test"];
    const rows = await t.asUser<{ email: string }>(teacher, "select email from public.profiles");
    expect(rows).toEqual([{ email: "teacher1@example.test" }]);
  });
});
