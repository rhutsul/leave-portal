// WS11, B: навмисна помилка сервера для перевірки трекера — лише адміністратору; гостю й іншим ролям — 404.
// Роль — з profiles.role через getClaims(), не з user_metadata. Supabase підмінено: без мережі.
// Назви без AC ID: інструмент експлуатації, а не поведінка за AC PM.
import { describe, expect, it, vi } from "vitest";

const session = vi.hoisted(() => ({
  claims: null as { sub: string; user_metadata?: { role?: string } } | null,
  role: null as string | null,
  profileIds: [] as string[],
}));

vi.mock("@/lib/supabase/server", () => ({
  createClient: async () => ({
    auth: {
      getClaims: async () => ({ data: session.claims ? { claims: session.claims } : null, error: null }),
      getSession: () => {
        throw new Error("getSession must not be used for authorization");
      },
    },
    from: (table: string) => {
      expect(table).toBe("profiles");
      return {
        select: () => ({
          eq: (_column: string, id: string) => ({
            maybeSingle: async () => {
              session.profileIds.push(id);
              return { data: session.role ? { role: session.role } : null, error: null };
            },
          }),
        }),
      };
    },
  }),
}));

const { GET } = await import("@/app/api/ops/server-error/route");

describe("GET /api/ops/server-error", () => {
  it("гостю — 404 без запиту до profiles", async () => {
    Object.assign(session, { claims: null, role: null, profileIds: [] });
    const res = await GET();
    expect(res.status).toBe(404);
    expect(session.profileIds).toEqual([]);
  });

  it.each(["employee", "manager"])("ролі %s — 404", async (role) => {
    Object.assign(session, { claims: { sub: "user-1" }, role, profileIds: [] });
    const res = await GET();
    expect(res.status).toBe(404);
    expect(session.profileIds).toEqual(["user-1"]);
  });

  it("роль admin лише в user_metadata — 404: роль береться з profiles", async () => {
    Object.assign(session, { claims: { sub: "user-2", user_metadata: { role: "admin" } }, role: "employee", profileIds: [] });
    expect((await GET()).status).toBe(404);
  });

  it("адміністратору — навмисна помилка сервера", async () => {
    Object.assign(session, { claims: { sub: "admin-1" }, role: "admin", profileIds: [] });
    await expect(GET()).rejects.toMatchObject({ name: "DeliberateServerError" });
    expect(session.profileIds).toEqual(["admin-1"]);
  });
});
