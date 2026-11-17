// public.schema_version() — версія останньої застосованої міграції для /api/health і smoke (рев'ю WS9, пункт 3).
// Журнал supabase_migrations.schema_migrations у PGlite веде тестова обв'язка (supabase-pglite.ts) так само, як
// Supabase CLI: рядок на кожен файл supabase/migrations. AC PM про це немає — тож без AC ID.
import { readdirSync } from "node:fs";
import { beforeAll, describe, expect, it } from "vitest";
import { createLeaveDb, type LeaveDb } from "./supabase-pglite";

let t: LeaveDb;

/** Мітка часу найновішого файлу міграції — те, з чим smoke порівнює поле schema у /api/health. */
const newestMigration = readdirSync(new URL("../../supabase/migrations/", import.meta.url))
  .filter((f) => /^\d+_.*\.sql$/.test(f))
  .sort()
  .at(-1)!
  .split("_")[0];

beforeAll(async () => {
  t = await createLeaveDb();
}, 60_000);

describe("schema_version() for /api/health", () => {
  it("returns the newest migration version to a visitor without sign-in (anon)", async () => {
    const [row] = await t.asAnon<{ v: string }>("select public.schema_version() as v");
    expect(row.v).toBe(newestMigration);
  });

  it("returns the same version to a signed-in user", async () => {
    const [row] = await t.asUser<{ v: string }>(t.users["teacher1@example.test"], "select public.schema_version() as v");
    expect(row.v).toBe(newestMigration);
  });

  it("follows the migration log: a newer applied version is reported at once", async () => {
    // Пише власник бази, як Supabase CLI: у ролей Data API прав на журнал немає.
    await t.db.query("insert into supabase_migrations.schema_migrations (version, name) values ('99991231235959', 'x')");
    try {
      const [row] = await t.asAnon<{ v: string }>("select public.schema_version() as v");
      expect(row.v).toBe("99991231235959");
    } finally {
      await t.db.query("delete from supabase_migrations.schema_migrations where version = '99991231235959'");
    }
  });

  it("does not open the migration log itself: anon and authenticated cannot read it directly", async () => {
    await expect(t.asAnon("select version from supabase_migrations.schema_migrations")).rejects.toMatchObject({
      code: "42501",
    });
    await expect(
      t.asUser(t.users["admin@example.test"], "select statements from supabase_migrations.schema_migrations"),
    ).rejects.toMatchObject({ code: "42501" });
  });

  it("is the only security definer function in public that anon can execute, without parameters and with empty search_path", async () => {
    const rows = await t.db.query<{ name: string; nargs: number; config: string[] | null }>(`
      select p.proname as name, p.pronargs as nargs, p.proconfig as config
      from pg_proc as p
      join pg_namespace as n on n.oid = p.pronamespace
      where n.nspname = 'public' and p.prosecdef and has_function_privilege('anon', p.oid, 'execute')
    `);
    expect(rows.rows).toEqual([{ name: "schema_version", nargs: 0, config: ["search_path=\"\""] }]);
  });
});
